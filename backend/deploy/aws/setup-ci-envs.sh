#!/usr/bin/env bash
# CI 환경 분리 준비 (KAN-62 6단계 사전 작업) — 멱등. 배포 동작은 바뀌지 않는다.
#
#   AWS_PROFILE=isb bash backend/deploy/aws/setup-ci-envs.sh          # 전부
#   SKIP_AWS=1     bash backend/deploy/aws/setup-ci-envs.sh          # GitHub·SSH 부분만(SSO 만료 시)
#   SKIP_GITHUB=1  bash backend/deploy/aws/setup-ci-envs.sh          # AWS 부분만
#
# 하는 일 — 전부 "붙이기만" 한다. 워크플로가 아직 이 값을 읽지 않으므로 dev 머지 배포는 종전 그대로다.
#   1) 개발계 CI 전용 SSH 키(out/ear-ci-deploy-api-dev) 생성 + 개발계 서버 authorized_keys 에 공개키 설치
#      — 관리자 pem 을 CI 에 올리지 않는다(운영과 같은 규약, setup-ci.sh 2번). 회수 = 이 줄만 지운다.
#   2) GitHub Environments `api-dev`(브랜치 dev 만) · `api-prod`(브랜치 main 만)
#      - 시크릿  CI_SSH_KEY_API : api-dev 에만 개발계 키. api-prod 는 두지 않는다 → 레포 시크릿(운영 키)이 그대로 적용된다
#      - 변수    API_HOST · API_SG_ID · API_SECRET_ID · API_HEALTH_URL · LOG_GROUP_PREFIX (환경마다 다른 값 전부)
#      기존 Preview·Production 환경은 Expo(EAS) 것이라 건드리지 않는다.
#   3) IAM 역할 ear-ci-deploy
#      - 신뢰 정책 sub 에 refs/heads/main + environment:api-dev·api-prod 추가(dev 는 유지)
#        (environment: 를 쓰는 배포 job 은 sub 가 environment 형식으로 바뀐다 — 브랜치 형식만으로는 배포 job 이 역할을 못 맡는다)
#      - 인라인 sg-open-close-api-dev : 개발계 SG 22 번 개폐 + /ear-dev/* 로그 읽기
#
# 이 스크립트가 하지 **않는** 것: 워크플로 수정(6단계) · main 보호(7단계, setup-main-protection.sh) · 배포 스위치(8단계).
set -euo pipefail

REGION="${AWS_REGION:-ap-northeast-2}"
REPO="${GH_REPO:-swm-runtime/ear_project}"
CI_ROLE="${CI_ROLE:-ear-ci-deploy}"
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
OUT="$ROOT/backend/deploy/aws/out"

# 환경값 — inventory.md 1장과 setup-dev-server.sh 산출물 기준(2026-09-15)
PROD_HOST=43.203.57.240;   PROD_SG=sg-048aaaf95e4d12b2e; PROD_SECRET=ear/prod/api; PROD_HEALTH=https://api.earcast.co.kr/api/v1/health;     PROD_LOGS=/ear
DEV_HOST=54.116.155.248;   DEV_SG=sg-0f8f793be74bd58e4;  DEV_SECRET=ear/dev/api;   DEV_HEALTH=https://api-dev.earcast.co.kr/api/v1/health; DEV_LOGS=/ear-dev
DEV_PEM="${DEV_PEM:-$OUT/ear-dev-isb.pem}"
DEV_CIKEY="$OUT/ear-ci-deploy-api-dev"

say() { printf '\n=== %s\n' "$*"; }
aws() { command aws --region "$REGION" "$@"; }

