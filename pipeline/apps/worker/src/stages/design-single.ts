import fs from "node:fs/promises";
import path from "node:path";
import { cfg } from "../config.js";
import { setJobProgress, type Job } from "../db.js";
import type { Executor } from "../executors/index.js";
import { assetPaths, buildDesignPromptInline, DESIGN_INLINE_SCHEMA, type BacklogCandidate, type InlineSource } from "@ear/pipeline";
import { fetchArticle, type FetchedSource } from "../sources/fetch.js";
import { log } from "../util.js";
import type { DesignOut } from "./draft-two-stage.js";

/**
 * 설계 단발 실행 (2026-09-08 비용 절감 ③, spec/04 2.1): 소스 본문은 코드가 가져오고(WebFetch 대신), 모델은 도구 없이 한 번에
 * 발췌 선택(문단 ID)·claims·구성안·발음 맵을 돌려준다. 산출물 파일은 워커가 쓴다 — 발췌 본문은 원문 문단을 그대로 옮기므로 인용 환각이 없다.
 */
export interface DesignInlineOut extends Omit<DesignOut, "excerpts" | "claims" | "self_check"> {
  excerpt_ids: string[]; gists: { s: number; lines: string[] }[];
  claims: { id: string; text: string; excerpt_ids: string[]; type: string }[];
  outline_md: string; pronunciations: { term: string; reading: string }[];
}

