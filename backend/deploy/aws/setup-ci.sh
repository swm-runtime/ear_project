#!/usr/bin/env bash
# CI/CD 1회 설정 — dev 머지 → GitHub Actions 자동 배포(제품 API 서버)를 위한 준비.
# 보안 변경(SG·IAM·SSH 키)을 포함하므로 **사람이 직접 실행한다**(pipeline/deploy/aws/setup-ci.sh 와 같은 규약).
# 멱등 — 다시 실행해도 안전하다.
#   bash backend/deploy/aws/setup-ci.sh
set -euo pipefail
PROFILE="${PROFILE:-isb}" REGION=ap-northeast-2
SG=sg-048aaaf95e4d12b2e          # 제품 서버 보안그룹 (docs/infra/inventory.md)
HOST=43.203.57.240
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
OUT="$ROOT/backend/deploy/aws/out"
PEM="${PEM:-$OUT/ear-prod-isb.pem}"   # ear-prod.pem 은 서버가 받지 않는다(2026-09-04 실측)
CIKEY="$OUT/ear-ci-deploy-api"

[ -f "$PEM" ] || { echo "관리자 pem 이 없다: $PEM"; exit 1; }

# 1) 지금 이 노트북의 IP 를 SSH 허용 목록에 (아래 3번에서 키를 심는 데 필요)
IP=$(curl -s https://checkip.amazonaws.com)
if aws ec2 authorize-security-group-ingress --profile $PROFILE --region $REGION --group-id $SG \
  --ip-permissions "IpProtocol=tcp,FromPort=22,ToPort=22,IpRanges=[{CidrIp=$IP/32,Description=\"admin $(date +%F)\"}]" >/dev/null 2>&1
then echo "1) SG: $IP 추가됨"; else echo "1) SG: $IP 이미 허용됨"; fi

# 2) CI 전용 SSH 키 — 관리자 pem 을 재사용하지 않는다(언제든 이 키만 회수할 수 있게)
[ -f "$CIKEY" ] || ssh-keygen -t ed25519 -N "" -C ear-ci-deploy-api -f "$CIKEY" >/dev/null
echo "2) CI 키: $CIKEY"

# 3) 서버 authorized_keys 에 CI 공개키 설치
PUB=$(cat "$CIKEY.pub")
ssh -i "$PEM" -o StrictHostKeyChecking=accept-new ec2-user@$HOST \
  "grep -qxF '$PUB' ~/.ssh/authorized_keys 2>/dev/null || echo '$PUB' >> ~/.ssh/authorized_keys"
echo "3) 서버에 CI 공개키 설치됨"

# 4) GitHub OIDC 공급자 — 계정에 1개면 된다. AI 서버 설정에서 이미 만들었으면 건너뛴다
aws iam list-open-id-connect-providers --profile $PROFILE --output text | grep -q token.actions.githubusercontent.com || \
  aws iam create-open-id-connect-provider --profile $PROFILE --url https://token.actions.githubusercontent.com \
    --client-id-list sts.amazonaws.com --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1 >/dev/null
echo "4) OIDC 공급자 준비됨"

# 5) 배포 역할 ear-ci-deploy 에 **제품 SG 개폐 권한만** 덧붙인다.
#    AI 서버용 인라인 정책(sg-open-close)은 건드리지 않는다 — 정책 이름을 나눠 서로를 덮어쓰지 않게 한다.
ACCOUNT=$(aws sts get-caller-identity --profile $PROFILE --query Account --output text)
aws iam get-role --profile $PROFILE --role-name ear-ci-deploy >/dev/null 2>&1 || {
  echo "   역할 ear-ci-deploy 가 없다 — 먼저 pipeline/deploy/aws/setup-ci.sh 를 실행할 것"; exit 1; }
POLICY=$(cat <<JSON
{ "Version": "2012-10-17", "Statement": [
  { "Sid": "OpenCloseSshApi", "Effect": "Allow",
    "Action": ["ec2:AuthorizeSecurityGroupIngress", "ec2:RevokeSecurityGroupIngress"],
    "Resource": "arn:aws:ec2:$REGION:$ACCOUNT:security-group/$SG" },
  { "Sid": "ReadApiLogsOnFailure", "Effect": "Allow",
    "Action": ["logs:GetLogEvents", "logs:FilterLogEvents", "logs:DescribeLogStreams", "logs:DescribeLogGroups"],
    "Resource": ["arn:aws:logs:$REGION:$ACCOUNT:log-group:/ear/*",
                 "arn:aws:logs:$REGION:$ACCOUNT:log-group:/ear/*:log-stream:*"] } ]}
JSON
)
aws iam put-role-policy --profile $PROFILE --role-name ear-ci-deploy \
  --policy-name sg-open-close-api --policy-document "$POLICY"
echo "5) 역할 ear-ci-deploy 에 제품 SG 개폐 + 배포 실패 시 로그 읽기 권한 추가됨"

# 6) GitHub 시크릿 — 개인키를 레포 시크릿으로. 값은 화면에도 로그에도 남기지 않는다
gh secret set CI_SSH_KEY_API --repo swm-runtime/ear_project < "$CIKEY"
echo "6) GitHub 시크릿 CI_SSH_KEY_API 등록됨"

echo
echo "끝. 이제 dev 에 backend/ 변경이 머지되면 자동 배포된다."
echo "수동 실행: gh workflow run deploy-api.yml --ref dev"
echo "개인키($CIKEY)는 커밋 금지 — out/ 은 .gitignore 대상이다."
