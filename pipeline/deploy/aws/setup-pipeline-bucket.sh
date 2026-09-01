#!/usr/bin/env bash
# 파이프라인 전용 S3 버킷 + 버킷 한정 IAM 정책을 만든다 (docs/ai/spec/08 2장 저장 계층). 같은 계정(ISB) 안에 리소스만 추가한다.
#   PIPELINE_BUCKET=earcast-pipeline-prod AWS_REGION=ap-northeast-2 pipeline/deploy/aws/setup-pipeline-bucket.sh
# 멱등이다 — 이미 있는 리소스는 건너뛰고 설정(PUT 류)만 다시 맞춘다.
# 자격증명 모델: AWS 키를 가진 주체는 AI 서버 EC2 하나(인스턴스 역할에 이 정책 부착 — 끝에 명령 출력). 로컬 워커는 웹의 서명 URL
# 라우트로 S3 를 쓴다(spec/10 2장). IAM 사용자·액세스 키는 기본으로 만들지 않는다 — 필요하면 WITH_IAM_USER=1 (샌드박스 SCP 가 막을 수 있음).
#
# 이 버킷이 담는 것: episodes/{id}/ 대본·claims·발췌·QA/비평 리포트·audio/ · sweeps/ 스윕 원본 · datasets/ 학습 데이터 export (spec/08 2장 구조).
# 제품 버킷(earcast-audio-prod)과 분리하는 이유: 발췌(sources.md)는 재배포 금지 증적이라 서빙 경로 옆에 두지 않는다 /
# 워커·웹에 주는 권한을 이 버킷으로 한정한다 / 버저닝·수명주기 정책이 제품 버킷과 다르다.
set -euo pipefail
: "${PIPELINE_BUCKET:?PIPELINE_BUCKET 필요 (예: earcast-pipeline-prod)}"
AWS_REGION="${AWS_REGION:-ap-northeast-2}"
WITH_IAM_USER="${WITH_IAM_USER:-0}"                     # 1 이면 5단계(IAM 사용자·키) 실행. 기본 0
IAM_USER="${IAM_USER:-ear-pipeline-worker}"
EC2_ROLE="${EC2_ROLE:-ear-ai-ec2}"                      # AI 서버 EC2 인스턴스 역할 이름 (M6 에서 생성) — 끝에 부착 명령 출력용
POLICY_NAME="${POLICY_NAME:-ear-pipeline-bucket-rw}"
SWEEPS_EXPIRE_DAYS="${SWEEPS_EXPIRE_DAYS:-180}"        # 스윕 원본 아카이브 — 조회는 sources 테이블이 담당하므로 오래 둘 이유가 없다
NONCURRENT_EXPIRE_DAYS="${NONCURRENT_EXPIRE_DAYS:-90}"  # 버저닝으로 쌓이는 이전 버전(웹 인라인 수정 되돌림용)
OUT="$(dirname "$0")/out"; mkdir -p "$OUT"

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
echo "== 계정 ${ACCOUNT_ID} · 리전 ${AWS_REGION} · 버킷 ${PIPELINE_BUCKET}"

echo "== 1. 버킷 (비공개)"
if aws s3api head-bucket --bucket "$PIPELINE_BUCKET" 2>/dev/null; then
  echo "   이미 있음 — 설정만 다시 적용"
else
  aws s3api create-bucket --bucket "$PIPELINE_BUCKET" --region "$AWS_REGION" \
    --create-bucket-configuration LocationConstraint="$AWS_REGION" >/dev/null
  echo "   생성됨"
fi
aws s3api put-public-access-block --bucket "$PIPELINE_BUCKET" --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
aws s3api put-bucket-encryption --bucket "$PIPELINE_BUCKET" --server-side-encryption-configuration \
  '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'
