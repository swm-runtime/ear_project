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

## 페이지 구성

한 장짜리 랜딩이 아니라 **주제별로 주소를 나눈다.** 기능·요금제·FAQ가 각각 다른 검색어로 잡히려면 각자의 주소와 제목·설명을 가져야 하기 때문이다.

| 경로 | 내용 |
|---|---|
| `/` | 히어로 + 각 주제 요약. 판단에 필요한 것은 전용 페이지로 넘긴다 |
| `/features/` | 기능 여섯 가지 상세 + 즉시 재생이 가능한 이유 + 하지 않기로 정한 것 |
| `/pricing/` | 요금제 3종 + 무엇이 같고 다른가 + 결제·해지 안내 |
| `/blog/`, `/blog/<slug>/` | 글 목록과 상세. 글은 `src/content/blog.ts`에 있다 |
| `/faq/` | 주제별 전체 FAQ. FAQPage 구조화 데이터는 **이 페이지만** 내보낸다 |
| `/privacy/`, `/terms/` | 개인정보 처리방침·이용약관 |

**중복 콘텐츠를 만들지 않는 것이 규칙이다.** 홈에도 기능·요금제·FAQ가 나오지만 전부 짧은 판본이고, 전용 페이지는 문장 자체가 다르다(`features[].body` vs `features[].detail`). 같은 문단을 두 주소에 그대로 실으면 어느 쪽을 대표로 볼지 흔들린다.

페이지를 추가할 때는 **`src/content/routes.ts`에만 넣으면 된다.** 내비게이션·바닥글·사이트맵·breadcrumb이 전부 거기서 나온다.

## 배포 전 반드시 바꿀 것

| 항목 | 위치 | 지금 값 |
|---|---|---|
| 도메인 | 환경변수 `NEXT_PUBLIC_SITE_URL` | `https://ear.example.com` (`src/content/site.ts` 기본값) |
| 문의 메일 | `src/content/site.ts` → `site.contactEmail` | `hello@ear.example.com` |
| 개인정보 문의 메일 | `src/content/site.ts` → `site.privacyEmail` | `privacy@ear.example.com` |
| 사업자 정보·시행일 | `src/content/legal.ts` → `TBD` 상수 | `〈…확정 후 기재〉` 자리표시자 |
| 구글 서치콘솔 소유확인 | 환경변수 `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` | 미설정 |
| 네이버 서치어드바이저 소유확인 | 환경변수 `NEXT_PUBLIC_NAVER_SITE_VERIFICATION` | 미설정 |

도메인은 canonical·og:url·sitemap의 기준이라 **틀리면 SEO가 통째로 어긋난다.** 빌드 환경에 넣어 둔다.

```bash
NEXT_PUBLIC_SITE_URL=https://이실제도메인 npm run build
```

### ⚠️ 정책 문서는 법무 검토 전이다

`/privacy/`·`/terms/`의 본문은 `docs/prd/ear_root_prd.md` 7장과 `docs/features/auth.md` 4.3의 실제 정책(결제 이력 유무로 갈리는 파기·보존)을 근거로 쓴 초안이다. **정식 출시 전에 법무 검토를 거쳐야 하고**, 확정되지 않은 값은 `src/content/legal.ts`의 `TBD` 상수에 모여 있다. 임의의 회사명·주소·시행일을 적어 두지 않은 이유는 그대로 배포되면 허위 고지가 되기 때문이다.

## SEO를 위해 해 둔 것

