import { enqueue, insertBacklogAlloc, pool, type Job } from "../db.js";
import { executedBy } from "../config.js";
import { storage } from "../storage.js";
import { log } from "../util.js";
import { LENGTH_SPECS } from "@ear/pipeline";

/**
 * 짧은 판 재제작 후보 (0040, KAN-296 단기 실험 ④ — 2026-10-29 박수헌 결정).
 * 발행된 단편의 주제·소스를 그대로 물려받은 새 백로그 행을 만든다 — status approved · length_profile short · remake_of = 원본. 스윕·군집화·중복 판정은 타지 않는다.
 * 설계는 원본의 구성안·claims 를 보지 않고 소스만 받아 짧은 규격(5~12분·구간 2~3개)으로 새로 짠다(length-profile.ts). 제목·썸네일은 원본 것을 쓴다(thumbnail.ts 가 복사).
 * 콘솔 역할은 backlog INSERT 권한이 없어(0003 RLS) 이 작업이 워커에서 행을 만든다. 요청은 콘솔 실험 탭 [짧게 다시 만들기].
 * payload.series_id 면 시리즈 단위(0041, 2026-10-30) — runSeriesRemake.
 */
export async function runRemake(job: Job) {
  if (job.payload.series_id) return runSeriesRemake(job);
  const origId = String(job.payload.backlog_id ?? "");
  if (!origId) throw new Error("backlog_id 가 없다");
  const o = (await pool.query("select id, mid_topic, title, summary, target_fit, angle, sources, axis, axis_type, status, series_id, remake_of, cluster_version from public.backlog where id = $1", [origId])).rows[0];
  if (!o) throw new Error(`원본 후보 없음: ${origId}`);
  if (o.status !== "published") throw new Error(`원본 ${origId} 는 발행된 편이 아니다 (${o.status}) — 발행된 편만 짧은 판을 만든다`);
  if (o.series_id) throw new Error(`원본 ${origId} 는 시리즈 편이다 — 시리즈는 실험 탭의 시리즈 재제작으로 한꺼번에 만든다`);
  if (o.remake_of) throw new Error(`원본 ${origId} 가 이미 재제작 편이다 (← ${o.remake_of})`);
  const live = (await pool.query("select id, status from public.backlog where remake_of = $1 and status not in ('rejected','expired')", [origId])).rows[0];
  if (live) throw new Error(`이미 짧은 판이 있다: ${live.id} (${live.status}) — 반려한 뒤에만 다시 만든다`);
  const sources = Array.isArray(o.sources) ? o.sources : [];
  if (sources.length < 3) throw new Error(`원본 ${origId} 의 소스가 ${sources.length}건 — 3건 하한 미달`);

  const id = await createShortCandidate(o, null, null);
  const jobId = await enqueue({ type: "draft", requires_ai: true, payload: { backlog_id: id, attempt: 1 }, parent_job_id: job.id });
  log(`  remake ${origId} → ${id} "${o.title}" (short) · 초안 ${jobId.slice(0, 8)}`);
  return { backlog_id: id, remake_of: origId, title: o.title, draft_job: jobId };
}

/** 원본 후보 행을 물려받은 짧은 판 후보 — held 로 넣고 바로 approved(insertBacklogAlloc 은 proposed·held 만 받는다). 시리즈 편이면 새 시리즈·화 번호를 단다 */
async function createShortCandidate(o: Record<string, any>, seriesId: string | null, seriesNo: number | null): Promise<string> {
  const id = await insertBacklogAlloc({
    mid_topic: o.mid_topic, title: o.title, summary: o.summary ?? "", target_fit: o.target_fit ?? "", angle: o.angle ?? "", sources: Array.isArray(o.sources) ? o.sources : [],
    dedup_note: `짧은 판 ← ${o.id} (KAN-296 실험 — 같은 주제·소스, 5~12분)`, status: "held", axis: o.axis ?? null, axis_type: o.axis_type ?? null, gaps: [], cluster_version: o.cluster_version ?? "v1",
  });
  await pool.query(
    "update public.backlog set status = 'approved', approved_by = $2, approved_at = now(), length_profile = 'short', remake_of = $3, series_id = $4, series_no = $5, updated_at = now() where id = $1",
    [id, `remake:${executedBy}`, o.id, seriesId, seriesNo],
  );
  return id;
}

