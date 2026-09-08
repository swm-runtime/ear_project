import fs from "node:fs/promises";
import path from "node:path";
import { cfg } from "../config.js";
import { setJobProgress, type Job } from "../db.js";
import type { Executor } from "../executors/index.js";
import { assetPaths, buildDesignPrompt, buildWritePrompt, DESIGN_SCHEMA, WRITE_SCHEMA, type BacklogCandidate, type INTRO_STYLES, type Templates } from "@ear/pipeline";
import { exists, hostOf, log } from "../util.js";
import { parseScriptForTts } from "../tts/script.js";
import { runDesignSingle } from "./design-single.js";

/**
 * 초안 2단계 (2026-09-08 — "축이 이끄는 파이프라인" ③, spec/04 2장).
 *   1단계 설계 — 에이전트 실행(WebFetch·파일 쓰기): 원문 정독 → sources.md(넉넉한 발췌)·claims.md·outline.md(구성안)·pronunciations.json
 *   2단계 대본 — **단발 호출**(도구 없음, 입력 전부 인라인): 원문을 보지 못한 채 발췌·claims·구성안만으로 대본을 한 번에 돌려준다.
 *     → 발췌 밖 주장의 통로(원문 기억·귀속 밀림)를 구조로 막고, 턴마다 문맥을 다시 읽는 에이전트 루프 비용을 없앤다.
 * 산출물 파일은 워커가 쓴다(script.md · script-notes.md · pronunciations.json 병합). 이후 L0·QA·비평 연쇄는 구 방식과 같다.
 * 설계 산출물이 이미 있으면(재집기·2단계만 실패) 설계를 건너뛴다.
 */
export interface DesignOut { axis: string; axis_type: string; landing_section: number; sections: { n: number; title: string; sources: string[]; ratio: number }[]; excerpts: number; claims: number; estimated_minutes: number; split_proposal: string; sources_used: string[]; sources_excluded: { url: string; reason: string }[]; gaps: string[]; self_check: string; notes: string }
export interface WriteOut { title: string; script: string; sections_followed: boolean; turn_claims: { turn: string; claims: string[] }[]; bridges: { turn: string; note: string }[]; pronunciations_added: { term: string; reading: string }[]; self_check_fixes: string[]; notes: string }

export interface TwoStageArgs {
  job: Job; ex: Executor; episodeId: string; candidate: BacklogCandidate; dir: string; rel: string;
  assetRoot: string; promptVersion: string; templates: Templates | null; majorTopic?: string;
  introStyle: (typeof INTRO_STYLES)[number]; fileTools: string[];
}
export interface TwoStageResult { summary: string; model: string | null; costUsd: number; tokens: unknown; design: DesignOut | null; write: WriteOut; stats: { turns: number; chars: number; minutes: number } }

const DESIGN_FILES = ["sources.md", "claims.md", "outline.md"] as const;

