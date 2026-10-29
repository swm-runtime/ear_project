import { cfg, executedBy } from "../config.js";
import { getSeries, insertRun, pool, saveSeriesPlan, setJobProgress, type Job } from "../db.js";
import type { Executor } from "../executors/index.js";
import { buildSeriesPlanPrompt, buildSeriesPlanPromptEn, buildShortSeriesPlanPrompt, LENGTH_SPECS, normalizeSeriesPlan, normalizeShortSeriesPlan, pipelineLocale, SERIES_PLAN_SCHEMA, SHORT_SERIES_PLAN_SCHEMA, type SeriesPlanEpisode, type SeriesPlanOut } from "@ear/pipeline";
import { log } from "../util.js";
import { workerRev } from "../assets.js";

export const SERIES_PLAN_VERSION = "series-plan-v1.1"; // v1.1 (2026-10-27): scope·only_here 는 개념만, 사례는 "예:"

/**
 * 시리즈 설계안 (spec/11 3장 · 글로벌 명세 6.11, KAN-136) — payload: { series_id, episodes? }.
 * 관리자가 [주제 기획] › 시리즈로 준 이름안·범위로 편 목록 초안을 만들어 series.plan 에 쓴다. 단발 호출, 도구 없음.
 * 사람이 시리즈 화면에서 고친 뒤 [승인]한다(게이트 S). 기획 중(planning)일 때만 쓴다 — 그 사이 승인·중단됐으면 결과를 버린다.
 */
export async function runSeriesPlan(job: Job, ex: Executor) {
  const id = String(job.payload.series_id ?? "");
  const s = await getSeries(id);
  if (!s) throw new Error(`시리즈 ${id} 없음`);
  if (s.status !== "planning") throw new Error(`시리즈 ${id} 는 ${s.status} — 기획 중일 때만 설계안을 만든다`);
  if (s.length_profile === "short" && s.remake_of) return runShortSeriesPlan(job, ex, s); // 짧은 판 시리즈(0041) — 원본 설계안을 개념 단위로 나눈다
  const wanted = Number(job.payload.episodes) > 0 ? Math.round(Number(job.payload.episodes)) : null;
  const en = pipelineLocale() === "en";
  await setJobProgress(job.id, { phase: `시리즈 설계안 — ${s.name.slice(0, 40)}`, detail: wanted ? `${wanted}편` : "편수 자동", toolCounts: {}, turns: 0, elapsedMs: 0 }).catch(() => {});
  const r = await ex.run<SeriesPlanOut>({
    prompt: (en ? buildSeriesPlanPromptEn : buildSeriesPlanPrompt)({ midTopic: s.mid_topic, name: s.name, scopeNote: s.scope_note ?? "", episodes: wanted }),
    schema: SERIES_PLAN_SCHEMA, tools: [], allowedTools: [], cwd: cfg.workRoot, timeoutMs: 10 * 60_000, model: cfg.clusterModel, maxThinkingTokens: cfg.thinkingDesign,
  });
  const plan = normalizeSeriesPlan(r.output.episodes ?? []);
  if (!plan.length) throw new Error(`설계안에 편이 없다 — ${String(r.output.notes ?? "").slice(0, 200)}`);
  const name = String(r.output.name ?? "").trim() || s.name;
  const intro = String(r.output.intro_line ?? "").trim();
  const countNote = wanted && plan.length !== wanted ? ` · ⚠ 요청 ${wanted}편과 다름` : "";
  // 썸네일 글자 칸은 초안을 쓰지 않는다 — 시리즈 디자인은 시리즈마다 사람이 정한다(2026-10-20). 칸을 채운 시리즈만 키워드 시리즈 디자인을 쓴다
  if (!(await saveSeriesPlan(id, { name, intro_line: intro, plan }))) throw new Error(`시리즈 ${id} 가 그 사이 기획 중이 아니게 됐다 — 설계안을 버린다`);
  const summary = `시리즈 설계안 · ${name} · ${plan.length}편${countNote} · 예상 ${plan.reduce((n, e) => n + e.minutes, 0)}분${r.output.notes ? ` · ${String(r.output.notes).slice(0, 200)}` : ""}`;
  await insertRun({ backlog_id: null, phase: "series_plan", result: summary, prompt_version: `${SERIES_PLAN_VERSION} (worker)`, executed_by: executedBy, model: r.model, cost_usd: r.listCostUsd ?? null, tokens: (r.raw as { usage?: unknown } | undefined)?.usage, worker_rev: workerRev() });
  log(`  series-plan ${id.slice(0, 8)}: ${plan.length}편${countNote}`);
  return { series_id: id, episodes: plan.length, requested: wanted, notes: r.output.notes ?? "" };
}

