#!/usr/bin/env bash
# 제품 서버(API) 코드 반입 + 재배포. 로컬에서도, CI(.github/workflows/deploy-api.yml)에서도 같은 것을 쓴다.
#
# 서버는 git 으로 받는다 — 이 레포는 public 이라 서버에 자격증명이 필요 없다(AI 서버가 rsync 를
# 쓰는 이유였던 deploy key 차단이 여기서는 걸리지 않는다). `.env.prod` 는 서버에만 있고 git 이
# 추적하지 않으므로 갱신 과정에서 건드려지지 않는다.
#
#   bash backend/deploy/push.sh                 # dev 를 서버에 반영
#   HOST=<ip> PEM=<pem> REF=<브랜치> 로 대상 변경
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
HOST="${HOST:-43.203.57.240}"
PEM="${PEM:-$ROOT/backend/deploy/aws/out/ear-prod.pem}"
REF="${REF:-dev}"
DEST=/opt/ear
HEALTH_URL="${HEALTH_URL:-https://api.earcast.co.kr/api/v1/health}"

# keepalive — 서버 빌드가 수 분간 출력 없이 돌면 유휴 연결이 끊긴다(AI 서버에서 실측된 실패 원인)
SSH="ssh -i $PEM -o StrictHostKeyChecking=accept-new -o ServerAliveInterval=15 -o ServerAliveCountMax=60"

echo "▶ $HOST 에 $REF 반영"
$SSH "ec2-user@$HOST" "
  set -euo pipefail
  cd $DEST
  BEFORE=\$(git rev-parse --short HEAD)
  git fetch --quiet origin $REF
  # --ff-only: 서버에 로컬 커밋이 생겼다면 조용히 덮지 않고 실패한다 — 사람이 봐야 하는 상태다
  git merge --ff-only origin/$REF
  AFTER=\$(git rev-parse --short HEAD)
  echo \"  \$BEFORE → \$AFTER\"
  cd backend
  docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build api
"

# 기동 확인 — 마이그레이션이 실패하면 컨테이너가 안 뜨고(의도), 헬스가 200 을 주지 않는다
echo "▶ 헬스 확인 ($HEALTH_URL)"
for i in $(seq 1 30); do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$HEALTH_URL" || true)
  if [ "$code" = "200" ]; then echo "✅ 200 (${i}회째)"; exit 0; fi
  sleep 5
done

echo "❌ 헬스가 200 이 아니다 (마지막 응답: ${code:-없음})" >&2
echo "   서버 로그: aws logs tail /ear/api --since 10m   또는  $SSH ec2-user@$HOST 'cd $DEST/backend && docker compose -f docker-compose.prod.yml logs --tail 100 api'" >&2
exit 1
