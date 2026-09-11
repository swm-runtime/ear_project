import fs from "node:fs/promises";
import path from "node:path";
import { cfg } from "../config.js";
import { insertRun, setJobProgress, updateJobPayload, type Job } from "../db.js";
import { executedBy } from "../config.js";
import { workerRev } from "../assets.js";
import { RetryLater } from "../util.js";
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
export interface WriteOut { title: string; one_liner?: string; script: string; sections_followed: boolean; turn_claims: { turn: string; claims: string[] }[]; bridges: { turn: string; note: string }[]; terms?: { term: string; turn: string; explained_by: string }[]; pronunciations_added: { term: string; reading: string }[]; self_check_fixes: string[]; notes: string }

export interface TwoStageArgs {
  job: Job; ex: Executor; episodeId: string; candidate: BacklogCandidate; dir: string; rel: string;
  assetRoot: string; promptVersion: string; templates: Templates | null; majorTopic?: string;
  introStyle: (typeof INTRO_STYLES)[number]; fileTools: string[];
  signoffSeed?: number;
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
  const prompt = buildWritePrompt({ episodeId, candidate: cand, introStyle: a.introStyle, promptVersion: a.promptVersion, templates: a.templates, majorTopic: a.majorTopic, signoffSeed: a.signoffSeed, estimatedMinutes, guidelines, specScript, goldFullEum, goldFullYuna, sourcesMd, claimsMd, outlineMd, pronunciationsJson });
  log(`  draft ${episodeId} · 2/2 대본 (단발, 프롬프트 ${Math.round(prompt.length / 1000)}K자)`);
  let w: Awaited<ReturnType<typeof ex.run<WriteOut>>>;
  try {
    w = await runWrite();
  } catch (e) {
    // 대본이 실패해도 설계는 끝나 있다 — 비용을 runs 에 남기고(안 남기면 실패 편의 설계 비용이 사라진다), 실행기 시간 초과·결과 없음은 한 번 다시 집는다.
    // 설계 산출물이 디렉토리에 있으므로 다음 집기는 대본만 다시 돈다 (designDone 분기). 두 번째도 실패면 초안 실패 복귀(onDraftFailed)
    const msg = String((e as Error)?.message ?? e);
    if (design) await insertRun({ backlog_id: cand.id, phase: "draft", attempt: 1, result: `설계만 완료(대본 실패: ${msg.slice(0, 160)}) — ${designSummary}`, prompt_version: `${a.promptVersion} (worker)`, artifacts: [], executed_by: executedBy, model: designModel, cost_usd: designCost, tokens: designTokens, worker_rev: workerRev() }).catch(() => {});
    const transient = /결과 없음|exit 143|timeout|ECONNRESET|rate limit|overloaded/i.test(msg);
    if (transient && !job.payload.write_retried) {
      await updateJobPayload(job.id, { write_retried: true }).catch(() => {});
      throw new RetryLater(`${episodeId} 대본 호출 실패(일시적) — 설계 산출물을 두고 잠시 후 대본만 다시: ${msg.slice(0, 120)}`, 60_000);
    }
    throw e;
  }
  async function runWrite() { return ex.run<WriteOut>({
    prompt, schema: WRITE_SCHEMA,
    tools: [], allowedTools: [], cwd: cfg.workRoot, timeoutMs: 60 * 60_000, model: cfg.draftWriteModel, maxThinkingTokens: cfg.thinkingWrite, effort: cfg.effortWrite, // 60분 — opus 대본 실측 30분+ (2026-09-09)
    onProgress: (pr) => setJobProgress(job.id, { ...pr, phase: "대본 2/2 — 단발 작성", detail: pr.turns > 0 ? "대본 작성 중 (도구 없음)" : pr.detail }).catch(() => {}),
  }); }
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
    "## 용어 풀이 (규칙 24 — 어디서 풀었나)",
    ...((o.terms ?? []).length ? (o.terms ?? []).map((t) => `- ${t.term} · ${t.turn} → ${t.explained_by}`) : ["- 없음"]), "",
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
  const summary = `${episodeId} 초안 완료 (2단계 · ${ex.kind}, 도입 ${a.introStyle.label}, 템플릿 ${a.templates?.version ?? "미적용"}). ${designSummary}. 대본: "${o.title}" ${stats.turns}턴·${stats.chars}자·약 ${stats.minutes}분 · claims 대응 턴 ${o.turn_claims.length} · 새 연결 ${o.bridges.length} · 자기 점검 수정 ${o.self_check_fixes.length}건 · 구간 준수 ${o.sections_followed ? "예" : "아니오"}. 비용 설계 $${designCost.toFixed(2)} + 대본 $${writeCost.toFixed(2)} (effort ${cfg.effortDesign ?? "기본"}/${cfg.effortWrite ?? "기본"}). ${o.notes}`;
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
/** @param opts.signoffHeads 템플릿 클로징 인사 골격들의 고정 머리(첫 {슬롯} 앞 문구, tpl-v2). 있으면 마지막 턴이 진행(Y) 턴이고 그중 하나를 담아야 한다 */
export function twoStageViolations(scriptMd: string, outlineMd: string, opts: { signoffHeads?: string[] } = {}): string[] {
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
  const sentences = (t: string) => (t.replace(/\.{2,}|…/g, " ").match(/[.!?](\s|$)/g)?.length ?? 0); // 말줄임표(뜸, 규칙 7)는 문장 종결로 세지 않는다
  const long = p.turns.filter((t) => t.id?.startsWith("E") && sentences(t.text) >= 7).map((t) => t.id);
  if (long.length) v.push(`해설 턴 ${long.length}개가 7문장 이상 (${long.slice(0, 8).join(", ")}${long.length > 8 ? " …" : ""}) — 한 턴 최대 6문장. 문장을 합치거나 진행 턴의 되물음으로 나눈다`);
  // 귀속 과밀 (guidelines 규칙 20~22, 2026-09-09): 해설 턴 중 귀속 표현이 있는 턴이 60% 를 넘으면 소스 순회로 본다
  // 독후감 화법 (규칙 23): 해설자가 소스를 읽은 경험·감상으로 말하는 턴
  const reader = p.turns.filter((t) => t.id?.startsWith("E") && /(읽어보니|읽다가|읽었어요|읽으면서|읽고 나서|읽어 봤|읽어봤|부분에서 멈췄|대목에서 멈췄|인상적이었|인상적이에요|인상 깊|와닿았|저도 그렇게 읽)/.test(t.text)).map((t) => t.id);
  if (reader.length) v.push(`해설 턴 ${reader.length}개가 읽은 경험·감상으로 말함 (${reader.slice(0, 8).join(", ")}) — 해설자는 독자가 아니라 아는 사람이다. 내용을 직접 말한다 (규칙 23)`);
  // 클로징 인사 (tpl-v2, 2026-09-09): 정리 턴 뒤 진행 담당의 인사 턴으로 끝나야 한다 — 골격 무변형은 QA 항목 5, 여기서는 위치·화자·머리 문구만
  const heads = (opts.signoffHeads ?? []).map((h) => h.replace(/\s+/g, " ").trim()).filter(Boolean);
  if (heads.length) {
    const last = p.turns[p.turns.length - 1];
    const text = last?.text.replace(/\s+/g, " ") ?? "";
    if (!last?.id?.startsWith("Y")) v.push(`마지막 턴이 진행(Y) 턴이 아님 (${last?.id ?? "없음"}) — 해설 정리 뒤 진행 담당의 클로징 인사 1턴("${heads[0]} …")으로 끝나야 한다 (tpl-v2, spec/04 4장)`);
    else if (!heads.some((h) => text.includes(h))) v.push(`마지막 턴 ${last.id}에 클로징 인사 골격("${heads[0]}"${heads.length > 1 ? ` 외 ${heads.length - 1}종` : ""})이 없음 — 템플릿 골격 그대로 {슬롯}만 채운다 (tpl-v2)`);
  }
  // 통계 용어 (규칙 24, full-v6 2026-09-09): 논문 결과 문장의 직역 — 판정 3편 공통 사유 "너무 어려움". 말로 옮기게 재생성
  const statRe = /(유의하|유의미|유의했|유의한|상호작용\s?효과|매개\s?(효과|분석|변인)|매개했|매개하|정적\s?(관계|상관)|부적\s?(관계|상관)|변인|효과\s?크기|표본\s?크기|회귀\s?계수|조절\s?효과|조절하지 않|조절했|통제\s?조건|통제\s?집단)/; // "상호작용" 단독은 일상어라 제외
  const stat = p.turns.filter((t) => t.id?.startsWith("E") && statRe.test(t.text)).map((t) => t.id);
  if (stat.length) v.push(`해설 턴 ${stat.length}개에 통계 용어(유의·매개·정적/부적 관계·변인·효과 크기) (${stat.slice(0, 8).join(", ")}) — 말로 옮긴다: "같이 움직였다", "~할수록 ~했다", "A 가 B 를 거쳐 C 로" (규칙 24)`);
  // 뜸 부재 (규칙 7, 판정 3편 A7 전부 동의 "수정 필요"): 해설 턴이 말줄임표 없이 열 턴 넘게 이어지면 낭독
  const eTurns = p.turns.filter((t) => t.id?.startsWith("E"));
  let gap = 0, maxGap = 0, gapEnd: string | null = null;
  for (const t of eTurns) { if (/\.{3}|…/.test(t.text)) gap = 0; else { gap++; if (gap > maxGap) { maxGap = gap; gapEnd = t.id; } } }
  if (maxGap >= 10) v.push(`해설 턴 ${maxGap}개가 연속으로 뜸(말줄임표) 없이 이어짐 (${gapEnd} 까지) — 긴 해설 구간에 문장 중간 뜸 "..." 을 둔다 (규칙 7). 낭독이 아니라 말이어야 한다`);
  // 골드 특유 문구 (골드 사용법·루브릭 G1, 판정 3편 전부 동의): 자리째 복제 틀이 2회 이상이면 재생성
  // full-v6.2 (판정 3편 G1 동의 11건): 문장이 골드에서 그대로 온 것은 1턴이어도 수정 — "자리까지 막기는 어렵고 완전 복제만 피하면 된다"(판정 부분동의)
  const goldRe = /(그 그림이 [^.。!?]{0,14}(맞|정확|가까|그거)|정확한 표현이|정확히 [^.。!?]{1,14}(핵심|조각|얘기|그거)|한 번쯤 떠올려 보셔도|떠올려 보셔도 좋겠|(해|두|보)셔도 좋겠(습니다|네요)|짧게 모아|모아 볼게요|모아 보면|한번 모아볼까요|한 번 묶어|묶어 주실|그런데 (윤아|이음)님은 어떠세요|솔직히 반반|예리하세요|반만 맞(았|아)|그 감각이 [^.。!?]{0,12}(정확|맞|핵심|통해|방향)|그 정리가 맞아요)/;
  const gold = p.turns.filter((t) => goldRe.test(t.text)).map((t) => t.id ?? "?");
  if (gold.length >= 1) v.push(`골드 특유 문구가 ${gold.length}턴 (${gold.slice(0, 6).join(", ")}) — 확인구("반만 맞았어요"·"그 감각이 …"·"그 그림이 …"·"그 정리가 맞아요")·정리 진입("…짧게 모아 보면요")·마무리 마지막 문장 틀("~해 보셔도 좋겠습니다")을 자리째 쓰지 않는다. 같은 기능을 새 문장으로 (골드 사용법)`);
  // 귀속 연속 (규칙 22, full-v6.2 — 판정 3편 A9 전부 동의, T260910-013 은 한 저자 글을 11턴 연속 옮김): 귀속 동사로 닫히는 해설 턴이 4턴 연속이면 책 소개다
  // full-v6.3: "동사로 끝남" 대신 "귀속 표현이 든 턴"으로 세고 5연속 — 018 은 E15~E18 이 전부 전언인데 E18 이 "거예요"로 끝나 4연속에서 끊겼다
  let run = 0, maxRun = 0, runEnd: string | null = null;
  for (const t of eTurns) { if (attributionRe.test(t.text)) { run++; if (run > maxRun) { maxRun = run; runEnd = t.id; } } else run = 0; }
  if (maxRun >= 5) v.push(`해설 턴 ${maxRun}개가 연속으로 귀속 표현("~라고요"·"~라고 해요"·"~라고 불러요"·"그가 말하는 건")을 담음 (${runEnd} 까지) — 한 소스를 옮겨 적는 구간이다. 소스가 말한 것을 해설자가 아는 것으로 바꾸어 말하고, 귀속은 직접 인용·수치·특정인 의견에만 (규칙 20~23)`);
  // 제작 용어 누설 (골드 사용법, full-v6.3 — T260910-020 "저는 그 번역이 맞다고 봅니다")
  const leak = p.turns.filter((t) => /(그|이) 번역이|번역이 (맞|정확)|번역 맞장구|이 구간에서|구간 #|발췌에|클레임|골드 예시/.test(t.text)).map((t) => t.id ?? "?");
  if (leak.length) v.push(`제작 용어가 대사에 새어 나옴 (${leak.slice(0, 6).join(", ")}) — "번역"·"구간"·"발췌"·"클레임"은 규칙 문서의 말이다. 두 사람의 말로 바꾼다`);
  // 한글로 풀어 쓴 세 자리 이상 정확한 수 (규칙 24, full-v6.3 — "오백일흔다섯 명"은 듣기에 어색). 반올림해 말한다
  const numRe = /[일이삼사오육칠팔구]?(백|천)\s?(?:[일이삼사오육칠팔구]?십[일이삼사오육칠팔구]?|[일이삼사오육칠팔구]백[일이삼사오육칠팔구십]*|(?:스물|서른|마흔|쉰|예순|일흔|여든|아흔)(?:하나|둘|셋|넷|다섯|여섯|일곱|여덟|아홉)?)/; // "오백일흔다섯"·"삼백쉰일곱"·"천구백구십"
  const nums = p.turns.filter((t) => t.id?.startsWith("E") && numRe.test(t.text.replace(/이천[일이삼사오육칠팔구십]*년/g, ""))).map((t) => t.id);
  if (nums.length >= 2) v.push(`해설 턴 ${nums.length}개가 세 자리 이상 수를 한글로 정확히 풀어 읽음 (${nums.slice(0, 6).join(", ")}) — "약 육백 명"처럼 반올림한다. 정확한 수가 축에 필요한 자리만 예외 (규칙 24)`);
  // "오늘 얘기" 틀 반복 (규칙 16 문어 은유, full-v6.2 — T260910-013 E2·E7·E12·E42 "오늘 얘기가/오늘의 출발점/오늘 얘기의 두 갈래/오늘 얘기를 한 줄로")
  const todayRe = /오늘(의)? (얘기|이야기|출발점|주제)/;
  const today = eTurns.filter((t) => todayRe.test(t.text));
  if (today.length >= 4) v.push(`해설 턴 ${today.length}개가 "오늘 얘기/오늘의 출발점" 틀로 위치를 잡음 (${today.slice(0, 6).map((t) => t.id).join(", ")}) — 같은 틀 세 번이면 각본이다. 내용으로 잇는다 (규칙 16)`);
  const a = attributionStats(p.turns);
  if (a.eTurns >= 10 && a.ratio > 0.5) v.push(`해설 턴 ${a.eTurns}개 중 ${a.attributed}개(${Math.round(a.ratio * 100)}%)에 귀속 표현("~에 따르면"·"라고 합니다"·"이 글/기사는"·매체명)이 있음 — 절반 초과, 소스 순회. 개념·원리·정의는 해설자의 말로 바꾸고, 이름은 근거 앵커·직접 인용에만 (규칙 20~22)`);
  return v;
}

/** 귀속 표현 — 규칙 22 의 자기 점검 지표. 매체·저자 고유명은 알 수 없으니 전언·지시 표현으로 잰다 */
const attributionRe = /(에 따르면|라고 합니다|라고 해요|라고 하는데요|고 합니다|고 해요|다고 적|라고요|다고요|냐고요|라고 불러요|라고 부르|라고 썼|라고 써요|썼어요|씁니다|말을 남겼|문장이 있어요|문장을 남겼|가 말하는 건|가 말하기를|이 말하는 건|라고 봤|라고 봅니다|라고 믿|라고 주장|내놓는 처방|내놓은|이 글|그 글|이 기사|그 기사|같은 글|같은 기사|아까 그|저자는|저자가|필자는|연구진은|연구진이|연구팀은|연구자는|연구자도|기사는|글은|글에서|기사에서|논문에서|보고서에서|책에서)/; // full-v6.3: "~라고요"·"라고 불러요"·"그가 말하는 건"을 못 세어 전언 68% 대본(T260910-018)을 통과시켰다
/** 귀속 표현이 있는 해설 턴의 비율 */
export function attributionStats(turns: { id: string | null; text: string }[]): { eTurns: number; attributed: number; ratio: number } {
  const e = turns.filter((t) => t.id?.startsWith("E"));
  const attributed = e.filter((t) => attributionRe.test(t.text)).length;
  return { eTurns: e.length, attributed, ratio: e.length ? attributed / e.length : 0 };
}
