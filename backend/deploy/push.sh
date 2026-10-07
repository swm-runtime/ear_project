#!/usr/bin/env bash
# 제품 서버(API) 코드 반입 + 재배포. 로컬에서도, CI(.github/workflows/deploy-api.yml)에서도 같은 것을 쓴다.
#
# 서버에는 git 이 없다 — `/opt/ear/backend` 에 파일만 있다(2026-09-04 실측). 그래서 커밋 트리를
# `git archive` 로 떠서 tar 로 푼다. 추적되지 않는 파일(`.env.prod`)은 아카이브에 없으므로
# 그대로 남는다 — rsync --delete 처럼 지워버릴 위험이 없다.
#
#   bash backend/deploy/push.sh                 # 현재 HEAD 를 서버에 반영
#   HOST=<ip> PEM=<pem> REF=<커밋> 로 대상 변경. 개발계는 SECRET_ID=ear/dev/api HEALTH_URL=https://api-dev.… (setup-dev-server.sh 가 넘긴다)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
HOST="${HOST:-43.203.57.240}"
PEM="${PEM:-$ROOT/backend/deploy/aws/out/ear-prod-isb.pem}"
REF="${REF:-HEAD}"
DEST=/opt/ear
HEALTH_URL="${HEALTH_URL:-https://api.earcast.co.kr/api/v1/health}"
SECRET_ID="${SECRET_ID:-ear/prod/api}"   # Secrets Manager 비밀값 묶음 — 환경마다 다르다(운영 ear/prod/api · 개발 ear/dev/api)
# API_IMAGE=<ECR uri>:<tag> 를 주면 서버가 빌드하지 않고 그 이미지를 pull 해 띄운다(KAN-62 4단계). 비우면 종전처럼 서버 빌드.
# 롤백 = 이전 커밋 SHA 태그로 다시 실행. 인스턴스 롤에 ecr-pull(setup-ecr.sh)이 있어야 한다.
API_IMAGE="${API_IMAGE:-}"

# keepalive — 서버 빌드가 수 분간 출력 없이 돌면 유휴 연결이 끊긴다(AI 서버에서 실측된 실패 원인)
SSH="ssh -i $PEM -o StrictHostKeyChecking=accept-new -o ServerAliveInterval=15 -o ServerAliveCountMax=60"
REV="$(git -C "$ROOT" rev-parse --short "$REF")"
[ -z "$(git -C "$ROOT" status --porcelain -- backend)" ] || REV="$REV-dirty"

echo "▶ $HOST 에 $REV 반입 (git archive → tar)${API_IMAGE:+ · 이미지 $API_IMAGE}"
# `backend` 경로만 뜬다 — 아카이브 안 경로가 backend/… 라 $DEST 에서 풀면 /opt/ear/backend 가 된다
git -C "$ROOT" archive "$REF" backend | $SSH "ec2-user@$HOST" "tar -x -C $DEST"

