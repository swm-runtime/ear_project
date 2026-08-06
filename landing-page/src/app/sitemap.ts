import type { MetadataRoute } from "next";
import { SITE_URL } from "@/content/site";

// 정적 내보내기에서 메타데이터 라우트를 빌드 시점에 파일로 굽는다.
export const dynamic = "force-static";


/** 페이지가 늘어나면 여기에 추가한다. 정적 빌드 시 /sitemap.xml 로 떨어진다. */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${SITE_URL}/`,
      changeFrequency: "weekly",
      priority: 1,
    },
  ];
}
