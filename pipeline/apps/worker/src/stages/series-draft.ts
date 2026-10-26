import fs from "node:fs/promises";
import path from "node:path";
import { buildSeriesOverlapPrompt, normalizeSeriesPlan, pipelineLocale, promptBody, SERIES_OVERLAP_SCHEMA, seriesOverlapMessages, type SeriesOverlapFinding, seriesRecapMaterial, seriesSentences, type BacklogCandidate, type SeriesDraftContext, type SeriesPlanEpisode, type SeriesTemplates, type Templates } from "@ear/pipeline";
import { activePromptAsset, getSeries, seriesPrevEpisodeId } from "../db.js";
import { getFile } from "../storage.js";
import { parseScriptForTts } from "../tts/script.js";
import { SERIES_PROMPT_KEY } from "../assets.js";
import { cfg } from "../config.js";
import type { Executor } from "../executors/index.js";

/**
 * 시리즈 편 대본 (spec/11 5·6장 · 글로벌 명세 6.11, KAN-136 4단계).
 *   - 맥락: 시리즈 행·설계안·앞 편 구성안(축·구간 질문)에서 만든다. 규칙은 DB 자산 skills/draft/series.md(항상 active).
 *   - 연결 재료: 설계 뒤 claims.md 에 회상 행(출처 "시리즈"/"Series")을, sources.md 에 "시리즈 연결 재료" 절을 붙인다 — QA 는 발췌를 최종 근거로 보므로 둘 다 둔다.
 *   - series-links.json: 인트로 시리즈 줄·클로징 문장·회상 행 ID — L0 가 재생성 회차에서도 읽는다.
 */
export const SERIES_LINKS_FILE = "series-links.json";
export interface SeriesLinks { series_id: string; no: number; total: number; intro_sentence: string; closing_sentence: string; recap_claim_id: string | null; prev: SeriesDraftContext["prev"]; next_title: string | null; name?: string; scope?: string; only_here?: string; elsewhere?: SeriesDraftContext["elsewhere"] }

/** 구성안에서 축 한 줄과 구간 질문들을 읽는다 — 한국판 "축:"·"질문:", 글로벌판 "Axis:"·"Question:". 축 앞의 [유형] 표지는 뗀다 */
export function outlineAxisQuestions(md: string): { axis: string; questions: string[] } {
  const axis = (md.match(/^(?:축|Axis):\s*(.+)$/m)?.[1] ?? "").replace(/^\[[^\]]*\]\s*/, "").trim();
  const questions = [...md.matchAll(/^\s*(?:질문|Question):\s*(.+)$/gm)].map((m) => m[1].trim()).filter(Boolean);
  return { axis, questions };
}

export async function buildSeriesContext(cand: BacklogCandidate, templates: Templates | null): Promise<SeriesDraftContext | undefined> {
  if (!cand.series_id || !cand.series_no) return undefined;
  const s = await getSeries(cand.series_id);
  if (!s) throw new Error(`시리즈 ${cand.series_id} 없음`);
  const plan = normalizeSeriesPlan((Array.isArray(s.plan) ? s.plan : []) as SeriesPlanEpisode[]);
  const no = cand.series_no;
  const ep = plan.find((e) => e.no === no);
  if (!ep) throw new Error(`시리즈 ${s.name} 설계안에 ${no}화가 없다`);
  const total = s.total_episodes ?? plan.length;
  let prev: SeriesDraftContext["prev"] = null;
  if (no > 1) {
    const prevId = await seriesPrevEpisodeId(cand.series_id, no - 1);
    if (!prevId) throw new Error(`${no - 1}화 에피소드가 아직 없다 — 앞 편 설계 뒤에 집는다(spec/11 5.3)`);
    const md = await getFile(`s3:episodes/${prevId}/outline.md`);
    if (!md) throw new Error(`${no - 1}화(${prevId}) 구성안(outline.md)이 없다`);
    const { axis, questions } = outlineAxisQuestions(md);
    if (!axis) throw new Error(`${no - 1}화(${prevId}) 구성안에서 축을 읽지 못했다`);
    prev = { title: plan.find((e) => e.no === no - 1)?.title ?? "", axis, questions };
  }
  const nextTitle = no < total ? plan.find((e) => e.no === no + 1)?.title ?? null : null;
  const en = pipelineLocale() === "en";
  const sentences = seriesSentences(templates as (Templates & SeriesTemplates) | null, { name: s.name, introLine: s.intro_line ?? "", no, total, nextTitle }, en);
  const rules = promptBody((await activePromptAsset(SERIES_PROMPT_KEY)).content);
  return {
    name: s.name, introLine: s.intro_line ?? "", no, total, scope: ep.scope, onlyHere: ep.only_here, carries: ep.carries,
    elsewhere: plan.filter((e) => e.no !== no).map((e) => ({ no: e.no, title: e.title, onlyHere: e.only_here })),
    prev, nextTitle, introSentence: sentences.intro, closingSentence: sentences.closing, recapClaimId: null, rules,
  };
}

