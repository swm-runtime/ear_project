#!/usr/bin/env bash
# 매일 pg_dump → S3. 크론 예: 0 19 * * * /opt/ear/backend/deploy/backup.sh  (UTC 19 = KST 04)
# 필요: aws cli(인스턴스 롤에 s3:PutObject), .env.prod의 DB_*, BACKUP_BUCKET
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; source .env.prod; set +a
: "${BACKUP_BUCKET:?BACKUP_BUCKET required}"

STAMP=$(date -u +%Y%m%dT%H%M%SZ)
FILE="/tmp/ear-${STAMP}.sql.gz"
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U "$DB_USERNAME" -d "$DB_NAME" --no-owner | gzip > "$FILE"
aws s3 cp "$FILE" "s3://${BACKUP_BUCKET}/pg/ear-${STAMP}.sql.gz" --only-show-errors
rm -f "$FILE"
echo "backup ok: ${STAMP}"
# 보관 기간은 버킷 라이프사이클(30일)로 자른다 — setup.sh가 건다.
