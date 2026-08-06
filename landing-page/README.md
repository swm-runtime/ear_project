# 이어 랜딩페이지

서비스 소개용 웹 랜딩페이지. **SEO를 최우선**으로 잡고 Next.js(App Router) 정적 내보내기로 만들었다.

> 이 디렉터리는 앱(`frontend/`)·서버(`backend/`)와 별개다. 코드를 공유하지 않는다 — `frontend/`는 React Native라 웹 컴포넌트가 넘어오지 않는다.

## 실행

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # out/ 에 정적 파일 생성 (prebuild가 og:image를 먼저 굽는다)
```

빌드 결과인 `out/`은 순수 HTML/CSS/JS다. Vercel·Cloudflare Pages·S3·Nginx 어디든 그대로 올린다.

## 배포 전 반드시 바꿀 것

| 항목 | 위치 | 지금 값 |
|---|---|---|
| 도메인 | 환경변수 `NEXT_PUBLIC_SITE_URL` | `https://ear.example.com` (`src/content/site.ts` 기본값) |
| 문의 메일 | `src/content/site.ts` → `site.contactEmail` | `hello@ear.example.com` |
| 구글 서치콘솔 소유확인 | 환경변수 `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` | 미설정 |
| 네이버 서치어드바이저 소유확인 | 환경변수 `NEXT_PUBLIC_NAVER_SITE_VERIFICATION` | 미설정 |
| 이용약관·개인정보 처리방침 | `src/components/Footer.tsx` | 페이지가 없어 링크를 걸지 않음 |

도메인은 canonical·og:url·sitemap의 기준이라 **틀리면 SEO가 통째로 어긋난다.** 빌드 환경에 넣어 둔다.

```bash
NEXT_PUBLIC_SITE_URL=https://이실제도메인 npm run build
```

## SEO를 위해 해 둔 것

- **정적 HTML 사전 생성** — 크롤러가 첫 응답에서 본문 전체를 받는다. 클라이언트 컴포넌트(`'use client'`)가 한 곳도 없어 자바스크립트 없이도 내용이 전부 보인다.
- **og:image를 확장자 있는 정적 PNG로** — 카카오톡·페이스북 크롤러는 JS를 실행하지 않고, Content-Type이 `image/png`가 아니면 썸네일을 만들지 않는다. `scripts/og-image.mjs` 참고.
- **구조화 데이터(JSON-LD)** — Organization·WebSite·MobileApplication·FAQPage. FAQ는 화면과 같은 원본(`src/content/site.ts`)에서 나가므로 "화면에 없는 내용을 구조화 데이터에만 넣는" 정책 위반이 생기지 않는다.
- `sitemap.xml` · `robots.txt` · `manifest.webmanifest` 자동 생성, canonical·hreflang(`lang="ko"`) 지정
- **FAQ 아코디언을 `<details>`로** — 접힌 답변도 HTML에 들어 있어 크롤러가 읽는다
- 시맨틱 마크업(`main`/`section`/`nav`/`footer`), `h1` 한 개, 본문 바로가기 링크, 키보드 포커스 표시, `prefers-reduced-motion` 대응
- 웹폰트를 실제 쓰인 글자로 서브셋(101KB)하고 `preload` — LCP가 폰트 로딩을 기다리지 않게 한다

## 구조

```
src/
  app/
    layout.tsx        메타데이터 전체(OG·트위터·robots·canonical·verification)
    page.tsx          섹션 조립만 한다
    globals.css       디자인 토큰 + 공용 클래스(container/section/btn/eyebrow)
    icon.svg  manifest.ts  robots.ts  sitemap.ts  not-found.tsx
  components/         섹션 단위 컴포넌트 + 같은 이름의 *.module.css
  content/site.ts     화면에 나가는 문구·수치의 원본
assets/               og:image 전용 폰트 서브셋
scripts/
  og-image.mjs        public/opengraph-image.png 생성 (build 전 자동 실행)
  subset-fonts.sh     public/fonts/pretendard-var.woff2 재생성 (수동)
```

## 문구를 고쳤다면

문구는 전부 `src/content/site.ts`에 있다. 고친 뒤에는 **폰트 서브셋을 다시 만든다.**

```bash
npm run build && bash scripts/subset-fonts.sh && npm run build
```

서브셋에 없는 글자는 시스템 글꼴로 떨어져서 한 문장 안에서 서체가 섞여 보인다. (필요: `python3`, `curl`)

히어로 이미지(og:image)의 문구는 `scripts/og-image.mjs`에 따로 있고, 그쪽 폰트 서브셋은 `assets/README.md`를 본다.

## 내용의 근거

카피에 나오는 정책 수치는 `docs/prd/ear_root_prd.md`와 `docs/pages/`가 원본이다.

- 하루 2편 드립(전 티어 동일) · 재생 한도만 티어로 갈림 — FR-14, FR-29
- 관심 주제 최소 1개·최대 3개 — FR-03
- 에피소드 10~15분 — FR-13
- 즉시 재생(생성 대기 없음) — FR-23 / 비기능 요구사항
- 이어듣기는 자동 재생하지 않음 — FR-24
- 원문 대조 검수·출처 고지 — FR-09, FR-10, FR-12
- 오프라인 저장은 P1 이연 — FR-26

**유료 요금제 가격과 재생 한도는 아직 확정되지 않았다.** PRD가 시범 운영 후 확정으로 두고 있어 페이지에도 "준비 중"으로 적었다. 확정되면 `src/content/site.ts`의 `plans`와 FAQ를 함께 고친다.
