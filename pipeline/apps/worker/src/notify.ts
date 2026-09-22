/**
 * 운영 알림 (2026-09-23, 자동화 도입) — 사람 손이 필요해진 지점을 Slack 으로 알린다.
 *
 * 자동화가 켜지면 후보 승인·초안·QA·비평·발행 준비까지 아무도 화면을 보지 않는다. 그래서 체인이 멈춘 곳
 * (QA 3회 실패 → review_required, 초안 실패, 발행 준비 연쇄 실패)과 사람 차례가 된 곳(패키지 완료 → 검수 대기)만
 * 알린다. 성공 단계마다 알리지 않는다 — 알림이 많아지면 아무도 읽지 않는다.
 *
 * 웹훅은 log-watch.ts 와 같은 `SLACK_ERROR_WEBHOOK_URL`(서버 env.prod 에만) — 없으면(노트북 워커) 조용히 건너뛴다.
 * 실패해도 작업 흐름에 영향을 주지 않는다 (전부 try/catch).
 */
import { log } from "./util.js";

const WEBHOOK_URL = process.env.SLACK_ERROR_WEBHOOK_URL || "";
const CONSOLE_URL = (process.env.PIPELINE_CONSOLE_URL || "https://admin.earcast.co.kr").replace(/\/$/, "");

export const consoleUrl = (path: string) => `${CONSOLE_URL}${path}`;

export async function notifyOps(text: string): Promise<void> {
  if (!WEBHOOK_URL) return;
  try {
    const res = await fetch(WEBHOOK_URL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) });
    if (!res.ok) log(`  알림 실패: Slack webhook ${res.status}`);
  } catch (e: any) {
    log(`  알림 실패: ${e?.message ?? e}`);
  }
}
