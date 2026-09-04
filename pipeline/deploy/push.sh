#!/usr/bin/env bash
# 로컬 → AI 서버 코드 반입 + 재배포 (deploy/README.md 3·5장).
# 조직 설정이 이 레포의 deploy key 를 막아서(2026-09-02 확인) 서버는 git 을 쓰지 않는다 —
# 노트북 체크아웃을 rsync 로 밀고(자격증명·비밀·산출물 미포함) 서버에서 compose 가 빌드한다.
#   bash pipeline/deploy/push.sh              # rsync → compose up -d --build
#   HOST=<ip> PEM=<pem 경로> 로 대상 변경
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
HOST="${HOST:-54.116.31.183}"
PEM="${PEM:-$ROOT/pipeline/deploy/aws/out/ear-ai-isb.pem}"
DEST=/opt/ear/ear_project
# keepalive — 서버 빌드가 수 분간 출력 없이 돌면(의존성 변경 시 npm ci) 유휴 연결이 끊긴다.
# CI 런 33864399977(2026-09-04)이 npm ci 4분 30초 침묵 후 Broken pipe로 실패한 원인.
SSH="ssh -i $PEM -o StrictHostKeyChecking=accept-new -o ServerAliveInterval=15 -o ServerAliveCountMax=60"
REV="$(git -C "$ROOT" rev-parse --short HEAD)"
[ -z "$(git -C "$ROOT" status --porcelain -- pipeline ai-server)" ] || REV="$REV-dirty"

$SSH "ec2-user@$HOST" "mkdir -p $DEST"
# 서버의 env 실값(deploy/env.prod·env.ai-server)은 --delete 에서 보호(P)한다. .env.example 템플릿만 넘어간다.
rsync -az --delete -e "$SSH" \
  --include='.env.example' \
  --exclude='.git' --exclude=node_modules --exclude='.next' --exclude='.work' \
  --exclude='.env' --exclude='.env.*' --exclude='deploy/aws/out' \
  --exclude='*.mp3' --exclude='*.wav' --exclude='.DS_Store' \
  --filter='P pipeline/deploy/env.prod' --filter='P pipeline/deploy/env.ai-server' \
  "$ROOT/pipeline" "$ROOT/ai-server" "ec2-user@$HOST:$DEST/"
echo "rsync 완료 → $HOST:$DEST (rev $REV)"

$SSH "ec2-user@$HOST" "
  set -e; cd $DEST/pipeline
  if [ ! -f deploy/env.prod ]; then
    cp deploy/env.prod.example deploy/env.prod
    cp ../ai-server/.env.example deploy/env.ai-server
    echo '⚠ 최초 1회: deploy/env.prod 와 deploy/env.ai-server 의 비밀값을 채운 뒤 push.sh 를 다시 실행 (README 3장)'
    exit 2
  fi
  WORKER_REV=$REV docker compose -f deploy/docker-compose.prod.yml --env-file deploy/env.prod up -d --build
"
