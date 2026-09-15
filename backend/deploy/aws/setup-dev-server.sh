#!/usr/bin/env bash
# 개발계 API 서버 만들기 (tickets/infra/pending/dev-environment-and-main-deploy.md 1단계) — 멱등.
#
#   ADMIN_IP=x.x.x.x AWS_PROFILE=isb bash backend/deploy/aws/setup-dev-server.sh            # AWS 리소스 + 시크릿 + env 초안
#   ADMIN_IP=x.x.x.x AWS_PROFILE=isb BOOTSTRAP=1 bash backend/deploy/aws/setup-dev-server.sh  # + 서버에 env 반입·첫 배포
#
# 만드는 것(전부 신규 — 운영 리소스는 참조만, 무변경):
#   키페어 ear-dev(→ out/ear-dev-isb.pem) — 이름은 SERVER_NAME(기본 ear-dev) · SG ear-dev-sg(22 관리자IP · 80 · 443) · IAM 역할/프로필 ear-dev-ec2
#   (secrets-read ear/dev/api · 로그 /ear-dev/* · ses-send · CloudWatchAgentServerPolicy — 버킷 권한은 2단계에서)
#   EC2 t4g.small(AL2023 arm64, gp3 20GB, IMDSv2 hop 2, user-data: docker·compose·buildx·cronie·스왑 2G) · EIP
#   Secrets Manager ear/dev/api — 운영과 같은 8개 키. 랜덤 비밀은 새로 만들고(운영 값 재사용 금지) 화면에 찍지 않는다
#   out/ear-dev.env.prod — 서버 .env.prod 초안(관리자 콘솔 설정은 만들지 않는다 — 콘솔은 AI 서버 몫)(비밀 항목은 자리표시 — push.sh 가 배포마다 Secrets Manager 값으로 덮어쓴다)
# 만들지 않는 것: 운영 이미지 복제(실사용자 데이터·운영 비밀이 따라온다) · NAT · ALB · RDS · WAF
# 사람 몫(끝에 출력): 가비아 A 레코드 1개(api-dev) · KAKAO_APP_ID
#
# 관리자 콘솔은 개발계에 두지 않는다 — 콘솔은 2026-09-03 부터 AI 서버의 파이프라인 웹(admin.earcast.co.kr /publish)이고
# 그 서버는 운영 하나만 둔다(결정 3). 백엔드 Caddy 의 정적 콘솔 블록(ADMIN_DOMAIN)은 퇴역 대상이라 개발계에서는
# 외부에 노출되지 않는 내부 포트(:8099)에 묶어 두기만 한다.
set -euo pipefail

REGION="${AWS_REGION:-ap-northeast-2}"
ADMIN_IP="${ADMIN_IP:?ADMIN_IP 가 필요합니다 (SSH 22 를 열 관리자 IP, 예: 1.2.3.4)}"
SERVER_NAME="${SERVER_NAME:-ear-dev}"   # NAME 은 셸에 이미 있을 수 있어(호스트명 등) 쓰지 않는다 — 2026-09-15 실측 사고
ROLE="${ROLE:-ear-dev-ec2}"
SG_NAME="${SG_NAME:-ear-dev-sg}"
INSTANCE_TYPE="${INSTANCE_TYPE:-t4g.small}"
VPC_ID="${VPC_ID:-vpc-07bfc7f134e639989}"           # 기본 VPC — 운영과 같다 (docs/infra/inventory.md 1장, 결정 2)
SUBNET_ID="${SUBNET_ID:-subnet-0343791d0f49bcaa8}"  # 퍼블릭 서브넷 2a — 운영 EC2 와 같은 곳
SECRET_ID="${SECRET_ID:-ear/dev/api}"
LOG_PREFIX="${LOG_PREFIX:-/ear-dev}"
BASE_DOMAIN="${BASE_DOMAIN:-earcast.co.kr}"
API_DOMAIN="${API_DOMAIN:-api-dev.$BASE_DOMAIN}"
ADMIN_DOMAIN="${ADMIN_DOMAIN:-:8099}"   # 정적 콘솔 블록을 죽이는 값 — compose 가 8099 를 공개하지 않아 밖에서 닿지 않는다
CONSOLE_ORIGIN="${CONSOLE_ORIGIN:-https://admin.$BASE_DOMAIN}"   # 파이프라인 웹(발행 콘솔)의 오리진 — 개발계 API 를 겨눌 때를 위해 CORS 에 넣어둔다
# 비밀 아닌 클라이언트 식별자 — 운영과 같은 앱이라 같은 값 (frontend/app.json · inventory.md 5장)
GOOGLE_WEB_CLIENT_ID="${GOOGLE_WEB_CLIENT_ID:-475643832949-q10v2jk03pjh0f37vurot61c216snist.apps.googleusercontent.com}"
APPLE_CLIENT_ID="${APPLE_CLIENT_ID:-com.runtime.ear}"
APPLE_SERVICES_ID="${APPLE_SERVICES_ID:-com.runtime.ear.signin}"
KAKAO_APP_ID="${KAKAO_APP_ID:-0000000}"             # 숫자 앱 ID — 운영 .env.prod 또는 Kakao Developers 에서. 기본값은 자리표시(카카오 로그인만 실패)
APP_VERSION="${APP_VERSION:-1.0.0}"

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
OUT="$(cd "$(dirname "$0")" && pwd)/out"
mkdir -p "$OUT"
ACCOUNT=$(command aws --region "$REGION" sts get-caller-identity --query Account --output text)