/**
 * 시리즈 짧은 판 (0041, 2026-10-30 박수헌 "시리즈도 다시 뽑는다"). 발행된 파이프라인 시리즈 하나를 통째로 —
 *  1) 새 시리즈 행: 이름·소개·설계안·편수·간행물·썸네일 설정을 그대로, length_profile short · remake_of = 원본 · status approved(게이트 S 생략 — 사람이 실험 탭에서 골랐다)
 *  2) 원본의 발행된 편마다 짧은 판 후보(같은 화 번호, 소스 그대로, remake_of = 원본 편) — approved. 초안은 워커가 화 순서대로 집는다(pickupApproved · seriesPrevReady)
 *  3) 표지(datasets/series/<id>/thumb-cover.png)를 원본에서 복사 — 편 썸네일은 thumbnail.ts 가 원본 편 것을 복사한다
 */
async function runSeriesRemake(job: Job) {
  const origId = String(job.payload.series_id);
  const s = (await pool.query("select * from public.series where id = $1", [origId])).rows[0];
  if (!s) throw new Error(`원본 시리즈 없음: ${origId}`);
  if (s.status !== "published") throw new Error(`시리즈 "${s.name}" 는 발행 전이다 (${s.status}) — 발행된 시리즈만 짧은 판을 만든다`);
  if (s.remake_of || s.length_profile === "short") throw new Error(`시리즈 "${s.name}" 는 이미 짧은 판이다`);
  const live = (await pool.query("select id, status from public.series where remake_of = $1 and status not in ('cancelled','withdrawn')", [origId])).rows[0];
  if (live) throw new Error(`이미 짧은 판 시리즈가 있다: ${live.id} (${live.status}) — 중단(cancelled)한 뒤에만 다시 만든다`);
  const eps = (await pool.query("select id, mid_topic, title, summary, target_fit, angle, sources, axis, axis_type, cluster_version, series_no from public.backlog where series_id = $1 and status = 'published' order by series_no", [origId])).rows;
  const total = Number(s.total_episodes ?? 0);
  if (!total || eps.length !== total || eps.some((e, k) => e.series_no !== k + 1)) throw new Error(`시리즈 "${s.name}" 의 발행 편이 ${eps.length}/${total} — 1화부터 전 편이 발행된 시리즈만 짧은 판을 만든다`);
  const thin = eps.filter((e) => !Array.isArray(e.sources) || e.sources.length < 2).map((e) => `${e.series_no}화`);
  if (thin.length) throw new Error(`소스가 2건 미만인 편: ${thin.join(", ")}`);

  const plan = (Array.isArray(s.plan) ? s.plan : []).map((e: Record<string, unknown>) => ({ ...e, minutes: Math.min(Number(e.minutes) || LENGTH_SPECS.short.targetMin, LENGTH_SPECS.short.targetMin) }));
  const ins = await pool.query(
    `insert into public.series (name, mid_topic, intro_line, scope_note, plan, total_episodes, status, approved_by, approved_at, publication, thumb_word, thumb_label, thumb_box, thumb_base_key, thumb_layers, length_profile, remake_of)
     values ($1,$2,$3,$4,$5,$6,'approved',$7,now(),$8,$9,$10,$11,$12,$13,'short',$14) returning id`,
    [s.name, s.mid_topic, s.intro_line, s.scope_note, JSON.stringify(plan), total, `remake:${executedBy}`, s.publication, s.thumb_word, s.thumb_label, s.thumb_box, s.thumb_base_key, s.thumb_layers, origId],
  );
  const newId = ins.rows[0].id as string;
  const made: string[] = [];
  for (const e of eps) made.push(await createShortCandidate(e, newId, e.series_no));
  // 표지 — 원본에 없으면 건너뛴다(편 썸네일 작업이 다시 그리지 않으므로 [시리즈 발행] 전에 시리즈 화면에서 확인)
  let cover = "없음";
  try {
    const buf = await storage().get(`datasets/series/${origId}/thumb-cover.png`);
    await storage().put(`datasets/series/${newId}/thumb-cover.png`, buf, "image/png");
    cover = "복사";
  } catch (err) { log(`  remake series ${origId}: 표지 복사 건너뜀 (${String((err as Error)?.message ?? err).slice(0, 100)})`); }
  log(`  remake series "${s.name}" ${origId.slice(0, 8)} → ${newId.slice(0, 8)} · 편 ${made.length} (${made[0]}~${made[made.length - 1]}) · 표지 ${cover}`);
  return { series_id: newId, remake_of: origId, name: s.name, episodes: made, cover };
}
