import { cfg, executedBy } from "../config.js";
import { getSeries, insertRun, saveSeriesPlan, setJobProgress, type Job } from "../db.js";
import type { Executor } from "../executors/index.js";
import { buildSeriesPlanPrompt, buildSeriesPlanPromptEn, normalizeSeriesPlan, pipelineLocale, SERIES_PLAN_SCHEMA, type SeriesPlanOut } from "@ear/pipeline";
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