/** 설계 뒤 연결 재료를 붙인다(멱등 — 이미 붙어 있으면 그 ID 를 쓴다). 회상 행은 claims 번호를 이어 받는다(max+1) */
export async function applySeriesMaterial(dir: string, seriesId: string, ctx: SeriesDraftContext): Promise<SeriesDraftContext> {
  const en = pipelineLocale() === "en";
  const mark = en ? "Series" : "시리즈";
  const claimsFile = path.join(dir, "claims.md"), sourcesFile = path.join(dir, "sources.md");
  let recapId: string | null = null;
  const material = seriesRecapMaterial(ctx, en);
  if (material) {
    const claims = await fs.readFile(claimsFile, "utf8");
    const existing = claims.match(new RegExp(`^\\|\\s*(C\\d{2,3})\\s*\\|[^\\n]*\\|\\s*${mark}\\s*\\|\\s*${en ? "series" : "시리즈"}\\s*\\|`, "m"));
    if (existing) recapId = existing[1];
    else {
      const max = Math.max(0, ...[...claims.matchAll(/^\|\s*C(\d{2,3})\s*\|/gm)].map((m) => Number(m[1])));
      recapId = `C${String(max + 1).padStart(2, "0")}`;
      const text = material.claim.replace(/\|/g, "／");
      const row = en ? `| ${recapId} | ${text} | Series | series | Opening |  |  | none | en |` : `| ${recapId} | ${text} | 시리즈 | 시리즈 | 도입 |  |  | 없음 |`;
      await fs.writeFile(claimsFile, insertAfterTable(claims, row));
      const sources = await fs.readFile(sourcesFile, "utf8");
      if (!sources.includes(material.section.split("\n")[0])) await fs.writeFile(sourcesFile, `${sources.trimEnd()}\n\n${material.section}\n`);
    }
  }
  const out = { ...ctx, recapClaimId: recapId };
  const links: SeriesLinks = { series_id: seriesId, no: ctx.no, total: ctx.total, intro_sentence: ctx.introSentence, closing_sentence: ctx.closingSentence, recap_claim_id: recapId, prev: ctx.prev, next_title: ctx.nextTitle, name: ctx.name, scope: ctx.scope, only_here: ctx.onlyHere, elsewhere: ctx.elsewhere };
  await fs.writeFile(path.join(dir, SERIES_LINKS_FILE), JSON.stringify(links, null, 1));
  return out;
}

/** 표의 마지막 claims 행 바로 뒤에 넣는다 — 표 뒤에 붙은 절(QA 반영 기록 등)이 있어도 표 안에 들어가게 */
function insertAfterTable(md: string, row: string): string {
  const lines = md.split("\n");
  let last = -1;
  lines.forEach((l, i) => { if (/^\|\s*C\d{2,3}\s*\|/.test(l)) last = i; });
  if (last < 0) return `${md.trimEnd()}\n${row}\n`;
  lines.splice(last + 1, 0, row);
  return lines.join("\n");
}

