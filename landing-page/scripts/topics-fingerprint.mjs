/**
 * 랜딩이 빌드 때 HTML에 굽는 데이터(`GET /public/topics`)의 지문 — 빌드(`build-meta.mjs`)와 빌드 건너뛰기 판정
 * (`should-build.mjs`)이 **같은 함수**로 만들어야 비교가 맞는다. 의존성 없이 Node 내장만 쓴다(건너뛰기 판정은
 * `npm install` 전에 돈다). 정규화는 `src/content/public-topics.ts`의 parseGroups 와 같은 규칙이다.
 */
import { createHash } from "node:crypto";

export const DEFAULT_API_BASE_URL = "https://api-dev.earcast.co.kr/api/v1";

/** 실패하면 null — 호출부가 정한다(빌드는 기본 목록으로 진행, 판정은 건너뜀) */
export async function topicsFingerprint(baseUrl = process.env.LANDING_API_BASE_URL ?? DEFAULT_API_BASE_URL) {
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/public/topics`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return null;
    const body = await response.json();
    const groups = (body.groups ?? [])
      .map((g) => ({
        name: typeof g.name === "string" ? g.name : "",
        topics: (g.topics ?? []).map((t) => t.name).filter((n) => typeof n === "string" && n.length > 0),
      }))
      .filter((g) => g.name && g.topics.length > 0);
    return createHash("sha256").update(JSON.stringify(groups)).digest("hex").slice(0, 16);
  } catch {
    return null;
  }
}
