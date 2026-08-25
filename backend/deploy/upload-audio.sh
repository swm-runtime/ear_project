#!/usr/bin/env bash
# 오디오 한 편을 S3에 올리고 contentId → 키 매핑을 CloudFront KeyValueStore에 넣는다.
#   AUDIO_BUCKET=ear-audio-prod KVS_ARN=arn:aws:cloudfront::...:key-value-store/... \
#     deploy/upload-audio.sh <contentId> <file.mp3>
# 출력되는 키를 contents.audio_path 에 넣는다. 키는 무작위라 URL·DB 어디에도 제목이 새지 않는다.
#
# 같은 contentId로 다시 올리면 새 키가 만들어지고 KVS가 새 키를 가리킨다(무중단 교체).
# 옛 오브젝트는 지우지 않는다 — 이미 발급된 URL이 5분간 살아 있다. 청소는 나중에 수동으로.
set -euo pipefail
CONTENT_ID="${1:?contentId required}"
FILE="${2:?file required}"
: "${AUDIO_BUCKET:?AUDIO_BUCKET required}" "${KVS_ARN:?KVS_ARN required}"
[[ "$CONTENT_ID" =~ ^[0-9a-fA-F-]{36}$ ]] || { echo "contentId must be a uuid" >&2; exit 1; }
CONTENT_ID=$(echo "$CONTENT_ID" | tr 'A-F' 'a-f')

EXT="${FILE##*.}"
KEY="audio/$(openssl rand -hex 16).${EXT}"
CT="audio/mpeg"; [ "$EXT" = "m4a" ] && CT="audio/mp4"

aws s3 cp "$FILE" "s3://${AUDIO_BUCKET}/${KEY}" \
  --content-type "$CT" \
  --cache-control 'public, max-age=31536000, immutable' \
  --only-show-errors

# KVS 쓰기는 낙관적 잠금이다 — 현재 ETag를 받아서 함께 보낸다
ETAG=$(aws cloudfront-keyvaluestore describe-key-value-store --kvs-arn "$KVS_ARN" --query ETag --output text)
aws cloudfront-keyvaluestore put-key --kvs-arn "$KVS_ARN" --if-match "$ETAG" \
  --key "$CONTENT_ID" --value "$KEY" >/dev/null

echo "$KEY"