- **정적 HTML 사전 생성** — 크롤러가 첫 응답에서 본문 전체를 받는다. 클라이언트 컴포넌트(`'use client'`)가 한 곳도 없어 자바스크립트 없이도 내용이 전부 보인다.
- **페이지마다 고유한 title·description·canonical·og:image** — `src/lib/seo.ts`가 `routes.ts` 하나에서 만든다. 페이지가 "어느 라우트인가"만 말하면 나머지는 자동이라 canonical을 빠뜨릴 수가 없다.
- **canonical에 끝 슬래시를 붙인다** — `trailingSlash: true`로 내보내는 실제 주소가 `/pricing/`이다. 한 글자만 달라도 색인이 갈라진다. 사이트맵도 같은 문자열을 쓴다.
- **og:image를 확장자 있는 정적 PNG로** — 카카오톡·페이스북 크롤러는 JS를 실행하지 않고, Content-Type이 `image/png`가 아니면 썸네일을 만들지 않는다. 페이지 묶음별로 6장을 굽는다(`scripts/og-image.mjs`).
- **구조화 데이터(JSON-LD)** — 전역은 Organization·WebSite·MobileApplication, 페이지별로 BreadcrumbList·FAQPage·Blog·BlogPosting. 조립은 `src/lib/schema.ts`가 한다. FAQ는 화면과 같은 원본에서 나가므로 "화면에 없는 내용을 구조화 데이터에만 넣는" 정책 위반이 생기지 않는다.
- **내부 링크** — 모든 하위 페이지가 빵부스러기와 "이어서 볼 것" 묶음을 갖는다. 페이지를 나누면 각 장이 막다른 길이 되기 쉬워서다.
- `sitemap.xml` · `robots.txt` · `manifest.webmanifest` 자동 생성, `lang="ko"`
- **아코디언을 `<details>`로** — 접힌 답변도 HTML에 들어 있어 크롤러가 읽는다
- 시맨틱 마크업(`main`/`article`/`nav`/`footer`), 페이지당 `h1` 한 개, 본문 바로가기 링크, 키보드 포커스 표시, `prefers-reduced-motion` 대응
- 웹폰트를 실제 쓰인 글자로 서브셋(139KB, 굵기 100~900 전부)하고 `preload` — LCP가 폰트 로딩을 기다리지 않게 한다

## 구조

```
src/
  app/
    layout.tsx          공통 메타데이터 + 헤더·푸터 + 전역 JSON-LD
    page.tsx            홈
    features/ pricing/ faq/ privacy/ terms/     각 page.tsx + page.module.css
    blog/page.tsx       목록
    blog/[slug]/page.tsx  글 상세 (generateStaticParams로 정적 생성)
    globals.css         디자인 토큰 + 공용 클래스(container/section/btn/eyebrow)
    icon.svg  manifest.ts  robots.ts  sitemap.ts  not-found.tsx
  components/           섹션·공용 컴포넌트 + 같은 이름의 *.module.css
  content/
    routes.ts           ★ 페이지 목록과 페이지별 SEO 메타의 유일한 원본
    site.ts             화면 문구·수치
    blog.ts             블로그 글
    legal.ts            처리방침·약관 본문
    prose.ts            긴 글의 블록 타입
  lib/
    seo.ts              Metadata 조립
    schema.ts           JSON-LD 조립
assets/                 og:image 전용 폰트 서브셋(TTF)
scripts/
  og-pages.mjs          og:image 문구 (순수 JS — 빌드가 TS 로딩에 의존하지 않게)
  og-image.mjs          public/og/*.png 생성 (build 전 자동 실행)
  subset-og-fonts.sh    assets/og-*.ttf 재생성 (수동)
  subset-fonts.sh       public/fonts/pretendard-var.woff2 재생성 (수동)
```

## 문구를 고쳤다면

화면 문구는 `src/content/`에 있다. 고친 뒤에는 **폰트 서브셋을 다시 만든다.**

```bash
npm run build && bash scripts/subset-fonts.sh && npm run build
```

서브셋에 없는 글자는 시스템 글꼴로 떨어져서 한 문장 안에서 서체가 섞여 보인다. (필요: `python3`, `curl`)

공유 이미지 문구(`scripts/og-pages.mjs`)를 고쳤다면 그쪽 서브셋도 따로 만든다.

```bash
bash scripts/subset-og-fonts.sh && npm run og
```

## 내용의 근거

카피에 나오는 정책 수치는 `docs/prd/ear_root_prd.md`와 `docs/features/`가 원본이다.

- 하루 2편 드립(전 티어 동일) · 재생 한도만 티어로 갈림 — FR-14, FR-29
- 미청취 5편 이상이면 그날 적립 건너뜀 · 주제 고갈 시 대체 없이 건너뜀 — FR-14
- 관심 주제 최소 1개·최대 3개 — FR-03
- 에피소드 10~15분 — FR-13
- 즉시 재생(생성 대기 없음) — FR-23 / 비기능 요구사항
- 이어듣기는 자동 재생하지 않음 — FR-24
- 원문 대조 검수·출처 고지 — FR-09, FR-10, FR-12
- 탈퇴 시 결제 이력 유무로 파기·보존이 갈림 — FR-02 / 비기능 요구사항 7장
- 해지해도 만료일까지 혜택 유지 — FR-31
- 오프라인 저장은 P1 이연 — FR-26

**유료 요금제 가격과 재생 한도는 아직 확정되지 않았다.** PRD가 시범 운영 후 확정으로 두고 있어 페이지에도 "준비 중"으로 적었다. 확정되면 `src/content/site.ts`의 `plans`·`planComparison`과 FAQ를 함께 고친다.
