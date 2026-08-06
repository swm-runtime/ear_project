import type { MetadataRoute } from "next";
import { site } from "@/content/site";

// 정적 내보내기에서 메타데이터 라우트를 빌드 시점에 파일로 굽는다.
export const dynamic = "force-static";


export default function manifest(): MetadataRoute.Manifest {
  return {
    name: site.title,
    short_name: site.name,
    description: site.shortDescription,
    lang: "ko",
    start_url: "/",
    display: "standalone",
    background_color: "#fbfaf7",
    theme_color: "#0c0f1a",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
