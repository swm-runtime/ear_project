#!/usr/bin/env bash
# AI 서버 EC2 만들기 (spec/10 2장 "호스트" · M6) — 멱등: 이미 있는 리소스는 건너뛴다.
#
#   ADMIN_IP=x.x.x.x AWS_REGION=ap-northeast-2 bash pipeline/deploy/aws/setup-ai-server.sh
#
# 만드는 것(전부 신규 — 기존 리소스는 참조만, 무변경):
#   키페어 ear-ai(→ out/ear-ai-isb.pem) · SG ear-ai-ec2 · IAM 역할/인스턴스 프로필 ear-ai-ec2(+ ear-pipeline-bucket-rw 부착)
#   EC2 t4g.small(AL2023 arm64, gp3 20GB, IMDSv2 hop 2, user-data: docker·compose·buildx·git·스왑 2G) · EIP
# 만들지 않는 것: NAT·ALB·Fargate·RDS (spec/08 7장). DNS(가비아)·Supabase Auth URL 은 사람 몫 — 끝에 안내를 출력한다.
set -euo pipefail

REGION="${AWS_REGION:-ap-northeast-2}"
ADMIN_IP="${ADMIN_IP:?ADMIN_IP 가 필요합니다 (SSH 22 를 열 관리자 IP, 예: 1.2.3.4)}"
NAME="${NAME:-ear-ai}"
ROLE="${ROLE:-ear-ai-ec2}"
TYPE="${TYPE:-t4g.small}"
VPC_ID="${VPC_ID:-vpc-07bfc7f134e639989}"           # 기본 VPC (docs/infra/inventory.md 1장)
SUBNET_ID="${SUBNET_ID:-subnet-0343791d0f49bcaa8}"  # 퍼블릭 서브넷 2a — 제품 EC2 와 같은 곳
PROD_SG="${PROD_SG:-sg-048aaaf95e4d12b2e}"          # 제품 SG — 8000 의 소스로 참조만 한다 (수정하지 않음)
BUCKET_POLICY_ARN="arn:aws:iam::$(aws sts get-caller-identity --query Account --output text):policy/ear-pipeline-bucket-rw"
OUT="$(cd "$(dirname "$0")" && pwd)/out"
mkdir -p "$OUT"

say() { printf '\n=== %s\n' "$*"; }
aws() { command aws --region "$REGION" "$@"; }

say "계정 확인"
aws sts get-caller-identity --query '[Account,Arn]' --output text

# ── 1. 키페어 ─────────────────────────────────────────────────
say "키페어 $NAME"
if aws ec2 describe-key-pairs --key-names "$NAME" >/dev/null 2>&1; then
  echo "이미 있음 — 건너뜀 (pem 은 최초 생성자가 보관: out/${NAME}-isb.pem)"
else
  aws ec2 create-key-pair --key-name "$NAME" --key-type ed25519 --query KeyMaterial --output text > "$OUT/${NAME}-isb.pem"
  chmod 600 "$OUT/${NAME}-isb.pem"
  echo "생성됨 → $OUT/${NAME}-isb.pem (커밋 금지 — out/ 은 gitignore)"
fi

# ── 2. 보안그룹 (신규 — 제품 SG 는 참조만) ─────────────────────
say "보안그룹 $ROLE"
SG_ID=$(aws ec2 describe-security-groups --filters "Name=group-name,Values=$ROLE" "Name=vpc-id,Values=$VPC_ID" --query 'SecurityGroups[0].GroupId' --output text)
if [ "$SG_ID" = "None" ]; then
  SG_ID=$(aws ec2 create-security-group --group-name "$ROLE" --description "ear AI server (pipeline web/worker + ai-server)" --vpc-id "$VPC_ID" --query GroupId --output text)
  echo "생성됨: $SG_ID"
else
  echo "이미 있음: $SG_ID"
fi
allow() { aws ec2 authorize-security-group-ingress --group-id "$SG_ID" "$@" >/dev/null 2>&1 && echo "  허용: $*" || echo "  이미 있음: $*"; }
allow --protocol tcp --port 22  --cidr "$ADMIN_IP/32"
allow --protocol tcp --port 80  --cidr 0.0.0.0/0
allow --protocol tcp --port 443 --cidr 0.0.0.0/0
allow --protocol udp --port 443 --cidr 0.0.0.0/0
allow --protocol tcp --port 8000 --source-group "$PROD_SG"   # /embeddings — 제품 서버(사설 IP)만

# ── 3. 인스턴스 역할 (제품 롤 ear-prod-ec2 재사용 금지 — 버킷 정책만 부착) ──
say "IAM 역할·프로필 $ROLE"
if aws iam get-role --role-name "$ROLE" >/dev/null 2>&1; then
  echo "역할 이미 있음"
else
  aws iam create-role --role-name "$ROLE" --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"ec2.amazonaws.com"},"Action":"sts:AssumeRole"}]}' >/dev/null
  echo "역할 생성됨"
