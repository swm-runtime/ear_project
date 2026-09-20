#!/usr/bin/env bash
# 운영 → 개발계 "콘텐츠 반영 알림" 경로를 만든다 (2026-09-20, KAN-84).
#
# 무엇을 하는가
#   1) 알림 전용 SSH 키를 만든다(로컬 `out/ear-content-sync-notify`).
#   2) 개발계 `authorized_keys` 에 공개키를 넣되 **command="…/sync-content-import.sh"** 로 묶는다.
#      그 키로는 들여오기 스크립트 말고 아무것도 실행할 수 없다(포트 포워딩·PTY 도 막는다).
#   3) 개인키를 운영 서버 `/opt/ear/backend/deploy/keys/content-sync` 에 둔다(600).
#   4) 운영 `.env.prod` 에 `CONTENT_SYNC_NOTIFY_HOST=<개발계 사설 IP>` 를 넣는다.
#   5) 개발계 SG 22번을 **운영 SG 에서만** 열어 준다(사설 IP·같은 VPC, 공개 노출 없음).
#
# 왜 이 방식인가
#   - 운영이 발행 직후 한 번 알려 주면 개발계가 곧바로 받아 간다 — 개발계가 계속 물어보지 않아도 된다.
#   - 알림이 실패해도 덤프는 S3 에 올라가 있고 개발계 안전망 크론(하루 1회)이 다음에 받는다.
#   - 운영이 개발계에서 할 수 있는 일은 "들여오기 실행" 하나뿐이다. 반대 방향(개발계 → 운영)은 열지 않는다.
#
# 실행: bash backend/deploy/aws/setup-content-sync-notify.sh
# 필요: AWS SSO 로그인(profile isb), 운영·개발계 pem(out/), 두 서버 22 번 접근(스크립트가 내 IP 로 잠깐 연다)
set -euo pipefail

PROFILE="${AWS_PROFILE:-isb}"
REGION="${AWS_REGION:-ap-northeast-2}"
PROD_HOST="${PROD_HOST:-43.203.57.240}"
PROD_SG="${PROD_SG:-sg-048aaaf95e4d12b2e}"
DEV_SG="${DEV_SG:-sg-0f8f793be74bd58e4}"
DEV_INSTANCE="${DEV_INSTANCE:-i-0a22112e947856a71}"
OUT="$(cd "$(dirname "$0")" && pwd)/out"
PROD_PEM="${PROD_PEM:-$HOME/.ssh/ear-prod-isb.pem}"
DEV_PEM="${DEV_PEM:-$OUT/ear-dev-isb.pem}"
KEY="$OUT/ear-content-sync-notify"
SSH_OPTS=(-o StrictHostKeyChecking=accept-new -o ConnectTimeout=15)

aws sts get-caller-identity --profile "$PROFILE" >/dev/null 2>&1 \
  || { echo "SSO 세션 만료 — aws sso login --profile $PROFILE --no-browser"; exit 1; }
[ -r "$PROD_PEM" ] || { echo "운영 pem 이 없다: $PROD_PEM"; exit 1; }
[ -r "$DEV_PEM" ] || { echo "개발계 pem 이 없다: $DEV_PEM"; exit 1; }

DEV_IP=$(aws ec2 describe-instances --profile "$PROFILE" --region "$REGION" \
  --instance-ids "$DEV_INSTANCE" --query 'Reservations[0].Instances[0].PrivateIpAddress' --output text)
[ -n "$DEV_IP" ] && [ "$DEV_IP" != "None" ] || { echo "개발계 사설 IP 를 찾지 못했다"; exit 1; }
echo "▶ 개발계 사설 IP: $DEV_IP"

echo "▶ 1/5 알림 전용 키"
if [ -f "$KEY" ]; then
  echo "  이미 있다 — 다시 만들지 않는다"
else
  ssh-keygen -t ed25519 -N '' -C 'ear content-sync notify (prod -> dev)' -f "$KEY" >/dev/null
  chmod 600 "$KEY"
fi

echo "▶ 2/5 개발계 SG 22 를 운영 SG 에서 열기"
aws ec2 authorize-security-group-ingress --profile "$PROFILE" --region "$REGION" \
  --group-id "$DEV_SG" --ip-permissions \
  "IpProtocol=tcp,FromPort=22,ToPort=22,UserIdGroupPairs=[{GroupId=$PROD_SG,Description=content-sync-notify}]" \
  >/dev/null 2>&1 && echo "  열었다" || echo "  이미 열려 있다"

