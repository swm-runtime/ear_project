import fs from "node:fs/promises";
import path from "node:path";
import { cfg } from "../config.js";
import { setJobProgress, type Job } from "../db.js";
import type { Executor } from "../executors/index.js";
import { assetPaths, buildRevisionPromptInlineParts, REVISION_INLINE_SCHEMA } from "@ear/pipeline";
import { exists, log } from "../util.js";

/**
 * 수정 재생성 단발 (2026-09-09 비용 절감): QA·L0 지적을 받은 대본을 한 번의 호출로 고친다. 모델은 바꿀 턴의 전문만 돌려주고,
 * 워커가 script.md 의 해당 턴 줄을 통째로 치환한다(after 가 비면 줄 삭제). claims.md 끝에 "QA attempt N 반영" 절, 발음 맵 병합도 워커가 쓴다.
 * 에이전트 방식(Read·Edit·python 루프)은 긴 턴 2개 고치는 데 $1.92 였다(T260909-002).
 */
export interface RevisionInlineOut { fixes: { turn: string; before: string; after: string; why: string; claims?: string[] }[]; pronunciations_added: { term: string; reading: string }[]; claims_note: string; notes: string }

/**
 * script-notes.md 의 턴별 claims 표를 수정 결과로 갱신한다 (2026-09-15, T260915-007): 수정이 턴에서 claim 문장을 지워도 표가 그대로면
 * L0 "구간 밖 사용"이 같은 턴을 계속 잡아 L0 수정 한도(2회)에서 실패한다. 표 행 `| E4 | C01, C20 |` 를 모델이 보고한 남은 claims 로 바꾸고, 지운 턴은 행을 없앤다
 */
export function updateNotesClaims(notesMd: string, fixes: { turn: string; after: string; claims?: string[] }[]): string {
  const lines = notesMd.split("\n");
  for (const f of fixes) {
    if (!f.claims) continue; // 구 스키마 응답 — 표를 건드리지 않는다
    const id = f.turn.trim().toUpperCase().replace(/[^EY0-9]/g, "");
    const ids = [...new Set(f.claims.map((c) => c.trim().toUpperCase()).filter((c) => /^C\d{2,3}$/.test(c)))];
    const row = ids.length ? `| ${id} | ${ids.join(", ")} |` : null;
    const idx = lines.findIndex((l) => new RegExp(`^\\|\\s*${id}\\s*\\|`).test(l));
    if (!f.after.trim() || !row) { if (idx >= 0) lines.splice(idx, 1); continue; }
    if (idx >= 0) lines[idx] = row;
    else { const last = lines.map((l, i) => (/^\|\s*[EY]\d+\s*\|/.test(l) ? i : -1)).filter((i) => i >= 0).pop(); if (last !== undefined) lines.splice(last + 1, 0, row); else lines.push(row); }
  }
  return lines.join("\n");
}

