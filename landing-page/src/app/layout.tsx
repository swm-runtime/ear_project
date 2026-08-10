import type { Metadata, Viewport } from "next";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { JsonLd } from "@/components/JsonLd";
import { routes } from "@/content/routes";
import { site, SITE_URL } from "@/content/site";
import { siteGraph } from "@/lib/schema";
import "./globals.css";

/**
 * 루트 레이아웃.
 *
 * 여기에는 **모든 페이지에 공통인 것만** 둔다. 제목·설명·canonical·OG 이미지는
 * 페이지마다 달라야 하므로 각 page.tsx가 `lib/seo.ts`로 만들어 내보낸다.
 * 여기서 openGraph를 정의해 두면 페이지가 덮어쓰지 않은 경우 홈 값이 그대로
 * 새어 나가므로, 공통 기본값으로 둘 만한 것만 남겼다.
 */
export const metadata: Metadata = {
  // canonical·OG·sitemap의 상대 경로가 절대 URL로 펼쳐지는 기준점.
  metadataBase: new URL(SITE_URL),
  title: {
    default: routes.home.title,
    template: `%s | ${site.name}`,
  },
  description: routes.home.description,
  keywords: [...site.keywords],
  applicationName: site.name,
  authors: [{ name: site.name }],
  creator: site.name,
  publisher: site.name,
  category: "education",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  // 한국어 페이지에서 숫자가 전화번호로 자동 링크되는 것을 막는다.
  formatDetection: { telephone: false, address: false, email: false },
  // 검색엔진 소유 확인 코드는 발급받은 뒤 환경변수로 주입한다.
  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION,
    other: process.env.NEXT_PUBLIC_NAVER_SITE_VERIFICATION
      ? { "naver-site-verification": process.env.NEXT_PUBLIC_NAVER_SITE_VERIFICATION }
      : {},
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfaf7" },
    { media: "(prefers-color-scheme: dark)", color: "#0c0f1a" },
  ],
  colorScheme: "light",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <head>
        {/* 본문 글꼴을 CSS 파싱보다 먼저 받기 시작한다. LCP(제목)가 폰트를 기다리지 않게 하는 것이 목적이다. */}
        <link
          rel="preload"
          href="/fonts/pretendard-var.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        {/* 사이트 전역 개체(Organization·WebSite·MobileApplication). 페이지 고유 타입은 각 page가 더한다. */}
        <JsonLd data={siteGraph()} />
      </head>
      <body>
        <a href="#main" className="skipLink">
          본문 바로가기
        </a>
        <Header />
        <main id="main">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