MYIP=$(curl -s https://checkip.amazonaws.com | tr -d '[:space:]')
opened=()
open_for_me() {
  aws ec2 authorize-security-group-ingress --profile "$PROFILE" --region "$REGION" \
    --group-id "$1" --protocol tcp --port 22 --cidr "$MYIP/32" >/dev/null 2>&1 && opened+=("$1") || true
}
close_mine() {
  for sg in "${opened[@]:-}"; do
    [ -n "$sg" ] || continue
    aws ec2 revoke-security-group-ingress --profile "$PROFILE" --region "$REGION" \
      --group-id "$sg" --protocol tcp --port 22 --cidr "$MYIP/32" >/dev/null 2>&1 || true
  done
}
trap close_mine EXIT
open_for_me "$DEV_SG"; open_for_me "$PROD_SG"; sleep 5

echo "▶ 3/5 개발계 authorized_keys 에 forced command 로 등록"
PUB=$(cat "$KEY.pub")
ssh -i "$DEV_PEM" "${SSH_OPTS[@]}" "ec2-user@$DEV_IP" bash -s <<EOF
set -euo pipefail
mkdir -p ~/.ssh && chmod 700 ~/.ssh
touch ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys
# 같은 키의 옛 줄을 지우고 다시 넣는다(키 교체도 이 스크립트로 한다)
grep -v 'ear content-sync notify' ~/.ssh/authorized_keys > ~/.ssh/authorized_keys.new || true
printf 'command="/opt/ear/backend/deploy/sync-content-import.sh >> /var/log/ear-content-sync.log 2>&1",no-agent-forwarding,no-port-forwarding,no-pty,no-X11-forwarding %s\n' '$PUB' >> ~/.ssh/authorized_keys.new
mv ~/.ssh/authorized_keys.new ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
echo "  등록 완료: \$(grep -c 'ear content-sync notify' ~/.ssh/authorized_keys) 줄"
EOF

echo "▶ 4/5 운영에 개인키 설치 + .env.prod 설정"
scp -i "$PROD_PEM" "${SSH_OPTS[@]}" "$KEY" "ec2-user@$PROD_HOST:/tmp/content-sync-key" >/dev/null
ssh -i "$PROD_PEM" "${SSH_OPTS[@]}" "ec2-user@$PROD_HOST" bash -s <<EOF
set -euo pipefail
install -d -m 700 /opt/ear/backend/deploy/keys
install -m 600 /tmp/content-sync-key /opt/ear/backend/deploy/keys/content-sync
shred -u /tmp/content-sync-key 2>/dev/null || rm -f /tmp/content-sync-key
cd /opt/ear/backend
# .env.prod 는 배포가 덮어쓰지 않는 파일이다(비밀값만 Secrets Manager 가 갱신한다)
if grep -q '^CONTENT_SYNC_NOTIFY_HOST=' .env.prod; then
  sed -i "s|^CONTENT_SYNC_NOTIFY_HOST=.*|CONTENT_SYNC_NOTIFY_HOST=$DEV_IP|" .env.prod
else
  printf '\n# 콘텐츠 발행 시 개발계에 알릴 주소(KAN-84)\nCONTENT_SYNC_NOTIFY_HOST=$DEV_IP\n' >> .env.prod
fi
grep '^CONTENT_SYNC_NOTIFY_HOST=' .env.prod
EOF

echo "▶ 5/5 운영 크론을 1분 주기로 (바뀐 게 없으면 즉시 끝난다)"
ssh -i "$PROD_PEM" "${SSH_OPTS[@]}" "ec2-user@$PROD_HOST" bash -s <<'EOF'
set -euo pipefail
LINE='*/1 * * * * /opt/ear/backend/deploy/sync-content-export.sh >> /var/log/ear-content-sync.log 2>&1'
crontab -l 2>/dev/null | grep -v 'sync-content-export.sh' > /tmp/ear-cron || true
echo "$LINE" >> /tmp/ear-cron
crontab /tmp/ear-cron && rm -f /tmp/ear-cron
crontab -l | grep sync-content-export
EOF

echo "✅ 완료 — 운영에서 콘텐츠를 발행하면 1분 안에 개발계로 넘어간다"
echo "   확인: ssh -i $PROD_PEM ec2-user@$PROD_HOST 'tail -5 /var/log/ear-content-sync.log'"