say() { printf '\n=== %s\n' "$*"; }
aws() { command aws --region "$REGION" "$@"; }

say "계정 확인"
aws sts get-caller-identity --query '[Account,Arn]' --output text
[ "$ACCOUNT" = "639177726357" ] || { echo "ISB 계정(639177726357)이 아니다: $ACCOUNT"; exit 1; }

# ── 1. 키페어 ─────────────────────────────────────────────────
say "키페어 $SERVER_NAME"
if aws ec2 describe-key-pairs --key-names "$SERVER_NAME" >/dev/null 2>&1; then
  echo "이미 있음 — 건너뜀 (pem: out/${SERVER_NAME}-isb.pem)"
else
  aws ec2 create-key-pair --key-name "$SERVER_NAME" --key-type ed25519 --query KeyMaterial --output text > "$OUT/${SERVER_NAME}-isb.pem"
  chmod 600 "$OUT/${SERVER_NAME}-isb.pem"
  echo "생성됨 → $OUT/${SERVER_NAME}-isb.pem (커밋 금지 — out/ 은 gitignore)"
fi

# ── 2. 보안그룹 (신규 — 운영 SG 무변경) ────────────────────────
say "보안그룹 $SG_NAME"
SG_ID=$(aws ec2 describe-security-groups --filters "Name=group-name,Values=$SG_NAME" "Name=vpc-id,Values=$VPC_ID" --query 'SecurityGroups[0].GroupId' --output text)
if [ "$SG_ID" = "None" ]; then
  SG_ID=$(aws ec2 create-security-group --group-name "$SG_NAME" --description "ear dev API server (caddy + api + postgres)" --vpc-id "$VPC_ID" \
    --tag-specifications "ResourceType=security-group,Tags=[{Key=Name,Value=$SG_NAME},{Key=Project,Value=ear},{Key=Env,Value=dev}]" --query GroupId --output text)
  echo "생성됨: $SG_ID"
else
  echo "이미 있음: $SG_ID"
fi
allow() { aws ec2 authorize-security-group-ingress --group-id "$SG_ID" "$@" >/dev/null 2>&1 && echo "  허용: $*" || echo "  이미 있음: $*"; }
allow --protocol tcp --port 22  --cidr "$ADMIN_IP/32"
allow --protocol tcp --port 80  --cidr 0.0.0.0/0
allow --protocol tcp --port 443 --cidr 0.0.0.0/0
allow --protocol udp --port 443 --cidr 0.0.0.0/0

# ── 3. 인스턴스 역할 (운영 롤 ear-prod-ec2 재사용 금지 — 개발 시크릿·개발 로그 그룹만) ──
say "IAM 역할·프로필 $ROLE"
if aws iam get-role --role-name "$ROLE" >/dev/null 2>&1; then
  echo "역할 이미 있음"
else
  aws iam create-role --role-name "$ROLE" --tags "Key=Project,Value=ear" "Key=Env,Value=dev" \
    --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"ec2.amazonaws.com"},"Action":"sts:AssumeRole"}]}' >/dev/null
  echo "역할 생성됨"
