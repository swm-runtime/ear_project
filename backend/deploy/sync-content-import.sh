#!/usr/bin/env bash
# 콘텐츠 계층 들여오기 (S3 → 개발계 DB) — KAN-62 3단계 · 결정 7 · 발행 즉시 반영 KAN-84.
#
# 개발계 서버에서 크론으로 돈다(운영 내보내기 20분 뒤). 운영이 올린 콘텐츠 표 덤프를 받아 **stage 스키마에
# 적재한 뒤 public 으로 upsert** 한다. 지우지 않는다 — 개발계 사용자 데이터(library_items·play_records 등)가
# 콘텐츠를 참조하므로 TRUNCATE/DELETE 는 그쪽을 깨뜨린다. 운영에서 회수된 콘텐츠는 status 가 withdrawn 으로
# 따라오고, 운영에서 하드 삭제된 행만 개발계에 남는다(무해).
#
# **운영이 발행 직후 SSH 로 이 스크립트를 부른다**(2026-09-20 — sync-content-export.sh 의 알림).
# 그 키는 개발계 authorized_keys 에서 이 스크립트로 묶여 있어(command="...") 다른 명령을 실행할 수 없다.
# 크론은 **안전망**으로만 남긴다 — 알림이 유실된 날(개발계 정지·네트워크)에도 하루 한 번은 맞춰진다.
#
#   30 19 * * * /opt/ear/backend/deploy/sync-content-import.sh >> /var/log/ear-content-sync.log 2>&1   # 04:30 KST (안전망)
#   수동: bash deploy/sync-content-import.sh
#
# **같은 덤프면 아무것도 하지 않는다** — S3 객체의 ETag 를 지난번과 비교해 같으면 즉시 끝낸다. 알림이 연달아
# 와도(연속 발행) DB 를 다시 쓰지 않는다. 받은 뒤에는 운영이 함께 올린 매니페스트(표별 행 수)와 대조해
# **빠진 행이 있으면 실패로 끝낸다** — 조용히 어긋난 채로 두지 않는다.
#
# 전제: 개발계 롤에 s3:GetObject (백업 버킷의 content-sync/*) — setup-dev-server.sh 가 붙인다.
set -euo pipefail
# 크론과 SSH forced command 는 PATH 가 짧다 — aws CLI(/usr/local/bin)를 못 찾는 경우를 막는다
export PATH="/usr/local/bin:/usr/bin:/bin:${PATH:-}"

TABLES=(topics contents content_topics content_sources content_embeddings content_stats)
BUCKET="${CONTENT_SYNC_BUCKET:-earcast-backup-prod}"
PREFIX="${CONTENT_SYNC_PREFIX:-content-sync}"
LOCK=/tmp/ear-content-import.lock
ETAG_FILE=/opt/ear/backend/.content-sync-etag
cd "$(dirname "$0")/.."
env_of() { sed -n "s/^$1=//p" .env.prod | tr -d '\r' | tail -n 1; }
DB_USERNAME=$(env_of DB_USERNAME); DB_NAME=$(env_of DB_NAME)
: "${DB_USERNAME:?}" "${DB_NAME:?}"
[ "$(env_of API_DOMAIN)" != "api.earcast.co.kr" ] || { echo "운영 서버에서 돌리지 않는다"; exit 1; }

exec 9>"$LOCK"; flock -n 9 || { echo "이전 들여오기가 아직 돌고 있다 — 건너뜀"; exit 1; }
# 1) 덤프가 지난번과 같은지부터 본다 — 목록 조회 한 번(수 ms)이고 DB 는 건드리지 않는다
ETAG=$(aws s3api head-object --bucket "$BUCKET" --key "${PREFIX}/content-latest.sql.gz" \
        --query ETag --output text 2>/dev/null || true)
[ -n "$ETAG" ] || { echo "덤프를 찾지 못했다 — 중단"; exit 1; }

if [ -f "$ETAG_FILE" ] && [ "$ETAG" = "$(cat "$ETAG_FILE")" ]; then
  echo "content import skip: 새 덤프 없음"
  exit 0
fi

FILE=$(mktemp /tmp/ear-content-import.XXXXXX.sql.gz)
MANIFEST=$(mktemp /tmp/ear-content-manifest.XXXXXX.txt)
trap 'rm -f "$FILE" "$MANIFEST"' EXIT
aws s3 cp "s3://${BUCKET}/${PREFIX}/content-latest.sql.gz" "$FILE" --only-show-errors
# 매니페스트는 2026-09-20부터 올라간다 — 없으면(옛 덤프) 검증만 건너뛴다
aws s3 cp "s3://${BUCKET}/${PREFIX}/content-latest.manifest" "$MANIFEST" --only-show-errors 2>/dev/null \
  || { echo "경고: 매니페스트가 없다 — 행 수 검증을 건너뛴다"; : > "$MANIFEST"; }
