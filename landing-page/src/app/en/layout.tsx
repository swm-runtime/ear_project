import type { Metadata, Viewport } from "next";
import { Analytics as VercelAnalytics } from "@vercel/analytics/next";
import { Analytics } from "@/components/Analytics";
import { EnHeader } from "@/components/EnHeader";
import { ScrollReveal } from "@/components/ScrollReveal";
import { enRoutes } from "@/content/en/routes";
import { enChrome, enSite } from "@/content/en/site";
import { SITE_URL } from "@/content/site";
import "../globals.css";

/**
 * 영어 페이지(`/en/`)의 루트 레이아웃(2026-10-15 — KAN-199).
 *
 * 한국어 루트 레이아웃(`(ko)/layout.tsx`)과 따로 둔 이유는 `<html lang="en">`과 영어 헤더 때문이다 — 그쪽 주석 참고.
 * 이 레이아웃 아래에는 **한국어 글자가 나가면 안 된다**(완료 조건). 그래서 한국어 레이아웃이 심는 전역 JSON-LD
 * (이름·설명이 한국어)는 넣지 않았다.
 *
 * 바닥글은 여기가 아니라 각 페이지가 그린다 — 언어 전환 링크가 "지금 페이지의 한국어 짝"을 가리켜야 하는데,
 * 레이아웃은 지금 어느 페이지인지 모른다. 같은 이유로 `<main>`도 페이지가 연다.
 */
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: enRoutes.home.title,
    template: `%s | ${enSite.name}`,
  },
  description: enRoutes.home.description,
  applicationName: enSite.name,
  authors: [{ name: enSite.name }],
  creator: enSite.name,
  publisher: enSite.name,
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
  formatDetection: { telephone: false, address: false, email: false },
  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // 한국어 레이아웃과 같은 값(globals.css의 --paper)
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#ffffff" },
  ],
  colorScheme: "light",
};

export default function EnRootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
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
          {enChrome.skipLink}
        </a>
        <EnHeader />
        {children}
        <ScrollReveal />
        <Analytics />
        <VercelAnalytics />
      </body>
    </html>
  );
}