fi
put() { aws iam put-role-policy --role-name "$ROLE" --policy-name "$1" --policy-document "$2"; echo "  인라인 정책: $1"; }
put secrets-read "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Action\":[\"secretsmanager:GetSecretValue\",\"secretsmanager:DescribeSecret\"],\"Resource\":\"arn:aws:secretsmanager:$REGION:$ACCOUNT:secret:${SECRET_ID}-*\"}]}"
put ear-logs-write "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Action\":[\"logs:CreateLogGroup\",\"logs:CreateLogStream\",\"logs:PutLogEvents\",\"logs:PutRetentionPolicy\",\"logs:DescribeLogGroups\"],\"Resource\":[\"arn:aws:logs:$REGION:$ACCOUNT:log-group:${LOG_PREFIX}/*\",\"arn:aws:logs:$REGION:$ACCOUNT:log-group:${LOG_PREFIX}/*:log-stream:*\"]}]}"
put ses-send '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":["ses:SendEmail","ses:SendRawEmail"],"Resource":"*"}]}'
aws iam attach-role-policy --role-name "$ROLE" --policy-arn arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy
echo "  관리형 정책: CloudWatchAgentServerPolicy"
if aws iam get-instance-profile --instance-profile-name "$ROLE" >/dev/null 2>&1; then
  echo "인스턴스 프로필 이미 있음"
else
  aws iam create-instance-profile --instance-profile-name "$ROLE" >/dev/null
  aws iam add-role-to-instance-profile --instance-profile-name "$ROLE" --role-name "$ROLE"
  echo "인스턴스 프로필 생성·연결 — 전파 대기 10초"; sleep 10
fi

# ── 4. Secrets Manager ear/dev/api — 운영과 같은 8개 키, 값은 전부 새로 ──────
say "Secrets Manager $SECRET_ID"
if aws secretsmanager describe-secret --secret-id "$SECRET_ID" >/dev/null 2>&1; then
  echo "이미 있음 — 값은 건드리지 않는다 (바꾸려면 콘솔 또는 put-secret-value)"
else
  rnd() { openssl rand -hex 32; }
  SECRET_TMP=$(mktemp); chmod 600 "$SECRET_TMP"
  trap 'rm -f "$SECRET_TMP"' EXIT
  # CLOUDFRONT_PRIVATE_KEY_BASE64 는 2단계(개발계 CloudFront)에서 실값으로 교체. 그 전엔 AUDIO_DELIVERY=local 이라 읽지 않는다.
  # PIPELINE_SSO_SECRET·SLACK_ERROR_WEBHOOK_URL 은 비움 — 개발계는 파이프라인 SSO 를 받지 않고, 운영 알림 채널에 쓰지 않는다.
  python3 - "$SECRET_TMP" "$(rnd)" "$(rnd)" "$(rnd)" "$(rnd)" "$(rnd)" <<'PY'
import json, sys
path, db, jwt, arc, wd, aud = sys.argv[1:7]
json.dump({
  "DB_PASSWORD": db,
  "JWT_SECRET": jwt,
  "ARCHIVE_HASH_PEPPER": arc,
  "WITHDRAWAL_HASH_PEPPER": wd,
  "AUDIO_URL_SIGNING_KEY": aud,
  "CLOUDFRONT_PRIVATE_KEY_BASE64": "replace-in-stage-2",
  "PIPELINE_SSO_SECRET": "",
  "SLACK_ERROR_WEBHOOK_URL": "",
}, open(path, "w"))
PY
  aws secretsmanager create-secret --name "$SECRET_ID" \
    --description "개발계 API(EC2 ear-dev) 비밀값 — .env.prod 의 비밀 항목만. 운영(ear/prod/api)과 값이 다르다" \
    --secret-string "file://$SECRET_TMP" --tags "Key=Project,Value=ear" "Key=Env,Value=dev" >/dev/null
  rm -f "$SECRET_TMP"; trap - EXIT
  echo "생성됨 (8개 키, 값 미출력)"
fi

# ── 5. EC2 ────────────────────────────────────────────────────
say "EC2 $SERVER_NAME"
INSTANCE_ID=$(aws ec2 describe-instances --filters "Name=tag:Name,Values=$SERVER_NAME" "Name=instance-state-name,Values=pending,running,stopping,stopped" --query 'Reservations[0].Instances[0].InstanceId' --output text)
if [ "$INSTANCE_ID" != "None" ]; then
  echo "이미 있음: $INSTANCE_ID"
