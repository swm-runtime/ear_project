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

/**
 * 알림 끄기 (2026-10-30 박수헌 "테스트할 때 너무 자주 온다 — 나중에 다시 필요하면 말할게") — `settings."notify.muted"` = { muted: true, reason? }.
 * 끄면 요약·분당 한도·잔량 경고는 보내지 않고 로그에만 남긴다. critical(잔액·크레딧 소진으로 작업이 멈춤)은 끄지 않는다 — 놓치면 큐가 조용히 멈춘다.
 * 배포 없이 설정만으로 켜고 끈다. 1분 캐시
 */
let mutedCache: { at: number; muted: boolean } | null = null;
async function isMuted(): Promise<boolean> {
  if (mutedCache && Date.now() - mutedCache.at < 60_000) return mutedCache.muted;
  const { getSetting } = await import("./db.js"); // notify 는 db 보다 가벼운 모듈이라 늦게 읽는다
  const v = await getSetting<{ muted?: boolean }>("notify.muted").catch(() => null);
  mutedCache = { at: Date.now(), muted: !!v?.muted };
  return mutedCache.muted;
}

export async function notifyOps(text: string, opts: { critical?: boolean } = {}): Promise<void> {
  if (!WEBHOOK_URL) return;
  if (!opts.critical && (await isMuted().catch(() => false))) { log(`  알림 꺼짐(notify.muted) — 보내지 않음: ${text.split("\n")[0].slice(0, 80)}`); return; }
  try {
    // 두 인스턴스가 같은 채널(#dev-ai)을 쓰므로 글로벌판 알림은 머리에 표시한다(글로벌 명세 8장)
    const body = pipelineLocale() === "en" ? `[GLOBAL] ${text}` : text;
    const res = await fetch(WEBHOOK_URL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: body }) });
    if (!res.ok) log(`  알림 실패: Slack webhook ${res.status}`);
  } catch (e: any) {
    log(`  알림 실패: ${e?.message ?? e}`);
  }
}
