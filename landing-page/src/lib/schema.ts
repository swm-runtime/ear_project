/**
 * 구조화 데이터(JSON-LD) 조립기.
 *
 * 검색 결과의 리치 스니펫과 지식 패널, 그리고 AI 검색이 읽는 값이다.
 * **화면에 없는 내용을 구조화 데이터에만 적으면 구글 정책 위반**이므로, 모든 값은
 * `content/` 아래의 같은 원본에서 가져온다.
 *
 * 사이트 전역 그래프(Organization·WebSite·MobileApplication)는 루트 레이아웃이
 * 모든 페이지에 심고, 페이지 고유의 타입(FAQPage·Blog·BlogPosting·BreadcrumbList)만
 * 각 페이지가 추가한다. @id를 절대 URL로 고정해 두었으므로 페이지가 달라도
 * 같은 개체를 가리킨다.
 */

import { allPosts, type Post } from "@/content/blog";
import { blocksToText } from "@/content/prose";
import { routes, postPath } from "@/content/routes";
import {
  androidStoreUrl,
  faqs,
  iosStoreUrl,
  plans,
  site,
  SITE_URL,
} from "@/content/site";

type Node = Record<string, unknown>;

const ORG_ID = `${SITE_URL}/#organization`;
const SITE_ID = `${SITE_URL}/#website`;
const APP_ID = `${SITE_URL}/#app`;

const abs = (path: string) => `${SITE_URL}${path}`;

/** JSON-LD 한 덩어리를 감싸는 공통 껍데기. */
export function graph(nodes: Node[]): Node {
  return { "@context": "https://schema.org", "@graph": nodes };
}

/* ---------- 사이트 전역 ---------- */

export function siteGraph(): Node {
  const organization: Node = {
    "@type": "Organization",
    "@id": ORG_ID,
    name: site.name,
    alternateName: site.nameEn,
    url: abs("/"),
    // `/icon.svg`는 없는 주소였다(404 — 2026-10-02 발견). 실제로 서빙되는 앱 아이콘(`app/icon.png`)을 가리킨다
    logo: abs("/icon.png"),
    sameAs: [iosStoreUrl, androidStoreUrl],
    description: site.shortDescription,
    email: site.contactEmail,
  };

  const website: Node = {
    "@type": "WebSite",
    "@id": SITE_ID,
    url: abs("/"),
    name: routes.home.title,
    description: routes.home.description,
    inLanguage: "ko-KR",
    publisher: { "@id": ORG_ID },
  };

  const application: Node = {
    "@type": "MobileApplication",
    "@id": APP_ID,
    name: site.name,
    applicationCategory: "EducationApplication",
    applicationSubCategory: "팟캐스트",
    operatingSystem: "iOS, Android",
    // 두 스토어의 앱 페이지 — 검색 결과에서 설치 경로로 쓰인다
    installUrl: [iosStoreUrl, androidStoreUrl],
    description: routes.home.description,
    inLanguage: "ko-KR",
    publisher: { "@id": ORG_ID },
    // 무료 요금제(라이트)만 적는다. 유료 요금제는 가격이 정해졌지만 앱 안의 결제가 아직 열리지 않았다 —
    // 살 수 없는 상품을 Offer로 내보내면 검색 결과에 "구매 가능"으로 읽힌다. 결제가 열리면 추가한다.
    offers: {
      "@type": "Offer",
      name: plans[0].name,
      price: "0",
      priceCurrency: "KRW",
      category: "free",
      url: abs(routes.pricing.path),
    },
  };

  return graph([organization, website, application]);
}

/* ---------- 페이지별 ---------- */

/** 홈을 제외한 모든 페이지에 붙인다. 검색 결과의 경로 표시가 URL 대신 이름으로 나온다. */
export function breadcrumb(trail: { name: string; path: string }[]): Node {
  return {
    "@type": "BreadcrumbList",
    itemListElement: [{ name: "홈", path: routes.home.path }, ...trail].map(
      (item, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: item.name,
        item: abs(item.path),
      })
    ),
  };
}

export function faqPage(): Node {
  return {
    "@type": "FAQPage",
    "@id": `${abs(routes.faq.path)}#faq`,
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}

export function blogIndex(): Node {
  return {
    "@type": "Blog",
    "@id": `${abs(routes.blog.path)}#blog`,
    url: abs(routes.blog.path),
    name: routes.blog.title,
    description: routes.blog.description,
    inLanguage: "ko-KR",
    publisher: { "@id": ORG_ID },
    blogPost: allPosts.map((p) => ({
      "@type": "BlogPosting",
      "@id": `${abs(postPath(p.slug))}#post`,
      headline: p.title,
      url: abs(postPath(p.slug)),
      datePublished: p.date,
    })),
  };
}

export function blogPosting(post: Post): Node {
  return {
    "@type": "BlogPosting",
    "@id": `${abs(postPath(post.slug))}#post`,
    mainEntityOfPage: abs(postPath(post.slug)),
    headline: post.title,
    description: post.description,
    inLanguage: "ko-KR",
    datePublished: post.date,
    dateModified: post.updated ?? post.date,
    articleSection: post.category,
    // 화면에 실제로 나가는 본문을 그대로 넣는다.
    articleBody: blocksToText(post.blocks),
    image: abs(routes.blog.ogImage),
    author: { "@id": ORG_ID },
    publisher: { "@id": ORG_ID },
    isPartOf: { "@id": `${abs(routes.blog.path)}#blog` },
  };
}