else
  AMI=$(aws ssm get-parameter --name /aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-arm64 --query Parameter.Value --output text)
  echo "AMI: $AMI (AL2023 arm64 최신)"
  UD=$(mktemp)
  cat > "$UD" <<'USERDATA'
#!/bin/bash
set -euxo pipefail
dnf install -y docker git cronie python3
systemctl enable --now docker crond
usermod -aG docker ec2-user
mkdir -p /usr/local/lib/docker/cli-plugins
curl -fsSL https://github.com/docker/compose/releases/latest/download/docker-compose-linux-aarch64 -o /usr/local/lib/docker/cli-plugins/docker-compose
curl -fsSL "https://github.com/docker/buildx/releases/latest/download/buildx-$(curl -fsSL https://api.github.com/repos/docker/buildx/releases/latest | grep -m1 tag_name | cut -d'"' -f4).linux-arm64" -o /usr/local/lib/docker/cli-plugins/docker-buildx
chmod +x /usr/local/lib/docker/cli-plugins/docker-compose /usr/local/lib/docker/cli-plugins/docker-buildx
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
mkdir -p /opt/ear/backend && chown -R ec2-user:ec2-user /opt/ear
USERDATA
  INSTANCE_ID=$(aws ec2 run-instances \
    --image-id "$AMI" --instance-type "$INSTANCE_TYPE" --key-name "$SERVER_NAME" \
    --security-group-ids "$SG_ID" --subnet-id "$SUBNET_ID" \
    --iam-instance-profile "Name=$ROLE" \
    --block-device-mappings '[{"DeviceName":"/dev/xvda","Ebs":{"VolumeSize":20,"VolumeType":"gp3","DeleteOnTermination":true}}]' \
    --metadata-options 'HttpTokens=required,HttpPutResponseHopLimit=2,HttpEndpoint=enabled' \
    --user-data "file://$UD" \
    --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=$SERVER_NAME},{Key=Project,Value=ear},{Key=Env,Value=dev}]" "ResourceType=volume,Tags=[{Key=Name,Value=$SERVER_NAME},{Key=Project,Value=ear},{Key=Env,Value=dev}]" \
    --query 'Instances[0].InstanceId' --output text)
  rm -f "$UD"
  echo "생성됨: $INSTANCE_ID — running 대기"
  aws ec2 wait instance-running --instance-ids "$INSTANCE_ID"
fi

# ── 6. EIP ────────────────────────────────────────────────────
say "Elastic IP"
ALLOC=$(aws ec2 describe-addresses --filters "Name=tag:Name,Values=$SERVER_NAME" --query 'Addresses[0].AllocationId' --output text)
if [ "$ALLOC" = "None" ]; then
  ALLOC=$(aws ec2 allocate-address --domain vpc --tag-specifications "ResourceType=elastic-ip,Tags=[{Key=Name,Value=$SERVER_NAME},{Key=Project,Value=ear},{Key=Env,Value=dev}]" --query AllocationId --output text)
  echo "할당됨: $ALLOC"
else
  echo "이미 있음: $ALLOC"
fi
aws ec2 associate-address --allocation-id "$ALLOC" --instance-id "$INSTANCE_ID" --no-allow-reassociation >/dev/null 2>&1 || true
EIP=$(aws ec2 describe-addresses --allocation-ids "$ALLOC" --query 'Addresses[0].PublicIp' --output text)
PRIV=$(aws ec2 describe-instances --instance-ids "$INSTANCE_ID" --query 'Reservations[0].Instances[0].PrivateIpAddress' --output text)