export async function runTwoStageDraft(a: TwoStageArgs): Promise<TwoStageResult> {
  const { job, ex, episodeId, candidate: cand, dir, rel } = a;
  const hosts = Array.from(new Set(cand.sources.map((s) => hostOf(s.url)).filter(Boolean)));
  let design: DesignOut | null = null;
  let designCost = 0; let designTokens: unknown = null; let designModel: string | null = null; let designSummary: string;

  // ── 1단계 설계 ────────────────────────────────────────────────────────────────
  const designDone = (await Promise.all(DESIGN_FILES.map((f) => exists(path.join(dir, f))))).every(Boolean);
  if (designDone) {
    log(`  draft ${episodeId}: 설계 산출물이 이미 있음 — 1단계 생략, 2단계(대본)만`);
    designSummary = "설계 이어받기(기존 산출물)";
  } else if (cfg.designMode === "single") {
    log(`  draft ${episodeId} ← ${cand.id} "${cand.title}" · 1/2 설계 (단발, 소스 ${cand.sources.length})`);
    const d = await runDesignSingle({ job, ex, episodeId, candidate: cand, dir, assetRoot: a.assetRoot, promptVersion: a.promptVersion });
    design = d.design; designCost = d.costUsd; designTokens = d.tokens; designModel = d.model;
    designSummary = `설계(단발): 축 [${design.axis_type}] ${design.axis} · 구간 ${design.sections.length} (착지 #${design.landing_section}) · 발췌 ${design.excerpts}·claims ${design.claims} · 예상 ${design.estimated_minutes}분 · 본문 ${d.fetched.filter((f) => f.ok).length}/${d.fetched.length}${design.gaps.length ? ` · 빈 역할 ${design.gaps.join("/")}` : ""}${design.sources_excluded.length ? ` · 제외 ${design.sources_excluded.map((x) => `${hostOf(x.url)} ${x.reason}`).join("; ").slice(0, 200)}` : ""}${design.split_proposal ? ` · ⚠ 분할 제안: ${design.split_proposal.slice(0, 200)}` : ""}`;
  } else {
    const prompt = buildDesignPrompt({ assetRoot: a.assetRoot, workRoot: cfg.workRoot, episodeId, candidate: cand, promptVersion: a.promptVersion });
    log(`  draft ${episodeId} ← ${cand.id} "${cand.title}" · 1/2 설계 (소스 ${cand.sources.length})`);
    const r = await ex.run<DesignOut>({
      prompt, schema: DESIGN_SCHEMA,
      allowedTools: ["Read", ...hosts.map((h) => `WebFetch(domain:${h})`), ...a.fileTools],
      addDirs: [dir, a.assetRoot], cwd: cfg.workRoot, timeoutMs: 60 * 60_000, model: cfg.draftDesignModel,
      onProgress: (pr) => setJobProgress(job.id, { ...pr, phase: "설계 1/2 — 정독·발췌·구성안" }).catch(() => {}),
      describe: (tool, input, counts) => {
        if (tool === "WebFetch") return `소스 정독 ${counts.WebFetch}/${cand.sources.length}`;
        const f = String(input?.file_path ?? "").split("/").pop() ?? "";
        if (tool === "Write" || tool === "Edit") return f === "outline.md" ? "구성안 작성" : f === "sources.md" ? "발췌 정리" : f === "claims.md" ? "claims 대조표 작성" : f === "pronunciations.json" ? "발음 맵 작성" : `${f} 작성`;
        if (tool === "Bash") return "자기 점검 (ID 대조)";
        return null;
      },
    });
    design = r.output; designCost = r.listCostUsd ?? 0; designTokens = (r.raw as { usage?: unknown } | undefined)?.usage; designModel = r.model;
    const missing: string[] = [];
    for (const f of DESIGN_FILES) if (!(await exists(path.join(dir, f)))) missing.push(f);
    if (missing.length) throw new Error(`설계 산출물 누락: ${missing.join(", ")} — 모델은 완료 보고를 냈으나 파일 없음 (turns=${r.numTurns ?? "?"}, notes="${design.notes.slice(0, 160)}")`);
    if (design.estimated_minutes && design.estimated_minutes < 13) {
      throw new Error(`재료 부족 — 설계 예상 분량 ${design.estimated_minutes}분 < 하한 13분. ${design.notes.slice(0, 200)}`);
    }
    designSummary = `설계: 축 [${design.axis_type}] ${design.axis} · 구간 ${design.sections.length} (착지 #${design.landing_section}) · 발췌 ${design.excerpts}·claims ${design.claims} · 예상 ${design.estimated_minutes}분${design.gaps.length ? ` · 빈 역할 ${design.gaps.join("/")}` : ""}${design.sources_excluded.length ? ` · 제외 ${design.sources_excluded.map((x) => `${hostOf(x.url)} ${x.reason}`).join("; ").slice(0, 200)}` : ""}${design.split_proposal ? ` · ⚠ 분할 제안: ${design.split_proposal.slice(0, 200)}` : ""}`;
  }

  // ── 2단계 대본 (단발) ─────────────────────────────────────────────────────────
  const ap = assetPaths(a.assetRoot, cfg.workRoot);
  const read = (p: string) => fs.readFile(p, "utf8");
  const [guidelines, specScript, goldFullEum, goldFullYuna, sourcesMd, claimsMd, outlineMd] = await Promise.all([
    read(ap.guidelines), read(ap.specScript), read(ap.goldFullEum), read(ap.goldFullYuna),
    read(path.join(dir, "sources.md")), read(path.join(dir, "claims.md")), read(path.join(dir, "outline.md")),
  ]);
  const pronFile = path.join(dir, "pronunciations.json");
  const pronunciationsJson = (await exists(pronFile)) ? await read(pronFile) : "{}";
  const estimatedMinutes = design?.estimated_minutes || Number(outlineMd.match(/^예상 분량:\s*(\d+(?:\.\d+)?)\s*분/m)?.[1]) || 15; // 설계 이어받기면 outline.md 에서 읽는다
  const prompt = buildWritePrompt({ episodeId, candidate: cand, introStyle: a.introStyle, promptVersion: a.promptVersion, templates: a.templates, majorTopic: a.majorTopic, estimatedMinutes, guidelines, specScript, goldFullEum, goldFullYuna, sourcesMd, claimsMd, outlineMd, pronunciationsJson });
  log(`  draft ${episodeId} · 2/2 대본 (단발, 프롬프트 ${Math.round(prompt.length / 1000)}K자)`);
  const w = await ex.run<WriteOut>({
    prompt, schema: WRITE_SCHEMA,
    tools: [], allowedTools: [], cwd: cfg.workRoot, timeoutMs: 30 * 60_000, model: cfg.draftWriteModel, maxThinkingTokens: cfg.thinkingWrite,
    onProgress: (pr) => setJobProgress(job.id, { ...pr, phase: "대본 2/2 — 단발 작성", detail: pr.turns > 0 ? "대본 작성 중 (도구 없음)" : pr.detail }).catch(() => {}),
  });
  const o = w.output;
  if (!o.script || !/## \[인트로\]/.test(o.script)) throw new Error(`2단계 대본이 비었거나 구역 헤더가 없음 (script ${o.script?.length ?? 0}자). notes="${(o.notes ?? "").slice(0, 200)}"`);

  // 산출물은 워커가 쓴다 — 모델이 파일을 안 쓰는 사고(산출물 누락)가 구조적으로 사라진다
  await fs.writeFile(path.join(dir, "script.md"), o.script.trim() + "\n", "utf8");
  const notes = [
    `# script-notes — ${episodeId}`, "",
    `> 2단계 대본 완료 보고 (워커 기록). 연결·비유는 사실이 아니며 QA 대상이 아니다 — 비평(critic)이 본다.`, "",
    "## 새 연결·비유 (구성안에 없던 것)",
    ...(o.bridges.length ? o.bridges.map((b) => `- ${b.turn} · ${b.note}`) : ["- 없음"]), "",
    "## 자기 점검 수정",
    ...(o.self_check_fixes.length ? o.self_check_fixes.map((f) => `- ${f}`) : ["- 없음"]), "",
    "## 해설 턴별 사용 claims",
    "| 턴 | claims |", "|---|---|",
    ...o.turn_claims.map((t) => `| ${t.turn} | ${t.claims.join(", ")} |`), "",
    `## 메모`, o.notes, "",
  ].join("\n");
  await fs.writeFile(path.join(dir, "script-notes.md"), notes, "utf8");
  if (o.pronunciations_added.length) {
    let cur: Record<string, string> = {};
    try { cur = JSON.parse(pronunciationsJson); } catch { cur = {}; }
    for (const p of o.pronunciations_added) if (p.term.trim() && p.reading.trim() && !(p.term in cur)) cur[p.term] = p.reading;
    await fs.writeFile(pronFile, JSON.stringify(cur, null, 2) + "\n", "utf8");
  }

  const stats = scriptStats(o.script);
  const writeCost = w.listCostUsd ?? 0;
  const summary = `${episodeId} 초안 완료 (2단계 · ${ex.kind}, 도입 ${a.introStyle.label}, 템플릿 ${a.templates?.version ?? "미적용"}). ${designSummary}. 대본: "${o.title}" ${stats.turns}턴·${stats.chars}자·약 ${stats.minutes}분 · claims 대응 턴 ${o.turn_claims.length} · 새 연결 ${o.bridges.length} · 자기 점검 수정 ${o.self_check_fixes.length}건 · 구간 준수 ${o.sections_followed ? "예" : "아니오"}. 비용 설계 $${designCost.toFixed(2)} + 대본 $${writeCost.toFixed(2)}. ${o.notes}`;
  return {
    summary, model: w.model ?? designModel, costUsd: designCost + writeCost,
    tokens: { design: designTokens, write: (w.raw as { usage?: unknown } | undefined)?.usage, design_model: designModel, write_model: w.model },
    design, write: o, stats,
  };
}

/** 공백·기호 제외 글자 수·턴 수·분량 환산 (350자/분) — 모델 자기보고 대신 워커가 센다 */
export function scriptStats(md: string): { turns: number; chars: number; minutes: number } {
  const p = parseScriptForTts(md);
  const chars = p.turns.reduce((n, t) => n + (t.text.match(/[가-힣A-Za-z0-9]/g)?.length ?? 0), 0);
  return { turns: p.turns.length, chars, minutes: Math.round((chars / 350) * 10) / 10 };
}

/** 2단계 L0 — 구성안 계약(구간 수·순서)과 분량 하한(13분 ≈ 4,000자)을 기계로 검사한다. 위반은 재생성 연쇄로 */
export function twoStageViolations(scriptMd: string, outlineMd: string): string[] {
  const v: string[] = [];
  const planned = [...outlineMd.matchAll(/^구간 #(\d+)/gm)].map((m) => Number(m[1]));
  const written = [...scriptMd.matchAll(/^### #(\d+)/gm)].map((m) => Number(m[1]));
  if (planned.length && written.length !== planned.length) v.push(`구성안 구간 ${planned.length}개인데 대본의 "### #n" 헤더가 ${written.length}개 — 구간 계약 위반 (outline.md 순서대로 전 구간을 써야 한다)`);
  else if (planned.length && written.some((n, i) => n !== planned[i])) v.push(`구간 번호 순서가 구성안과 다름 (구성안 ${planned.join(",")} / 대본 ${written.join(",")})`);
  const s = scriptStats(scriptMd);
  if (s.chars < 4000) v.push(`분량 ${s.chars}자(약 ${s.minutes}분) — 하한 13분(약 4,000자) 미달. 채우기 없이 구성안 재료(예비 재료·역사 맥락)를 더 실행해 늘린다`);
  // 과다 분량: 설계 예상의 1.6배를 넘으면 풀어 쓰기가 길어진 것 (T260908-001: 예상 17분 → 31분). 초과 구간의 긴 해설 턴을 줄이는 방향으로 재생성
  const est = Number(outlineMd.match(/^예상 분량:\s*(\d+(?:\.\d+)?)\s*분/m)?.[1]);
  if (est && s.minutes > est * 1.6) v.push(`분량 ${s.chars}자(약 ${s.minutes}분) — 구성안 예상 ${est}분의 1.6배 초과. 재료를 빼지 말고 해설 턴의 풀어 쓰기를 줄여 예상 분량(±15%)에 맞춘다 (긴 턴부터: 7문장 이상 턴, 같은 말의 재서술)`);
  // 해설 턴 길이: 규격은 평균 2~5문장 — 7문장 이상 턴은 낭독 호흡이 무너진다
  const p = parseScriptForTts(scriptMd);
  const long = p.turns.filter((t) => t.id?.startsWith("E") && (t.text.match(/[.!?…]+(\s|$)/g)?.length ?? 0) >= 7).map((t) => t.id);
  if (long.length) v.push(`해설 턴 ${long.length}개가 7문장 이상 (${long.slice(0, 8).join(", ")}${long.length > 8 ? " …" : ""}) — 한 턴 최대 6문장. 문장을 합치거나 진행 턴의 되물음으로 나눈다`);
  return v;
}
