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
}: PageMetaInput): Metadata {
  const og = toOgImage(image);

  return {
    title,
    description,
    ...(keywords ? { keywords } : {}),
    alternates: { canonical: path },
    openGraph: {
      type: ogType,
      locale: site.locale,
      url: path,
      siteName: site.name,
      // OG 제목에는 브랜드명을 직접 붙인다. title.template은 <title>에만 적용된다.
      title: path === "/" ? title : `${title} | ${site.name}`,
      description,
      images: [og],
      ...(ogType === "article"
        ? { publishedTime, modifiedTime: modifiedTime ?? publishedTime }
        : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: path === "/" ? title : `${title} | ${site.name}`,
      description,
      images: [og],
    },
  };
}

/** `routes.ts`에 정의된 고정 페이지용. 대부분의 페이지가 이 한 줄로 끝난다. */
export function routeMetadata(key: RouteKey): Metadata {
  const r = routes[key];

  return buildMetadata({
    path: r.path,
    title: r.title,
    description: r.description,
    image: { url: r.ogImage, alt: `${r.title} — ${site.name}` },
  });
}