# ---------------------------------------------------------------- 1) 개발계 CI SSH 키
if [ -z "${SKIP_GITHUB:-}" ]; then
  say "1) 개발계 CI 전용 SSH 키"
  [ -f "$DEV_PEM" ] || { echo "개발계 관리자 pem 이 없다: $DEV_PEM"; exit 1; }
  [ -f "$DEV_CIKEY" ] || ssh-keygen -q -t ed25519 -N "" -C ear-ci-deploy-api-dev -f "$DEV_CIKEY"
  PUB=$(cat "$DEV_CIKEY.pub")
  ssh -i "$DEV_PEM" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15 "ec2-user@$DEV_HOST" \
    "grep -qxF '$PUB' ~/.ssh/authorized_keys 2>/dev/null || echo '$PUB' >> ~/.ssh/authorized_keys; wc -l < ~/.ssh/authorized_keys"
  echo "개발계 서버 authorized_keys 에 설치됨(위 숫자 = 등록 키 수, 2 = 관리자 + CI)"

  # ---------------------------------------------------------------- 2) GitHub Environments
  say "2) GitHub Environments · 시크릿 · 변수 — $REPO"
  env_put() {  # name, branch
    gh api -X PUT "repos/$REPO/environments/$1" \
      -F 'deployment_branch_policy[protected_branches]=false' \
      -F 'deployment_branch_policy[custom_branch_policies]=true' >/dev/null
    if ! gh api "repos/$REPO/environments/$1/deployment-branch-policies" --jq '.branch_policies[].name' | grep -qx "$2"; then
      gh api -X POST "repos/$REPO/environments/$1/deployment-branch-policies" -f "name=$2" -f type=branch >/dev/null
    fi
    echo "환경 $1 — 배포 허용 브랜치: $2"
  }
  var_set() { gh variable set "$2" --env "$1" --repo "$REPO" --body "$3"; }
  env_put api-dev dev
  env_put api-prod main

  gh secret set CI_SSH_KEY_API --env api-dev --repo "$REPO" < "$DEV_CIKEY"
  echo "시크릿 api-dev/CI_SSH_KEY_API = 개발계 CI 키 (값은 출력하지 않음). api-prod 는 레포 시크릿을 그대로 쓴다"

  var_set api-dev  API_HOST "$DEV_HOST";     var_set api-dev  API_SG_ID "$DEV_SG";  var_set api-dev  API_SECRET_ID "$DEV_SECRET"
  var_set api-dev  API_HEALTH_URL "$DEV_HEALTH"; var_set api-dev  LOG_GROUP_PREFIX "$DEV_LOGS"
  var_set api-prod API_HOST "$PROD_HOST";    var_set api-prod API_SG_ID "$PROD_SG"; var_set api-prod API_SECRET_ID "$PROD_SECRET"
  var_set api-prod API_HEALTH_URL "$PROD_HEALTH"; var_set api-prod LOG_GROUP_PREFIX "$PROD_LOGS"
  echo "변수 5종 × 2 환경 등록됨"
  gh variable list --env api-dev --repo "$REPO"
fi