zcat "$FILE" | tail -n 20 | grep -q 'PostgreSQL database dump complete' || { echo "덤프가 완결되지 않았다 — 중단"; exit 1; }

PSQL=(docker compose -f docker-compose.prod.yml --env-file .env.prod exec -T postgres psql -U "$DB_USERNAME" -d "$DB_NAME" -v ON_ERROR_STOP=1 -q)

# 1) stage 스키마에 표 6개를 public 과 같은 모양으로 만들고, 덤프의 public. 을 sync_stage. 로 바꿔 적재한다.
#    (덤프는 --column-inserts 라 열 이름이 박혀 있어, 개발계에 열이 더 있어도 그대로 들어간다)
{
  echo "DROP SCHEMA IF EXISTS sync_stage CASCADE; CREATE SCHEMA sync_stage;"
  for t in "${TABLES[@]}"; do echo "CREATE TABLE sync_stage.$t (LIKE public.$t INCLUDING DEFAULTS);"; done
  echo "SET session_replication_role = replica;"   # stage 에는 FK 가 없지만, 트리거·순서 걱정 없이 적재
  # setval 은 뺀다 — 개발계 시퀀스를 운영 값으로 되감으면 개발계 신규 행이 중복 키를 낸다. INSERT 만 stage 로 보낸다
  zcat "$FILE" | grep -vE '^SELECT pg_catalog\.setval' | sed -E 's/^INSERT INTO public\./INSERT INTO sync_stage./'
} | "${PSQL[@]}" >/dev/null

# 2) upsert — 표마다 충돌 키로 갱신. 열 목록은 정보 스키마에서 뽑아 스키마가 달라도(개발계가 앞서도) 깨지지 않게
"${PSQL[@]}" 2>&1 <<'SQL' | grep -E "NOTICE|ERROR" | sed 's/^psql://' || true
DO $$
DECLARE
  spec record;
  cols text; sets text; n int; total int := 0;
BEGIN
  FOR spec IN
    SELECT * FROM (VALUES
      ('topics',             'id'),
      ('contents',           'id'),
      ('content_topics',     'content_id, topic_id'),
      ('content_sources',    'content_id, position'),
      ('content_embeddings', 'content_id'),
      ('content_stats',      'content_id, period_type, period_start')
    ) AS t(tbl, conflict_cols)
  LOOP
    SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position),
           string_agg(quote_ident(column_name) || ' = EXCLUDED.' || quote_ident(column_name), ', ' ORDER BY ordinal_position)
      INTO cols, sets
      FROM information_schema.columns
     WHERE table_schema = 'sync_stage' AND table_name = spec.tbl;
    EXECUTE format('INSERT INTO public.%1$I (%2$s) SELECT %2$s FROM sync_stage.%1$I ON CONFLICT (%3$s) DO UPDATE SET %4$s',
                   spec.tbl, cols, spec.conflict_cols, sets);
    GET DIAGNOSTICS n = ROW_COUNT; total := total + n;
    RAISE NOTICE '% → % rows', spec.tbl, n;
  END LOOP;
  RAISE NOTICE 'content sync upsert total % rows', total;
END $$;
-- 운영에서 주제 매핑이 바뀐 콘텐츠: stage 에 있는 콘텐츠의 옛 매핑만 걷어낸다(다른 표는 참조하지 않는 표라 안전)
DELETE FROM public.content_topics ct
 WHERE ct.content_id IN (SELECT id FROM sync_stage.contents)
   AND NOT EXISTS (SELECT 1 FROM sync_stage.content_topics s WHERE s.content_id = ct.content_id AND s.topic_id = ct.topic_id);
SQL

# 3) 검증 — 운영이 센 행 수(매니페스트)만큼 개발계에도 들어왔는지 본다.
#    개발계 행 수는 **더 많을 수 있다**(운영에서 하드 삭제된 옛 행이 남는다). 모자라면 실패다.
VERIFY_FAILED=0
while IFS='=' read -r key value; do
  case "$key" in
    stamp|'') continue ;;
  esac
  have=$("${PSQL[@]}" -tA -c "SELECT count(*) FROM public.${key}" | tr -d '[:space:]')
  if [ -z "$have" ] || [ "$have" -lt "$value" ]; then
    echo "검증 실패: ${key} 운영 ${value}행 / 개발계 ${have:-?}행"
    VERIFY_FAILED=1
  fi
done < "$MANIFEST"

"${PSQL[@]}" -c "DROP SCHEMA IF EXISTS sync_stage CASCADE;" >/dev/null

if [ "$VERIFY_FAILED" -ne 0 ]; then
  # ETag 를 적지 않는다 — 다음 알림·크론이 같은 덤프로 다시 시도한다
  echo "content import FAILED: 행 수가 모자란다"
  exit 1
fi

printf '%s' "$ETAG" > "$ETAG_FILE"
echo "content import ok: $(date -u +%FT%TZ) from s3://${BUCKET}/${PREFIX}/content-latest.sql.gz"
