import type { Metadata } from "next";
import Link from "next/link";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { Sentences } from "@/components/Sentences";
import { navRoutes } from "@/content/routes";
import { site } from "@/content/site";
import s from "./not-found.module.css";
import "./globals.css";

/**
 * 없는 주소의 404(종전 `app/not-found.tsx`를 옮긴 것 — 2026-10-15, KAN-199).
 *
 * 루트 레이아웃이 한국어(`(ko)`)·영어(`en/`) 둘로 갈리면서 맨 위 `app/layout.tsx`가 없어졌고, 그러면 `not-found.tsx`를
 * 감쌀 레이아웃이 없어 Next 기본 404(영어 한 줄)가 `out/404.html`로 나간다. Next가 이 경우를 위해 둔 것이
 * `global-not-found`다(`next.config.ts`의 `experimental.globalNotFound`) — 레이아웃을 거치지 않으므로
 * `<html>`·전역 CSS·헤더·푸터를 여기서 직접 그린다. 404는 한국어로 둔다(영어판은 필수 4페이지만이다).
 */
export const metadata: Metadata = {
  title: `페이지를 찾을 수 없어요 | ${site.name}`,
  // 404는 색인 대상이 아니다.
  robots: { index: false, follow: true },
};

export default function GlobalNotFound() {
  return (
    <html lang="ko">
      <head>
        <link
          rel="preload"
          href="/fonts/pretendard-var.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
      </head>
      <body>
        <a href="#main" className="skipLink">
          본문 바로가기
        </a>
        <Header />
        <main id="main">
          <div className={s.wrap}>
            <div className="container">
              <p className={s.code}>404</p>
              <h1 className={s.title}>찾으시는 페이지가 없어요</h1>
              <p className={s.lede}>
                <Sentences text="주소가 바뀌었거나 삭제된 페이지일 수 있어요. 아래에서 다시 찾아봐 주세요." />
              </p>

              <Link href="/" className="btn btnPrimary">
                첫 화면으로
              </Link>

              <nav className={s.links} aria-label="주요 페이지">
                {navRoutes.map((r) => (
                  <Link key={r.path} href={r.path}>
                    {r.label}
                  </Link>
                ))}
              </nav>
            </div>
          </div>
        </main>
        <Footer />
      </body>
    </html>
  );
}
