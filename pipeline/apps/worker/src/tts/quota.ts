/**
 * ElevenLabs 잔량 모니터링 (KAN-204, 2026-10-25) — 계정 하나를 한국판·글로벌판 두 인스턴스가 함께 쓴다(한도 합산).
 * 2026-10-23 크레딧이 바닥나 글로벌 TTS 가 멈춘 뒤에야 알았다 — ai-pause.ts 의 차단기는 소진 "뒤"에 작동한다. 소진 전에 알리는 것이 이 모듈이다.
 *
 * - 워커가 `GET /v1/user/subscription`(과금 없음)을 큐가 비었을 때 30분에 한 번 · TTS 작업을 끝낼 때마다 읽어 `settings."tts.quota"` 에 적는다.
 *   콘솔 설정 화면이 이 값을 보여 준다(잔량·한도·리셋일·남은 편수 추정). DB 가 인스턴스마다 따로라 각자 적지만 값은 같은 계정이다.
 * - 잔량이 한도의 20% · 5% 아래로 내려가면 Slack 에 한 번씩 알린다(리셋 주기가 바뀌면 다시). 두 인스턴스가 각각 보내므로 최대 두 번 — 글로벌판은 머리의 [GLOBAL] 로 구분된다.
 * - 남은 편수 추정은 이 인스턴스의 최근 30일 tts runs 편당 평균 차감(응답 헤더 character-cost 합)으로 나눈 참고값이다. 다른 인스턴스의 소비는 셈에 없다.
 * 실패해도 작업 흐름에 영향을 주지 않는다(전부 try/catch, 로그만).
 */
import { cfg } from "../config.js";
import { getSetting, pool } from "../db.js";
import { notifyOps } from "../notify.js";
import { log } from "../util.js";
import { holdLease } from "../lease.js";

const BASE = "https://api.elevenlabs.io/v1";
export const CHECK_EVERY_MS = 30 * 60_000;
/** 알림 문턱 — 잔량/한도 비율. 큰 것부터 */
export const ALERT_RATIOS = [0.2, 0.05] as const;

export interface SubscriptionSnapshot {
  character_count: number;
  character_limit: number;
  remaining: number;
  /** 잔량/한도 (0~1) */
  ratio: number;
  /** 다음 리셋 시각 ISO — 응답에 없으면 null */
  reset_at: string | null;
  tier: string | null;
  status: string | null;
}

/** `GET /v1/user/subscription` 응답에서 쓰는 값만 — 형식이 다르면 null */
export function parseSubscription(json: unknown): SubscriptionSnapshot | null {
  const j = (json ?? {}) as Record<string, unknown>;
  const count = Number(j.character_count);
  const limit = Number(j.character_limit);
  if (!Number.isFinite(count) || !Number.isFinite(limit) || limit <= 0) return null;
  const remaining = Math.max(0, limit - count);
  const reset = Number(j.next_character_count_reset_unix);
  return {
    character_count: count,
    character_limit: limit,
    remaining,
    ratio: remaining / limit,
    reset_at: Number.isFinite(reset) && reset > 0 ? new Date(reset * 1000).toISOString() : null,
    tier: typeof j.tier === "string" ? j.tier : null,
    status: typeof j.status === "string" ? j.status : null,
  };
}

/** 이번에 새로 알릴 문턱 — 지난 알림(`alerted[문턱] = 그때의 리셋 시각`)이 같은 주기면 건너뛴다. 리셋 시각을 모르면 한 번만 */
export function dueAlerts(snap: { ratio: number; reset_at: string | null }, alerted: Record<string, string | null | undefined> | null | undefined): number[] {
  const period = snap.reset_at ?? "unknown";
  return ALERT_RATIOS.filter((r) => snap.ratio <= r && (alerted?.[String(r)] ?? null) !== period);
}

