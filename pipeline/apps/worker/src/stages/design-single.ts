import fs from "node:fs/promises";
import path from "node:path";
import { cfg, executedBy } from "../config.js";
import { blockedTierHosts, insertRun, priorEpisodesUsingUrls, recordFetchStatus, refreshDomainFetchBlock, setJobProgress, type Job } from "../db.js";
import { getFile } from "../storage.js";
import type { Executor } from "../executors/index.js";
import { assetPaths, buildDesignPromptInline, DESIGN_INLINE_SCHEMA, type BacklogCandidate, type InlineSource } from "@ear/pipeline";
import { fetchArticle, fetchStatusOf, type FetchedSource } from "../sources/fetch.js";
import { log } from "../util.js";
import { workerRev } from "../assets.js";
import type { DesignOut } from "./draft-two-stage.js";

/**
 * 설계 단발 실행 (2026-09-08 비용 절감 ③, spec/04 2.1): 소스 본문은 코드가 가져오고(WebFetch 대신), 모델은 도구 없이 한 번에
 * 발췌 선택(문단 ID)·claims·구성안·발음 맵을 돌려준다. 산출물 파일은 워커가 쓴다 — 발췌 본문은 원문 문단을 그대로 옮기므로 인용 환각이 없다.
 */
export interface DesignInlineOut extends Omit<DesignOut, "excerpts" | "claims" | "self_check"> {
  excerpt_ids: string[]; gists: { s: number; lines: string[] }[];
  claims: { id: string; text: string; excerpt_ids: string[]; type: string; attribution: "필수" | "불필요" }[];
  outline_md: string; pronunciations: { term: string; reading: string }[];
}

/** 구성안 정규화 (2026-09-10, T260910-007/C77): 모델이 "**축:**"·"### 구간 #1"·"- 예상 분량:"·"구간 1 —" 처럼 장식을 붙이면 줄머리 검사(`^축:`·`^구간 #1`)와
 *  L0 의 `^예상 분량:`·`^구간 #n` 이 전부 어긋나 $1.3 짜리 설계를 통째로 버렸다. 알려진 키 줄의 장식만 벗기고 정본 형태로 맞춘다 — 내용은 손대지 않는다 */
