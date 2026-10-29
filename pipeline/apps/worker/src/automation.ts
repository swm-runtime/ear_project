/**
 * 자동화 (2026-09-23 박수헌 결정, spec/03 6.1 2단계 진입 · spec/07 1장 개정):
 *   군집화까지는 사람+Claude, **그 뒤 후보 승인 → 초안 → QA → 비평 → TTS → 썸네일 → 패키지까지 자동**,
 *   추천 메타(enrich)·검수·발행은 사람.
 *
 * 스위치는 DB `settings.automation` — 콘솔 설정 화면에서 끄고 켠다 (워커 재시작 없음).
 *   { auto_approve: boolean, auto_publish_prep: boolean, rule: "v1", server_ai_claim: boolean }
 *   server_ai_claim (2026-09-26 박수헌): false 면 API 실행기(openai) 워커는 AI 작업을 집지 않는다 — 서버는 발행 준비(io)만. 행에 없으면 true. 2026-10-16 KAN-222 부터 운영은 서버 워커만이라 끄면 노트북 워커 없이는 AI 작업이 멈춘다
 *
 * 자동 승인 규칙 v1 (`approved_by = "auto:v1"`):
 *   - 군집화 v2 후보 (`cluster_version = 'v2'`)
 *   - 빈 역할 없음 (`gaps` 비어 있음)
 *   - 소스 겹침 경고 없음 (`dedup_note` 에 "소스 겹침" 없음)
 *   조건 밖 후보는 `proposed` 로 남아 사람이 본다. 하루 상한은 두지 않는다 — API 쪽 hard limit 이 상한이다 (2026-09-23 결정).
 *
 * 발행 준비 자동 연쇄: 비평이 끝나면 `tts → thumbnail → package` 를 건다 (사람이 [발행 준비]를 누른 것과 같은 경로, chain.ts).
 *   글로벌판(2026-10-22)은 같은 스위치로, 비평이 아니라 **에이전트 판정이 발행 가능·필수 수정 전부 반영된 시점**에 건다(명세 6.10 — 패키지 관문과 같은 규칙). 자동 승인도 같은 규칙 v1 로 글로벌에서 켤 수 있다.
 * 패키지는 enrich 를 자동으로 걸지 않는다 — 발행하지 않을 편까지 메타를 뽑는 낭비를 막기 위해 업로드 화면의 [추천 메타 뽑기]로 사람이 건다.
 * 알림은 편마다가 아니라 큐가 다 비었을 때 한 번 (digest.ts). API 한도(429)는 ai-pause.ts 가 집기를 멈춘다.
 */
import { approveBacklogAuto, enqueue, getSetting, hasActiveDraftJob, seriesPrevReady, hasActiveJob, insertRun, listProposedForAutoApprove } from "./db.js";
import { agentGateBlockers } from "./stages/agent-gate.js";
import { executedBy } from "./config.js";
import { workerRev } from "./assets.js";
import { log } from "./util.js";
import { pipelineLocale } from "@ear/pipeline";

export interface AutomationSetting { auto_approve?: boolean; auto_publish_prep?: boolean; rule?: string; server_ai_claim?: boolean; judge_threshold?: number; /** 짧은 판 비평 관문(KAN-296) — 짧은 판 루브릭 합계가 이 값 미만이면 발행 준비를 걸지 않는다. 없으면 기록만(루브릭 보정 중, 2026-10-30) */ short_threshold?: number } // judge_threshold: 글로벌 판정 루프의 발행 기준(편집자 GPT 3회 중앙값, 기본 60 — 2026-10-23 박수헌, 종전 65)
export const AUTO_RULE = "v1";

let cached: { at: number; value: AutomationSetting } | null = null;
/** settings.automation — 30초 캐시 (루프마다 읽지 않게). 행이 없으면 전부 off */
export async function readAutomation(): Promise<AutomationSetting> {
  if (cached && Date.now() - cached.at < 30_000) return cached.value;
  const v = (await getSetting<AutomationSetting>("automation").catch(() => null)) ?? {};
  cached = { at: Date.now(), value: v };
  return v;
}

export interface AutoApproveRow { id: string; cluster_version: string | null; gaps: string[] | null; dedup_note: string | null; series_id?: string | null }

