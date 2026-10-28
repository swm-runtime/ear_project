/**
 * 페이지 메타데이터를 만드는 헬퍼.
 *
 * 페이지마다 Metadata 객체를 손으로 쓰면 canonical을 빠뜨리거나 OG 제목만 옛날 값으로
 * 남는 실수가 반드시 생긴다. 페이지는 "어느 라우트인가"만 말하고 나머지는 여기서 만든다.
 *
 * canonical은 **끝 슬래시까지 포함해** `routes.ts`의 경로를 그대로 쓴다.
 * `trailingSlash: true`로 내보내는 실제 주소와 한 글자라도 다르면 색인이 갈라진다.
 */

import type { Metadata } from "next";
import { enCounterpart, enRoutes, type EnRouteKey } from "@/content/en/routes";
import { enSite } from "@/content/en/site";
import { routes, type RouteKey } from "@/content/routes";
import { site } from "@/content/site";

type OgImageInput = { url: string; alt: string };

function toOgImage({ url, alt }: OgImageInput) {
  return { url, width: 1200, height: 630, alt, type: "image/png" };
}

type PageMetaInput = {
  /** 끝 슬래시를 포함한 경로. canonical과 og:url이 된다. */
  path: string;
  title: string;
  description: string;
  image: OgImageInput;
  /** 글 상세처럼 웹페이지가 아닌 유형일 때만 바꾼다. */
  ogType?: "website" | "article";
  /** 발행·수정 시각. article일 때만 의미가 있다. */
  publishedTime?: string;
  modifiedTime?: string;
  keywords?: string[];
  /** OG의 사이트 이름·로캘. 영어 페이지만 바꾼다(기본은 한국어 `site`). */
  siteName?: string;
  locale?: string;
  /**
   * 같은 내용의 다른 언어 판본(`hreflang`). 키는 언어 코드와 `x-default`, 값은 끝 슬래시까지 포함한 경로.
   * 한쪽에만 적으면 검색엔진이 무시하므로 **양쪽 페이지에 같은 묶음**을 넣는다 — `languageAlternates()`가 만든다.
   */
  languages?: Record<string, string>;
  /**
   * 제목 뒤에 `| 이어`를 붙이지 않는다 — `<title>`·OG·트위터 제목 모두(2026-10-28 — KAN-281).
   * 링크를 주고받는 퀴즈처럼, 공유 카드 제목에 브랜드가 붙으면 광고로 읽히는 페이지에만 쓴다.
   */
  bareTitle?: boolean;
};

export function buildMetadata({
  path,
  title,
  description,
  image,
  ogType = "website",
  publishedTime,
  modifiedTime,
  keywords,
  siteName = site.name,
  locale = site.locale,
  languages,
  bareTitle = false,
}: PageMetaInput): Metadata {
  const og = toOgImage(image);
  // 홈(한국어 `/`, 영어 `/en/`)은 제목에 브랜드가 이미 들어 있어 OG 제목에 다시 붙이지 않는다.
  const isHome = path === "/" || path === "/en/";
  const ogTitle = isHome || bareTitle ? title : `${title} | ${siteName}`;

  return {
    // `absolute`는 레이아웃의 `title.template`(`%s | 이어`)을 건너뛴다.
    title: bareTitle ? { absolute: title } : title,
    description,
    ...(keywords ? { keywords } : {}),
    alternates: { canonical: path, ...(languages ? { languages } : {}) },
    openGraph: {
      type: ogType,
      locale,
      url: path,
      siteName,
      // OG 제목에는 브랜드명을 직접 붙인다. title.template은 <title>에만 적용된다.
      title: ogTitle,
      description,
      images: [og],
      ...(ogType === "article"
        ? { publishedTime, modifiedTime: modifiedTime ?? publishedTime }
        : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: ogTitle,
      description,
      images: [og],
    },
  };
}

/**
 * 한국어·영어 판본이 함께 있는 페이지의 `hreflang` 묶음(2026-10-15 — KAN-199).
 * 두 판본이 **같은 묶음**을 내보내야 양방향으로 인정된다. 언어를 고르지 못한 방문자(`x-default`)는 한국어로 보낸다.
 */
export function languageAlternates(koPath: string, enPath: string): Record<string, string> {
  return { ko: koPath, en: enPath, "x-default": koPath };
}

/** `routes.ts`에 정의된 고정 페이지용. 대부분의 페이지가 이 한 줄로 끝난다. */
export function routeMetadata(key: RouteKey): Metadata {
  const r = routes[key];
  const en = enCounterpart(key);

  return buildMetadata({
    path: r.path,
    title: r.title,
    description: r.description,
    image: { url: r.ogImage, alt: `${r.title} — ${site.name}` },
    ...(en ? { languages: languageAlternates(r.path, en.path) } : {}),
  });
}

/** 영어 페이지(`/en/`)용. 사이트 이름·로캘을 영어로 바꾸고, 한국어 짝과 같은 `hreflang` 묶음을 붙인다. */
export function enRouteMetadata(key: EnRouteKey): Metadata {
  const r = enRoutes[key];

  const meta = buildMetadata({
    path: r.path,
    title: r.title,
    description: r.description,
    image: { url: r.ogImage, alt: `${r.title} — ${enSite.name}` },
    siteName: enSite.name,
    locale: enSite.locale,
    languages: languageAlternates(routes[r.koKey].path, r.path),
  });

  // 법무 검토 전 초안(약관·처리방침)은 색인하지 않는다 — 링크도 따라가지 않게 PR #1584 값 그대로 둔다
  return r.indexable ? meta : { ...meta, robots: { index: false, follow: false } };
}
