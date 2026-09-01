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
