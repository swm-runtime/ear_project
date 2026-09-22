/**
 * 자동화 (2026-09-23 박수헌 결정, spec/03 6.1 2단계 진입 · spec/07 1장 개정):
 *   군집화까지는 사람+Claude, **그 뒤 후보 승인 → 초안 → QA → 비평 → TTS → 썸네일 → 패키지까지 자동**,
 *   추천 메타(enrich)·검수·발행은 사람.
 *
 * 스위치는 DB `settings.automation` — 콘솔 설정 화면에서 끄고 켠다 (워커 재시작 없음).
 *   { auto_approve: boolean, auto_publish_prep: boolean, rule: "v1" }
 *
 * 자동 승인 규칙 v1 (`approved_by = "auto:v1"`):
 *   - 군집화 v2 후보 (`cluster_version = 'v2'`)
 *   - 빈 역할 없음 (`gaps` 비어 있음)
 *   - 소스 겹침 경고 없음 (`dedup_note` 에 "소스 겹침" 없음)
 *   조건 밖 후보는 `proposed` 로 남아 사람이 본다. 하루 상한은 두지 않는다 — API 쪽 hard limit 이 상한이다 (2026-09-23 결정).
 *
 * 발행 준비 자동 연쇄: 비평이 끝나면 `tts → thumbnail → package` 를 건다 (사람이 [발행 준비]를 누른 것과 같은 경로, chain.ts).
 * 패키지는 enrich 를 자동으로 걸지 않는다 — 발행하지 않을 편까지 메타를 뽑는 낭비를 막기 위해 업로드 화면의 [추천 메타 뽑기]로 사람이 건다.
 * 알림은 편마다가 아니라 큐가 다 비었을 때 한 번 (digest.ts).
 */
import { approveBacklogAuto, enqueue, getSetting, hasActiveDraftJob, hasActiveJob, insertRun, listProposedForAutoApprove } from "./db.js";
import { executedBy } from "./config.js";
import { workerRev } from "./assets.js";
import { log } from "./util.js";

export interface AutomationSetting { auto_approve?: boolean; auto_publish_prep?: boolean; rule?: string }
export const AUTO_RULE = "v1";

let cached: { at: number; value: AutomationSetting } | null = null;
/** settings.automation — 30초 캐시 (루프마다 읽지 않게). 행이 없으면 전부 off */
export async function readAutomation(): Promise<AutomationSetting> {
  if (cached && Date.now() - cached.at < 30_000) return cached.value;
  const v = (await getSetting<AutomationSetting>("automation").catch(() => null)) ?? {};
  cached = { at: Date.now(), value: v };
  return v;
}

export interface AutoApproveRow { id: string; cluster_version: string | null; gaps: string[] | null; dedup_note: string | null }

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
  const s = await readAutomation();
  if (!s.auto_approve) return 0;
  let n = 0;
  for (const row of await listProposedForAutoApprove()) {
    if (autoApproveBlocker(row)) continue;
    const by = `auto:${AUTO_RULE}`;
    if (!(await approveBacklogAuto(row.id, by))) continue; // 그 사이 사람이 손댔으면 건너뜀
    if (!(await hasActiveDraftJob(row.id))) await enqueue({ type: "draft", requires_ai: true, payload: { backlog_id: row.id, attempt: 1 } });
    await insertRun({ backlog_id: row.id, phase: "approve", result: `자동 승인 (${by}) — 군집화 v2 · 빈 역할 0 · 소스 겹침 없음 → draft 작업 생성`, prompt_version: `auto-approve-${AUTO_RULE} (worker)`, executed_by: executedBy, worker_rev: workerRev() });
    log(`게이트 1 자동 승인 (${by}): ${row.id}`);
    n++;
  }
  return n;
}

/** 비평 완료 후 발행 준비 연쇄 — 이미 걸려 있으면 건너뛴다 */
export async function startPublishPrepIfEnabled(episodeId: string, backlogId: string, parentJobId: string): Promise<string | null> {
  const s = await readAutomation();
  if (!s.auto_publish_prep) return null;
  if (await hasActiveJob(["tts", "thumbnail", "package"], episodeId)) return null;
  const id = await enqueue({ type: "tts", requires_ai: false, payload: { episode_id: episodeId, backlog_id: backlogId, chain: ["thumbnail", "package"], auto: true }, parent_job_id: parentJobId });
  log(`  자동 발행 준비: ${episodeId} → tts ${id.slice(0, 8)} (→ thumbnail → package)`);
  return id;
}

