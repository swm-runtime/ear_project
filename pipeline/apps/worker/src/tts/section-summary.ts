import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { cfg } from "../config.js";
import { pool } from "../db.js";
import { promptBody } from "@ear/pipeline";
import { SECTION_SUMMARY_PROMPT_KEY } from "../assets.js";
import { makeExecutor } from "../executors/index.js";
import type { ScriptSection, SectionKind } from "./sections.js";

/**
 * 구간 요약 (KAN-152, 2026-10-07 — PM: 앱 구간 카드 = 위 "개요·본론·결론"(kind) + 아래 요약 한 줄).
 *
 * 구간 제목을 그대로 쓰지 않는 이유: 발행 45편 구간 312개 중 141개가 "인트로·도입·마무리"라 요약할 내용이 없고,
 * 단락 제목은 48%가 20자를 넘는다(중앙값 20 · 최대 32). 앱은 요약이 없으면 제목을 대신 보이므로, 제목을 복사하면 안 보내는 것과 같다.
 *
 * - 한 편에 한 번 호출 — 구간마다 kind·제목·그 구간 대사를 넘기고 구간 순서대로 받는다. 규칙 문구는 DB 자산 `skills/tts/section-summary.md`
 * - 코드 검사: 비어 있지 않음 · 한 줄 · 공백 포함 20자(코드 포인트) 이내. 어긋난 구간만 짚어 한 번 다시 받는다. 그래도 어긋나면 그 구간은 요약 없이 둔다(앱이 제목으로 대신한다)
 * - "대사에 있는 말만"은 코드로 가리지 못한다 — 모델 지시와 검수(게이트 2)에 맡긴다
 * - 캐시(`section-summaries.json`): 요약은 대사에만 달렸고 시각과 무관하다 — 다시 합성해도 같은 대사면 다시 부르지 않고 같은 요약을 쓴다. 키 = 자산 판 + kind + 제목 + 대사
 * - 실패(키 없음·API 오류)는 구간 생성 실패가 아니다 — 요약 없이 구간만 낸다
 */
export const SUMMARY_MAX = 20;
export const SUMMARY_CACHE_FILE = "section-summaries.json";

export interface SummaryItem { kind: SectionKind; title: string; text: string }
interface Cache { version: string; model: string | null; items: Record<string, string> }

const SCHEMA = {
  type: "object", additionalProperties: false, required: ["summaries"],
  properties: { summaries: { type: "array", items: { type: "object", additionalProperties: false, required: ["index", "summary"], properties: { index: { type: "integer" }, summary: { type: "string" } } } } },
} as const;

/** 요약 한 줄이 규격 밖이면 사유, 맞으면 null */
export function summaryProblem(s: string | null | undefined): string | null {
  if (!s || !s.trim()) return "비어 있음";
  if (/[\r\n]/.test(s)) return "줄바꿈";
  const n = [...s.trim()].length;
  return n > SUMMARY_MAX ? `${n}자 (공백 포함 ${SUMMARY_MAX}자 이내)` : null;
}

export function summaryCacheKey(version: string, item: SummaryItem): string {
  return crypto.createHash("sha256").update([version, item.kind, item.title, item.text].join("\u0000")).digest("hex").slice(0, 24);
}

export function buildSummaryPrompt(episodeTitle: string, items: SummaryItem[], fix?: { index: number; problem: string; summary: string }[]): string {
  const body = items.map((x, i) => `### 구간 ${i} · ${x.kind} · 제목: ${x.title}\n${x.text}`).join("\n\n");
  const again = fix?.length ? `\n\n[다시 쓸 구간]\n${fix.map((f) => `- 구간 ${f.index}: "${f.summary}" — ${f.problem}`).join("\n")}\n위 구간만 규칙에 맞게 다시 쓴다. 나머지 구간은 그대로 낸다.` : "";
  return `[에피소드] ${episodeTitle}\n\n${body}${again}`;
}

async function loadRule(): Promise<{ version: string; body: string }> {
  const r = await pool.query<{ version: string; content: string }>("select version, content from public.prompt_assets where status = 'active' and key = $1", [SECTION_SUMMARY_PROMPT_KEY]);
  const row = r.rows[0];
  if (!row) throw new Error(`prompt_assets 에 active 자산이 없다: ${SECTION_SUMMARY_PROMPT_KEY} — 시딩(npm run assets:import -- --only ${SECTION_SUMMARY_PROMPT_KEY})`);
  return { version: row.version, body: promptBody(row.content) };
}

