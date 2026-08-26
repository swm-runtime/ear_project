import type { MetadataRoute } from "next";
import { SITE_URL } from "@/content/site";

// 정적 내보내기에서 메타데이터 라우트를 빌드 시점에 파일로 굽는다.
export const dynamic = "force-static";


/**
 * 크롤러에 보여줄 것과 아닌 것.
 *
 * `/auth/`·`/api/`는 **사람이 읽을 페이지가 아니라 앱이 쓰는 경로**다. 애플 로그인 콜백은
 * `GET`에 200을 주므로(라우팅 확인용) 막지 않으면 검색 결과에 뜬다. 콘텐츠 공유 링크
 * 안내 페이지(`/contents/*`)도 같은 이유로 색인 대상이 아니다 — 페이지 자체의 noindex
 * 메타와 **이중으로** 막는다.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/auth/", "/api/", "/contents/"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