export async function runRevisionSingle(a: { job: Job; ex: Executor; episodeId: string; dir: string; assetRoot: string; attempt: number; qaFailures: { location: string; item: string; reason: string }[] }):
  Promise<{ output: { fixes: { location: string; before: string; after: string }[]; notes: string }; model: string | null; costUsd: number; tokens: unknown; unmatched: string[] }> {
  const { job, ex, episodeId, dir, attempt } = a;
  const read = (p: string) => fs.readFile(p, "utf8");
  const ap = assetPaths(a.assetRoot, cfg.workRoot);
  const outlineFile = path.join(dir, "outline.md"); const pronFile = path.join(dir, "pronunciations.json");
  const [guidelines, scriptMd, claimsMd, sourcesMd] = await Promise.all([read(ap.guidelines), read(path.join(dir, "script.md")), read(path.join(dir, "claims.md")), read(path.join(dir, "sources.md"))]);
  const outlineMd = (await exists(outlineFile)) ? await read(outlineFile) : null;
  const pronunciationsJson = (await exists(pronFile)) ? await read(pronFile) : "{}";
  // 입력 축소 (2026-09-16 비용): 수정 재생성은 입력이 비용의 82% — 지적된 턴의 claims 와 그 발췌만 보낸다. 전체가 필요한 지적(분량·전역 규칙)이면 전부 보낸다
  const notesMd = (await exists(path.join(dir, "script-notes.md"))) ? await read(path.join(dir, "script-notes.md")) : "";
  const trimmed = trimMaterialsForFixes(a.qaFailures, scriptMd, claimsMd, sourcesMd, notesMd);
  const parts = buildRevisionPromptInlineParts({ episodeId, attempt, qaFailures: a.qaFailures, guidelines, scriptMd, claimsMd: trimmed.claimsMd, sourcesMd: trimmed.sourcesMd, outlineMd, pronunciationsJson });
  if (trimmed.note) log(`  draft(revision ${attempt}) ${episodeId}: ${trimmed.note}`);
  log(`  draft(revision ${attempt}) ${episodeId}: 지적 ${a.qaFailures.length}건 단발 수정 (공유 ${Math.round(parts.system.length / 1000)}K + 편별 ${Math.round(parts.user.length / 1000)}K자)`);
  const r = await ex.run<RevisionInlineOut>({
    prompt: parts.user, systemPrompt: parts.system, schema: REVISION_INLINE_SCHEMA, tools: [], allowedTools: [], cwd: cfg.workRoot, timeoutMs: 20 * 60_000, model: cfg.revisionModel, maxThinkingTokens: cfg.thinkingRevision, effort: cfg.effortRevision,
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
    applied.push({ location: f.turn, ...changeWindow(before, f.after.trim()) });
  }
  if (!applied.length && o.fixes.length) throw new Error(`수정 턴을 대본에서 찾지 못함: ${unmatched.join(", ")} — 턴 번호 형식 확인`);
  await fs.writeFile(path.join(dir, "script.md"), lines.join("\n"), "utf8");
  const notesFile = path.join(dir, "script-notes.md");
  if (await exists(notesFile)) await fs.writeFile(notesFile, updateNotesClaims(await read(notesFile), o.fixes.filter((f) => !unmatched.includes(f.turn))), "utf8");
  if (o.claims_note.trim()) await fs.writeFile(path.join(dir, "claims.md"), `${claimsMd.trimEnd()}\n\n## QA attempt ${attempt - 1} 반영 (단발 수정)\n\n${o.claims_note.trim()}\n${unmatched.length ? `\n(대본에서 못 찾은 턴: ${unmatched.join(", ")})\n` : ""}`, "utf8");
  if (o.pronunciations_added.length) {
    let cur: Record<string, string> = {}; try { cur = JSON.parse(pronunciationsJson); } catch { cur = {}; }
    for (const p of o.pronunciations_added) if (p.term.trim() && p.reading.trim() && !(p.term in cur)) cur[p.term] = p.reading;
    await fs.writeFile(pronFile, JSON.stringify(cur, null, 2) + "\n", "utf8");
  }
  return { output: { fixes: applied, notes: `${o.notes}${unmatched.length ? ` · 못 찾은 턴 ${unmatched.join(", ")}` : ""}` }, model: r.model, costUsd: r.listCostUsd ?? 0, tokens: (r.raw as { usage?: unknown } | undefined)?.usage, unmatched };
}

/**
 * 수정 내역의 전·후를 "바뀐 구간"으로 잘라 돌려준다 (2026-09-16): 앞 80자만 담던 방식은 턴 중간의 수정(귀속 표현 삭제 등)이 전·후 동일로 보여
 * QA 2회차의 해소 확인이 빈 diff 를 받았다. 공통 앞·뒤를 걷어내고 좌우 40자를 붙인다. 완전히 같으면 "(변경 없음)"
 */
export function changeWindow(before: string, after: string, ctx = 40): { before: string; after: string } {
  if (before === after) return { before: "(변경 없음)", after: "(변경 없음)" };
  let p = 0; const max = Math.min(before.length, after.length);
  while (p < max && before[p] === after[p]) p++;
  let s = 0;
  while (s < max - p && before[before.length - 1 - s] === after[after.length - 1 - s]) s++;
  const cut = (str: string) => { const start = Math.max(0, p - ctx), end = Math.min(str.length, str.length - s + ctx); return `${start > 0 ? "…" : ""}${str.slice(start, end)}${end < str.length ? "…" : ""}`; };
  return { before: cut(before), after: cut(after) };
}

/**
 * 수정 재생성 입력 축소 (2026-09-16): 지적된 턴(location·reason 의 E/Y 번호, "E7~E8" 범위 포함)이 쓰는 claims 행과 그 발췌 ID 의 소스 줄만 남긴다.
 * 소스 머리(발행처·요지)는 전부 두어 블록 구조는 보이게 한다. 분량·전역 지적처럼 턴을 특정할 수 없거나 표를 못 읽으면 전체를 돌려준다(안전 쪽).
 */
export function trimMaterialsForFixes(failures: { location: string; item: string; reason: string }[], scriptMd: string, claimsMd: string, sourcesMd: string, notesMd: string): { claimsMd: string; sourcesMd: string; note: string | null } {
  const full = { claimsMd, sourcesMd, note: null };
  const text = failures.map((f) => `${f.location} ${f.reason}`).join("\n");
  if (/분량|하한|자\(약|전체 재작성|4,?000자/.test(text)) return { ...full, note: "지적에 분량·전역 항목이 있어 재료 전체를 보냄" };
  const ids = new Set<string>();
  for (const m of text.matchAll(/\b([EY])(\d+)\s*[~〜-]\s*(?:[EY])?(\d+)\b/g)) { const a = Number(m[2]), b = Number(m[3]); if (b >= a && b - a <= 40) for (let n = a; n <= b; n++) ids.add(`${m[1]}${n}`); }
  for (const m of text.matchAll(/\b([EY]\d+)\b/g)) ids.add(m[1]);
  if (!ids.size) return { ...full, note: "지적에서 턴을 특정하지 못해 재료 전체를 보냄" };
  // "N턴 연속" 류는 마지막 턴 앞의 해설 턴들도 대상이다
  if (/연속|턴 \d+개/.test(text)) { for (const id of [...ids]) { const m = id.match(/^E(\d+)$/); if (m) for (let n = Math.max(1, Number(m[1]) - 6); n < Number(m[1]); n++) ids.add(`E${n}`); } }
  const claimIds = new Set<string>();
  for (const m of notesMd.matchAll(/^\|\s*([EY]\d+)\s*\|\s*([^|]*)\|/gm)) if (ids.has(m[1])) for (const c of m[2].match(/C\d{2,3}/g) ?? []) claimIds.add(c);
  if (!claimIds.size) return { ...full, note: "지적된 턴의 claims 표가 없어 재료 전체를 보냄" };
  const excerptIds = new Set<string>();
  const claimLines = claimsMd.split("\n").filter((l) => {
    const m = l.match(/^\|\s*(C\d{2,3})\s*\|/);
    if (!m) return !/^\|\s*C\d/.test(l); // 머리·표 헤더는 유지
    if (!claimIds.has(m[1])) return false;
    for (const e of l.match(/S\d+-\d+/g) ?? []) excerptIds.add(e);
    return true;
  });
  const sourceLines = sourcesMd.split("\n").filter((l) => { const m = l.match(/^-\s*(S\d+-\d+):/); return m ? excerptIds.has(m[1]) : true; });
  const claimsOut = `> (수정 재생성용 발췌본 — 지적된 턴 ${[...ids].sort().join(", ")} 이 쓰는 claims ${claimIds.size}행만. 나머지 claims 는 이 수정에서 쓰지 않는다)\n` + claimLines.join("\n");
  const sourcesOut = `> (수정 재생성용 발췌본 — 위 claims 의 발췌 ${excerptIds.size}개만. 소스 머리·요지는 전부 둔다)\n` + sourceLines.join("\n");
  return { claimsMd: claimsOut, sourcesMd: sourcesOut, note: `입력 축소 — 턴 ${ids.size}개 · claims ${claimIds.size}/${(claimsMd.match(/^\|\s*C\d/gm) ?? []).length} · 발췌 ${excerptIds.size} · 재료 ${Math.round((claimsMd.length + sourcesMd.length) / 1000)}K → ${Math.round((claimsOut.length + sourcesOut.length) / 1000)}K자` };
}
