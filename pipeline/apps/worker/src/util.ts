import fs from "node:fs/promises";

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function log(msg: string, ...rest: unknown[]) {
  const ts = new Date().toISOString().replace("T", " ").slice(0, 19);
  console.log(`[${ts}] ${msg}`, ...rest);
}

export async function exists(p: string): Promise<boolean> {
  try { await fs.access(p); return true; } catch { return false; }
}

export function hostOf(url: string): string {
  try { return new URL(url).hostname; } catch { return ""; }
}

export function stripHtml(s: string | undefined | null, max = 300): string {
  if (!s) return "";
  const t = String(s)
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
  return t.slice(0, max);
}

/** 지금은 못 하지만 실패는 아닌 상황 — 작업을 큐로 되돌리고 잠시 후 다시 집는다 */
export class RetryLater extends Error {
  constructor(msg: string, public delayMs = 60_000) { super(msg); this.name = "RetryLater"; }
}
/**
 * API 한도 (2026-09-23 차단기): 실행기가 429 를 두 종류로 구분해 던진다 — 워커 루프가 작업을 큐로 되돌리고 AI 집기를 멈춘다 (ai-pause.ts).
 *   rate  — 분당 토큰·요청 한도. 잠시 뒤 풀린다 → 5분 멈춤 뒤 자동 재개
 *   quota — 잔액·예산 소진(insufficient_quota, budget). 사람이 충전·조정하기 전엔 안 풀린다 → 콘솔에서 재개할 때까지 멈춤
 * 작업 실패로 처리하지 않는다 — 실패시키면 초안은 에피소드를 지우고 후보를 되돌려 백로그가 망가진다.
 */
export class ApiLimit extends Error {
  /** provider (2026-09-26): openai 는 AI 집기를, elevenlabs 는 TTS 집기를 멈춘다 — 둘은 독립이라 한쪽 한도로 다른 쪽을 세우지 않는다 */
  constructor(public kind: "rate" | "quota", msg: string, public retryAfterMs = 5 * 60_000, public provider: "openai" | "elevenlabs" = "openai") { super(msg); this.name = "ApiLimit"; }
}
