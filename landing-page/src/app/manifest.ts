import type { MetadataRoute } from "next";
import { routes } from "@/content/routes";
import { site } from "@/content/site";

// 정적 내보내기에서 메타데이터 라우트를 빌드 시점에 파일로 굽는다.
export const dynamic = "force-static";


export default function manifest(): MetadataRoute.Manifest {
  return {
    name: routes.home.title,
    short_name: site.name,
    description: site.shortDescription,
    lang: "ko",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    // 아이콘 실체는 app/icon.png(파비콘)과 app/apple-icon.png이고, 여기서는
    // PWA 설치용으로 같은 파일을 가리킨다. 모서리가 둥근 투명 PNG라 purpose는 any만 쓴다
    // (maskable로 선언하면 잘려 나간 모서리에 배경이 비친다).
    icons: [{ src: "/icon.png", sizes: "512x512", type: "image/png", purpose: "any" }],
  };
}
