import Script from "next/script";
import { GA_MEASUREMENT_ID } from "@/content/site";

/**
 * Google Analytics 4(gtag.js)를 심는다.
 *
 * 구글이 주는 원본 스니펫은 `<script async src=...>` + 인라인 초기화 두 개인데,
 * 그대로 JSX에 박으면 App Router가 라우트 이동 때 스크립트를 다시 실행하거나
 * 실행 순서를 보장하지 않는다. `next/script`가 "한 번만 로드"와 순서를 책임지므로
 * 그쪽을 쓴다(`node_modules/next/dist/docs/01-app/02-guides/scripts.md`).
 *
 * `strategy`는 기본값인 `afterInteractive`. 같은 문서가 태그 매니저·애널리틱스를
 * 이 전략의 예로 들고 있다 — 측정은 빨리 붙어야 하지만 우리 코드보다 먼저 받을
 * 이유는 없다. `beforeInteractive`로 올리면 LCP 앞줄을 분석 스크립트가 차지한다.
 *
 * 정적 내보내기(`output: "export"`)에서도 그대로 동작한다. afterInteractive는
 * 서버가 아니라 클라이언트 런타임이 주입하는 방식이라 서버가 필요 없다. 대신
 * 자바스크립트가 꺼진 브라우저에서는 측정이 붙지 않는데, 본문은 정적 HTML이라
 * 읽는 데는 지장이 없고 측정만 빠진다.
 *
 * 인라인 스크립트에 `id`가 필요한 건 Next가 중복 실행을 막는 열쇠로 쓰기 때문이다.
 */
export function Analytics() {
  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
        strategy="afterInteractive"
      />
      <Script id="ga4-init" strategy="afterInteractive">
        {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${GA_MEASUREMENT_ID}');`}
      </Script>
    </>
  );
}
