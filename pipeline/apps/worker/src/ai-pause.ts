/**
 * AI 집기 멈춤 (2026-09-23 박수헌: "토큰 제한에 거부됐는데 계속 시도하면 안 된다").
 *
 * 실행기가 ApiLimit(util.ts)을 던지면 워커 루프가 작업을 큐로 되돌리고 여기에 멈춤을 건다. 멈춘 동안 claim_job 을 AI 불가로 불러
 * requires_ai 작업은 집지 않는다 — TTS·패키지 같은 io 작업은 계속 돈다.
 *   rate  — 이 프로세스 메모리에 retryAfterMs(기본 5분) 동안. 지나면 자동 재개
 *   quota — DB `settings."automation.ai_paused"` = { paused: true, reason, at } 에 기록. 콘솔 설정의 [AI 작업 재개]가 지우기 전까지 모든 워커가 멈춘다
 * Slack 알림은 멈추는 순간 한 번(quota) · rate 는 1시간에 한 번까지 — 요약(digest.ts)과 별개로 즉시 보낸다.
 */
import { getSetting, pool } from "./db.js";
import { cfg } from "./config.js";
import { readAutomation } from "./automation.js";
import { consoleUrl, notifyOps } from "./notify.js";
import { ApiLimit, log } from "./util.js";

let rateUntil = 0;
let lastRateAlert = 0;
let dbCache: { at: number; paused: boolean; reason?: string } | null = null;

/** DB 멈춤 상태 (30초 캐시) */
async function dbPaused(): Promise<{ paused: boolean; reason?: string }> {
  if (dbCache && Date.now() - dbCache.at < 30_000) return dbCache;
  const v = (await getSetting<{ paused?: boolean; reason?: string }>("automation.ai_paused").catch(() => null)) ?? {};
  dbCache = { at: Date.now(), paused: !!v.paused, reason: v.reason };
  return dbCache;
}

/** 서버 AI 집기 스위치가 꺼졌는가 — API 실행기 워커에만 해당. 꺼지면 AI 작업과 스윕(io)을 집지 않는다 (스윕·군집화는 노트북 Claude, 2026-09-26) */
export async function serverClaimOff(): Promise<boolean> {
  return cfg.executor === "openai" && (await readAutomation()).server_ai_claim === false;
}
/** AI 작업을 집어도 되는가 — 루프가 매번 부른다 */
export async function aiPaused(): Promise<string | null> {
  // 설정 스위치 (2026-09-26): 서버(API 실행기) 워커의 AI 집기를 사람이 끈 상태 — 군집화·초안은 노트북 Claude 가 집는다. 한도 멈춤과 달리 알림 없음
  if (await serverClaimOff()) return "설정에서 서버 워커 AI 집기 꺼짐 — 스윕도 건너뛰고 발행 준비(io)만";
  if (Date.now() < rateUntil) return `분당 한도 — ${Math.ceil((rateUntil - Date.now()) / 1000)}초 뒤 재개`;
  const d = await dbPaused();
  if (d.paused) return `잔액·예산 소진 — 콘솔 설정에서 [AI 작업 재개] 전까지 멈춤${d.reason ? ` (${d.reason.slice(0, 80)})` : ""}`;
  return null;
}

/** 한도에 걸렸을 때 — 되돌린 작업 정보와 함께 멈춤을 걸고 알린다 */
export async function pauseForLimit(e: ApiLimit, job: { type: string; id: string }): Promise<void> {
  if (e.kind === "rate") {
    rateUntil = Date.now() + e.retryAfterMs;
    log(`⏸ AI 집기 멈춤 ${Math.round(e.retryAfterMs / 60_000)}분 (분당 한도) — ${job.type} ${job.id.slice(0, 8)} 은 큐로: ${e.message}`);
    if (Date.now() - lastRateAlert > 60 * 60_000) {
      lastRateAlert = Date.now();
      await notifyOps(`:hourglass: *OpenAI 분당 한도* — AI 작업 ${Math.round(e.retryAfterMs / 60_000)}분 멈춤 뒤 자동 재개 (되돌린 작업: ${job.type})\n${e.message.slice(0, 200)}`);
    }
    return;
  }
  const reason = e.message.slice(0, 300);
  // 이미 멈춰 있으면(다른 워커가 먼저) 알리지 않는다 — upsert 의 where 로 한 번만
  const r = await pool.query(
    `insert into public.settings (key, value) values ('automation.ai_paused', jsonb_build_object('paused', true, 'reason', $1::text, 'at', now(), 'job', $2::text))
     on conflict (key) do update set value = excluded.value where coalesce((public.settings.value->>'paused')::boolean, false) = false
     returning key`, [reason, job.type]);
  dbCache = { at: Date.now(), paused: true, reason };
  log(`⏸ AI 집기 멈춤 (잔액·예산 소진) — 콘솔 설정에서 재개할 때까지. ${job.type} ${job.id.slice(0, 8)} 은 큐로: ${reason}`);
  if (r.rowCount) await notifyOps(`:octagonal_sign: *OpenAI 잔액·예산 소진 — AI 작업 멈춤* (되돌린 작업: ${job.type}, 큐는 그대로)\n${reason}\n충전·예산 조정 뒤 설정 화면에서 [AI 작업 재개]: ${consoleUrl("/settings")}`);
}
