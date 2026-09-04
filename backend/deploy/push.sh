#!/usr/bin/env bash
# 제품 서버(API) 코드 반입 + 재배포. 로컬에서도, CI(.github/workflows/deploy-api.yml)에서도 같은 것을 쓴다.
#
# 서버에는 git 이 없다 — `/opt/ear/backend` 에 파일만 있다(2026-09-04 실측). 그래서 커밋 트리를
# `git archive` 로 떠서 tar 로 푼다. 추적되지 않는 파일(`.env.prod`)은 아카이브에 없으므로
# 그대로 남는다 — rsync --delete 처럼 지워버릴 위험이 없다.
#
#   bash backend/deploy/push.sh                 # 현재 HEAD 를 서버에 반영
#   HOST=<ip> PEM=<pem> REF=<커밋> 로 대상 변경
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
HOST="${HOST:-43.203.57.240}"
PEM="${PEM:-$ROOT/backend/deploy/aws/out/ear-prod-isb.pem}"
REF="${REF:-HEAD}"
DEST=/opt/ear
HEALTH_URL="${HEALTH_URL:-https://api.earcast.co.kr/api/v1/health}"

# keepalive — 서버 빌드가 수 분간 출력 없이 돌면 유휴 연결이 끊긴다(AI 서버에서 실측된 실패 원인)
SSH="ssh -i $PEM -o StrictHostKeyChecking=accept-new -o ServerAliveInterval=15 -o ServerAliveCountMax=60"
REV="$(git -C "$ROOT" rev-parse --short "$REF")"
[ -z "$(git -C "$ROOT" status --porcelain -- backend)" ] || REV="$REV-dirty"

echo "▶ $HOST 에 $REV 반입 (git archive → tar)"
# `backend` 경로만 뜬다 — 아카이브 안 경로가 backend/… 라 $DEST 에서 풀면 /opt/ear/backend 가 된다
git -C "$ROOT" archive "$REF" backend | $SSH "ec2-user@$HOST" "tar -x -C $DEST"

echo "▶ 재기동"
$SSH "ec2-user@$HOST" "
  set -euo pipefail
  cd $DEST/backend
  # Windows 체크아웃에서 CRLF 가 섞이면 셰뱅이 깨져 컨테이너가 안 뜬다(README 2장 주의)
  find deploy -type f -name '*.sh' -exec sed -i 's/\r\$//' {} +
  [ -f .env.prod ] || { echo '.env.prod 가 서버에 없다 — 최초 설치는 README 2장'; exit 1; }
  docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build api
"

# 기동 확인 — 마이그레이션이 실패하면 컨테이너가 안 뜨고(의도), 헬스가 200 을 주지 않는다
echo "▶ 헬스 확인 ($HEALTH_URL)"
for i in $(seq 1 30); do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$HEALTH_URL" || true)
  if [ "$code" = "200" ]; then echo "✅ 200 (${i}회째) — $REV 배포 완료"; exit 0; fi
  sleep 5
done

echo "❌ 헬스가 200 이 아니다 (마지막 응답: ${code:-없음})" >&2
echo "   로그: aws logs tail /ear/api --since 10m" >&2
echo "   또는: $SSH ec2-user@$HOST 'cd $DEST/backend && docker compose -f docker-compose.prod.yml logs --tail 100 api'" >&2
exit 1
