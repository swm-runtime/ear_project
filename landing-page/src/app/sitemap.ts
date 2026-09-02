import type { MetadataRoute } from "next";
import { allPosts } from "@/content/blog";
import { postPath, routeList } from "@/content/routes";
import { SITE_URL } from "@/content/site";

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
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const pages: MetadataRoute.Sitemap = routeList.map((r) => ({
    url: `${SITE_URL}${r.path}`,
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  }));

  const posts: MetadataRoute.Sitemap = allPosts.map((post) => ({
    url: `${SITE_URL}${postPath(post.slug)}`,
    lastModified: post.updated ?? post.date,
    changeFrequency: "yearly",
    priority: 0.6,
  }));

  return [...pages, ...posts];
}