export async function runDesignSingle(a: { job: Job; ex: Executor; episodeId: string; candidate: BacklogCandidate; dir: string; assetRoot: string; promptVersion: string }):
  Promise<{ design: DesignOut; model: string | null; costUsd: number; tokens: unknown; fetched: FetchedSource[] }> {
  const { job, ex, episodeId, candidate: cand, dir } = a;
  await setJobProgress(job.id, { phase: "설계 1/2 — 소스 본문 가져오기", detail: `${cand.sources.length}건 fetch`, toolCounts: {}, turns: 0, elapsedMs: 0 }).catch(() => {});
  const fetched = await Promise.all(cand.sources.map((s, i) => fetchArticle(i + 1, s.url)));
  const okCount = fetched.filter((f) => f.ok).length;
  log(`  design ${episodeId}: 소스 ${okCount}/${fetched.length} 본문 확보 (${fetched.map((f) => `S${f.n} ${f.ok ? `${f.chars}자/${f.blocks.length}문단` : `✗ ${f.status}`}`).join(" · ")})`);
  if (okCount < 3) throw new Error(`소스 본문 ${okCount}건 — 3건 하한 미달 (${fetched.filter((f) => !f.ok).map((f) => `S${f.n} ${f.status} ${f.note ?? ""}`).join("; ")})`);

  const ap = assetPaths(a.assetRoot, cfg.workRoot);
  const read = (p: string) => fs.readFile(p, "utf8");
  const [guidelines, specScript, goldFullEum, goldFullYuna] = await Promise.all([read(ap.guidelines), read(ap.specScript), read(ap.goldFullEum), read(ap.goldFullYuna)]);
  const sources: InlineSource[] = fetched.map((f, i) => ({ n: f.n, url: f.url, publisher: cand.sources[i].publisher, title: cand.sources[i].title || f.title || "", published: cand.sources[i].published, backbone: cand.sources[i].backbone, ok: f.ok, byline: f.byline, note: f.note, blocks: f.blocks }));
  const prompt = buildDesignPromptInline({ episodeId, candidate: cand, promptVersion: a.promptVersion, guidelines, specScript, goldFullEum, goldFullYuna, sources });
  log(`  design ${episodeId}: 단발 호출 (프롬프트 ${Math.round(prompt.length / 1000)}K자)`);
  const r = await ex.run<DesignInlineOut>({
    prompt, schema: DESIGN_INLINE_SCHEMA, tools: [], allowedTools: [], cwd: cfg.workRoot, timeoutMs: 40 * 60_000, model: cfg.draftDesignModel,
    onProgress: (pr) => setJobProgress(job.id, { ...pr, phase: "설계 1/2 — 발췌 선택·claims·구성안 (단발)", detail: pr.turns > 0 ? "설계 중 (도구 없음)" : pr.detail }).catch(() => {}),
  });
  const o = r.output;

  // ── 산출물 조립 (ID 검증 포함) ─────────────────────────────────────────────
  const blockById = new Map<string, { s: number; text: string }>();
  for (const f of fetched) for (const b of f.blocks) blockById.set(b.id, { s: f.n, text: b.text });
  const chosen = new Set(o.excerpt_ids.filter((id) => blockById.has(id)));
  const badClaims: string[] = [];
  for (const c of o.claims) {
    for (const id of c.excerpt_ids) { if (!blockById.has(id)) badClaims.push(`${c.id}→${id}`); else chosen.add(id); } // claims 가 가리키는 문단은 발췌에 넣는다
  }
  if (badClaims.length) throw new Error(`claims 가 존재하지 않는 문단 ID 를 가리킴: ${badClaims.slice(0, 10).join(", ")}${badClaims.length > 10 ? " …" : ""}`);
  const claimIds = new Set(o.claims.map((c) => c.id));
  const outlineRefs = [...new Set(o.outline_md.match(/\bC\d{2,3}\b/g) ?? [])];
  const missing = outlineRefs.filter((c) => !claimIds.has(c));
  if (missing.length) throw new Error(`구성안이 claims 에 없는 ID 를 참조: ${missing.slice(0, 10).join(", ")}`);
  if (!/^축:/m.test(o.outline_md) || !/^구간 #1/m.test(o.outline_md)) throw new Error("outline_md 형식 위반 — '축:' 또는 '구간 #1' 없음");
  if (o.estimated_minutes && o.estimated_minutes < 13) throw new Error(`재료 부족 — 설계 예상 분량 ${o.estimated_minutes}분 < 하한 13분. ${o.notes.slice(0, 200)}`);

  const lines: string[] = ["> 내부 증적 — 재배포 금지", "", `# 소스 발췌 — ${episodeId}`, "", `> 설계 단발 실행: 발췌는 코드가 가져온 원문 문단을 모델이 골라 그대로 옮긴 것 (${chosen.size}항목). 요지만 모델 작성.`, ""];
  for (const f of fetched) {
    const src = cand.sources[f.n - 1];
    lines.push(`## S${f.n}. ${src.publisher} — "${src.title || f.title || ""}"`);
    lines.push(`- URL: ${f.url}${src.published ? ` · 발행 ${String(src.published).slice(0, 10)}` : ""}${f.byline ? ` · 저자 ${f.byline}` : ""}`);
    if (!f.ok) { lines.push(`- 본문 없음 (${f.status}${f.note ? ` — ${f.note}` : ""}) — 제외`, ""); continue; }
    const g = o.gists.find((x) => x.s === f.n);
    if (g) lines.push(`- 요지: ${g.lines.join(" / ")}`);
    lines.push("");
    for (const b of f.blocks) if (chosen.has(b.id)) lines.push(`- ${b.id}: "${b.text}"`);
    lines.push("");
  }
  await fs.writeFile(path.join(dir, "sources.md"), lines.join("\n"), "utf8");
  const claimsMd = [`# claims — ${episodeId}`, "", "| ID | 주장 | 발췌 ID | 유형 |", "|---|---|---|---|", ...o.claims.map((c) => `| ${c.id} | ${c.text.replace(/\|/g, "／")} | ${c.excerpt_ids.join(", ")} | ${c.type} |`), ""].join("\n");
  await fs.writeFile(path.join(dir, "claims.md"), claimsMd, "utf8");
  await fs.writeFile(path.join(dir, "outline.md"), o.outline_md.trim() + "\n", "utf8");
  const pron: Record<string, string> = {};
  for (const p of o.pronunciations) if (p.term.trim() && p.reading.trim()) pron[p.term.trim()] = p.reading.trim();
  await fs.writeFile(path.join(dir, "pronunciations.json"), JSON.stringify(pron, null, 2) + "\n", "utf8");

  const design: DesignOut = {
    axis: o.axis, axis_type: o.axis_type, landing_section: o.landing_section, sections: o.sections, excerpts: chosen.size, claims: o.claims.length,
    estimated_minutes: o.estimated_minutes, split_proposal: o.split_proposal, sources_used: o.sources_used, sources_excluded: [
      ...o.sources_excluded, ...fetched.filter((f) => !f.ok && !o.sources_excluded.some((x) => x.url === f.url)).map((f) => ({ url: f.url, reason: `${f.status} ${f.note ?? ""}`.trim() })),
    ], gaps: o.gaps, self_check: `ID 검증: 발췌 ${chosen.size} · claims ${o.claims.length} · 구성안 참조 ${outlineRefs.length} 전부 유효`, notes: o.notes,
  };
  return { design, model: r.model, costUsd: r.listCostUsd ?? 0, tokens: (r.raw as { usage?: unknown } | undefined)?.usage, fetched };
}
