import fs from "node:fs/promises";
import path from "node:path";
import { cfg } from "../config.js";
import { setJobProgress, type Job } from "../db.js";
import type { Executor } from "../executors/index.js";
import { assetPaths, buildRevisionPromptInline, REVISION_INLINE_SCHEMA } from "@ear/pipeline";
import { exists, log } from "../util.js";

/**
 * 수정 재생성 단발 (2026-09-09 비용 절감): QA·L0 지적을 받은 대본을 한 번의 호출로 고친다. 모델은 바꿀 턴의 전문만 돌려주고,
 * 워커가 script.md 의 해당 턴 줄을 통째로 치환한다(after 가 비면 줄 삭제). claims.md 끝에 "QA attempt N 반영" 절, 발음 맵 병합도 워커가 쓴다.
 * 에이전트 방식(Read·Edit·python 루프)은 긴 턴 2개 고치는 데 $1.92 였다(T260909-002).
 */
export interface RevisionInlineOut { fixes: { turn: string; before: string; after: string; why: string }[]; pronunciations_added: { term: string; reading: string }[]; claims_note: string; notes: string }

export async function runRevisionSingle(a: { job: Job; ex: Executor; episodeId: string; dir: string; assetRoot: string; attempt: number; qaFailures: { location: string; item: string; reason: string }[] }):
  Promise<{ output: { fixes: { location: string; before: string; after: string }[]; notes: string }; model: string | null; costUsd: number; tokens: unknown; unmatched: string[] }> {
  const { job, ex, episodeId, dir, attempt } = a;
  const read = (p: string) => fs.readFile(p, "utf8");
  const ap = assetPaths(a.assetRoot, cfg.workRoot);
  const outlineFile = path.join(dir, "outline.md"); const pronFile = path.join(dir, "pronunciations.json");
  const [guidelines, scriptMd, claimsMd, sourcesMd] = await Promise.all([read(ap.guidelines), read(path.join(dir, "script.md")), read(path.join(dir, "claims.md")), read(path.join(dir, "sources.md"))]);
  const outlineMd = (await exists(outlineFile)) ? await read(outlineFile) : null;
  const pronunciationsJson = (await exists(pronFile)) ? await read(pronFile) : "{}";
  const prompt = buildRevisionPromptInline({ episodeId, attempt, qaFailures: a.qaFailures, guidelines, scriptMd, claimsMd, sourcesMd, outlineMd, pronunciationsJson });
  log(`  draft(revision ${attempt}) ${episodeId}: 지적 ${a.qaFailures.length}건 단발 수정 (프롬프트 ${Math.round(prompt.length / 1000)}K자)`);
  const r = await ex.run<RevisionInlineOut>({
    prompt, schema: REVISION_INLINE_SCHEMA, tools: [], allowedTools: [], cwd: cfg.workRoot, timeoutMs: 20 * 60_000, model: cfg.revisionModel, maxThinkingTokens: cfg.thinkingRevision,
    onProgress: (pr) => setJobProgress(job.id, { ...pr, phase: `대본 수정 (attempt ${attempt}, 단발)`, detail: pr.turns > 0 ? "지적 대조·수정 중 (도구 없음)" : pr.detail }).catch(() => {}),
  });
  const o = r.output;

  // 턴 단위 치환 — "[화자] E12 · 문장" 줄을 찾아 문장만 바꾼다. 못 찾은 턴은 기록만 하고 넘어간다 (전부 못 찾으면 실패)
  const lines = scriptMd.split("\n");
  const unmatched: string[] = []; const applied: { location: string; before: string; after: string }[] = [];
  for (const f of o.fixes) {
    const id = f.turn.trim().toUpperCase().replace(/[^EY0-9]/g, "");
    const idx = lines.findIndex((l) => new RegExp(`^\\[(윤아|이음)\\]\\s*${id}\\s*·`).test(l));
    if (idx < 0) { unmatched.push(f.turn); continue; }
    const m = lines[idx].match(/^(\[(?:윤아|이음)\]\s*[EY]\d+\s*·\s*)(.*)$/);
    const before = m?.[2] ?? lines[idx];
    if (!f.after.trim()) lines.splice(idx, 1); else lines[idx] = `${m?.[1] ?? ""}${f.after.trim()}`;
    applied.push({ location: f.turn, before: before.slice(0, 80), after: f.after.trim().slice(0, 80) });
  }
  if (!applied.length && o.fixes.length) throw new Error(`수정 턴을 대본에서 찾지 못함: ${unmatched.join(", ")} — 턴 번호 형식 확인`);
  await fs.writeFile(path.join(dir, "script.md"), lines.join("\n"), "utf8");
  if (o.claims_note.trim()) await fs.writeFile(path.join(dir, "claims.md"), `${claimsMd.trimEnd()}\n\n## QA attempt ${attempt - 1} 반영 (단발 수정)\n\n${o.claims_note.trim()}\n${unmatched.length ? `\n(대본에서 못 찾은 턴: ${unmatched.join(", ")})\n` : ""}`, "utf8");
  if (o.pronunciations_added.length) {
    let cur: Record<string, string> = {}; try { cur = JSON.parse(pronunciationsJson); } catch { cur = {}; }
    for (const p of o.pronunciations_added) if (p.term.trim() && p.reading.trim() && !(p.term in cur)) cur[p.term] = p.reading;
    await fs.writeFile(pronFile, JSON.stringify(cur, null, 2) + "\n", "utf8");
  }
  return { output: { fixes: applied, notes: `${o.notes}${unmatched.length ? ` · 못 찾은 턴 ${unmatched.join(", ")}` : ""}` }, model: r.model, costUsd: r.listCostUsd ?? 0, tokens: (r.raw as { usage?: unknown } | undefined)?.usage, unmatched };
}