const OUTLINE_KEYS = /^(축 해설|축|착지 구간|예상 분량|역할표|역할 없는 소스|연결·비유|마무리 한 줄|비율 합계|구간\s*#?\s*\d)/; // \b 는 한글 뒤에서 안 잡힌다 — 키 목록으로
export function normalizeOutline(md: string): string {
  return md.split(/\r?\n/).map((raw) => {
    let l = raw.replace(/^\s*(?:#{1,6}\s*|[-*>]\s+)?/, "").replace(/\*\*/g, "").replace(/^\s+/, "");
    if (!OUTLINE_KEYS.test(l)) return raw;
    l = l.replace(/^구간\s*#?\s*(\d+)\s*[—–\-:]?\s*/, (_m, n) => `구간 #${n} — `).replace(/^(축|축 해설|착지 구간|예상 분량|역할표|역할 없는 소스|연결·비유|마무리 한 줄|비율 합계)\s*[:：]\s*/, (_m, k) => `${k}: `);
    return l.trimEnd();
  }).join("\n");
}

/** 다른 편의 sources.md 에서 URL → 발췌 문단 본문 목록. 형식은 이 파일이 쓰는 그대로("## S{n}." 머리, "- URL:", "- S{n}-NN: \"…\"") */
export function parsePriorExcerpts(md: string): Map<string, string[]> {
  const out = new Map<string, string[]>(); let url: string | null = null;
  for (const line of md.split(/\r?\n/)) {
    if (/^## S\d+\./.test(line)) { url = null; continue; }
    const u = line.match(/^- URL:\s*(\S+)/); if (u) { url = u[1]; continue; }
    const b = line.match(/^- S\d+-\d+:\s*"([\s\S]*)"\s*$/);
    if (b && url) { const a = out.get(url) ?? []; a.push(b[1]); out.set(url, a); }
  }
  return out;
}
const normText = (t: string) => t.replace(/\s+/g, " ").trim();
/** 문단이 이미 쓴 발췌와 같은가 — 같은 문단이거나(정규화 일치) 한쪽이 다른 쪽을 품는 경우(splitLong 경계가 달라졌을 때). 40자 미만은 우연 일치가 잦아 안 본다 */
export function isUsedBlock(text: string, used: string[]): boolean {
  const a = normText(text); if (a.length < 40) return false;
  return used.some((u) => { const b = normText(u); return b.length >= 40 && (a === b || a.includes(b) || b.includes(a)); });
}

export async function runDesignSingle(a: { job: Job; ex: Executor; episodeId: string; candidate: BacklogCandidate; dir: string; assetRoot: string; promptVersion: string }):
  Promise<{ design: DesignOut; model: string | null; costUsd: number; tokens: unknown; fetched: FetchedSource[] }> {
  const { job, ex, episodeId, candidate: cand, dir } = a;
  await setJobProgress(job.id, { phase: "설계 1/2 — 소스 본문 가져오기", detail: `${cand.sources.length}건 fetch`, toolCounts: {}, turns: 0, elapsedMs: 0 }).catch(() => {});
  // 차단 tier 도메인(사람 판정, spec/01 2장)은 페이지가 열려도 쓰지 않는다 (2026-09-10): 소스 풀에서는 지웠지만 후보 행의 URL 사본은 남아 있다.
  // 접근 실패와 같은 경로(제외 → 3건 하한 → 자동 반려)로 처리한다
  const blockedHosts = await blockedTierHosts().catch(() => new Set<string>());
  const isBlockedTier = (url: string) => { try { const u = new URL(url); const h = u.hostname.replace(/^www\./, ""); const seg = u.pathname.split("/").filter(Boolean)[0]; return blockedHosts.has(h) || (!!seg && blockedHosts.has(`${h}/${seg}`)); } catch { return false; } };
  const fetched = await Promise.all(cand.sources.map(async (s, i) => isBlockedTier(s.url)
    ? ({ n: i + 1, url: s.url, ok: false, status: 0, title: null, byline: null, blocks: [], chars: 0, note: "차단 도메인 (판정 blocked) — 가져오지 않음" } as FetchedSource)
    : fetchArticle(i + 1, s.url)));
  await Promise.all(fetched.filter((f) => f.status !== 0 || f.ok).map((f) => recordFetchStatus(f.url, fetchStatusOf(f)).catch(() => {}))); // 차단 tier 로 건너뛴 것은 접근 결과가 아니다 // 0017: 접근 결과를 소스에 남긴다 — 다음 군집화가 robots·blocked 를 뺀다
  await refreshDomainFetchBlock(fetched.map((f) => f.url)).catch(() => {}); // 도메인째 반복되면 군집화 제외 표시
  const okCount = fetched.filter((f) => f.ok).length;
  log(`  design ${episodeId}: 소스 ${okCount}/${fetched.length} 본문 확보 (${fetched.map((f) => `S${f.n} ${f.ok ? `${f.chars}자/${f.blocks.length}문단` : `✗ ${f.status}`}`).join(" · ")})`);
  if (okCount < 3) throw new Error(`소스 본문 ${okCount}건 — 3건 하한 미달 (${fetched.filter((f) => !f.ok).map((f) => `S${f.n} ${f.status} ${f.note ?? ""}`).join("; ")})`);

  // 이미 쓴 문단 제외 (2026-09-10, T260910-005↔013 — 같은 소스 2건에서 같은 문단을 골라 두 편의 구간이 거의 같은 대사가 됐다):
  // 다른 후보의 편이 같은 URL 에서 발췌한 문단은 프롬프트에서 본문을 빼고 자리만 남긴다 — 모델은 고를 수 없고, 남은 대목이 얇으면 그 소스를 제외한다.
  // 소스 단위로 막지 않는 이유: 풀이 작은 대분류는 소스 금지가 곧 편수 제한이다. 막는 단위는 문단이다.
  const prior = await priorEpisodesUsingUrls(cand.sources.map((s) => s.url), cand.id).catch((e) => { log(`  design ${episodeId}: 이전 편 조회 실패 (${String(e?.message ?? e).slice(0, 80)}) — 문단 제외 없이 진행`); return []; });
  const usedByUrl = new Map<string, { episode: string; title: string; texts: string[] }[]>();
  for (const pe of prior) {
    const md = pe.sources_key ? await getFile(pe.sources_key) : null;
    if (!md) continue;
    const ex = parsePriorExcerpts(md);
    for (const u of pe.urls) { const texts = ex.get(u); if (!texts?.length) continue; const arr = usedByUrl.get(u) ?? []; arr.push({ episode: pe.episode_id, title: pe.title, texts }); usedByUrl.set(u, arr); }
  }
  const usedBlocks = new Map<string, string>(); // 문단 ID → 쓴 편
  const priorNotes: string[] = [];
  for (const f of fetched) {
    const uses = usedByUrl.get(f.url); if (!uses?.length || !f.ok) continue;
    let n = 0;
    for (const b of f.blocks) { const hit = uses.find((u) => isUsedBlock(b.text, u.texts)); if (hit) { usedBlocks.set(b.id, hit.episode); n++; } }
    if (n) priorNotes.push(`S${f.n} ${n}/${f.blocks.length}문단 (${[...new Set(uses.map((u) => u.episode))].join("·")})`);
  }
  if (usedBlocks.size) log(`  design ${episodeId}: 이미 쓴 문단 제외 — ${priorNotes.join(" · ")}`);

  const ap = assetPaths(a.assetRoot, cfg.workRoot);
  const read = (p: string) => fs.readFile(p, "utf8");
  const [guidelines, specScript, goldFullEum, goldFullYuna] = await Promise.all([read(ap.guidelines), read(ap.specScript), read(ap.goldFullEum), read(ap.goldFullYuna)]);
  const sources: InlineSource[] = fetched.map((f, i) => ({ n: f.n, url: f.url, publisher: cand.sources[i].publisher, title: cand.sources[i].title || f.title || "", published: cand.sources[i].published, backbone: cand.sources[i].backbone, ok: f.ok, byline: f.byline, note: f.note,
    blocks: f.blocks.filter((b) => !usedBlocks.has(b.id)), usedBlocks: f.blocks.filter((b) => usedBlocks.has(b.id)).map((b) => ({ id: b.id, by: usedBlocks.get(b.id)! })) }));
  const prompt = buildDesignPromptInline({ episodeId, candidate: cand, promptVersion: a.promptVersion, guidelines, specScript, goldFullEum, goldFullYuna, sources });
  log(`  design ${episodeId}: 단발 호출 (프롬프트 ${Math.round(prompt.length / 1000)}K자)`);
  const r = await ex.run<DesignInlineOut>({
    prompt, schema: DESIGN_INLINE_SCHEMA, tools: [], allowedTools: [], cwd: cfg.workRoot, timeoutMs: 40 * 60_000, model: cfg.draftDesignModel, maxThinkingTokens: cfg.thinkingDesign, effort: cfg.effortDesign,
    onProgress: (pr) => setJobProgress(job.id, { ...pr, phase: "설계 1/2 — 발췌 선택·claims·구성안 (단발)", detail: pr.turns > 0 ? "설계 중 (도구 없음)" : pr.detail }).catch(() => {}),
  });
  const o = { ...r.output, outline_md: normalizeOutline(r.output.outline_md) };
  // 검증 실패도 비용이 든 실행이다 — 원본 출력을 남기고 runs 에 기록한 뒤 실패시킨다 (재현·진단용. 이전엔 흔적 없이 버려졌다)
  const fail = async (msg: string): Promise<never> => {
    await fs.mkdir(dir, { recursive: true }).catch(() => {});
    await fs.writeFile(path.join(dir, "design-raw.json"), JSON.stringify({ episode_id: episodeId, backlog_id: cand.id, error: msg, output: r.output }, null, 1)).catch(() => {});
    await insertRun({ backlog_id: cand.id, phase: "draft", attempt: 1, result: `설계 산출물 검증 실패: ${msg.slice(0, 200)} — 원본 design-raw.json (로컬 ${dir})`, prompt_version: `${a.promptVersion} (worker)`, artifacts: [], executed_by: executedBy, model: r.model, cost_usd: r.listCostUsd, tokens: (r.raw as { usage?: unknown } | undefined)?.usage, worker_rev: workerRev() }).catch(() => {});
    throw new Error(msg);
  };

  // ── 산출물 조립 (ID 검증 포함) ─────────────────────────────────────────────
  const blockById = new Map<string, { s: number; text: string }>();
  for (const f of fetched) for (const b of f.blocks) if (!usedBlocks.has(b.id)) blockById.set(b.id, { s: f.n, text: b.text }); // 제외 문단은 ID 검증에서도 없는 문단이다
  const chosen = new Set(o.excerpt_ids.filter((id) => blockById.has(id)));
  const badClaims: string[] = [];
  for (const c of o.claims) {
    for (const id of c.excerpt_ids) { if (!blockById.has(id)) badClaims.push(`${c.id}→${id}`); else chosen.add(id); } // claims 가 가리키는 문단은 발췌에 넣는다
  }
  const reused = [...new Set([...o.excerpt_ids, ...o.claims.flatMap((c) => c.excerpt_ids)])].filter((id) => usedBlocks.has(id));
  if (reused.length) await fail(`이미 다른 편이 쓴 문단을 발췌·claims 에 넣음: ${reused.slice(0, 8).map((id) => `${id}(${usedBlocks.get(id)})`).join(", ")} — 제외 문단은 고를 수 없다`);
  if (badClaims.length) await fail(`claims 가 존재하지 않는 문단 ID 를 가리킴: ${badClaims.slice(0, 10).join(", ")}${badClaims.length > 10 ? " …" : ""}`);
  const claimIds = new Set(o.claims.map((c) => c.id));
  const outlineRefs = [...new Set(o.outline_md.match(/\bC\d{2,3}\b/g) ?? [])];
  const missing = outlineRefs.filter((c) => !claimIds.has(c));
  if (missing.length) await fail(`구성안이 claims 에 없는 ID 를 참조: ${missing.slice(0, 10).join(", ")}`);
  if (!/^축:/m.test(o.outline_md) || !/^구간 #1/m.test(o.outline_md)) await fail(`outline_md 형식 위반 — '축:' 또는 '구간 #1' 줄이 없음 (정규화 후). 앞부분: ${o.outline_md.replace(/\s+/g, " ").slice(0, 160)}`);
  if (o.estimated_minutes && o.estimated_minutes < 13) await fail(`재료 부족 — 설계 예상 분량 ${o.estimated_minutes}분 < 하한 13분. ${o.notes.slice(0, 200)}`);

  const lines: string[] = ["> 내부 증적 — 재배포 금지", "", `# 소스 발췌 — ${episodeId}`, "", `> 설계 단발 실행: 발췌는 코드가 가져온 원문 문단을 모델이 골라 그대로 옮긴 것 (${chosen.size}항목). 요지만 모델 작성.`, ...(priorNotes.length ? [`> 이미 다른 편이 쓴 문단은 제외했다: ${priorNotes.join(" · ")}`] : []), ""];
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
  const req = o.claims.filter((c) => c.attribution === "필수").length;
  const claimsMd = [`# claims — ${episodeId}`, "", `> 귀속 열(guidelines 규칙 20): 필수 ${req} · 불필요 ${o.claims.length - req}. 불필요 주장은 대본이 해설자의 말로 설명하고 출처를 달지 않는다.`, "", "| ID | 주장 | 발췌 ID | 유형 | 귀속 |", "|---|---|---|---|---|", ...o.claims.map((c) => `| ${c.id} | ${c.text.replace(/\|/g, "／")} | ${c.excerpt_ids.join(", ")} | ${c.type} | ${c.attribution} |`), ""].join("\n");
  await fs.writeFile(path.join(dir, "claims.md"), claimsMd, "utf8");
  await fs.writeFile(path.join(dir, "outline.md"), o.outline_md.trim() + "\n", "utf8");
  const pron: Record<string, string> = {};
  for (const p of o.pronunciations) if (p.term.trim() && p.reading.trim()) pron[p.term.trim()] = p.reading.trim();
  await fs.writeFile(path.join(dir, "pronunciations.json"), JSON.stringify(pron, null, 2) + "\n", "utf8");

  const design: DesignOut = {
    axis: o.axis, axis_type: o.axis_type, landing_section: o.landing_section, sections: o.sections, excerpts: chosen.size, claims: o.claims.length,
    estimated_minutes: o.estimated_minutes, split_proposal: o.split_proposal, sources_used: o.sources_used, sources_excluded: [
      ...o.sources_excluded, ...fetched.filter((f) => !f.ok && !o.sources_excluded.some((x) => x.url === f.url)).map((f) => ({ url: f.url, reason: `${f.status} ${f.note ?? ""}`.trim() })),
    ], gaps: o.gaps, self_check: `ID 검증: 발췌 ${chosen.size} · claims ${o.claims.length} · 구성안 참조 ${outlineRefs.length} 전부 유효${usedBlocks.size ? ` · 이미 쓴 문단 ${usedBlocks.size}개 제외 (${priorNotes.join(" · ")})` : ""}`, notes: o.notes,
  };
  return { design, model: r.model, costUsd: r.listCostUsd ?? 0, tokens: (r.raw as { usage?: unknown } | undefined)?.usage, fetched };
}
