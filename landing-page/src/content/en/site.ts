/**
 * 영어 소개 페이지(`/en/`)의 문구(2026-10-15 — KAN-199).
 *
 * 한국어 `site.ts`의 번역이 아니다 — 글로벌 트랙은 **해외 이용자에게 K-컬처 콘텐츠를 영어로** 들려주는 별도 시장이라
 * (`docs/spec/api/global-api.md` 1·2장), 출퇴근 자기계발을 내세우는 한국어 카피를 그대로 옮기면 사실과 어긋난다.
 * 그래서 두 판본에 **공통으로 참인 것만** 적는다: AI가 만든 오디오, 관심 주제 기반의 매일 적립, 즉시 재생,
 * 이어듣기, 원문 대조·출처 고지, 합성 음성이라는 고지(이용약관 8조).
 *
 * 쓰지 않은 것: 편수·길이·가격·요금제 이름 — 글로벌 요금제와 편성 수치가 아직 확정되지 않았다(global-api.md 9장).
 * 확정되면 그때 넣는다.
 *
 * 영어 앱 이름 `Ear`는 **PM 확정 전 임시값**이다(KAN-198). 바뀌면 `enSite.name` 한 곳만 고친다.
 * 화면에 나가는 값이므로 **한국어 글자를 넣지 않는다**.
 */

import { site } from "../site";

export const enSite = {
  name: "Ear",
  shortDescription:
    "AI-generated audio episodes on Korean culture, delivered to your library every day.",
  locale: "en_US",
  contactEmail: site.contactEmail,
  privacyEmail: site.privacyEmail,
} as const;

export const enHome = {
  hero: {
    eyebrow: "AI podcast app",
    title: "Korean culture, in short audio episodes",
    lede: "Ear is an AI-generated podcast app. Pick the topics you like, and new episodes about Korean culture arrive in your library every day. Every episode is produced ahead of time, so it plays the moment you tap.",
  },
  features: {
    eyebrow: "Features",
    title: "Less searching, more listening",
    lede: "Ear takes care of finding something to listen to, so you can just press play.",
    items: [
      {
        icon: "drip",
        title: "New episodes every day",
        text: "Choose the topics you are interested in. Episodes that match them are added to your library each day.",
      },
      {
        icon: "bolt",
        title: "Plays instantly",
        text: "Every episode is produced in advance. There is no generating screen and no waiting.",
      },
      {
        icon: "resume",
        title: "Pick up where you left off",
        text: "Ear remembers where you stopped. It never starts playing on its own when you open the app.",
      },
      {
        icon: "compass",
        title: "Browse and save",
        text: "Find more in the Explore feed and save episodes to your library whenever you like.",
      },
      {
        icon: "shield",
        title: "Checked against the source",
        text: "Scripts are compared with their original sources before release. We do not add facts that are not in the source.",
      },
      {
        icon: "quote",
        title: "Sources credited",
        text: "Every episode names its original authors and sources, so you can read further.",
      },
    ],
  },
  /** 이용약관 8조(AI 생성 콘텐츠 고지)와 같은 내용을 소개 페이지에서도 먼저 밝힌다. */
  aiNote: {
    eyebrow: "About the content",
    title: "Made with AI, and we say so",
    paragraphs: [
      "Episodes on Ear are written with the help of AI and read by synthetic voices (text-to-speech). The voices are not real people.",
      "We check scripts against their sources before release, but AI-generated content can still contain mistakes. Episodes are for general interest and are not legal, medical, financial or other professional advice. If you spot an error, let us know.",
    ],
  },
  cta: {
    title: "Start with today's episode",
    lede: "Ear is available on the App Store and Google Play.",
  },
  nextTitle: "More information",
} as const;

/** 영어 레이아웃의 고정 문구. */
export const enChrome = {
  skipLink: "Skip to content",
  homeAria: `${enSite.name} home`,
  download: "Get the app",
  iphone: "iPhone",
  crumbsAria: "Breadcrumb",
  footerLegal: "Legal",
  /**
   * 언어 전환 링크 — 한국어 판본으로 가는 링크의 이름은 관례대로 그 언어로 적는다(`lang="ko"`로 표시).
   * `/en` 페이지에 들어가는 **유일한 한국어 글자**다(완료 조건 점검에서 예외로 둔다).
   */
  koreanLinkLabel: "한국어",
} as const;
