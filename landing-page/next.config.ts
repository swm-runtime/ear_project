import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 정적 내보내기. `next build`가 out/ 에 순수 HTML/CSS/JS를 만든다.
  // 서버 없이 어디든 올릴 수 있고, 크롤러가 첫 응답에서 완성된 HTML을 받는다.
  // 문의 폼 등 서버 처리가 필요해지면 이 줄만 지우면 Route Handler를 쓸 수 있다.
  output: "export",

  // 정적 내보내기에서는 기본 이미지 최적화 서버가 없다.
  images: { unoptimized: true },

  // /about → /about/index.html. 정적 호스팅에서 경로 뒤 슬래시 처리를 일관되게 만든다.
  trailingSlash: true,

  // 응답 헤더로 서버 종류를 알리지 않는다.
  poweredByHeader: false,
};

export default nextConfig;