export const SHORT_SERIES_PLAN_VERSION = "series-plan-short-v1"; // 2026-10-30 — 원본 편을 개념 단위로 1~3편, from_no

/**
 * 짧은 판 시리즈 설계안 (KAN-296, 0041 — 2026-10-30 박수헌). 원본 시리즈의 설계안·편별 소스(발행처·제목)를 받아 원본 편 하나를 개념 단위로 1~3편(5~12분)으로 나눈다.
 * 새 편마다 from_no(원본 편 번호)를 적어 [승인] 때 그 편의 소스를 물려받은 후보가 생긴다(stages/remake.ts materialize). 이름·한 줄 소개는 원본 그대로.
 * 원본 편 가운데 새 편이 하나도 나오지 않은 번호는 notes 에 경고로 남긴다 — 사람이 시리즈 화면에서 보고 고친다
 */
async function runShortSeriesPlan(job: Job, ex: Executor, s: NonNullable<Awaited<ReturnType<typeof getSeries>>>) {
  const orig = await getSeries(s.remake_of!);
  if (!orig) throw new Error(`원본 시리즈 ${s.remake_of} 없음`);
  const original = (Array.isArray(orig.plan) ? orig.plan : []) as SeriesPlanEpisode[];
  if (!original.length) throw new Error(`원본 시리즈 "${orig.name}" 의 설계안이 비어 있다`);
  const eps = (await pool.query("select series_no, sources from public.backlog where series_id = $1 and status = 'published' order by series_no", [orig.id])).rows as { series_no: number; sources: { publisher?: string; title?: string }[] }[];
  const sources: Record<number, string[]> = {};
  for (const e of eps) sources[e.series_no] = (Array.isArray(e.sources) ? e.sources : []).map((x) => `${x.publisher ?? "?"} — ${String(x.title ?? "").slice(0, 80)}`);
  const sp = LENGTH_SPECS.short;
  await setJobProgress(job.id, { phase: `짧은 판 시리즈 설계안 — ${s.name.slice(0, 40)}`, detail: `원본 ${original.length}편을 개념 단위로`, toolCounts: {}, turns: 0, elapsedMs: 0 }).catch(() => {});
  const r = await ex.run<{ episodes: SeriesPlanEpisode[]; notes: string }>({
    prompt: buildShortSeriesPlanPrompt({ name: s.name, midTopic: s.mid_topic, original, sources, minMinutes: sp.floorMin, maxMinutes: sp.maxMin! }),
    schema: SHORT_SERIES_PLAN_SCHEMA, tools: [], allowedTools: [], cwd: cfg.workRoot, timeoutMs: 15 * 60_000, model: cfg.clusterModel, maxThinkingTokens: cfg.thinkingDesign,
  });
  const { plan, missing } = normalizeShortSeriesPlan(r.output.episodes ?? [], original.length, sp.maxMin!);
  if (!plan.length) throw new Error(`짧은 판 설계안에 편이 없다 — ${String(r.output.notes ?? "").slice(0, 200)}`);
  if (!(await saveSeriesPlan(s.id, { name: s.name, intro_line: s.intro_line ?? "", plan }))) throw new Error(`시리즈 ${s.id} 가 그 사이 기획 중이 아니게 됐다 — 설계안을 버린다`);
  const split = original.map((o) => `${o.no}화→${plan.filter((e) => e.from_no === o.no).length}`).join(" ");
  const warn = missing.length ? ` · ⚠ 새 편이 없는 원본 편: ${missing.map((n) => `${n}화`).join(", ")}` : "";
  const summary = `짧은 판 시리즈 설계안 · ${s.name} · 원본 ${original.length}편 → ${plan.length}편 (${split}) · 예상 ${plan.reduce((n, e) => n + e.minutes, 0)}분${warn}${r.output.notes ? ` · ${String(r.output.notes).slice(0, 200)}` : ""}`;
  await insertRun({ backlog_id: null, phase: "series_plan", result: summary, prompt_version: `${SHORT_SERIES_PLAN_VERSION} (worker)`, executed_by: executedBy, model: r.model, cost_usd: r.listCostUsd ?? null, tokens: (r.raw as { usage?: unknown } | undefined)?.usage, worker_rev: workerRev() });
  log(`  series-plan short ${s.id.slice(0, 8)}: ${original.length}편 → ${plan.length}편 (${split})${warn}`);
  return { series_id: s.id, episodes: plan.length, from: original.length, missing, notes: r.output.notes ?? "" };
}