# ── 7. 서버 .env.prod 초안 (비밀 항목은 자리표시 — push.sh 가 Secrets Manager 로 덮어쓴다) ──
say ".env.prod 초안 → $OUT/${SERVER_NAME}.env.prod"
cat > "$OUT/${SERVER_NAME}.env.prod" <<ENV
# 개발계 API(ear-dev) — setup-dev-server.sh 가 생성. 비밀 항목(*)은 배포마다 Secrets Manager $SECRET_ID 값으로 덮어쓴다(push.sh).
NODE_ENV=production
PORT=3000
DB_HOST=postgres
DB_PORT=5432
DB_USERNAME=ear
DB_PASSWORD=from-secrets-manager
DB_NAME=ear
CORS_ORIGINS=$CONSOLE_ORIGIN
JWT_SECRET=from-secrets-manager
ARCHIVE_HASH_PEPPER=from-secrets-manager
WITHDRAWAL_HASH_PEPPER=from-secrets-manager
APPLE_CLIENT_ID=$APPLE_CLIENT_ID
APPLE_SERVICES_ID=$APPLE_SERVICES_ID
GOOGLE_WEB_CLIENT_ID=$GOOGLE_WEB_CLIENT_ID
KAKAO_APP_ID=$KAKAO_APP_ID
LATEST_APP_VERSION_IOS=$APP_VERSION
LATEST_APP_VERSION_ANDROID=$APP_VERSION
MIN_SUPPORTED_APP_VERSION_IOS=$APP_VERSION
MIN_SUPPORTED_APP_VERSION_ANDROID=$APP_VERSION
AUDIO_URL_SIGNING_KEY=from-secrets-manager
# 1단계: 로컬 전달(우리 서버가 서명·스트리밍). 2단계에서 cloudfront 로 전환하며 아래 세 값을 채운다
AUDIO_DELIVERY=local
AUDIO_URL_BASE_URL=https://$API_DOMAIN/api/v1/audio
AUDIO_STORAGE_ROOT=./storage/audio
CLOUDFRONT_KEY_PAIR_ID=
CLOUDFRONT_PRIVATE_KEY_BASE64=from-secrets-manager
AWS_REGION=$REGION
AUDIO_BUCKET=
BACKUP_BUCKET=
MAIL_DELIVERY=ses
MAIL_FROM_ADDRESS=이어 개발계 <no-reply@$BASE_DOMAIN>
TRUST_PROXY_HOPS=1
API_DOMAIN=$API_DOMAIN
# 개발계에 관리자 콘솔 없음 — 정적 콘솔 Caddy 블록을 내부 포트에 묶어 둔다(공개 안 됨)
ADMIN_DOMAIN=$ADMIN_DOMAIN
LOG_GROUP_PREFIX=$LOG_PREFIX
PIPELINE_SSO_SECRET=from-secrets-manager
SLACK_ERROR_WEBHOOK_URL=from-secrets-manager
ENV
echo "작성됨 (비밀값 없음 — 자리표시만)"

# ── 8. (선택) 서버 부트스트랩 — env 반입 + 첫 배포 ──────────────
if [ "${BOOTSTRAP:-0}" = "1" ]; then
  say "서버 부트스트랩 ($EIP)"
  PEM="$OUT/${SERVER_NAME}-isb.pem"
  SSH="ssh -i $PEM -o StrictHostKeyChecking=accept-new -o ConnectTimeout=8 -o ServerAliveInterval=15"
  for i in $(seq 1 40); do $SSH ec2-user@$EIP 'cloud-init status --wait >/dev/null 2>&1; command -v docker >/dev/null && docker compose version >/dev/null' 2>/dev/null && break; echo "  cloud-init 대기 ($i)"; sleep 15; done
  scp -q -i "$PEM" "$OUT/${SERVER_NAME}.env.prod" ec2-user@$EIP:/opt/ear/backend/.env.prod
  echo "env 반입됨 → push.sh"
  HOST=$EIP PEM=$PEM SECRET_ID=$SECRET_ID HEALTH_URL="https://$API_DOMAIN/api/v1/health" bash "$ROOT/backend/deploy/push.sh"
fi

say "완료"
cat <<DONE
인스턴스: $INSTANCE_ID ($INSTANCE_TYPE) · 공인 IP(EIP): $EIP · 사설 IP: $PRIV · SG: $SG_ID · 롤: $ROLE · 시크릿: $SECRET_ID
사람 몫:
  1) 가비아 A 레코드 1개 — $API_DOMAIN → $EIP (TTL 기본). Caddy 가 인증서를 받으려면 DNS 가 먼저 있어야 한다
  2) (관리자 콘솔은 개발계에 없다 — admin.$BASE_DOMAIN 은 AI 서버의 파이프라인 웹, 운영 하나만)
  3) KAKAO_APP_ID 실값 — 운영 서버 .env.prod 의 KAKAO_APP_ID 줄 또는 Kakao Developers 앱 ID. 확보하면 $OUT/${SERVER_NAME}.env.prod 에 적고 재배포
  4) DNS 반영 후: BOOTSTRAP=1 로 다시 실행(env 반입 + push.sh). 이미 떠 있으면 서버에서 docker compose … restart caddy 로 인증서 재시도
  5) docs/infra/inventory.md 에 등재 (티켓 9단계에서 일괄)
DONE
