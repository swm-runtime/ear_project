#!/usr/bin/env bash
# 콘텐츠 계층 내보내기 (운영 → S3) — KAN-62 3단계 · 결정 7.
#
# 운영 서버에서 크론으로 돈다(백업 10분 뒤). 콘텐츠 계층 6개 표의 **데이터만** 덤프해 백업 버킷의
# content-sync/ 접두사에 올린다. 개발계는 이 파일만 받아 자기 DB 에 upsert 한다(sync-content-import.sh).
#
#   왜 이 방향인가: 개발계가 운영 DB 에 직접 붙거나 운영 서버에 SSH 하려면 개발계가 운영 자격증명을 들어야
#   한다. 반대로 운영이 "콘텐츠만" 내보내면 사용자 개인정보는 운영 밖으로 한 바이트도 나가지 않고,
#   개발계는 S3 읽기 권한(이 접두사만) 하나로 끝난다.
#
#   10 19 * * * /opt/ear/backend/deploy/sync-content-export.sh >> /var/log/ear-content-sync.log 2>&1   # 04:10 KST
#
# 표: topics · contents · content_topics · content_sources · content_embeddings · content_stats (사용자 표는 절대 넣지 않는다)
set -euo pipefail

TABLES=(topics contents content_topics content_sources content_embeddings content_stats)
LOCK=/tmp/ear-content-export.lock
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
: "${DB_USERNAME:?}" "${DB_NAME:?}" "${BACKUP_BUCKET:?BACKUP_BUCKET required (.env.prod)}"
PREFIX="${CONTENT_SYNC_PREFIX:-content-sync}"

exec 9>"$LOCK"; flock -n 9 || { echo "이전 내보내기가 아직 돌고 있다 — 건너뜀"; exit 1; }
find /tmp -maxdepth 1 -name 'ear-content-*.sql.gz' -mtime +3 -delete 2>/dev/null || true

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
aws s3 cp "$FILE" "s3://${BACKUP_BUCKET}/${PREFIX}/content-${STAMP}.sql.gz" --only-show-errors
aws s3 cp "$FILE" "s3://${BACKUP_BUCKET}/${PREFIX}/content-latest.sql.gz" --only-show-errors
echo "content export ok: ${STAMP} (${SIZE} bytes, tables=${TABLES[*]})"
# 심장박동 지표 — 성공했을 때만 1을 찍는다. CloudWatch 알람이 "25시간 안에 지표 없음"을 잡는다(실패뿐 아니라 미실행도)
aws cloudwatch put-metric-data --region "${AWS_REGION:-ap-northeast-2}" --namespace ear/ops --metric-name CronSuccess \
  --dimensions Job=content-export --value 1 --unit Count 2>/dev/null || echo "경고: 심장박동 지표 기록 실패(권한/네트워크) — 알람이 오탐할 수 있다"
