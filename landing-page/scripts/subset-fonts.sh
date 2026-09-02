#!/usr/bin/env bash
#
# 웹폰트(Pretendard) 서브셋을 다시 만든다.
#
#   npm run build && bash scripts/subset-fonts.sh
#
# 왜 서브셋이 필요한가
#   한글 폰트는 음절이 11,172자라 통째로 넣으면 변수폰트 woff2가 1.7MB다.
#   랜딩페이지에서 그 용량은 LCP를 그대로 갉아먹는다. 실제로 화면에 나오는
#   글자만 남기면 86KB로 줄고, 굵기는 변수폰트 하나가 100~900을 다 커버한다.
#
# 언제 다시 돌려야 하나
#   **문구를 고칠 때마다.** 서브셋에 없는 글자는 시스템 글꼴로 떨어져서
#   한 문장 안에서 서체가 섞여 보인다. 빌드 결과(out/)에서 글자를 뽑으므로
#   반드시 `npm run build`를 먼저 돌린 다음 실행한다.
#
# 필요한 것: python3, curl
set -euo pipefail

cd "$(dirname "$0")/.."

PRETENDARD_VERSION="1.3.9"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

if [ ! -d out ]; then
  echo "out/ 이 없다. 먼저 'npm run build'를 실행할 것." >&2
  exit 1
fi

echo "1/4  fonttools 준비"
python3 -m venv "$WORK/venv"
"$WORK/venv/bin/pip" install --quiet fonttools brotli

echo "2/4  Pretendard $PRETENDARD_VERSION 내려받기"
curl -sSfL -o "$WORK/var.ttf" \
  "https://cdn.jsdelivr.net/npm/pretendard@$PRETENDARD_VERSION/dist/public/variable/PretendardVariable.ttf"

echo "3/4  out/ 의 HTML에서 쓰인 글자 추출"
python3 - "$WORK/chars.txt" <<'PY'
import html, pathlib, re, sys

chars = set()
for path in pathlib.Path("out").rglob("*.html"):
    body = path.read_text(encoding="utf-8").split("<body", 1)[-1]
    body = re.sub(r"<script.*?</script>", " ", body, flags=re.S)
    chars |= set(html.unescape(re.sub(r"<[^>]+>", " ", body)))

chars = {c for c in chars if c.isprintable() and not c.isspace()}
pathlib.Path(sys.argv[1]).write_text("".join(sorted(chars)), encoding="utf-8")
print(f"      고유 문자 {len(chars)}자")
PY

echo "4/4  서브셋 생성"
# 화면에 없더라도 흔히 쓰는 기호·라틴 문자는 넉넉히 남겨 둔다.
BASE="U+0020-007E,U+00A0,U+00A9,U+00AE,U+00B7,U+00D7,U+2013,U+2014,U+2018,U+2019,U+201C,U+201D,U+2022,U+2026,U+20A9,U+2192"
"$WORK/venv/bin/pyftsubset" "$WORK/var.ttf" \
  --unicodes="$BASE" \
  --text-file="$WORK/chars.txt" \
  --layout-features='*' \
  --flavor=woff2 \
  --output-file=public/fonts/pretendard-var.woff2

ls -lh public/fonts/pretendard-var.woff2

echo "5/5  Paperlogy(제목용) 서브셋 — 600·700 두 굵기"
for W in "6SemiBold:600" "7Bold:700"; do
  NAME="${W%%:*}"; WGT="${W##*:}"
  curl -sSfL -o "$WORK/paperlogy-$WGT.woff2"     "https://cdn.jsdelivr.net/gh/fonts-archive/Paperlogy/Paperlogy-$NAME.woff2"
  "$WORK/venv/bin/pyftsubset" "$WORK/paperlogy-$WGT.woff2"     --unicodes="$BASE"     --text-file="$WORK/chars.txt"     --layout-features='*'     --flavor=woff2     --output-file="public/fonts/paperlogy-$WGT.woff2"
done
ls -lh public/fonts/paperlogy-*.woff2
echo "완료. 문구를 또 고치면 다시 실행할 것."