fi
aws iam attach-role-policy --role-name "$ROLE" --policy-arn "$BUCKET_POLICY_ARN"
echo "정책 부착: $BUCKET_POLICY_ARN"
if aws iam get-instance-profile --instance-profile-name "$ROLE" >/dev/null 2>&1; then
  echo "인스턴스 프로필 이미 있음"
else
  aws iam create-instance-profile --instance-profile-name "$ROLE" >/dev/null
  aws iam add-role-to-instance-profile --instance-profile-name "$ROLE" --role-name "$ROLE"
  echo "인스턴스 프로필 생성·연결 — 전파 대기 10초"; sleep 10
fi

# ── 4. EC2 ────────────────────────────────────────────────────
say "EC2 $NAME"
INSTANCE_ID=$(aws ec2 describe-instances --filters "Name=tag:Name,Values=$NAME" "Name=instance-state-name,Values=pending,running,stopping,stopped" --query 'Reservations[0].Instances[0].InstanceId' --output text)
if [ "$INSTANCE_ID" != "None" ]; then
  echo "이미 있음: $INSTANCE_ID"
else
  AMI=$(aws ssm get-parameter --name /aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-arm64 --query Parameter.Value --output text)
  echo "AMI: $AMI (AL2023 arm64 최신)"
  UD=$(mktemp)
  cat > "$UD" <<'USERDATA'
#!/bin/bash
set -euxo pipefail
dnf install -y docker git
systemctl enable --now docker
usermod -aG docker ec2-user
mkdir -p /usr/local/lib/docker/cli-plugins
curl -fsSL https://github.com/docker/compose/releases/latest/download/docker-compose-linux-aarch64 -o /usr/local/lib/docker/cli-plugins/docker-compose
curl -fsSL "https://github.com/docker/buildx/releases/latest/download/buildx-$(curl -fsSL https://api.github.com/repos/docker/buildx/releases/latest | grep -m1 tag_name | cut -d'"' -f4).linux-arm64" -o /usr/local/lib/docker/cli-plugins/docker-buildx
chmod +x /usr/local/lib/docker/cli-plugins/docker-compose /usr/local/lib/docker/cli-plugins/docker-buildx
# 스왑 2G — t4g.small(2GB) 에서 next build OOM 방지 (spec/10 2장)
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
mkdir -p /opt/ear && chown ec2-user:ec2-user /opt/ear
USERDATA
  INSTANCE_ID=$(aws ec2 run-instances \
    --image-id "$AMI" --instance-type "$TYPE" --key-name "$NAME" \
    --security-group-ids "$SG_ID" --subnet-id "$SUBNET_ID" \
    --iam-instance-profile "Name=$ROLE" \
    --block-device-mappings '[{"DeviceName":"/dev/xvda","Ebs":{"VolumeSize":20,"VolumeType":"gp3","DeleteOnTermination":true}}]' \
    --metadata-options 'HttpTokens=required,HttpPutResponseHopLimit=2,HttpEndpoint=enabled' \
    --user-data "file://$UD" \
    --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=$NAME},{Key=Project,Value=ear}]" \
    --query 'Instances[0].InstanceId' --output text)
  rm -f "$UD"
  echo "생성됨: $INSTANCE_ID — running 대기"
  aws ec2 wait instance-running --instance-ids "$INSTANCE_ID"
fi

# ── 5. EIP ────────────────────────────────────────────────────
say "Elastic IP"
ALLOC=$(aws ec2 describe-addresses --filters "Name=tag:Name,Values=$NAME" --query 'Addresses[0].AllocationId' --output text)
if [ "$ALLOC" = "None" ]; then
  ALLOC=$(aws ec2 allocate-address --domain vpc --tag-specifications "ResourceType=elastic-ip,Tags=[{Key=Name,Value=$NAME}]" --query AllocationId --output text)
  echo "할당됨: $ALLOC"
else
  echo "이미 있음: $ALLOC"
fi
aws ec2 associate-address --allocation-id "$ALLOC" --instance-id "$INSTANCE_ID" --no-allow-reassociation >/dev/null 2>&1 || true
EIP=$(aws ec2 describe-addresses --allocation-ids "$ALLOC" --query 'Addresses[0].PublicIp' --output text)
PRIV=$(aws ec2 describe-instances --instance-ids "$INSTANCE_ID" --query 'Reservations[0].Instances[0].PrivateIpAddress' --output text)

say "완료"
cat <<DONE
인스턴스: $INSTANCE_ID ($TYPE) · 공인 IP(EIP): $EIP · 사설 IP: $PRIV · SG: $SG_ID
다음 (deploy/README.md 순서대로):
  1) 가비아 A 레코드: pipeline.<도메인> → $EIP
  2) SSH: ssh -i pipeline/deploy/aws/out/${NAME}-isb.pem ec2-user@$EIP
  3) 코드 반입(deploy key)·env 작성·compose up — README 3~4장
  4) Supabase Auth → URL Configuration 에 https://pipeline.<도메인> 추가
  5) docs/infra/inventory.md 에 등재
DONE
