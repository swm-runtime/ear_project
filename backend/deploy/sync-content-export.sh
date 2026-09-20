#!/usr/bin/env bash
# 콘텐츠 계층 내보내기 (운영 → S3) — KAN-62 3단계 · 결정 7 · 발행 즉시 반영 KAN-84.
#
# 운영 서버에서 크론으로 돈다(백업 10분 뒤). 콘텐츠 계층 6개 표의 **데이터만** 덤프해 백업 버킷의
# content-sync/ 접두사에 올린다. 개발계는 이 파일만 받아 자기 DB 에 upsert 한다(sync-content-import.sh).
#
#   왜 이 방향인가: 개발계가 운영 DB 에 직접 붙거나 운영 서버에 SSH 하려면 개발계가 운영 자격증명을 들어야
#   한다. 반대로 운영이 "콘텐츠만" 내보내면 사용자 개인정보는 운영 밖으로 한 바이트도 나가지 않고,
#   개발계는 S3 읽기 권한(이 접두사만) 하나로 끝난다.
#
#   */1 * * * * /opt/ear/backend/deploy/sync-content-export.sh >> /var/log/ear-content-sync.log 2>&1
#
#   **1분마다 돌지만 대부분 아무것도 하지 않는다.** 먼저 콘텐츠 표의 지문(표별 행 수 + 최종 수정 시각)을
#   재서 지난번과 같으면 덤프도 업로드도 건너뛴다(2026-09-20 개정). 발행·회수·주제 변경이 있었을 때만
#   실제로 뜨므로, 콘텐츠가 늘어도(임베딩은 한 행이 수십 KB다) 평소 비용이 늘지 않는다.
#
#   **바뀐 것을 올린 직후 개발계에 알린다**(2026-09-20). 개발계가 주기적으로 묻는 대신 운영이 밀어 주므로
#   발행하면 몇 초 안에 개발계에 반영된다. 알림은 SSH 한 번이고, 그 키는 개발계에서 들여오기 스크립트만
#   실행하도록 묶여 있다(forced command) — 운영이 개발계에서 할 수 있는 일은 그것뿐이다.
#   알림이 실패해도 덤프는 이미 올라가 있고, 개발계의 안전망 크론(하루 1회)이 다음에 받아 간다.
#
# 표: topics · contents · content_topics · content_sources · content_embeddings · content_stats (사용자 표는 절대 넣지 않는다)
set -euo pipefail
# 크론은 PATH 가 짧다 — aws CLI(/usr/local/bin)를 못 찾는 경우를 막는다
export PATH="/usr/local/bin:/usr/bin:/bin:${PATH:-}"

TABLES=(topics contents content_topics content_sources content_embeddings content_stats)
LOCK=/tmp/ear-content-export.lock
# 지난번 내보낸 내용의 지문. 이 파일이 없으면(첫 실행·서버 교체) 한 번 내보내고 다시 적는다
FINGERPRINT_FILE=/opt/ear/backend/.content-sync-fingerprint
# 개발계에 "지금 받아라"고 알릴 때 쓰는 키·대기 상한. 주소는 아래에서 .env.prod 로부터 읽는다
NOTIFY_KEY="${CONTENT_SYNC_NOTIFY_KEY:-/opt/ear/backend/deploy/keys/content-sync}"
NOTIFY_TIMEOUT_SEC=20
FILE=""
cleanup() {
  local code=$?
  if [ "$code" -eq 0 ]; then [ -n "$FILE" ] && rm -f "$FILE"; exit 0; fi
  echo "content export FAILED: exit ${code}${FILE:+ (파일 보존: $FILE)}"
  exit "$code"
}
trap cleanup EXIT INT TERM HUP
cd "$(dirname "$0")/.."

# backup.sh 와 같은 이유로 .env.prod 를 source 하지 않는다 — 마지막 항목을 읽는다
env_of() { sed -n "s/^$1=//p" .env.prod | tr -d '\r' | tail -n 1; }
DB_USERNAME=$(env_of DB_USERNAME); DB_NAME=$(env_of DB_NAME); BACKUP_BUCKET=$(env_of BACKUP_BUCKET)
# **크론에는 환경변수가 없다** — 주소의 원천은 .env.prod 다(셋업 스크립트가 넣는다). 비우면 알리지 않는다
NOTIFY_HOST="${CONTENT_SYNC_NOTIFY_HOST:-$(env_of CONTENT_SYNC_NOTIFY_HOST)}"
: "${DB_USERNAME:?}" "${DB_NAME:?}" "${BACKUP_BUCKET:?BACKUP_BUCKET required (.env.prod)}"
PREFIX="${CONTENT_SYNC_PREFIX:-content-sync}"

exec 9>"$LOCK"; flock -n 9 || { echo "이전 내보내기가 아직 돌고 있다 — 건너뜀"; exit 1; }
find /tmp -maxdepth 1 -name 'ear-content-*.sql.gz' -mtime +3 -delete 2>/dev/null || true

PSQL=(docker compose -f docker-compose.prod.yml --env-file .env.prod exec -T postgres
      psql -U "$DB_USERNAME" -d "$DB_NAME" -tA -v ON_ERROR_STOP=1 -q)

# 지문 = 표별 "행 수:최종 수정 시각". 행이 지워지면 수가, 고쳐지면 시각이 달라진다.
# 읽기 한 번(인덱스 없는 count 지만 콘텐츠 표는 작다)이라 5분마다 돌려도 부담이 없다.
fingerprint_query() {
  local t first=1
  for t in "${TABLES[@]}"; do
    [ $first -eq 1 ] || printf ' UNION ALL '
    printf "SELECT '%s=' || count(*) || ':' || coalesce(max(updated_at)::text, '-') FROM public.%s" "$t" "$t"
    first=0
  done
}
FINGERPRINT=$("${PSQL[@]}" -c "$(fingerprint_query)" | tr '\n' ' ')
[ -n "$FINGERPRINT" ] || { echo "지문을 읽지 못했다 — 중단"; exit 1; }