/** 자동 승인 규칙 v1 — 순수 함수 (테스트 대상). 이유를 돌려주면 승인 불가 */
export function autoApproveBlocker(row: AutoApproveRow): string | null {
  if (row.cluster_version !== "v2") return `군집화 ${row.cluster_version ?? "버전 없음"} (v2 만 자동)`;
  if ((row.gaps ?? []).length > 0) return `빈 역할 ${row.gaps!.length}개`;
  if (/소스 겹침/.test(row.dedup_note ?? "")) return "소스 겹침 경고";
  if (/⚠️ 초안 실패|🗑/.test(row.dedup_note ?? "")) return "초안 실패·삭제 후 복귀 (사람이 다시 승인)";
  return null;
}

/** proposed 후보 중 규칙을 통과한 것을 승인하고 draft 작업을 건다. 루프마다 호출 — 승인할 것이 없으면 쿼리 1번 */
export async function autoApprove(): Promise<number> {
  // 글로벌판도 같은 스위치·규칙 v1 로 승인한다 (2026-10-22 박수헌 "국내판과 같은 수준으로" — 글로벌 명세 5장 원칙 6·6.3 개정). 보류(held)·조건 밖 후보는 그대로 사람이 본다
  const s = await readAutomation();
  if (!s.auto_approve) return 0;
  let n = 0;
  for (const row of await listProposedForAutoApprove()) {
    if (autoApproveBlocker(row)) continue;
    const by = `auto:${AUTO_RULE}`;
    if (!(await approveBacklogAuto(row.id, by))) continue; // 그 사이 사람이 손댔으면 건너뜀
    if (!(await hasActiveDraftJob(row.id)) && (await seriesPrevReady(row.id))) await enqueue({ type: "draft", requires_ai: true, payload: { backlog_id: row.id, attempt: 1 } }); // 시리즈 편은 앞 편 초안 뒤(pickupApproved 가 건다)
    await insertRun({ backlog_id: row.id, phase: "approve", result: `자동 승인 (${by}) — 군집화 v2 · 빈 역할 0 · 소스 겹침 없음 → draft 작업 생성`, prompt_version: `auto-approve-${AUTO_RULE} (worker)`, executed_by: executedBy, worker_rev: workerRev() });
    log(`게이트 1 자동 승인 (${by}): ${row.id}`);
    n++;
  }
  return n;
}

/** 발행 준비 연쇄 — 작업이 끝나는 자리에서 **한 번** 건다. 한국판은 비평 끝(source critic), 글로벌판은 판정 루프 끝(source judge, 명세 6.10 — 판정이 발행 가능이고 필수 수정이 전부 반영된 편만).
 *  이미 걸려 있으면 건너뛴다. 실패하면 멈추고 사람이 콘솔 [발행 준비]로 다시 건다 — 폴링으로 다시 걸지 않는다
 *  (2026-10-23: 글로벌 1분 폴링(autoPublishPrepGlobal)이 발음 누락 편을 12분에 51번 다시 걸어 폐기. 연결 방식은 한국판과 같게) */
export async function startPublishPrepIfEnabled(episodeId: string, backlogId: string, parentJobId: string, source: "critic" | "judge" = "critic"): Promise<string | null> {
  const s = await readAutomation();
  if (!s.auto_publish_prep) return null;
  if ((pipelineLocale() === "en") !== (source === "judge")) return null; // 한국판은 비평 끝에서만, 글로벌판은 판정 끝에서만
  if (await hasActiveJob(["tts", "thumbnail", "package"], episodeId)) return null;
  const id = await enqueue({ type: "tts", requires_ai: false, payload: { episode_id: episodeId, backlog_id: backlogId, chain: ["thumbnail", "package"], auto: true }, parent_job_id: parentJobId });
  log(`  자동 발행 준비: ${episodeId} → tts ${id.slice(0, 8)} (→ thumbnail → package)`);
  return id;
}

/** 글로벌 판정 통과 편의 발행 준비 차단 사유 — 콘솔 표시용(에이전트 판정 불가·must_fix 미수리). 연쇄 자체는 판정 루프 끝에서 startPublishPrepIfEnabled(…, "judge") 가 건다 */
export function globalPrepBlockers(verdicts: unknown): string[] { return agentGateBlockers(verdicts); }
