import type { Metadata, Viewport } from "next";
import { Analytics as VercelAnalytics } from "@vercel/analytics/next";
import { Analytics } from "@/components/Analytics";
import { site, SITE_URL } from "@/content/site";
import "../globals.css";

/**
 * 퀴즈 페이지(`/quiz/…`)의 루트 레이아웃 — 사이트 헤더·바닥글 없이 퀴즈만 그린다(2026-10-27 — KAN-281).
 *
 * 퀴즈는 카톡으로 받은 링크를 눌러 들어오는 사람이 먼저 보는 화면이다. 시작부터 서비스 메뉴와
 * [앱 다운로드] 버튼이 보이면 광고로 읽혀 풀기 전에 닫는다. 그래서 앱 안내는 결과 화면 한 곳에만 두고,
 * 한국어 레이아웃(`(ko)/layout.tsx`)의 헤더·바닥글·전역 JSON-LD·스크롤 등장 효과는 싣지 않는다.
 *
 * 루트 레이아웃이 하나 더 생긴 것이라(한국어 `(ko)` · 영어 `en/` · 퀴즈 `(quiz)`) 다른 페이지와 오가면
 * 전체 새로고침이 일어난다. 퀴즈에서 나가는 길은 `/app/` 링크 하나뿐이라 문제없다.
 */
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: site.name,
    template: `%s | ${site.name}`,
  },
  applicationName: site.name,
  robots: { index: false, follow: true },
  formatDetection: { telephone: false, address: false, email: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#ffffff" },
  ],
  colorScheme: "light",
};

export default function QuizRootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
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
        <main id="main">{children}</main>
        <Analytics />
        <VercelAnalytics />
      </body>
    </html>
  );
}
