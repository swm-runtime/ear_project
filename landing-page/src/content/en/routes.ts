/**
 * 영어 페이지(`/en/`)의 목록과 페이지별 SEO 메타(2026-10-15 — KAN-199).
 *
 * 영어판은 **필수 4페이지만** 둔다 — 소개·약관·개인정보·계정 삭제. 글로벌 스토어 심사가 영어 지원 URL·개인정보 URL·
 * 계정 삭제 URL을 요구해서다. 랜딩 전면 영어화는 범위 밖이다(티켓 `docs/tickets/frontend/pending/landing-english-pages.md`).
 *
 * 한국어 `routes.ts`와 따로 두는 이유: 한국어 쪽은 내비·바닥글·사이트맵 묶음까지 거기서 나오는데, 영어 4페이지를
 * 거기 섞으면 한국어 바닥글에 영어 제목이 끼어든다. 대신 `koKey`로 짝을 걸어, `hreflang`(seo.ts)과 사이트맵이
 * 양쪽 판본을 같은 묶음으로 내보내게 한다.
 *
 * 화면에 나가는 값이므로 **한국어 글자를 넣지 않는다**(완료 조건 — `/en` 페이지의 한국어 리터럴 0건).
 */

import type { RouteKey } from "../routes";

export type EnRouteKey = "home" | "terms" | "privacy" | "accountDeletion";

export type EnRouteMeta = {
  /** 끝 슬래시를 포함한 절대 경로. */
  path: string;
  /** 같은 내용의 한국어 페이지. `hreflang`·사이트맵이 이 짝을 쓴다. */
  koKey: RouteKey;
  /** 바닥글·breadcrumb에 쓰는 이름. */
  label: string;
  /** `<title>`. 영어 레이아웃의 template이 뒤에 " | Earcast"를 붙인다(홈은 예외). */
  title: string;
  description: string;
  /** `scripts/og-pages.mjs`가 굽는 파일과 이름이 같아야 한다. */
  ogImage: string;
  priority: number;
  changeFrequency: "weekly" | "monthly" | "yearly";
  /** 내용이 마지막으로 바뀐 날(YYYY-MM-DD). 사이트맵 `lastmod`. */
  lastModified: string;
  /**
   * 검색 색인 여부. false면 noindex·nofollow를 내고 사이트맵에서 뺀다 — 약관·처리방침은 법무 검토 전 초안이라
   * 색인하지 않는다(PR #1584 결정). 검토가 끝나면 true로 바꾸는 것만으로 사이트맵에 들어간다.
   * `hreflang`은 색인 여부와 무관하게 양쪽 `<head>`에 둔다(언어 짝 표시는 유지).
   */
  indexable: boolean;
};

export const enRoutes: Record<EnRouteKey, EnRouteMeta> = {
  home: {
    path: "/en/",
    koKey: "home",
    label: "Home",
    title: "Earcast — AI-generated audio episodes on Korean culture",
    description:
      "Earcast is an AI-generated podcast app. Pick the topics you like, and short audio episodes about Korean culture arrive in your library every day, ready to play.",
    ogImage: "/og/en.png",
    priority: 0.8,
    changeFrequency: "monthly",
    lastModified: "2026-10-15",
    indexable: true,
  },
  terms: {
    path: "/en/terms/",
    koKey: "terms",
    label: "Terms of Use",
    title: "Terms of Use",
    // 제목·설명은 PR #1584의 영어 약관 페이지 문구 그대로다
    description:
      "The rules for using Earcast — eligibility, subscriptions and cancellation, AI-generated content, and how you may use our episodes.",
    ogImage: "/og/en-legal.png",
    priority: 0.3,
    changeFrequency: "yearly",
    lastModified: "2026-10-15",
    indexable: false,
  },
  privacy: {
    path: "/en/privacy/",
    koKey: "privacy",
    label: "Privacy Policy",
    title: "Privacy Policy",
    description:
      "What we collect, why, who receives it, how long we keep it, and the rights you have — written for users in the global market.",
    ogImage: "/og/en-legal.png",
    priority: 0.3,
    changeFrequency: "yearly",
    lastModified: "2026-10-15",
    indexable: false,
  },
  accountDeletion: {
    path: "/en/account-deletion/",
    koKey: "accountDeletion",
    label: "Account Deletion",
    title: "Delete Your Account",
    description:
      "How to delete your Earcast account, what is deleted, and what is kept for a limited time because the law requires it.",
    ogImage: "/og/en-legal.png",
    priority: 0.3,
    changeFrequency: "yearly",
    lastModified: "2026-10-15",
    indexable: true,
  },
};

export const enRouteList: EnRouteMeta[] = Object.values(enRoutes);

/** 한국어 라우트의 영어 짝. 없으면 undefined — 영어판이 없는 페이지에는 `hreflang`을 붙이지 않는다. */
export function enCounterpart(key: RouteKey): EnRouteMeta | undefined {
  return enRouteList.find((r) => r.koKey === key);
}
