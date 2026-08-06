# og:image 전용 폰트 서브셋

`scripts/og-image.mjs`가 공유 미리보기 이미지를 그릴 때만 쓰는 Pretendard 서브셋이다.
이미지에 실제로 찍히는 글자만 남겨서 파일당 11KB다.

- `og-800.ttf` — 제목·워드마크(Bold)
- `og-400.ttf` — 하단 설명줄(Regular)

`next/og`(satori)는 **woff2를 읽지 못한다.** 그래서 여기만 TTF다.
웹 페이지 본문 글꼴은 `public/fonts/pretendard-var.woff2`이고 만드는 방법이 다르다(`scripts/subset-fonts.sh`).

## 이미지 문구를 고쳤다면

`scripts/og-image.mjs`의 문구를 바꿨다면 서브셋도 다시 만들어야 한다.
빠진 글자는 이미지에서 네모(tofu)로 나온다.

```bash
# 1. 이미지에 들어가는 글자를 그대로 적는다 (숫자·기호 포함)
TEXT='이어출근길에 열면,오늘 들을 게 준비되어 있어요자기계발 · 커리어 · 교양|매일 2편, 오디오로 도착하는 AI 팟캐스트0123456789'

# 2. 도구 준비
python3 -m venv /tmp/fontenv && /tmp/fontenv/bin/pip install fonttools brotli

# 3. 원본 내려받기
curl -sSfL -o /tmp/Pretendard-Bold.ttf \
  https://cdn.jsdelivr.net/npm/pretendard@1.3.9/dist/public/static/alternative/Pretendard-Bold.ttf
curl -sSfL -o /tmp/Pretendard-Regular.ttf \
  https://cdn.jsdelivr.net/npm/pretendard@1.3.9/dist/public/static/alternative/Pretendard-Regular.ttf

# 4. 서브셋 생성
printf '%s' "$TEXT" > /tmp/og-text.txt
/tmp/fontenv/bin/pyftsubset /tmp/Pretendard-Bold.ttf \
  --text-file=/tmp/og-text.txt --output-file=assets/og-800.ttf
/tmp/fontenv/bin/pyftsubset /tmp/Pretendard-Regular.ttf \
  --text-file=/tmp/og-text.txt --output-file=assets/og-400.ttf

# 5. 확인
npm run og && open public/opengraph-image.png
```

## 라이선스

Pretendard — SIL Open Font License 1.1. <https://github.com/orioncactus/pretendard>
