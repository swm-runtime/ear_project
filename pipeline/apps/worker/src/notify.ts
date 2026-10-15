/**
 * 운영 알림 (2026-09-23, 자동화 도입) — Slack 웹훅 전송. 무엇을 언제 보낼지는 digest.ts 가 정한다
 * (큐가 다 비었을 때 한 번에 요약 — 편마다 보내지 않는다, 2026-09-23 박수헌).
 *
 * 웹훅은 log-watch.ts 와 같은 `SLACK_ERROR_WEBHOOK_URL`(서버 env.prod 에만) — 없으면(노트북 워커) 조용히 건너뛴다.
 * 실패해도 작업 흐름에 영향을 주지 않는다 (전부 try/catch).
 */
import { log } from "./util.js";
import { pipelineLocale } from "@ear/pipeline";

const WEBHOOK_URL = process.env.SLACK_ERROR_WEBHOOK_URL || "";
const CONSOLE_URL = (process.env.PIPELINE_CONSOLE_URL || "https://admin.earcast.co.kr").replace(/\/$/, "");

export const consoleUrl = (path: string) => `${CONSOLE_URL}${path}`;
export const hasWebhook = () => !!WEBHOOK_URL;

export async function notifyOps(text: string): Promise<void> {
  if (!WEBHOOK_URL) return;
  try {
    // 두 인스턴스가 같은 채널(#dev-ai)을 쓰므로 글로벌판 알림은 머리에 표시한다(글로벌 명세 8장)
    const body = pipelineLocale() === "en" ? `[GLOBAL] ${text}` : text;
    const res = await fetch(WEBHOOK_URL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: body }) });
    if (!res.ok) log(`  알림 실패: Slack webhook ${res.status}`);
  } catch (e: any) {
    log(`  알림 실패: ${e?.message ?? e}`);
  }
}
