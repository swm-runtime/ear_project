import type { MetadataRoute } from "next";
import { allPosts } from "@/content/blog";
import { enCounterpart, enRouteList } from "@/content/en/routes";
import { postPath, routes, type RouteKey } from "@/content/routes";
import { SITE_URL } from "@/content/site";
import { languageAlternates } from "@/lib/seo";

// 정적 내보내기에서 메타데이터 라우트를 빌드 시점에 파일로 굽는다.
export const dynamic = "force-static";

/**
 * 사이트맵.
 *
 * 페이지 목록을 여기에 다시 적지 않는다 — `routes.ts`와 블로그 글 목록에서 만든다.
 * 페이지를 추가하고 사이트맵에 넣는 걸 잊는 실수를 구조적으로 막기 위한 것이다.
 *
 * URL은 canonical과 **완전히 같은 문자열**이어야 한다. 끝 슬래시가 하나 다르면
 * 크롤러는 사이트맵이 가리키는 주소와 canonical이 가리키는 주소를 다르게 본다.
 *
 * 영어판이 있는 페이지(소개·약관·개인정보·계정 삭제 — KAN-199)는 두 판본 모두 같은 `hreflang` 묶음을 단다.
 * 페이지 `<head>`의 alternates(seo.ts)와 같은 함수로 만들어 둘이 어긋나지 않게 한다.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  /** 경로 묶음을 절대 URL로 펼친다 — 사이트맵의 hreflang은 절대 주소여야 한다. */
  const absolute = (languages: Record<string, string>) =>
    Object.fromEntries(Object.entries(languages).map(([lang, path]) => [lang, `${SITE_URL}${path}`]));

  const pages: MetadataRoute.Sitemap = (Object.keys(routes) as RouteKey[]).map((key) => {
    const r = routes[key];
    // 색인하지 않는 영어 짝(법무 검토 전 약관·처리방침)은 사이트맵 hreflang에서도 뺀다 — noindex 주소를 사이트맵에 알리지 않는다
    const en = enCounterpart(key);
    const enIndexed = en?.indexable ? en : undefined;
    return {
      url: `${SITE_URL}${r.path}`,
      lastModified: r.lastModified,
      changeFrequency: r.changeFrequency,
      priority: r.priority,
      ...(enIndexed ? { alternates: { languages: absolute(languageAlternates(r.path, enIndexed.path)) } } : {}),
    };
  });

  const enPages: MetadataRoute.Sitemap = enRouteList.filter((r) => r.indexable).map((r) => ({
    url: `${SITE_URL}${r.path}`,
    lastModified: r.lastModified,
    changeFrequency: r.changeFrequency,
    priority: r.priority,
    alternates: { languages: absolute(languageAlternates(routes[r.koKey].path, r.path)) },
  }));

  const posts: MetadataRoute.Sitemap = allPosts.map((post) => ({
    url: `${SITE_URL}${postPath(post.slug)}`,
    lastModified: post.updated ?? post.date,
    changeFrequency: "yearly",
    priority: 0.6,
  }));

  return [...pages, ...enPages, ...posts];
}