if [ -f "$FINGERPRINT_FILE" ] && [ "$FINGERPRINT" = "$(cat "$FINGERPRINT_FILE")" ]; then
  echo "content export skip: 바뀐 콘텐츠 없음"
  # 건너뛴 것도 정상 동작이다 — 심장박동을 남겨야 "미실행" 알람이 오탐하지 않는다
  aws cloudwatch put-metric-data --region "${AWS_REGION:-ap-northeast-2}" --namespace ear/ops --metric-name CronSuccess \
    --dimensions Job=content-export --value 1 --unit Count 2>/dev/null || true
  exit 0
fi

STAMP=$(date -u +%Y%m%dT%H%M%SZ)
FILE="/tmp/ear-content-${STAMP}.sql.gz"
install -m 600 /dev/null "$FILE"

# --data-only: 스키마는 개발계가 자기 마이그레이션으로 갖고 있다(개발계가 앞서 있을 수 있어 스키마를 실어 보내지 않는다)
# --column-inserts: 열 이름이 박힌 INSERT — 개발계에 새 열이 있어도(뒤에 붙은 열) 그대로 들어간다. 행이 적어 속도는 문제 아니다
# --no-owner --no-privileges: 개발계 롤 이름과 무관하게
T_ARGS=(); for t in "${TABLES[@]}"; do T_ARGS+=(-t "public.$t"); done
timeout 900 docker compose -f docker-compose.prod.yml --env-file .env.prod exec -T postgres \
  pg_dump -U "$DB_USERNAME" -d "$DB_NAME" --data-only --column-inserts --no-owner --no-privileges "${T_ARGS[@]}" | gzip > "$FILE"

zcat "$FILE" | tail -n 20 | grep -q 'PostgreSQL database dump complete' \
  || { echo "덤프가 완결되지 않았다 — 업로드하지 않는다"; exit 1; }
# 사용자 표가 섞이지 않았는지 이중 확인 — 표 목록 밖의 INSERT 가 하나라도 있으면 중단
if zcat "$FILE" | grep -E '^INSERT INTO public\.' | grep -vE "^INSERT INTO public\.($(IFS='|'; echo "${TABLES[*]}")) " | head -1 | grep -q .; then
  echo "허용 표 밖의 데이터가 들어 있다 — 업로드하지 않는다"; exit 1
fi

SIZE=$(stat -c %s "$FILE")

# 표별 행 수를 함께 올린다 — 개발계가 받은 뒤 "빠진 행이 없는지" 이 값과 대조한다(검증은 받는 쪽에서)
MANIFEST=$(mktemp /tmp/ear-content-manifest.XXXXXX.txt); trap 'rm -f "$MANIFEST"' EXIT
{
  echo "stamp=${STAMP}"
  for t in "${TABLES[@]}"; do
    echo "${t}=$("${PSQL[@]}" -c "SELECT count(*) FROM public.${t}")"
  done
} > "$MANIFEST"

aws s3 cp "$FILE" "s3://${BACKUP_BUCKET}/${PREFIX}/content-${STAMP}.sql.gz" --only-show-errors
aws s3 cp "$MANIFEST" "s3://${BACKUP_BUCKET}/${PREFIX}/content-latest.manifest" --only-show-errors
# **덤프를 마지막에 올린다.** 개발계는 덤프 파일이 바뀐 것을 보고 내려받으므로, 매니페스트가 먼저 있어야 짝이 맞는다
aws s3 cp "$FILE" "s3://${BACKUP_BUCKET}/${PREFIX}/content-latest.sql.gz" --only-show-errors
printf '%s' "$FINGERPRINT" > "$FINGERPRINT_FILE"
echo "content export ok: ${STAMP} (${SIZE} bytes, tables=${TABLES[*]})"

# 개발계에 알린다 — 실패해도 내보내기는 성공이다(경고만 남기고 안전망 크론에 맡긴다).
# 키는 개발계 authorized_keys 에서 command="…/sync-content-import.sh" 로 묶여 있어, 여기서 명령을 고를 수 없다
if [ -n "$NOTIFY_HOST" ] && [ -r "$NOTIFY_KEY" ]; then
  if timeout "$NOTIFY_TIMEOUT_SEC" ssh -i "$NOTIFY_KEY" -o BatchMode=yes -o StrictHostKeyChecking=accept-new \
      -o ConnectTimeout=5 "ec2-user@${NOTIFY_HOST}" >/dev/null 2>&1; then
    echo "content export notify ok: ${NOTIFY_HOST}"
  else
    echo "경고: 개발계 알림 실패(${NOTIFY_HOST}) — 안전망 크론이 다음에 받아 간다"
  fi
elif [ -n "$NOTIFY_HOST" ]; then
  echo "경고: 알림 키가 없다(${NOTIFY_KEY}) — 알리지 않았다"
fi
# 심장박동 지표 — 성공했을 때만 1을 찍는다. CloudWatch 알람이 "25시간 안에 지표 없음"을 잡는다(실패뿐 아니라 미실행도)
aws cloudwatch put-metric-data --region "${AWS_REGION:-ap-northeast-2}" --namespace ear/ops --metric-name CronSuccess \
  --dimensions Job=content-export --value 1 --unit Count 2>/dev/null || echo "경고: 심장박동 지표 기록 실패(권한/네트워크) — 알람이 오탐할 수 있다"
