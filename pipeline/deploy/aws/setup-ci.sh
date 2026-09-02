#!/usr/bin/env bash
# CI/CD 1회 설정 (deploy/README.md CI 장) — dev 머지 → GitHub Actions 자동 배포를 위한 준비.
# 보안 변경(SG·IAM·키)을 포함하므로 사람이 직접 실행한다. 멱등 — 다시 실행해도 안전.
#   bash pipeline/deploy/aws/setup-ci.sh
set -euo pipefail
PROFILE=isb REGION=ap-northeast-2
SG=sg-0dfc05389c325b537
HOST=54.116.31.183
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"          # 레포 루트
OUT="$ROOT/pipeline/deploy/aws/out"
PEM="$OUT/ear-ai-isb.pem"
CIKEY="$OUT/ear-ci-deploy"

# 1) 지금 이 노트북의 IP 를 SSH 허용 목록에 추가 (오늘 배포 + 3번 키 설치용)
IP=$(curl -s https://checkip.amazonaws.com)
if aws ec2 authorize-security-group-ingress --profile $PROFILE --region $REGION --group-id $SG \
  --ip-permissions "IpProtocol=tcp,FromPort=22,ToPort=22,IpRanges=[{CidrIp=$IP/32,Description=\"admin $(date +%F)\"}]" >/dev/null 2>&1
then echo "1) SG: $IP 추가됨"; else echo "1) SG: $IP 이미 허용됨"; fi

# 2) CI 전용 SSH 키 (admin pem 재사용 안 함 — 언제든 이 키만 회수 가능)
[ -f "$CIKEY" ] || ssh-keygen -t ed25519 -N "" -C ear-ci-deploy -f "$CIKEY" >/dev/null
echo "2) CI 키: $CIKEY"

# 3) 서버 authorized_keys 에 CI 공개키 설치
PUB=$(cat "$CIKEY.pub")
ssh -i "$PEM" -o StrictHostKeyChecking=accept-new ec2-user@$HOST \
  "grep -qxF '$PUB' ~/.ssh/authorized_keys 2>/dev/null || echo '$PUB' >> ~/.ssh/authorized_keys"
echo "3) 서버에 CI 공개키 설치됨"

# 4) GitHub OIDC 공급자 (계정에 1개면 됨 — 없을 때만 생성)
aws iam list-open-id-connect-providers --profile $PROFILE --output text | grep -q token.actions.githubusercontent.com || \
  aws iam create-open-id-connect-provider --profile $PROFILE --url https://token.actions.githubusercontent.com \
    --client-id-list sts.amazonaws.com --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1 >/dev/null
echo "4) OIDC 공급자 준비됨"

# 5) 배포 역할 ear-ci-deploy — 이 레포 dev 브랜치 워크플로만 신뢰, 권한은 SG 개폐뿐 (서버·버킷 접근 없음)
ACCOUNT=$(aws sts get-caller-identity --profile $PROFILE --query Account --output text)
TRUST=$(cat <<JSON
{ "Version": "2012-10-17", "Statement": [{
  "Effect": "Allow",
  "Principal": { "Federated": "arn:aws:iam::$ACCOUNT:oidc-provider/token.actions.githubusercontent.com" },
  "Action": "sts:AssumeRoleWithWebIdentity",
  "Condition": { "StringEquals": {
    "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
    "token.actions.githubusercontent.com:sub": "repo:swm-runtime/ear_project:ref:refs/heads/dev" } }
}]}
JSON
)
POLICY=$(cat <<JSON
{ "Version": "2012-10-17", "Statement": [
  { "Sid": "OpenCloseSsh", "Effect": "Allow",
    "Action": ["ec2:AuthorizeSecurityGroupIngress", "ec2:RevokeSecurityGroupIngress"],
    "Resource": "arn:aws:ec2:$REGION:$ACCOUNT:security-group/$SG" } ]}
JSON
)
aws iam create-role --profile $PROFILE --role-name ear-ci-deploy --assume-role-policy-document "$TRUST" \
  --description "GitHub Actions dev deploy - SG open/close only" >/dev/null 2>&1 || \
  aws iam update-assume-role-policy --profile $PROFILE --role-name ear-ci-deploy --policy-document "$TRUST"
aws iam put-role-policy --profile $PROFILE --role-name ear-ci-deploy --policy-name sg-open-close --policy-document "$POLICY"
echo "5) IAM 역할 ear-ci-deploy 준비됨"

# 6) CI SSH 개인키를 GitHub secret 으로 (값은 GitHub 금고에만 — 출력·커밋 없음)
/opt/homebrew/bin/gh secret set CI_SSH_KEY --repo swm-runtime/ear_project < "$CIKEY"
echo "6) GitHub secret CI_SSH_KEY 등록됨"
echo "완료 — .github/workflows/deploy-pipeline.yml 이 dev 머지마다 자동 배포합니다"
