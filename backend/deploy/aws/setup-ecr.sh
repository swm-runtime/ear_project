#!/usr/bin/env bash
# API 이미지 저장소 (KAN-62 4단계 · 결정 9) — 멱등.
#
#   AWS_PROFILE=isb bash backend/deploy/aws/setup-ecr.sh
#
# 만드는 것: ECR 리포지토리 ear/api (비공개 · 푸시 시 스캔 · 태그 불변 아님 — dev-latest 같은 이동 태그를 쓴다 ·
#            수명주기: 태그 있는 이미지 최근 10개만, 태그 없는 레이어는 1일 뒤 정리)
# 권한:     CI 롤 ear-ci-deploy 에 ecr-push (이 리포지토리 한정 + GetAuthorizationToken)
#           인스턴스 롤 ear-prod-ec2 · ear-dev-ec2 에 ecr-pull (이 리포지토리 한정 + GetAuthorizationToken)
# 바뀌지 않는 것: 배포 방식. push.sh 는 API_IMAGE 를 받을 때만 pull 모드다 — 그 전환은 별도 결정(티켓 4단계 4번).
set -euo pipefail

REGION="${AWS_REGION:-ap-northeast-2}"
REPO="${REPO:-ear/api}"
KEEP="${KEEP:-10}"
CI_ROLE="${CI_ROLE:-ear-ci-deploy}"
PULL_ROLES=(${PULL_ROLES:-ear-prod-ec2 ear-dev-ec2})
say() { printf '\n=== %s\n' "$*"; }
aws() { command aws --region "$REGION" "$@"; }
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
REPO_ARN="arn:aws:ecr:$REGION:$ACCOUNT:repository/$REPO"

say "계정 $ACCOUNT · 리포지토리 $REPO"
if aws ecr describe-repositories --repository-names "$REPO" >/dev/null 2>&1; then
  echo "이미 있음"
else
  aws ecr create-repository --repository-name "$REPO" --image-scanning-configuration scanOnPush=true \
    --encryption-configuration encryptionType=AES256 --tags Key=Project,Value=ear --query 'repository.repositoryUri' --output text
  echo "생성됨"
fi
aws ecr put-lifecycle-policy --repository-name "$REPO" --lifecycle-policy-text "{
  \"rules\": [
    {\"rulePriority\": 1, \"description\": \"untagged layers 1 day\", \"selection\": {\"tagStatus\": \"untagged\", \"countType\": \"sinceImagePushed\", \"countUnit\": \"days\", \"countNumber\": 1}, \"action\": {\"type\": \"expire\"}},
    {\"rulePriority\": 2, \"description\": \"keep last $KEEP tagged\", \"selection\": {\"tagStatus\": \"any\", \"countType\": \"imageCountMoreThan\", \"countNumber\": $KEEP}, \"action\": {\"type\": \"expire\"}}
  ]}" >/dev/null
echo "수명주기: 태그 이미지 최근 $KEEP 개 보존, 태그 없는 레이어 1일"

say "CI 롤 $CI_ROLE — ecr-push"
aws iam put-role-policy --role-name "$CI_ROLE" --policy-name ecr-push --policy-document "{\"Version\":\"2012-10-17\",\"Statement\":[
  {\"Effect\":\"Allow\",\"Action\":\"ecr:GetAuthorizationToken\",\"Resource\":\"*\"},
  {\"Effect\":\"Allow\",\"Action\":[\"ecr:BatchCheckLayerAvailability\",\"ecr:CompleteLayerUpload\",\"ecr:InitiateLayerUpload\",\"ecr:PutImage\",\"ecr:UploadLayerPart\",\"ecr:BatchGetImage\",\"ecr:GetDownloadUrlForLayer\",\"ecr:DescribeImages\"],\"Resource\":\"$REPO_ARN\"}]}"
echo "부착됨"

for r in "${PULL_ROLES[@]}"; do
  say "인스턴스 롤 $r — ecr-pull"
  aws iam put-role-policy --role-name "$r" --policy-name ecr-pull --policy-document "{\"Version\":\"2012-10-17\",\"Statement\":[
    {\"Effect\":\"Allow\",\"Action\":\"ecr:GetAuthorizationToken\",\"Resource\":\"*\"},
    {\"Effect\":\"Allow\",\"Action\":[\"ecr:BatchGetImage\",\"ecr:GetDownloadUrlForLayer\",\"ecr:BatchCheckLayerAvailability\"],\"Resource\":\"$REPO_ARN\"}]}"
  echo "부착됨"
done

say "완료"
echo "레지스트리: $ACCOUNT.dkr.ecr.$REGION.amazonaws.com/$REPO"
echo "CI: deploy-api.yml build-push job 이 <sha>·dev-latest 태그로 푸시한다. 서버 pull 배포: API_IMAGE=<uri>:<sha> bash backend/deploy/push.sh"
