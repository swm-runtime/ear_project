import { Header } from "@/components/Header";
import { Hero } from "@/components/Hero";
import { Problem } from "@/components/Problem";
import { HowItWorks } from "@/components/HowItWorks";
import { Features } from "@/components/Features";
import { Topics } from "@/components/Topics";
import { Pricing } from "@/components/Pricing";
import { Faq } from "@/components/Faq";
import { FinalCta } from "@/components/FinalCta";
import { Footer } from "@/components/Footer";

/**
 * 랜딩페이지 한 장.
 *
 * 모든 섹션이 서버 컴포넌트다 — 'use client'가 한 곳도 없어서 브라우저로 나가는
 * 자바스크립트가 사실상 없고, 크롤러는 첫 응답에서 본문 전체를 받는다.
 * 아코디언은 <details>, 스크롤 이동은 CSS scroll-behavior로 처리한다.
 */
export default function Page() {
  return (
    <>
      <a href="#main" className="skipLink">
        본문 바로가기
      </a>
      <Header />
      <main id="main">
        <Hero />
        <Problem />
        <HowItWorks />
        <Features />
        <Topics />
        <Pricing />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </>
  );
}
