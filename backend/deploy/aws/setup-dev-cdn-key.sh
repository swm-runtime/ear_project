#!/usr/bin/env bash
# 개발계 오디오 서명 키 (KAN-62 2단계) — 멱등.
#
#   AWS_PROFILE=isb bash backend/deploy/aws/setup-dev-cdn-key.sh
#
# 개발계는 운영 S3·운영 CloudFront 를 **읽기 전용으로 공유**한다(콘텐츠 계층 동일 — 결정 7). 새 버킷·새 배포는
# 만들지 않고, 운영 배포의 키 그룹에 **개발계 전용 공개키를 하나 더** 넣는다. 그러면 개발계 서버는 자기 개인키로
# 서명하고 운영 CloudFront 가 검증한다 — 운영 개인키가 개발계 서버에 놓이지 않는다. 회수는 키 그룹에서 이 키만 빼면 끝.
#
# 만드는 것: RSA 2048 키페어(out/cf_private_dev.pem — 커밋 금지) · CloudFront 공개키 ear-audio-key-dev
# 운영에 손대는 것: 키 그룹 ear-audio-keygroup 에 공개키 1개 추가 (기존 키·배포·버킷 정책 무변경)
# 갱신하는 것: Secrets Manager ear/dev/api 의 CLOUDFRONT_PRIVATE_KEY_BASE64 (값 미출력)
# 끝에 개발계 .env.prod 에 넣을 비밀 아닌 줄 4개를 출력한다.
set -euo pipefail

REGION="${AWS_REGION:-ap-northeast-2}"
KEY_NAME="${KEY_NAME:-ear-audio-key-dev}"
KEY_GROUP_NAME="${KEY_GROUP_NAME:-ear-audio-keygroup}"
DIST_ID="${DIST_ID:-ETLYPIXXR2K7A}"                 # 운영 오디오 배포 (docs/infra/inventory.md 2장)
SECRET_ID="${SECRET_ID:-ear/dev/api}"
OUT="$(cd "$(dirname "$0")" && pwd)/out"
PRIV="$OUT/cf_private_dev.pem"
mkdir -p "$OUT"

say() { printf '\n=== %s\n' "$*"; }
aws() { command aws --region "$REGION" "$@"; }

say "계정 확인"
aws sts get-caller-identity --query '[Account,Arn]' --output text

# ── 1. 개발계 키페어 ─────────────────────────────────────────
say "RSA 키페어 $PRIV"
if [ -f "$PRIV" ]; then
  echo "이미 있음 — 재사용"
else
  openssl genrsa -out "$PRIV" 2048 2>/dev/null
  chmod 600 "$PRIV"
  echo "생성됨 (커밋 금지 — out/ 은 gitignore)"
fi
PUB_TMP=$(mktemp); trap 'rm -f "$PUB_TMP"' EXIT
openssl rsa -in "$PRIV" -pubout -out "$PUB_TMP" 2>/dev/null

# ── 2. CloudFront 공개키 (이름으로 멱등) ──────────────────────
say "CloudFront 공개키 $KEY_NAME"
PUB_ID=$(aws cloudfront list-public-keys --query "PublicKeyList.Items[?Name=='$KEY_NAME'].Id | [0]" --output text)
if [ "$PUB_ID" = "None" ] || [ -z "$PUB_ID" ]; then
  CFG=$(mktemp)
  python3 - "$PUB_TMP" "$KEY_NAME" > "$CFG" <<'PY'
import json, sys, time
pem = open(sys.argv[1]).read()
print(json.dumps({"CallerReference": f"{sys.argv[2]}-{int(time.time())}", "Name": sys.argv[2], "EncodedKey": pem,
                  "Comment": "dev API signing key - dev server signs, prod distribution verifies"}))
PY
  PUB_ID=$(aws cloudfront create-public-key --public-key-config "file://$CFG" --query PublicKey.Id --output text)
  rm -f "$CFG"
  echo "생성됨: $PUB_ID"
else
  echo "이미 있음: $PUB_ID"
fi

# ── 3. 운영 키 그룹에 추가 (기존 키 유지) ─────────────────────
say "키 그룹 $KEY_GROUP_NAME 에 $PUB_ID 추가"
KG_ID=$(aws cloudfront list-key-groups --query "KeyGroupList.Items[?KeyGroup.KeyGroupConfig.Name=='$KEY_GROUP_NAME'].KeyGroup.Id | [0]" --output text)
[ "$KG_ID" != "None" ] || { echo "키 그룹이 없다: $KEY_GROUP_NAME"; exit 1; }
KG_JSON=$(aws cloudfront get-key-group --id "$KG_ID")
ETAG=$(echo "$KG_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin)["ETag"])')
if echo "$KG_JSON" | python3 -c "import json,sys; d=json.load(sys.stdin); sys.exit(0 if '$PUB_ID' in d['KeyGroup']['KeyGroupConfig']['Items'] else 1)"; then
  echo "이미 들어 있음"
else
  NEW_CFG=$(echo "$KG_JSON" | python3 -c "
import json,sys
c=json.load(sys.stdin)['KeyGroup']['KeyGroupConfig']; c['Items'].append('$PUB_ID'); print(json.dumps(c))")
  aws cloudfront update-key-group --id "$KG_ID" --if-match "$ETAG" --key-group-config "$NEW_CFG" --query 'KeyGroup.KeyGroupConfig.Items' --output text
  echo "추가됨 (운영 키 그대로 + 개발 키)"
fi

# ── 4. 개발계 시크릿의 개인키 갱신 (값 미출력) ────────────────
say "Secrets Manager $SECRET_ID — CLOUDFRONT_PRIVATE_KEY_BASE64"
CUR=$(mktemp); chmod 600 "$CUR"; trap 'rm -f "$PUB_TMP" "$CUR"' EXIT
aws secretsmanager get-secret-value --secret-id "$SECRET_ID" --query SecretString --output text > "$CUR"
python3 - "$CUR" "$PRIV" <<'PY'
import base64, json, sys
cur, priv = sys.argv[1:3]
d = json.load(open(cur))
d["CLOUDFRONT_PRIVATE_KEY_BASE64"] = base64.b64encode(open(priv, "rb").read()).decode()
json.dump(d, open(cur, "w"))
PY
aws secretsmanager put-secret-value --secret-id "$SECRET_ID" --secret-string "file://$CUR" --query VersionId --output text >/dev/null
echo "갱신됨"

DIST_DOMAIN=$(aws cloudfront get-distribution --id "$DIST_ID" --query 'Distribution.DomainName' --output text)
say "완료 — 개발계 .env.prod 에 넣을 줄 (비밀 아님)"
cat <<ENV
AUDIO_DELIVERY=cloudfront
AUDIO_URL_BASE_URL=https://$DIST_DOMAIN
CLOUDFRONT_KEY_PAIR_ID=$PUB_ID
AUDIO_BUCKET=earcast-audio-prod   # 업로드 대상 이름만 — 개발계 롤에 쓰기 권한이 없어 업로드·회수는 S3 에서 거부된다(의도)
ENV
echo "적용: 서버 .env.prod 의 위 4줄을 바꾸고 push.sh 재실행 (CLOUDFRONT_PRIVATE_KEY_BASE64 는 push.sh 가 시크릿에서 덮어쓴다)"
