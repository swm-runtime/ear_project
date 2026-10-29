import { enqueue, insertBacklogAlloc, pool, type Job } from "../db.js";
import { executedBy } from "../config.js";
import { log } from "../util.js";

/**
 * 짧은 판 재제작 후보 (0040, KAN-296 단기 실험 ④ — 2026-10-29 박수헌 결정).
 * 발행된 단편의 주제·소스를 그대로 물려받은 새 백로그 행을 만든다 — status approved · length_profile short · remake_of = 원본. 스윕·군집화·중복 판정은 타지 않는다.
 * 설계는 원본의 구성안·claims 를 보지 않고 소스만 받아 짧은 규격(5~12분·구간 2~3개)으로 새로 짠다(length-profile.ts). 제목·썸네일은 원본 것을 쓴다(thumbnail.ts 가 복사).
 * 콘솔 역할은 backlog INSERT 권한이 없어(0003 RLS) 이 작업이 워커에서 행을 만든다. 요청은 콘솔 실험 탭 [짧게 다시 만들기].
 */
export async function runRemake(job: Job) {
  const origId = String(job.payload.backlog_id ?? "");
  if (!origId) throw new Error("backlog_id 가 없다");
  const o = (await pool.query("select id, mid_topic, title, summary, target_fit, angle, sources, axis, axis_type, status, series_id, remake_of, cluster_version from public.backlog where id = $1", [origId])).rows[0];
  if (!o) throw new Error(`원본 후보 없음: ${origId}`);
  if (o.status !== "published") throw new Error(`원본 ${origId} 는 발행된 편이 아니다 (${o.status}) — 발행된 편만 짧은 판을 만든다`);
  if (o.series_id) throw new Error(`원본 ${origId} 는 시리즈 편이다 — 시리즈는 이 실험 대상이 아니다`);
  if (o.remake_of) throw new Error(`원본 ${origId} 가 이미 재제작 편이다 (← ${o.remake_of})`);
  const live = (await pool.query("select id, status from public.backlog where remake_of = $1 and status not in ('rejected','expired')", [origId])).rows[0];
  if (live) throw new Error(`이미 짧은 판이 있다: ${live.id} (${live.status}) — 반려한 뒤에만 다시 만든다`);
  const sources = Array.isArray(o.sources) ? o.sources : [];
  if (sources.length < 3) throw new Error(`원본 ${origId} 의 소스가 ${sources.length}건 — 3건 하한 미달`);

  const id = await insertBacklogAlloc({
    mid_topic: o.mid_topic, title: o.title, summary: o.summary ?? "", target_fit: o.target_fit ?? "", angle: o.angle ?? "", sources,
    dedup_note: `짧은 판 ← ${origId} (KAN-296 실험 — 같은 주제·소스, 5~12분)`, status: "held", axis: o.axis ?? null, axis_type: o.axis_type ?? null, gaps: [], cluster_version: o.cluster_version ?? "v1",
  });
  // held 로 넣고 바로 approved 로 — insertBacklogAlloc 은 proposed·held 만 받는다. 승인자는 작업(사람이 실험 탭에서 눌렀다)
  await pool.query("update public.backlog set status = 'approved', approved_by = $2, approved_at = now(), length_profile = 'short', remake_of = $3, updated_at = now() where id = $1", [id, `remake:${executedBy}`, origId]);
  const jobId = await enqueue({ type: "draft", requires_ai: true, payload: { backlog_id: id, attempt: 1 }, parent_job_id: job.id });
  log(`  remake ${origId} → ${id} "${o.title}" (short) · 초안 ${jobId.slice(0, 8)}`);
  return { backlog_id: id, remake_of: origId, title: o.title, draft_job: jobId };
}
