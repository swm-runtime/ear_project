#!/usr/bin/env bash
# S3(비공개) + CloudFront(OAC, 서명 URL 필수) 한 번에 만든다. 멱등이 아니다 — 처음 한 번만.
#   AUDIO_BUCKET=ear-audio-prod BACKUP_BUCKET=ear-backup-prod AWS_REGION=ap-northeast-2 \
#     deploy/aws/setup-audio-cdn.sh
# 끝나면 .env.prod에 넣을 값 네 줄을 출력한다.
set -euo pipefail
: "${AUDIO_BUCKET:?}" "${BACKUP_BUCKET:?}"
AWS_REGION="${AWS_REGION:-ap-northeast-2}"
OUT="$(dirname "$0")/out"; mkdir -p "$OUT"

echo "== 1. S3 buckets (private, no public access)"
for B in "$AUDIO_BUCKET" "$BACKUP_BUCKET"; do
  aws s3api create-bucket --bucket "$B" --region "$AWS_REGION" \
    --create-bucket-configuration LocationConstraint="$AWS_REGION" >/dev/null
  aws s3api put-public-access-block --bucket "$B" --public-access-block-configuration \
    BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
done
# 백업은 30일 지나면 지운다 — 저장 비용의 유일한 누수 지점
aws s3api put-bucket-lifecycle-configuration --bucket "$BACKUP_BUCKET" --lifecycle-configuration \
  '{"Rules":[{"ID":"expire-30d","Status":"Enabled","Filter":{"Prefix":"pg/"},"Expiration":{"Days":30}}]}'

echo "== 2. CloudFront signing key pair"
openssl genrsa -out "$OUT/cf_private.pem" 2048 2>/dev/null
openssl rsa -pubout -in "$OUT/cf_private.pem" -out "$OUT/cf_public.pem" 2>/dev/null
PUB_ID=$(aws cloudfront create-public-key --public-key-config \
  "CallerReference=ear-$(date +%s),Name=ear-audio-key,EncodedKey=$(cat "$OUT/cf_public.pem")" \
  --query 'PublicKey.Id' --output text)
KG_ID=$(aws cloudfront create-key-group --key-group-config \
  "Name=ear-audio-keygroup,Items=[$PUB_ID]" --query 'KeyGroup.Id' --output text)

echo "== 3. Origin Access Control (S3는 CloudFront에서만 읽힌다)"
OAC_ID=$(aws cloudfront create-origin-access-control --origin-access-control-config \
  "Name=ear-audio-oac,SigningProtocol=sigv4,SigningBehavior=always,OriginAccessControlOriginType=s3" \
  --query 'OriginAccessControl.Id' --output text)

echo "== 4. KeyValueStore + viewer-request Function (/play/<contentId> → S3 키)"
KVS_ARN=$(aws cloudfront create-key-value-store --name ear-audio-map   --query 'KeyValueStore.ARN' --output text)
# 생성 직후엔 PROVISIONING — READY 될 때까지 기다린다
for _ in $(seq 1 30); do
  ST=$(aws cloudfront describe-key-value-store --name ear-audio-map --query 'KeyValueStore.Status' --output text)
  [ "$ST" = "READY" ] && break; sleep 5
done
FN_ARN=$(aws cloudfront create-function --name ear-audio-rewrite   --function-config "Comment=play path to S3 key,Runtime=cloudfront-js-2.0,KeyValueStoreAssociations={Quantity=1,Items=[{KeyValueStoreARN=$KVS_ARN}]}"   --function-code "fileb://$(dirname "$0")/audio-rewrite.function.js"   --query 'FunctionSummary.FunctionMetadata.FunctionARN' --output text)
FN_ETAG=$(aws cloudfront describe-function --name ear-audio-rewrite --query ETag --output text)
aws cloudfront publish-function --name ear-audio-rewrite --if-match "$FN_ETAG" >/dev/null

echo "== 5. CloudFront distribution"
# CachePolicyId 658327ea... = AWS 관리형 "CachingOptimized": 쿼리스트링 무시 → 서명 파라미터가
# 달라도 같은 오브젝트로 캐시된다. Range 요청은 기본 지원.
cat > "$OUT/dist.json" <<JSON
{
  "CallerReference": "ear-audio-$(date +%s)",
  "Comment": "ear audio (signed URLs only)",
  "Enabled": true,
  "PriceClass": "PriceClass_200",
  "HttpVersion": "http2and3",
  "Origins": { "Quantity": 1, "Items": [ {
    "Id": "s3-audio",
    "DomainName": "${AUDIO_BUCKET}.s3.${AWS_REGION}.amazonaws.com",
    "OriginAccessControlId": "${OAC_ID}",
    "S3OriginConfig": { "OriginAccessIdentity": "" }
  } ] },
  "DefaultCacheBehavior": {
    "TargetOriginId": "s3-audio",
    "ViewerProtocolPolicy": "https-only",
    "AllowedMethods": { "Quantity": 2, "Items": ["GET","HEAD"],
      "CachedMethods": { "Quantity": 2, "Items": ["GET","HEAD"] } },
    "Compress": false,
    "CachePolicyId": "658327ea-f89d-4fab-a63d-7e88639e58f6",
    "TrustedKeyGroups": { "Enabled": true, "Quantity": 1, "Items": ["${KG_ID}"] },
    "TrustedSigners": { "Enabled": false, "Quantity": 0 },
    "FunctionAssociations": { "Quantity": 1, "Items": [
      { "EventType": "viewer-request", "FunctionARN": "${FN_ARN}" } ] }
  }
}
JSON
DIST=$(aws cloudfront create-distribution --distribution-config "file://$OUT/dist.json")
jq_get() { echo "$DIST" | python3 -c "import sys,json;print(json.load(sys.stdin)['Distribution']['$1'])"; }
DIST_ID=$(jq_get Id)
DIST_DOMAIN=$(jq_get DomainName)
DIST_ARN=$(jq_get ARN)

echo "== 6. bucket policy: only this distribution may read"
aws s3api put-bucket-policy --bucket "$AUDIO_BUCKET" --policy "{
  \"Version\":\"2012-10-17\",\"Statement\":[{\"Sid\":\"AllowCloudFrontOAC\",\"Effect\":\"Allow\",
  \"Principal\":{\"Service\":\"cloudfront.amazonaws.com\"},\"Action\":\"s3:GetObject\",
  \"Resource\":\"arn:aws:s3:::${AUDIO_BUCKET}/*\",
  \"Condition\":{\"StringEquals\":{\"AWS:SourceArn\":\"${DIST_ARN}\"}}}]}"

echo
echo "==== .env.prod 에 넣을 값 ===="
echo "AUDIO_DELIVERY=cloudfront"
echo "AUDIO_URL_BASE_URL=https://${DIST_DOMAIN}"
echo "CLOUDFRONT_KEY_PAIR_ID=${PUB_ID}"
echo "CLOUDFRONT_PRIVATE_KEY_BASE64=$(base64 -w0 "$OUT/cf_private.pem")"
echo
echo "==== 업로드 스크립트가 쓰는 값 ===="
echo "AUDIO_BUCKET=${AUDIO_BUCKET}"
echo "KVS_ARN=${KVS_ARN}"
echo
echo "distribution ${DIST_ID} 배포 완료까지 5~10분. ${OUT}/cf_private.pem 은 커밋 금지."