export async function readSeriesLinks(dir: string): Promise<SeriesLinks | null> {
  try { return JSON.parse(await fs.readFile(path.join(dir, SERIES_LINKS_FILE), "utf8")) as SeriesLinks; } catch { return null; }
}

/** L0 시리즈 검사 (spec/11 6장) — 인트로 시리즈 줄 · 클로징 인사의 예고/맺음 문장 · 2화부터 도입 첫 해설 턴의 회상 행. 비율 표지가 없어 한도 뒤 남으면 실패한다 */
export function seriesViolations(scriptMd: string, notesMd: string | undefined, links: SeriesLinks | null): string[] {
  if (!links) return [];
  const en = pipelineLocale() === "en";
  const v: string[] = [];
  const turns = parseScriptForTts(scriptMd).turns;
  const norm = (s: string) => s.replace(/\s+/g, " ").trim();
  const first = turns[0], last = turns[turns.length - 1];
  if (!first || !norm(first.text).includes(norm(links.intro_sentence))) v.push(en ? `Series intro line missing from the intro turn ${first?.id ?? ""} — the {topic_line} slot is exactly: "${links.intro_sentence}"` : `인트로 턴 ${first?.id ?? ""}에 시리즈 줄이 없다 — {대주제 한 줄} 자리는 정확히 "${links.intro_sentence}"`);
  if (!last || !norm(last.text).includes(norm(links.closing_sentence))) v.push(en ? `Series sentence missing from the sign-off turn ${last?.id ?? ""} — that turn starts with exactly "${links.closing_sentence}" and then keeps the sign-off line word for word (both in one turn; do not drop either)` : `클로징 인사 턴 ${last?.id ?? ""}에 시리즈 문장이 없다 — 첫 {슬롯}은 정확히 "${links.closing_sentence}"로 시작한다`);
  if (links.recap_claim_id) {
    const leadZone = turns.find((t) => t.id?.startsWith("E") && t.section !== turns[0]?.section);
    const firstE = turns.find((t) => t.id?.startsWith("E"));
    const target = leadZone ?? firstE;
    const row = target?.id ? (notesMd ?? "").split("\n").find((l) => new RegExp(`^\\|\\s*${target.id}\\s*\\|`).test(l)) : undefined;
    if (!target || !row || !row.includes(links.recap_claim_id)) v.push(en ? `Recap of episode ${links.no - 1} missing — the first explainer turn of the Opening (${target?.id ?? "none"}) starts with one or two sentences from claim ${links.recap_claim_id} and lists it in turn_claims` : `${links.no - 1}화 회상이 없다 — 도입의 첫 해설 턴(${target?.id ?? "없음"})은 claims ${links.recap_claim_id}로 한두 문장 회상하고 turn_claims 에 그 행을 넣는다`);
  }
  return v;
}

/** 시리즈 범위 검사 (spec/11 6장 L1 겹침 항목) — 다른 편이 자세히 다룰 개념을 풀어 쓴 곳. 단발·도구 없음. 형제 편이 없으면 돌지 않는다 */
export async function seriesOverlapViolations(ex: Executor, scriptMd: string, links: SeriesLinks | null): Promise<{ violations: string[]; costUsd: number }> {
  if (!links?.elsewhere?.length) return { violations: [], costUsd: 0 };
  const en = pipelineLocale() === "en";
  const r = await ex.run<{ findings: SeriesOverlapFinding[] }>({
    prompt: buildSeriesOverlapPrompt({ name: links.name ?? "", no: links.no, scope: links.scope ?? "", onlyHere: links.only_here ?? "", elsewhere: links.elsewhere, scriptMd }, en),
    schema: SERIES_OVERLAP_SCHEMA, tools: [], allowedTools: [], cwd: cfg.workRoot, timeoutMs: 5 * 60_000, model: cfg.qaModel, effort: "low",
  });
  return { violations: seriesOverlapMessages(r.output.findings ?? [], en), costUsd: r.listCostUsd ?? 0 };
}