/** 이 인스턴스의 편당 평균 차감(최근 30일, 계측된 tts runs) — 없으면 null */
async function avgCreditsPerEpisode(): Promise<number | null> {
  const r = await pool.query(
    `select round(avg((tokens->>'credits')::numeric))::int avg from public.runs
      where phase = 'tts' and tokens->>'credits' is not null and executed_at > now() - interval '30 days'`);
  const n = r.rows[0]?.avg;
  return typeof n === "number" && n > 0 ? n : null;
}

let lastCheck = 0;

/** 잔량을 읽어 settings 에 적고 문턱을 넘었으면 알린다. force 가 아니면 30분에 한 번 */
export async function maybeCheckTtsQuota(opts: { force?: boolean } = {}): Promise<SubscriptionSnapshot | null> {
  if (!cfg.elevenLabsKey) return null;
  if (!opts.force && Date.now() - lastCheck < CHECK_EVERY_MS) return null;
  lastCheck = Date.now();
  // 복제 중 하나만 (lease.ts, 2026-10-30) — 복제가 동시에 뜨면(배포 직후) 같은 문턱 알림이 겹쳐 간다. force(콘솔 다시 보기)는 그대로
  if (!opts.force && !(await holdLease("tts-quota", CHECK_EVERY_MS * 2))) return null;
  try {
    const res = await fetch(`${BASE}/user/subscription`, { headers: { "xi-api-key": cfg.elevenLabsKey }, signal: AbortSignal.timeout(15_000) });
    if (!res.ok) { log(`ElevenLabs 잔량 조회 실패 (계속 진행): HTTP ${res.status}`); return null; }
    const snap = parseSubscription(await res.json());
    if (!snap) { log("ElevenLabs 잔량 조회: 응답 형식을 읽지 못함 (계속 진행)"); return null; }

    const prev = (await getSetting<{ alerted?: Record<string, string> }>("tts.quota").catch(() => null)) ?? {};
    const avg = await avgCreditsPerEpisode().catch(() => null);
    const due = dueAlerts(snap, prev.alerted);
    const alerted = { ...(prev.alerted ?? {}) };
    for (const r of due) alerted[String(r)] = snap.reset_at ?? "unknown";
    const value = { ...snap, checked_at: new Date().toISOString(), avg_credits: avg, episodes_left: avg ? Math.floor(snap.remaining / avg) : null, alerted };
    await pool.query(
      `insert into public.settings (key, value) values ('tts.quota', $1::jsonb) on conflict (key) do update set value = excluded.value`,
      [JSON.stringify(value)]);

    if (due.length) {
      const low = Math.min(...due);
      const pct = Math.round(snap.ratio * 100);
      const reset = snap.reset_at ? snap.reset_at.slice(0, 10) : "?";
      const left = value.episodes_left != null ? ` · 이 인스턴스 평균(${avg!.toLocaleString()}크레딧/편)으로 약 ${value.episodes_left}편` : "";
      log(`⚠ ElevenLabs 잔량 ${pct}% (${snap.remaining.toLocaleString()}/${snap.character_limit.toLocaleString()}) — ${Math.round(low * 100)}% 문턱 알림`);
      await notifyOps(
        `${low <= 0.05 ? ":octagonal_sign:" : ":warning:"} *ElevenLabs 크레딧 잔량 ${pct}%* — ${snap.remaining.toLocaleString()} / ${snap.character_limit.toLocaleString()} 크레딧${left} · 리셋 ${reset}\n` +
        `계정은 한국판·글로벌판 공용이라 두 쪽 TTS 가 함께 줄어듭니다. 바닥나면 TTS 가 멈추고 [TTS 재개]가 필요합니다 — 충전·플랜은 ElevenLabs 콘솔(https://elevenlabs.io/app/subscription)에서.`);
    }
    return snap;
  } catch (e: any) {
    log(`ElevenLabs 잔량 조회 오류 (계속 진행): ${e?.message ?? e}`);
    return null;
  }
}