# TLS 아닌 접근 거부 — 발췌·대본이 평문으로 오가지 않게 (architecture.md 9.4 파트너 저작물 취급)
aws s3api put-bucket-policy --bucket "$PIPELINE_BUCKET" --policy "{
  \"Version\":\"2012-10-17\",\"Statement\":[{\"Sid\":\"DenyInsecureTransport\",\"Effect\":\"Deny\",\"Principal\":\"*\",
  \"Action\":\"s3:*\",\"Resource\":[\"arn:aws:s3:::${PIPELINE_BUCKET}\",\"arn:aws:s3:::${PIPELINE_BUCKET}/*\"],
  \"Condition\":{\"Bool\":{\"aws:SecureTransport\":\"false\"}}}]}"

echo "== 2. 버저닝 ON (웹 인라인 수정 되돌림 · 덮어쓰기 사고 복구)"
aws s3api put-bucket-versioning --bucket "$PIPELINE_BUCKET" --versioning-configuration Status=Enabled

echo "== 3. 수명주기 (sweeps/ ${SWEEPS_EXPIRE_DAYS}일 · 이전 버전 ${NONCURRENT_EXPIRE_DAYS}일 · 미완료 멀티파트 7일)"
aws s3api put-bucket-lifecycle-configuration --bucket "$PIPELINE_BUCKET" --lifecycle-configuration "{\"Rules\":[
  {\"ID\":\"sweeps-expire\",\"Status\":\"Enabled\",\"Filter\":{\"Prefix\":\"sweeps/\"},
   \"Expiration\":{\"Days\":${SWEEPS_EXPIRE_DAYS}}},
  {\"ID\":\"noncurrent-cleanup\",\"Status\":\"Enabled\",\"Filter\":{\"Prefix\":\"\"},
   \"NoncurrentVersionExpiration\":{\"NoncurrentDays\":${NONCURRENT_EXPIRE_DAYS}},
   \"AbortIncompleteMultipartUpload\":{\"DaysAfterInitiation\":7}}]}"

echo "== 4. IAM 정책 (이 버킷의 episodes/* · sweeps/* · datasets/* 만 읽기·쓰기 — 삭제 없음, 제품 버킷 권한 없음). EC2 인스턴스 역할에 붙인다"
POLICY_ARN="arn:aws:iam::${ACCOUNT_ID}:policy/${POLICY_NAME}"
POLICY_DOC="{
  \"Version\":\"2012-10-17\",\"Statement\":[
    {\"Sid\":\"ListPrefixes\",\"Effect\":\"Allow\",\"Action\":\"s3:ListBucket\",
     \"Resource\":\"arn:aws:s3:::${PIPELINE_BUCKET}\",
     \"Condition\":{\"StringLike\":{\"s3:prefix\":[\"episodes/*\",\"sweeps/*\",\"datasets/*\"]}}},
    {\"Sid\":\"BucketMeta\",\"Effect\":\"Allow\",\"Action\":[\"s3:GetBucketLocation\",\"s3:ListBucketMultipartUploads\"],
     \"Resource\":\"arn:aws:s3:::${PIPELINE_BUCKET}\"},
    {\"Sid\":\"ObjectRW\",\"Effect\":\"Allow\",
     \"Action\":[\"s3:GetObject\",\"s3:GetObjectVersion\",\"s3:PutObject\",\"s3:AbortMultipartUpload\",\"s3:ListMultipartUploadParts\"],
     \"Resource\":[\"arn:aws:s3:::${PIPELINE_BUCKET}/episodes/*\",\"arn:aws:s3:::${PIPELINE_BUCKET}/sweeps/*\",\"arn:aws:s3:::${PIPELINE_BUCKET}/datasets/*\"]}]}"
if aws iam get-policy --policy-arn "$POLICY_ARN" >/dev/null 2>&1; then
  # 이미 있으면 새 버전으로 갱신 (기본 버전 교체, 5개 한도라 이전 비기본 버전은 정리)
  for V in $(aws iam list-policy-versions --policy-arn "$POLICY_ARN" --query 'Versions[?!IsDefaultVersion].VersionId' --output text); do
    aws iam delete-policy-version --policy-arn "$POLICY_ARN" --version-id "$V"; done
  aws iam create-policy-version --policy-arn "$POLICY_ARN" --policy-document "$POLICY_DOC" --set-as-default >/dev/null
  echo "   정책 갱신됨 ${POLICY_ARN}"
else
  aws iam create-policy --policy-name "$POLICY_NAME" --policy-document "$POLICY_DOC" \
    --description "ear pipeline bucket read/write (episodes/*, sweeps/*)" >/dev/null
  echo "   정책 생성됨 ${POLICY_ARN}"
fi

if [ "$WITH_IAM_USER" = "1" ]; then
echo "== 5. IAM 사용자 ${IAM_USER} (선택 — 로컬에서 서명 URL 라우트 없이 직접 S3 를 써야 할 때만)"
aws iam get-user --user-name "$IAM_USER" >/dev/null 2>&1 || aws iam create-user --user-name "$IAM_USER" >/dev/null
aws iam attach-user-policy --user-name "$IAM_USER" --policy-arn "$POLICY_ARN"
ENV_FILE="$OUT/${PIPELINE_BUCKET}.env"
if [ "$(aws iam list-access-keys --user-name "$IAM_USER" --query 'length(AccessKeyMetadata)' --output text)" = "0" ]; then
  KEY=$(aws iam create-access-key --user-name "$IAM_USER" --query 'AccessKey.[AccessKeyId,SecretAccessKey]' --output text)
  {
    echo "# 파이프라인 S3 — 워커(apps/worker/.env)·웹(apps/web/.env.local) 공용. 팀 비밀 채널로 공유, 커밋 금지"
    echo "PIPELINE_BUCKET=${PIPELINE_BUCKET}"
    echo "AWS_REGION=${AWS_REGION}"
    echo "AWS_ACCESS_KEY_ID=$(echo "$KEY" | cut -f1)"
    echo "AWS_SECRET_ACCESS_KEY=$(echo "$KEY" | cut -f2)"
  } > "$ENV_FILE"; chmod 600 "$ENV_FILE"
  echo "   액세스 키 발급 → ${ENV_FILE}"
else
  echo "   액세스 키가 이미 있어 새로 만들지 않음 (재발급: aws iam create-access-key --user-name ${IAM_USER})"
fi
else
  echo "== 5. IAM 사용자 생략 (기본). 로컬 워커는 웹 서명 URL 라우트, EC2 는 인스턴스 역할 — 필요 시 WITH_IAM_USER=1"
fi

echo
echo "==== 확인 ===="
aws s3api get-public-access-block --bucket "$PIPELINE_BUCKET" --query 'PublicAccessBlockConfiguration' --output text | tr '\t' ' '
aws s3api get-bucket-versioning --bucket "$PIPELINE_BUCKET" --query 'Status' --output text
echo
echo "==== 다음 (M6, AI 서버 EC2 만들 때) ===="
echo "인스턴스 역할 ${EC2_ROLE} 에 정책 부착:  aws iam attach-role-policy --role-name ${EC2_ROLE} --policy-arn ${POLICY_ARN}"
echo "역할 검증(EC2 안에서):  aws s3api put-object --bucket ${PIPELINE_BUCKET} --key episodes/_smoke/ok.txt --body /dev/null"
echo "                     aws s3api put-object --bucket ${PIPELINE_BUCKET} --key other/deny.txt --body /dev/null   ← AccessDenied 여야 정상"
echo "docs/infra/inventory.md 에 버킷·정책(·역할) 을 등재하고 계정 이관 체크리스트에 포함시킨다 (임대 계정)."
echo "완료. 코드에서 s3: 키를 읽고 쓰는 것은 M4 (docs/ai/spec/10 7장)."