/** 구간 요약 — 캐시에 있는 구간은 다시 부르지 않는다. 반환 summaries 는 items 와 같은 길이(실패한 구간은 null) */
export async function summarizeSections(episodeTitle: string, items: SummaryItem[], cache: Cache | null): Promise<{ summaries: (string | null)[]; cache: Cache; costUsd: number; called: boolean; failed: string[] }> {
  const rule = await loadRule();
  const keys = items.map((x) => summaryCacheKey(rule.version, x));
  const prev = cache?.version === rule.version ? cache.items : {};
  const summaries: (string | null)[] = keys.map((k) => (prev[k] && !summaryProblem(prev[k]) ? prev[k] : null));
  let costUsd = 0, called = false, model: string | null = cache?.model ?? null;
  if (summaries.some((s) => s == null)) {
    const ex = makeExecutor("openai");
    let fix: { index: number; problem: string; summary: string }[] | undefined;
    for (let round = 0; round < 2; round++) {
      const r = await ex.run<{ summaries: { index: number; summary: string }[] }>({
        prompt: buildSummaryPrompt(episodeTitle, items, fix), systemPrompt: rule.body, schema: SCHEMA, allowedTools: [], tools: [], cwd: cfg.workRoot, timeoutMs: 120_000, model: cfg.sectionSummaryModel,
      });
      called = true; costUsd += r.listCostUsd ?? 0; model = r.model ?? model;
      for (const { index, summary } of r.output.summaries ?? []) {
        if (index >= 0 && index < items.length && summaries[index] == null && !summaryProblem(summary)) summaries[index] = summary.trim();
      }
      const bad = summaries.map((s, i) => (s == null ? i : -1)).filter((i) => i >= 0);
      if (!bad.length) break;
      fix = bad.map((i) => { const got = r.output.summaries?.find((x) => x.index === i)?.summary ?? ""; return { index: i, problem: summaryProblem(got) ?? "빠짐", summary: got }; });
    }
  }
  const out: Cache = { version: rule.version, model, items: {} };
  keys.forEach((k, i) => { if (summaries[i]) out.items[k] = summaries[i]!; });
  const failed = summaries.map((s, i) => (s == null ? items[i].title : null)).filter((x): x is string => !!x);
  return { summaries, cache: out, costUsd, called, failed };
}

/**
 * 구간에 요약을 붙인다 — dir 의 캐시를 읽고 쓴다. 실패는 던지지 않고 note 로 알린다(구간은 요약 없이 나간다).
 * 반환 note 는 실행 기록에 붙는 한 토막(" · 요약 8/8 …").
 */
export async function attachSummaries(dir: string, episodeTitle: string, sections: ScriptSection[], texts: string[] | undefined): Promise<{ sections: ScriptSection[]; note: string; costUsd: number }> {
  if (!sections.length || !texts || texts.length !== sections.length) return { sections, note: "", costUsd: 0 };
  if (!cfg.openaiKey) return { sections, note: " · 요약 없음(OPENAI_API_KEY 없음)", costUsd: 0 };
  const cacheFile = path.join(dir, SUMMARY_CACHE_FILE);
  let cache: Cache | null = null;
  try { cache = JSON.parse(await fs.readFile(cacheFile, "utf8")) as Cache; } catch { cache = null; }
  try {
    const items: SummaryItem[] = sections.map((s, i) => ({ kind: s.kind ?? "body", title: s.title, text: texts[i] }));
    const r = await summarizeSections(episodeTitle, items, cache);
    await fs.writeFile(cacheFile, JSON.stringify(r.cache, null, 1), "utf-8");
    const withSummary = sections.map((s, i) => (r.summaries[i] ? { ...s, summary: r.summaries[i]! } : s));
    const ok = r.summaries.filter(Boolean).length;
    const note = ` · 요약 ${ok}/${sections.length}${r.called ? ` ($${r.costUsd.toFixed(3)})` : " (캐시)"}${r.failed.length ? ` — 못 쓴 구간 ${r.failed.join("·").slice(0, 80)}(제목으로 대신)` : ""}`;
    return { sections: withSummary, note, costUsd: r.costUsd };
  } catch (e: any) {
    return { sections, note: ` · 요약 실패(${String(e?.message ?? e).slice(0, 100)}) — 구간만`, costUsd: 0 };
  }
}
