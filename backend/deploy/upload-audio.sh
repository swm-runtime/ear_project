#!/usr/bin/env bash
# 오디오 원본을 S3에 올린다. contents.audio_path 값 = 버킷 안의 키(예: ep/<uuid>.mp3).
#   deploy/upload-audio.sh ./storage/audio  →  s3://$AUDIO_BUCKET/ 아래에 동일 구조로
# 키는 제목이 아니라 불투명한 식별자로 둔다 — CDN URL에 그대로 노출되기 때문.
set -euo pipefail
SRC="${1:?source dir required}"
: "${AUDIO_BUCKET:?AUDIO_BUCKET required}"
aws s3 sync "$SRC" "s3://${AUDIO_BUCKET}/" \
  --exclude '*' --include '*.mp3' --include '*.m4a' \
  --content-type audio/mpeg \
  --cache-control 'public, max-age=31536000, immutable' \
  --only-show-errors
echo "uploaded to s3://${AUDIO_BUCKET}/"
