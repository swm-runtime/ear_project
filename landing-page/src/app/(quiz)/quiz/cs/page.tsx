import type { Metadata } from "next";
import { CsQuiz } from "./CsQuiz";
import { csQuiz } from "@/content/quiz-cs";
import { buildMetadata } from "@/lib/seo";

/**
 * CS 지식 테스트 — `https://earcast.co.kr/quiz/cs/` (2026-10-27 — KAN-281 홍보용 참여형 콘텐츠).
 *
 * 카카오톡·메신저로 링크를 주고받으며 푸는 퀴즈다. 10문제를 풀면 레벨이 나오고,
 * 「키워드로 빠르게 배우는 CS 지식」 시리즈 안내와 앱 받기 링크(`/app/?src=quiz_cs`)로 이어진다.
 *
 * 문제·결과 문구는 `content/quiz-cs.ts`, 화면과 공유는 `CsQuiz.tsx`. 공유 미리보기 이미지는
 * `scripts/og-pages.mjs`의 `quiz-cs.png`다.
 *
 * 사이트 헤더·바닥글 없이 퀴즈 전용 루트 레이아웃(`(quiz)/layout.tsx`)으로 그린다 — 시작부터 광고처럼 보이면
 * 풀기 전에 닫으므로, 앱 안내는 결과 화면 한 곳에만 둔다.
 *
 * `/app/`처럼 `routes.ts`에 넣지 않는다 — 내비·사이트맵에 나올 페이지가 아니고 색인 대상도 아니다.
 * 공유 미리보기(og:*)는 색인과 무관하게 나간다.
 */
export const metadata: Metadata = {
  ...buildMetadata({
    path: csQuiz.path,
    title: csQuiz.title,
    description: csQuiz.description,
    image: { url: "/og/quiz-cs.png", alt: "키워드 10문제로 보는 당신의 CS 지식 수준" },
  }),
  robots: { index: false, follow: true },
};

export default function CsQuizPage() {
  return <CsQuiz />;
}
