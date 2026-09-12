#!/usr/bin/env bash
# 매일 pg_dump → S3. 크론: 0 19 * * * /opt/ear/backend/deploy/backup.sh >> /var/log/ear-backup.log 2>&1
#   (UTC 19 = KST 04). 필요: aws cli(인스턴스 롤 s3:PutObject), .env.prod 의 DB_*·BACKUP_BUCKET
#
# 이 배치는 **조용히 실패하는 것이 가장 위험하다.** 2026-08-31~09-11 열하루 동안 매일 죽었는데
# 아무 신호가 없었고, 복구가 필요했다면 복구할 대상이 없었다. 아래 방어는 전부 그 사고에서 나왔다.
set -euo pipefail

FILE=""
LOCK=/tmp/ear-backup.lock

# **트랩을 맨 먼저 건다.** 종전에는 덤프 직전에 걸어서, .env.prod 를 못 읽는 등 앞단 실패가
# 알림 없이 로그에만 남았다 — 그리고 로그는 아무도 보지 않는다(위 사고).
cleanup() {
  local code=$?
  # 성공했을 때만 지운다. 업로드가 일시적으로 실패했는데 덤프까지 버리면 그날 백업이 사라진다
  if [ "$code" -eq 0 ]; then
    [ -n "$FILE" ] && rm -f "$FILE"
    exit 0
  fi
  echo "backup FAILED: exit ${code}${FILE:+ (덤프 보존: $FILE)}"
  if [ -n "${SLACK_ERROR_WEBHOOK_URL:-}" ]; then
    curl -sS -m 10 -X POST -H 'content-type: application/json' \
      -d "{\"text\":\":rotating_light: DB 백업 실패 (exit ${code}) — $(hostname) $(date -u +%FT%TZ). /var/log/ear-backup.log 확인\"}" \
      "$SLACK_ERROR_WEBHOOK_URL" >/dev/null 2>&1 || true
  fi
  exit "$code"
}
# EXIT 만으로는 SIGTERM·SIGHUP(인스턴스 종료·OOM)에 트랩이 돌지 않는다 — 알림 없이 사라진다
trap cleanup EXIT INT TERM HUP

cd "$(dirname "$0")/.."

# **.env.prod 를 source 하지 않는다.** 이 파일은 docker compose 의 env_file 이지 셸 스크립트가 아니다 —
# compose 형식은 따옴표 없는 값에 공백과 <> 를 허용하는데 셸은 그것을 리다이렉트로 읽는다.
# `MAIL_FROM_ADDRESS=이어 <no-reply@...>` 한 줄이 위 열하루 사고의 1차 원인이었다.
#
# **마지막 항목을 쓴다(tail).** compose 의 dotenv 파서가 중복 키에서 마지막을 채택하기 때문이다.
# 처음 것을 잡으면 운영자가 `echo 'DB_NAME=...' >> .env.prod` 로 값을 고쳤을 때 앱은 새 DB 를
# 쓰고 백업은 옛 DB 를 뜬다 — pg_dump 는 성공하고 크기도 정상이라 복구할 때까지 아무도 모른다.
env_of() { sed -n "s/^$1=//p" .env.prod | tr -d '\r' | tail -n 1; }

DB_USERNAME=$(env_of DB_USERNAME)
DB_NAME=$(env_of DB_NAME)
BACKUP_BUCKET=$(env_of BACKUP_BUCKET)
SLACK_ERROR_WEBHOOK_URL=$(env_of SLACK_ERROR_WEBHOOK_URL)

: "${DB_USERNAME:?DB_USERNAME required (.env.prod)}"
: "${DB_NAME:?DB_NAME required (.env.prod)}"
: "${BACKUP_BUCKET:?BACKUP_BUCKET required (.env.prod)}"
# 알림이 이 배치의 **유일한** 신호다. 비어 있으면 실패해도 다시 조용해지므로 시작할 때 알린다
[ -n "$SLACK_ERROR_WEBHOOK_URL" ] || echo "경고: SLACK_ERROR_WEBHOOK_URL 이 비어 있다 — 실패해도 알림이 가지 않는다"

# 앞 실행이 멈춰 있는데 다음 크론이 겹쳐 도는 것을 막는다(덤프 중 hang → 매일 한 개씩 쌓인다)
exec 9>"$LOCK"
flock -n 9 || { echo "이전 백업이 아직 돌고 있다 — 건너뜀"; exit 1; }

# 실패해 보존된 옛 덤프 청소 — /tmp 가 무한정 차지 않게
find /tmp -maxdepth 1 -name 'ear-*.sql.gz' -mtime +3 -delete 2>/dev/null || true

STAMP=$(date -u +%Y%m%dT%H%M%SZ)
FILE="/tmp/ear-${STAMP}.sql.gz"
# 덤프에는 전체 사용자 개인정보가 들어 있다 — /tmp 는 누구나 읽는다. 만들자마자 권한을 좁힌다
install -m 600 /dev/null "$FILE"

# **--env-file 을 반드시 준다.** compose 가 ${DB_NAME}·${API_DOMAIN} 등을 치환하는데, 종전에는
# `source .env.prod` 가 그 값을 환경에 올려 주고 있었다. source 를 걷어내면서 이것이 사라지면
# compose 가 "required variable ... is missing" 으로 죽고 파이프 뒤 gzip 은 성공해 **20바이트짜리
# 빈 덤프가 올라간다**(2026-09-12 실측).
#
# timeout: 백엔드의 긴 트랜잭션이 pg_dump 의 락 획득을 막으면 무한정 매달린다 — 그러면 EXIT 트랩도
# 돌지 않아 알림조차 없다. 30분을 넘기면 실패로 끊는다.
timeout 1800 docker compose -f docker-compose.prod.yml --env-file .env.prod exec -T postgres \
  pg_dump -U "$DB_USERNAME" -d "$DB_NAME" --no-owner | gzip > "$FILE"

# **완결성은 덤프 꼬리의 표식으로 본다.** 크기 하한은 거의 못 잡는다 — 빈 DB 의 스키마 덤프도 수 KB 라
# "그럴듯한 크기의 쓸모없는 백업"을 통과시킨다. pg_dump 는 정상 종료 시 반드시 이 표식을 찍으므로
# 중간에 끊긴 스트림이 여기서 걸린다.
#
# 마지막 줄이 아니라 **꼬리 20줄**을 본다 — pg16 의 pg_dump 는 표식 뒤에 `\unrestrict <토큰>` 줄을
# 더 붙인다(2026-09-12 실측: 표식 3514행, 파일 3518행). 버전이 올라가며 꼬리가 또 늘 수 있다.
zcat "$FILE" | tail -n 20 | grep -q 'PostgreSQL database dump complete' \
  || { echo "덤프가 완결되지 않았다 (꼬리에 완결 표식 없음) — 업로드하지 않는다"; exit 1; }

SIZE=$(stat -c %s "$FILE")
aws s3 cp "$FILE" "s3://${BACKUP_BUCKET}/pg/ear-${STAMP}.sql.gz" --only-show-errors
echo "backup ok: ${STAMP} (${SIZE} bytes, db=${DB_NAME})"
# 보관 기간은 버킷 라이프사이클(30일) — deploy/aws/setup-audio-cdn.sh 가 pg/ 접두사에 건다.
