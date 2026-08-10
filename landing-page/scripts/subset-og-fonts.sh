#!/usr/bin/env bash
#
# og:image 전용 폰트 서브셋(assets/og-400.ttf · og-800.ttf)을 다시 만든다.
#
#   bash scripts/subset-og-fonts.sh && npm run og
#
# 왜 필요한가
#   `next/og`(satori)는 woff2를 읽지 못해 TTF만 쓴다. Pretendard 원본 TTF는 한 벌에
#   1.5MB라 저장소에 넣기 부담스러워서, 이미지에 실제로 찍히는 글자만 남긴다(한 벌 ~11KB).
#
# 언제 다시 돌려야 하나
#   scripts/og-pages.mjs 의 문구를 고칠 때마다. 서브셋에 없는 글자는 이미지에서
#   네모(tofu)로 찍힌다. 문자 목록은 og-pages.mjs 에서 직접 뽑으므로 손으로 적지 않는다.
#
# 필요한 것: python3, curl, node
set -euo pipefail

cd "$(dirname "$0")/.."

PRETENDARD_VERSION="1.3.9"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "1/4  og-pages.mjs 에서 문자 추출"
node -e '
import("./scripts/og-pages.mjs").then(async (m) => {
  const chars = [...new Set(m.ogCharacters())].sort().join("");
  await (await import("node:fs/promises")).writeFile(process.argv[1], chars, "utf8");
  console.log(`      고유 문자 ${chars.length}자`);
});
' "$WORK/chars.txt"

echo "2/4  fonttools 준비"
python3 -m venv "$WORK/venv"
"$WORK/venv/bin/pip" install --quiet fonttools brotli

echo "3/4  Pretendard $PRETENDARD_VERSION 내려받기"
BASE_URL="https://cdn.jsdelivr.net/npm/pretendard@$PRETENDARD_VERSION/dist/public/static/alternative"
curl -sSfL -o "$WORK/bold.ttf" "$BASE_URL/Pretendard-Bold.ttf"
curl -sSfL -o "$WORK/regular.ttf" "$BASE_URL/Pretendard-Regular.ttf"

echo "4/4  서브셋 생성"
# 숫자·기본 문장부호는 문구에 없더라도 남겨 둔다.
BASE="U+0020-007E,U+00B7,U+2013,U+2014,U+2018,U+2019,U+201C,U+201D,U+2026"
"$WORK/venv/bin/pyftsubset" "$WORK/bold.ttf" \
  --unicodes="$BASE" --text-file="$WORK/chars.txt" --output-file=assets/og-800.ttf
"$WORK/venv/bin/pyftsubset" "$WORK/regular.ttf" \
  --unicodes="$BASE" --text-file="$WORK/chars.txt" --output-file=assets/og-400.ttf

ls -lh assets/og-800.ttf assets/og-400.ttf
echo "완료. 'npm run og' 로 이미지를 다시 굽고 눈으로 확인할 것."
