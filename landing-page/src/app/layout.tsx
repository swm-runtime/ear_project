import type { Metadata, Viewport } from "next";
import { JsonLd } from "@/components/JsonLd";
import { site, SITE_URL } from "@/content/site";
import "./globals.css";

/**
 * 공유 미리보기 이미지. `scripts/og-image.mjs`가 빌드 전에 굽는다(package.json의 prebuild).
 * 확장자가 붙은 정적 파일이라 어느 호스팅에서도 Content-Type이 image/png로 나간다 —
 * 카카오톡·페이스북 크롤러가 썸네일을 만들려면 이게 맞아야 한다.
 */
const OG_IMAGE = {
  url: "/opengraph-image.png",
  width: 1200,
  height: 630,
  alt: "이어 — 출근길에 열면, 오늘 들을 게 준비되어 있어요",
  type: "image/png",
};

export const metadata: Metadata = {
  // canonical·OG·sitemap의 상대 경로가 절대 URL로 펼쳐지는 기준점.
  metadataBase: new URL(SITE_URL),
  title: {
    default: site.title,
    template: `%s | ${site.name}`,
  },
  description: site.description,
  keywords: [...site.keywords],
  applicationName: site.name,
  authors: [{ name: site.name }],
  creator: site.name,
  publisher: site.name,
  category: "education",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: site.locale,
    url: "/",
    siteName: site.name,
    title: site.title,
    description: site.shortDescription,
    images: [OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: site.title,
    description: site.shortDescription,
    images: [OG_IMAGE],
  },
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
        {/* 본문 글꼴을 CSS 파싱보다 먼저 받기 시작한다. LCP(히어로 제목)가 폰트를 기다리지 않게 하는 것이 목적이다. */}
        <link
          rel="preload"
          href="/fonts/pretendard-var.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <JsonLd />
      </head>
      <body>{children}</body>
    </html>
  );
}
