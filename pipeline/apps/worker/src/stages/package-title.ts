import { buildTitlePromptPartsEn, TITLE_PROMPT_VERSION_EN, TITLE_SCHEMA_EN, titleCaseEn, titleViolationsEn } from "@ear/pipeline";
import { cfg } from "../config.js";
import { pool } from "../db.js";
import { makeExecutor } from "../executors/index.js";
import { storage } from "../storage.js";
import { log } from "../util.js";

/**
 * 글로벌 발행 제목 (2026-10-23, 글로벌 명세 6.9) — 주제(백로그 제목안 "Why …")와 제목을 분리한다.
 * 패키지 단계가 확정 대본과 최근 제목 10개를 GPT 에 주고 제목을 받는다. 규칙은 @ear/pipeline TITLE_RULES_EN(코드가 1·4·5·6 을 다시 센다).
 * 어기면 대안 중 통과하는 것을 쓰고, 없으면 사유를 붙여 한 번 더 부른다. 그래도 어기면 받은 제목을 쓰고 결과에 남긴다 — 제목 때문에 발행 준비를 막지는 않는다.
 * 한국판은 이 파일을 타지 않는다(게이트 2 에서 사람이 제목을 확정).
 */
export interface TitleResult { title: string; form: string; alternatives: string[]; why: string; model: string | null; costUsd: number; attempts: number; violations: string[]; promptVersion: string }

/** 최근 패키지 제목(최신순) — runs(phase=package) 의 upload-meta.json 을 S3 에서 읽는다. 발행된 편도 포함: 청취자 목록에 보이는 제목이 기준이다 */
export async function recentTitlesEn(excludeEpisodeId: string, limit = 10): Promise<string[]> {
  const r = await pool.query<{ artifacts: string[] | null }>(
    "select artifacts from public.runs where phase = 'package' and executed_at > now() - interval '365 days' order by executed_at desc limit 80",
  );
  const out: string[] = []; const seen = new Set<string>();
  for (const row of r.rows) {
    const key = (row.artifacts ?? []).find((a) => a.endsWith("/upload-meta.json"));
    if (!key || key.includes(`/${excludeEpisodeId}/`) || seen.has(key)) continue;
    seen.add(key);
    const text = await storage().get(key.replace(/^s3:/, "")).then((b) => b.toString("utf8")).catch(() => null);
    try { const t = JSON.parse(text ?? "")?.title; if (typeof t === "string" && t.trim()) out.push(t.trim()); } catch { /* 깨진 파일 */ }
    if (out.length >= limit) break;
  }
  return out;
}

export async function writeTitleEn(a: { episodeId: string; topicTitle: string; midTopic: string; oneLiner: string | null; scriptMd: string; recentTitles: string[] }): Promise<TitleResult> {
  const ex = makeExecutor("openai");
  let cost = 0; let model: string | null = null;
  const ask = async (violations?: string[], previous?: string) => {
    const parts = buildTitlePromptPartsEn({ ...a, violations, previous });
    const r = await ex.run<{ title: string; form: string; alternatives: string[]; why: string }>({
      prompt: parts.user, systemPrompt: parts.system, schema: TITLE_SCHEMA_EN, tools: [], allowedTools: [], cwd: cfg.workRoot, timeoutMs: 180_000, model: cfg.packageTitleModel, effort: "medium", maxOutputTokens: 8192,
    });
    cost += r.listCostUsd ?? 0; model = r.model ?? model;
    return r.output;
  };
  const pick = (o: { title: string; form: string; alternatives: string[]; why: string }) => {
    const v = titleViolationsEn(o.title, a.recentTitles);
    if (!v.length) return { ...o, violations: v, title: titleCaseEn(o.title) };
    const alt = (o.alternatives ?? []).find((t) => !titleViolationsEn(t, a.recentTitles).length);
    return alt ? { ...o, title: titleCaseEn(alt), form: "alternative", violations: [] as string[] } : { ...o, title: titleCaseEn(o.title), violations: v };
  };
  let out = pick(await ask());
  let attempts = 1;
  if (out.violations.length) {
    log(`  package ${a.episodeId}: 제목 규칙 위반 — "${out.title}" (${out.violations.join("; ")}) · 다시 부름`);
    out = pick(await ask(out.violations, out.title)); attempts = 2;
  }
  return { title: out.title, form: out.form, alternatives: out.alternatives ?? [], why: out.why, model, costUsd: Math.round(cost * 1e6) / 1e6, attempts, violations: out.violations, promptVersion: TITLE_PROMPT_VERSION_EN };
}