# ---------------------------------------------------------------- 3) IAM
if [ -z "${SKIP_AWS:-}" ]; then
  say "3) IAM 역할 $CI_ROLE — 신뢰에 main 추가 · 개발계 SG 개폐"
  ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
  TRUST_NOW=$(aws iam get-role --role-name "$CI_ROLE" --query 'Role.AssumeRolePolicyDocument' --output json)
  # 저장소가 "불변 주체(immutable subject)" 모드면 토큰의 sub 접두사가 repo:<org>@<id>/<repo>@<id> 다(2026-09-16 23:05 실측 —
  # 평문 repo:<org>/<repo> 줄은 하나도 매치되지 않아 배포 job 이 AssumeRoleWithWebIdentity 에서 막혔다. dev 브랜치가 되던 것도
  # 이전에 누군가 넣어 둔 ID 박힌 줄 덕분). 그래서 평문·불변 두 접두사 × 네 주체를 모두 넣는다.
  SUB_PREFIX=$(gh api "repos/$REPO/actions/oidc/customization/sub" --jq 'if .use_immutable_subject then .sub_claim_prefix else "" end' 2>/dev/null || true)
  [ -n "$SUB_PREFIX" ] && echo "불변 주체 모드 — 접두사 $SUB_PREFIX 형식도 신뢰에 넣는다"
  TRUST_NEW=$(REPO="$REPO" SUB_PREFIX="$SUB_PREFIX" python3 - "$TRUST_NOW" <<'PY'
import json, os, sys
doc = json.loads(sys.argv[1]); repo = os.environ["REPO"]; imm = os.environ.get("SUB_PREFIX", "")
# 브랜치 형식(environment 없는 job: verify·build-push) + Environment 형식(environment: 를 쓰는 deploy job).
# GitHub 은 job 에 environment 가 있으면 OIDC sub 를 "<접두사>:environment:<name>" 으로 발급한다.
prefixes = [f"repo:{repo}"] + ([imm] if imm and imm != f"repo:{repo}" else [])
suffixes = ["ref:refs/heads/dev", "ref:refs/heads/main", "environment:api-dev", "environment:api-prod"]
want = [f"{p}:{s}" for p in prefixes for s in suffixes]
changed = False
for st in doc["Statement"]:
    fed = st.get("Principal", {}).get("Federated", "")
    if "token.actions.githubusercontent.com" not in str(fed): continue
    cond = st.setdefault("Condition", {})
    for op in ("StringEquals", "StringLike"):
        subs = cond.get(op, {}).get("token.actions.githubusercontent.com:sub")
        if subs is None: continue
        subs = [subs] if isinstance(subs, str) else list(subs)
        for w in want:
            if w not in subs: subs.append(w); changed = True
        cond[op]["token.actions.githubusercontent.com:sub"] = subs
        break
    else:
        cond.setdefault("StringEquals", {})["token.actions.githubusercontent.com:sub"] = want; changed = True
print(json.dumps(doc) if changed else "")
PY
)
  if [ -n "$TRUST_NEW" ]; then
    aws iam update-assume-role-policy --role-name "$CI_ROLE" --policy-document "$TRUST_NEW"
    echo "신뢰 정책 갱신 — sub 에 refs/heads/main · environment:api-dev · environment:api-prod 추가"
  else
    echo "신뢰 정책 이미 dev·main 포함"
  fi
  aws iam get-role --role-name "$CI_ROLE" --query 'Role.AssumeRolePolicyDocument.Statement[].Condition' --output json

  aws iam put-role-policy --role-name "$CI_ROLE" --policy-name sg-open-close-api-dev --policy-document "{\"Version\":\"2012-10-17\",\"Statement\":[
    {\"Sid\":\"OpenCloseSshApiDev\",\"Effect\":\"Allow\",\"Action\":[\"ec2:AuthorizeSecurityGroupIngress\",\"ec2:RevokeSecurityGroupIngress\"],\"Resource\":\"arn:aws:ec2:$REGION:$ACCOUNT:security-group/$DEV_SG\"},
    {\"Sid\":\"ReadDevLogsOnFailure\",\"Effect\":\"Allow\",\"Action\":[\"logs:GetLogEvents\",\"logs:FilterLogEvents\",\"logs:DescribeLogStreams\",\"logs:DescribeLogGroups\"],\"Resource\":[\"arn:aws:logs:$REGION:$ACCOUNT:log-group:$DEV_LOGS/*\",\"arn:aws:logs:$REGION:$ACCOUNT:log-group:$DEV_LOGS/*:log-stream:*\"]}]}"
  echo "인라인 sg-open-close-api-dev 부착됨(개발계 SG $DEV_SG 22 번 개폐 + $DEV_LOGS 로그 읽기)"
fi

say "완료"
echo "다음(6단계, 별도 PR): deploy-api.yml 에 environment: \${{ github.ref_name == 'main' && 'api-prod' || 'api-dev' }} 와 vars.API_* 를 읽게 바꾸고, 그때부터 dev 머지 = 개발계 배포가 된다."
echo "개인키 $DEV_CIKEY 는 커밋 금지(out/ 은 .gitignore)."