echo "▶ 재기동"
$SSH "ec2-user@$HOST" "
  set -euo pipefail
  cd $DEST/backend
  # Windows 체크아웃에서 CRLF 가 섞이면 셰뱅이 깨져 컨테이너가 안 뜬다(README 2장 주의)
  find deploy -type f -name '*.sh' -exec sed -i 's/\r\$//' {} +
  [ -f .env.prod ] || { echo '.env.prod 가 서버에 없다 — 최초 설치는 README 2장'; exit 1; }

  # 비밀값의 원천은 Secrets Manager 다($SECRET_ID — tickets/infra prod-secrets-storage).
  # 배포마다 내려받아 .env.prod 의 비밀 항목만 덮어쓴다. 조회가 실패하면 set -e 로 여기서
  # 멈춘다 — .env.prod 도 컨테이너도 아직 건드리지 않은 상태라 돌던 API 가 그대로 산다.
  command -v aws >/dev/null || { echo 'aws CLI 가 서버에 없다'; exit 1; }
  command -v python3 >/dev/null || { echo 'python3 가 서버에 없다'; exit 1; }
  SECRET_TMP=\$(mktemp /tmp/ear-secret.XXXXXX.json); chmod 600 \"\$SECRET_TMP\"
  trap 'shred -u \"\$SECRET_TMP\" 2>/dev/null || rm -f \"\$SECRET_TMP\"' EXIT
  aws secretsmanager get-secret-value --region \${AWS_REGION:-ap-northeast-2} \
    --secret-id $SECRET_ID --query SecretString --output text > \"\$SECRET_TMP\"
  cp .env.prod .env.prod.bak          # 갱신이 깨졌을 때 되돌릴 자리 — 한 세대만 유지
  # **선택 env 키를 .env.prod 에 미리 선언한다.** apply-secrets.py 는 Secrets 에만 있고 .env.prod 에
  # 없는 키를 만나면 배포를 중단시킨다(조용히 키를 늘리는 쪽이 더 위험하다는 판단 — 그 판단은
  # 그대로다). 다만 코드가 \"비면 꺼진다\" 로 다루는 **알려진 선택 키**는 서버마다 SSH 로 한 줄씩
  # 넣어 주는 대신 여기서 빈 값으로 선언해 둔다. 값은 여전히 Secrets 가 채우고, Secrets 에 없으면
  # 빈 채로 남아 기능이 꺼진다. 목록에 없는 키는 종전처럼 막힌다.
  for KEY in GA4_PROPERTY_ID GA4_SERVICE_ACCOUNT_BASE64 SLACK_SIGNUP_WEBHOOK_URL RECOMMEND_TEST_EMAIL AUTO_EXPAND_ENABLED SIGNUP_TRIAL_ENABLED SIGNUP_TRIAL_DAYS SIGNUP_TRIAL_EXISTING_USERS_BEFORE SERVICE_DAY_BOUNDARY_05_FROM APP_STORE_BUNDLE_ID APP_STORE_APP_APPLE_ID APP_STORE_ENVIRONMENTS APP_STORE_ISSUER_ID APP_STORE_KEY_ID APP_STORE_PRIVATE_KEY_BASE64 GOOGLE_PLAY_PACKAGE_NAME GOOGLE_PLAY_SERVICE_ACCOUNT_BASE64 GOOGLE_PLAY_PUBSUB_AUDIENCE GOOGLE_PLAY_PUBSUB_SERVICE_ACCOUNT APP_STORE_CONNECT_ISSUER_ID APP_STORE_CONNECT_KEY_ID APP_STORE_CONNECT_PRIVATE_KEY_BASE64; do
    grep -q \"^\$KEY=\" .env.prod || printf '%s=\\n' \"\$KEY\" >> .env.prod
  done
  python3 deploy/apply-secrets.py \"\$SECRET_TMP\" .env.prod

  if [ -n \"$API_IMAGE\" ]; then
    REGISTRY=\"${API_IMAGE%%/*}\"
    aws ecr get-login-password --region \${AWS_REGION:-ap-northeast-2} | docker login --username AWS --password-stdin \"\$REGISTRY\" >/dev/null
    API_IMAGE=\"$API_IMAGE\" docker compose -f docker-compose.prod.yml --env-file .env.prod pull api
    API_IMAGE=\"$API_IMAGE\" docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --no-build api
    # 다음에 API_IMAGE 없이(옛 방식) 배포해도 compose 가 같은 컨테이너를 잡도록 남겨둔다 — 값은 기록용
    echo \"$API_IMAGE\" > .api-image
    # 옛 이미지 정리 — pull 로 새 태그가 오면 이전 태그는 남아 배포마다 디스크가 는다
    # (CWAgent 실측 2026-09-15~23: 하루 약 1%p, 09-24 수동 정리로 24%p 회수). `-a` 여야 태그가 남은
    # 미사용 이미지도 지워지고, 실행 중 컨테이너의 이미지는 절대 대상이 아니다. 24시간 전 것만 —
    # 방금 pull 한 이미지가 어떤 이유로 아직 안 붙었더라도 지워지지 않게.
    docker image prune -af --filter \"until=24h\" >/dev/null 2>&1 || true
  else
    docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build api
  fi
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
