import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  agentRules: false, // 자동 생성 AGENTS.md/CLAUDE.md 끔 (저장소 지침은 spec/ 이 원본)
  /* config options here */
};

export default nextConfig;
