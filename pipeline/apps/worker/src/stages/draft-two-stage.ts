import fs from "node:fs/promises";
import path from "node:path";
import { cfg } from "../config.js";
import { insertRun, setJobProgress, updateJobPayload, type Job } from "../db.js";
import { executedBy } from "../config.js";
import { workerRev } from "../assets.js";
import { ApiLimit, RetryLater } from "../util.js";
import type { Executor } from "../executors/index.js";
import { assetPaths, buildDesignPrompt, buildWritePromptParts, DESIGN_SCHEMA, WRITE_SCHEMA, type BacklogCandidate, type INTRO_STYLES, type Templates } from "@ear/pipeline";
import { exists, hostOf, log } from "../util.js";
import { parseScriptForTts, type ScriptTurn } from "../tts/script.js";
import { runDesignSingle } from "./design-single.js";

/**
 * 초안 2단계 (2026-09-08 — "축이 이끄는 파이프라인" ③, spec/04 2장).
 *   1단계 설계 — 에이전트 실행(WebFetch·파일 쓰기): 원문 정독 → sources.md(넉넉한 발췌)·claims.md·outline.md(구성안)·pronunciations.json
 *   2단계 대본 — **단발 호출**(도구 없음, 입력 전부 인라인): 원문을 보지 못한 채 발췌·claims·구성안만으로 대본을 한 번에 돌려준다.
 *     → 발췌 밖 주장의 통로(원문 기억·귀속 밀림)를 구조로 막고, 턴마다 문맥을 다시 읽는 에이전트 루프 비용을 없앤다.
 * 산출물 파일은 워커가 쓴다(script.md · script-notes.md · pronunciations.json 병합). 이후 L0·QA·비평 연쇄는 구 방식과 같다.
 * 설계 산출물이 이미 있으면(재집기·2단계만 실패) 설계를 건너뛴다.
 */
export interface DesignOut { axis: string; axis_type: string; landing_section: number; axis_source?: string; sections: { n: number; title: string; sources: string[]; ratio: number }[]; excerpts: number; claims: number; estimated_minutes: number; split_proposal: string; sources_used: string[]; sources_excluded: { url: string; reason: string }[]; gaps: string[]; self_check: string; notes: string }
export interface WriteOut { title: string; one_liner?: string; script: string; sections_followed: boolean; turn_claims: { turn: string; claims: string[] }[]; bridges: { turn: string; note: string }[]; terms?: { term: string; turn: string; explained_by: string }[]; pronunciations_added: { term: string; reading: string }[]; self_check_fixes: string[]; notes: string }

export interface TwoStageArgs {
  job: Job; ex: Executor; episodeId: string; candidate: BacklogCandidate; dir: string; rel: string;
  assetRoot: string; promptVersion: string; templates: Templates | null; majorTopic?: string;
  introStyle: (typeof INTRO_STYLES)[number]; fileTools: string[];
  signoffSeed?: number;
  /** 실험 no-gold (2026-09-15): 설계·대본 프롬프트에서 골드 예시를 뺀다 — settings.experiments.no_gold_backlog_ids 에 든 후보만 */
  noGold?: boolean;
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
    const d = await runDesignSingle({ job, ex, episodeId, candidate: cand, dir, assetRoot: a.assetRoot, promptVersion: a.promptVersion, noGold: a.noGold });
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
    read(ap.guidelines), read(ap.specScript), a.noGold ? Promise.resolve("") : read(ap.goldFullEum), a.noGold ? Promise.resolve("") : read(ap.goldFullYuna),
    read(path.join(dir, "sources.md")), read(path.join(dir, "claims.md")), read(path.join(dir, "outline.md")),
  ]);
  const pronFile = path.join(dir, "pronunciations.json");
  const pronunciationsJson = (await exists(pronFile)) ? await read(pronFile) : "{}";
  const estimatedMinutes = design?.estimated_minutes || Number(outlineMd.match(/^예상 분량:\s*(\d+(?:\.\d+)?)\s*분/m)?.[1]) || 15; // 설계 이어받기면 outline.md 에서 읽는다
  const parts = buildWritePromptParts({ episodeId, candidate: cand, introStyle: a.introStyle, promptVersion: a.promptVersion, templates: a.templates, majorTopic: a.majorTopic, signoffSeed: a.signoffSeed, estimatedMinutes, guidelines, specScript, goldFullEum, goldFullYuna, sourcesMd, claimsMd, outlineMd, pronunciationsJson });
  log(`  draft ${episodeId} · 2/2 대본 (단발, 공유 ${Math.round(parts.system.length / 1000)}K + 편별 ${Math.round(parts.user.length / 1000)}K자)`);
  let w: Awaited<ReturnType<typeof ex.run<WriteOut>>>;
  try {
    w = await runWrite();
  } catch (e) {
    // 대본이 실패해도 설계는 끝나 있다 — 비용을 runs 에 남기고(안 남기면 실패 편의 설계 비용이 사라진다), 실행기 시간 초과·결과 없음은 한 번 다시 집는다.
    // 설계 산출물이 디렉토리에 있으므로 다음 집기는 대본만 다시 돈다 (designDone 분기). 두 번째도 실패면 초안 실패 복귀(onDraftFailed)
    if (e instanceof ApiLimit) throw e; // 한도는 워커 차단기가 처리 — 여기서 재시도로 바꾸지 않는다 (ai-pause.ts)
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
    prompt: parts.user, systemPrompt: parts.system, schema: WRITE_SCHEMA,
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
export interface L0AttributionInput { claimsMd?: string; sourcesMd?: string; notesMd?: string; pronunciations?: Record<string, string> }
export function twoStageViolations(scriptMd: string, outlineMd: string, opts: { signoffHeads?: string[] } & L0AttributionInput = {}): string[] {
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
  // 클로징 마지막 문장 "다음(에) ~하면" 틀 (규칙 22, full-v7.3 — 002 Y48·006 Y22·007 Y34 직접 수정이 매번 "다음"만 지웠다): 마지막 진행 턴의 문장 머리만 본다
  {
    const last = p.turns[p.turns.length - 1];
    if (last?.id?.startsWith("Y") && /(^|[.!?…]\s*)다음(에|\s[가-힣]{1,6}(에|에서|부터|엔))\s/.test(last.text.replace(/\s+/g, " "))) v.push(`마지막 턴 ${last.id} 의 문장이 "다음(에) ~" 틀로 시작 — 클로징은 조건 없이 바로 말한다("회의에서 침묵이 흐르거든", "매일 아침 점수가 낮게 떠도") (규칙 22)`);
  }
  // 통계 용어 (규칙 24, full-v6 2026-09-09): 논문 결과 문장의 직역 — 판정 3편 공통 사유 "너무 어려움". 말로 옮기게 재생성
  // 2026-10-01 수정: "조절했"·"조절하지 않" 단독은 일상어다 — "드러낼지 조절했어요"가 통계 용어로 잡혀 수정 2회 뒤에도 남았다(T261001-005 검토 대기). 통계 뜻은 "조절 효과/변인/변수"로만 잡고, 걸린 낱말을 메시지에 적어 수정 호출이 무엇을 고칠지 알게 한다
  const statRe = /(유의하|유의미|유의했|유의한|상호작용\s?효과|매개\s?(효과|분석|변인)|매개했|매개하|정적\s?(관계|상관)|부적\s?(관계|상관)|변인|효과\s?크기|표본\s?크기|회귀\s?계수|조절\s?(효과|변인|변수)|통제\s?조건|통제\s?집단)/; // "상호작용" 단독은 일상어라 제외
  const stat = p.turns.filter((t) => t.id?.startsWith("E") && statRe.test(t.text)).map((t) => `${t.id} "${t.text.match(statRe)?.[0]}"`);
  if (stat.length) v.push(`해설 턴 ${stat.length}개에 통계 용어(유의·매개·정적/부적 관계·변인·효과 크기) (${stat.slice(0, 8).join(", ")}) — 말로 옮긴다: "같이 움직였다", "~할수록 ~했다", "A 가 B 를 거쳐 C 로" (규칙 24)`);
  // 뜸 부재 (규칙 7, 판정 3편 A7 전부 동의 "수정 필요"): 해설 턴이 말줄임표 없이 열 턴 넘게 이어지면 낭독
  const eTurns = p.turns.filter((t) => t.id?.startsWith("E"));
  let gap = 0, maxGap = 0, gapEnd: string | null = null, gapRun: string[] = [], maxRunIds: string[] = [];
  for (const t of eTurns) { if (/\.{3}|…/.test(t.text)) { gap = 0; gapRun = []; } else { gap++; gapRun.push(t.id ?? "?"); if (gap > maxGap) { maxGap = gap; gapEnd = t.id; maxRunIds = [...gapRun]; } } }
  // full-v8.3 (2026-09-20): 넣을 턴을 지목한다 — 수정 호출은 최소 수정 원칙이라 "구간에 뜸을 두라"만으로는 한두 턴만 고쳐 2회 뒤에도 남았다(GPT T260920-003, 14턴)
  if (maxGap >= 10) { const targets = maxRunIds.filter((_, i) => i % 4 === 2); v.push(`해설 턴 ${maxGap}개가 연속으로 뜸(말줄임표) 없이 이어짐 (${maxRunIds[0]}~${gapEnd}) — ${targets.join("·")} 각 턴의 문장 중간(절 사이, 생각을 고르는 자리)에 뜸 "..." 을 하나씩 넣는다. 지목한 턴은 전부 고친다 (규칙 7)`); }
  // 골드 특유 문구 (골드 사용법·루브릭 G1, 판정 3편 전부 동의): 자리째 복제 틀이 2회 이상이면 재생성
  // full-v6.2 (판정 3편 G1 동의 11건): 문장이 골드에서 그대로 온 것은 1턴이어도 수정 — "자리까지 막기는 어렵고 완전 복제만 피하면 된다"(판정 부분동의)
  const goldRe = /(그 그림이 [^.。!?]{0,14}(맞|정확|가까|그거)|정확한 표현이|정확히 [^.。!?]{1,14}(핵심|조각|얘기|그거)|한 번쯤 떠올려 보셔도|떠올려 보셔도 좋겠|(해|두|보)셔도 좋겠(습니다|네요)|짧게 모아|모아 볼게요|모아 보면|한번 모아볼까요|한 번 묶어|묶어 주실|그런데 (윤아|이음)님은 어떠세요|(윤아|이음)님(한테|께|,)? ?하나(만)? (여쭤|물어)볼게요|하나(만)? 여쭤볼게요|솔직히 반반|예리하세요|반만 맞(았|아)|그 감각이 [^.。!?]{0,12}(정확|맞|핵심|통해|방향)|그 정리가 맞아요|솔직히 둘 다|이해하게 (된|됐)|흔히 생각하는 (거|것)(랑|과|이랑)? ?반대|통념(과|이랑) 반대|거의 그런데|그렇게 들어도 크게 틀리지 않|정확히 같은 패턴|한 번쯤 생각해 볼 필요)/; // v8.4: 새 골드(T260918-001) 특유 문구 4개 추가 — 교정 진입·수긍 교정·확인구·클로징 · full-v8.3: 골드 변형 "솔직히 둘 다"(002 Y10) · 학습자 마무리(A10, 001 E33) · 통념 반전 도입 틀(001 E1)
  const gold = p.turns.filter((t) => goldRe.test(t.text)).map((t) => t.id ?? "?");
  if (gold.length >= 1) v.push(`골드 특유 문구가 ${gold.length}턴 (${gold.slice(0, 6).join(", ")}) — 확인구("반만 맞았어요"·"그 감각이 …"·"그 그림이 …"·"그 정리가 맞아요")·정리 진입("…짧게 모아 보면요")·마무리 마지막 문장 틀("~해 보셔도 좋겠습니다")을 자리째 쓰지 않는다. 같은 기능을 새 문장으로 (골드 사용법)`);
  // 귀속 연속 (규칙 22, full-v6.2 — 판정 3편 A9 전부 동의, T260910-013 은 한 저자 글을 11턴 연속 옮김): 귀속 동사로 닫히는 해설 턴이 4턴 연속이면 책 소개다
  // full-v6.3: "동사로 끝남" 대신 "귀속 표현이 든 턴"으로 세고 5연속 — 018 은 E15~E18 이 전부 전언인데 E18 이 "거예요"로 끝나 4연속에서 끊겼다
  let run = 0, maxRun = 0, runEnd: string | null = null;
  for (const t of eTurns) { if (attributionRe.test(t.text)) { run++; if (run > maxRun) { maxRun = run; runEnd = t.id; } } else run = 0; }
  // full-v8.3: 임계 5→4 — 확장 정규식으로 9편·골드 2편 실측, 판정 동의 구간(001·003) 둘만 4연속, 오탐 0
  if (maxRun >= 4) v.push(`해설 턴 ${maxRun}개가 연속으로 귀속·전언 표현("~라고요"·"~라고 해요"·"~라고 불러요"·"그가 말하는 건")을 담음 (${runEnd} 까지) — 한 소스를 옮겨 적는 구간이다. 소스가 말한 것을 해설자가 아는 것으로 바꾸어 말하고, 귀속은 직접 인용·수치·특정인 의견에만 (규칙 20~23)`);
  // full-v6.4 (2026-09-12 직접 수정 43건): 기원 서사 틀 반복 · 턴 끝 미완결 · 비유 표지 밀도
  const originRe = /(아까|방금|앞에서)[^.!?]{0,25}(때부터|부터)[^.!?]{0,8}(걸리|걸렸|궁금|정리)|(아까|방금)부터 (궁금|정리|걸리)/;
  const origin = p.turns.filter((t) => t.id?.startsWith("Y") && originRe.test(t.text)).map((t) => t.id ?? "?");
  if (origin.length >= 2) v.push(`진행 턴 ${origin.length}개가 같은 기원 서사 틀("아까 ~하셨을 때부터 걸렸는데요")로 시작 (${origin.join(", ")}) — 기원은 내용으로 붙이고 "방금"과 "~부터"를 같이 쓰지 않는다 (규칙 1)`);
  const openEnd = p.turns.filter((t) => /(\.{3}|…)["'”’]?\s*$|[는고라데며서면]\.\s*$/.test(t.text.trim())).map((t) => t.id ?? "?");
  if (openEnd.length >= 3) v.push(`턴 ${openEnd.length}개가 완결되지 않은 채 끝남 (${openEnd.slice(0, 6).join(", ")}) — 말줄임표·연결어미로 끝나면 오디오가 끊긴 인상을 준다. 완결형 문장으로 (규칙 16)`);
  const metaphorRe = /(같은 거예요|같은 거네요|같은 거죠|같은 셈|같은 건데|비유하자면|이라고 보면 돼요|처럼요[.?]|인 셈이(에요|네요|죠))/g;
  const metaphors = p.turns.reduce((a, t) => a + (t.text.match(metaphorRe)?.length ?? 0), 0);
  if (metaphors >= 8) v.push(`비유 표지("같은 거예요"·"같은 셈"·"비유하자면")가 ${metaphors}회 — 비유는 어려운 대목에만, 에피소드에 셋 이내. 쉬운 대목의 비유와 개념 간 관계 비유를 뺀다 (규칙 18)`);
  // 진행자가 지어낸 관계 비유 "X는 A가 아니라 B네요" (규칙 3·18, 직접 수정: 당직자·배터리/충전기·창고/검수대 전부 삭제됨)
  const relRe = /(은|는) [가-힣 ]{1,12}(이|가) 아니라[^.!?]{0,14}(같은|이네요|이에요|예요|네요|거네요|인 거|죠)/;
  const hostMeta = p.turns.filter((t) => t.id?.startsWith("Y") && relRe.test(t.text)).map((t) => t.id ?? "?");
  if (hostMeta.length) v.push(`진행 턴 ${hostMeta.length}개가 관계 비유("X는 A가 아니라 B네요")를 지어냄 (${hostMeta.join(", ")}) — 진행자는 비유를 만들지 않는다. 자기 말로 바꿔 되돌린다 (규칙 3·18)`);
  // 제작 용어 누설 (골드 사용법, full-v6.3 — T260910-020 "저는 그 번역이 맞다고 봅니다")
  const leak = p.turns.filter((t) => /(그|이) 번역이|번역이 (맞|정확)|번역 맞장구|이 구간에서|구간 #|발췌에|클레임|골드 예시|이 블록|블록이|블록에서/.test(t.text)).map((t) => t.id ?? "?");
  if (leak.length) v.push(`제작 용어가 대사에 새어 나옴 (${leak.slice(0, 6).join(", ")}) — "번역"·"구간"·"발췌"·"클레임"은 규칙 문서의 말이다. 두 사람의 말로 바꾼다`);
  // 한글로 풀어 쓴 세 자리 이상 정확한 수 (규칙 24, full-v6.3 — "오백일흔다섯 명"은 듣기에 어색). 반올림해 말한다
  const numRe = /[일이삼사오육칠팔구]?(백|천)\s?(?:[일이삼사오육칠팔구]?십[일이삼사오육칠팔구]?|[일이삼사오육칠팔구]백[일이삼사오육칠팔구십]*|(?:스물|서른|마흔|쉰|예순|일흔|여든|아흔)(?:하나|둘|셋|넷|다섯|여섯|일곱|여덟|아홉)?)/; // "오백일흔다섯"·"삼백쉰일곱"·"천구백구십"
  const nums = p.turns.filter((t) => t.id?.startsWith("E") && numRe.test(t.text.replace(/이천[일이삼사오육칠팔구십]*년/g, ""))).map((t) => t.id);
  if (nums.length >= 2) v.push(`해설 턴 ${nums.length}개가 세 자리 이상 수를 한글로 정확히 풀어 읽음 (${nums.slice(0, 6).join(", ")}) — "약 육백 명"처럼 반올림한다. 정확한 수가 축에 필요한 자리만 예외 (규칙 24)`);
  // "오늘 얘기" 틀 반복 (규칙 16 문어 은유, full-v6.2 — T260910-013 E2·E7·E12·E42 "오늘 얘기가/오늘의 출발점/오늘 얘기의 두 갈래/오늘 얘기를 한 줄로")
  const todayRe = /오늘(의)? (얘기|이야기|출발점|주제)/;
  const today = eTurns.filter((t) => todayRe.test(t.text));
  if (today.length >= 4) v.push(`해설 턴 ${today.length}개가 "오늘 얘기/오늘의 출발점" 틀로 위치를 잡음 (${today.slice(0, 6).map((t) => t.id).join(", ")}) — 같은 틀 세 번이면 각본이다. 내용으로 잇는다 (규칙 16)`);

  // ── v9.3 (2026-09-22, GPT 3편 실측 — 규칙 문장으로는 안 줄고 코드 검사가 확실한 정형 문제) ──
  const expl = p.turns.filter((t) => t.id?.startsWith("E"));
  // 표본 수·편수·조사 횟수 낭독 (규칙 20 각주): "384명에게", "278쌍을", "17개 연구", "연구 열일곱 편" — 연구는 대상과 결과로만 소개한다
  const sampleRe = /(참가자|응답자|학생|직원|관리자|창업자|가구|사람|성인|청소년|환자|기업)\s*(\d[\d,]*|[일이삼사오육칠팔구십백천만]{1,4})\s*(명|쌍|곳)|(\d[\d,]*|[일이삼사오육칠팔구십백천만]{1,4})\s*(명|쌍|곳|가구)(을|를|의|에게|과|이|가|에|씩)?\s*[^.!?]{0,14}(조사|인터뷰|설문|추적|분석|검토|살핀|살펴|모아|모은|묶은|대상|참여|응답|표본|보여|물어|물었|나눠|비교|실험)|(\d+|[일이삼사오육칠팔구십]+)\s*(개|편)의? (연구|논문|실험)|연구 (\d+|[일이삼사오육칠팔구십]+)\s*편|(\d+|[일이삼사오육칠팔구십]+)\s*차례 (조사|측정)/;
  const citeRe = /(이 글이|그 글이|글이|논문이|보고서가|연구가) 인용한|(앞선|선행|기존) (연구|문헌)(들)?(에서|의|도|가|은|는|을)|(이|를|를 보충한|을 보충한) (연구|논문)에서는|문헌 (관계|편수)/; // 인용 관계·선행 연구 대조 — 소스 안의 서지 관계
  const sample = expl.filter((t) => sampleRe.test(t.text) || citeRe.test(t.text)).map((t) => t.id);
  if (sample.length) v.push(`해설 턴 ${sample.length}개가 표본 수·편수·조사 횟수·인용 관계를 낭독 (${sample.slice(0, 8).join(", ")}) — 연구는 대상과 결과로만 소개한다. 사람 수·편수·조사 횟수·조사 연도·앞선 연구와의 관계는 각주라 뺀다 (규칙 20)`);
  // 수치 나열 (규칙 17): 한 해설 턴에 수치 5개 이상
  const numCount = (t: string) => (t.match(/\d[\d,.]*\s*(퍼센트|%|명|원|배|년|개|곳|건|시간|분|달|주|센트|달러)?/g) ?? []).length;
  const dense = expl.map((t) => ({ id: t.id!, n: numCount(t.text) })).filter((x) => x.n >= 5);
  if (dense.length) v.push(`해설 턴 ${dense.length}개에 수치가 5개 이상 (${dense.slice(0, 6).map((x) => `${x.id}: ${x.n}개`).join(", ")}) — 한 턴에 수치는 3개 이하. 극적 대비·설득에 필요 없는 수치부터 뺀다 (규칙 17)`);
  // 주어형 귀속 (규칙 8·20): "이 글은 …해요", "저자는", "연구진은", "이 연구에서는" 가 해설 턴 4개 이상이면 소스를 읽어 주는 대본이다 (연속이 아니어도)
  const subjRe = /(이 글|그 글|이 기사|글쓴이|저자들?|필자|연구진|연구자들?|연구팀|이 연구|그 연구|이 조사|이 실험|이 보고서|이 논문)(은|는|이|가|에서는|에서도)\s|(이 글|그 글|이 연구|이 조사)의 (주장|출발점|결론|해석|권고|제안|핵심)/;
  const subj = expl.filter((t) => subjRe.test(t.text)).map((t) => t.id);
  if (subj.length >= 4) v.push(`해설 턴 ${subj.length}개가 주어형 귀속("이 글은"·"저자는"·"연구진은"·"이 연구에서는")으로 말함 (${subj.slice(0, 8).join(", ")}) — 블록 소개 한 문장 뒤에는 주어 없이 내용을 말한다 (규칙 8·20)`);
  // 마무리 정리 턴 (규칙 22·tpl-v2): 마지막 해설 턴이 3문장 미만이면 수렴이 없다 — 수정 재생성이 claims 를 지우며 문장까지 깎은 사례(T260922-007 E28)
  const closingE = [...expl].reverse().find((t) => t.section === "마무리");
  if (closingE) { const n = closingE.text.split(/(?<=[.?!])\s+/).filter((x) => x.trim()).length; if (n < 3) v.push(`마무리 정리 턴 ${closingE.id} 이 ${n}문장 — 정리 턴은 3~5문장이다. 구간마다 한 문장을 답의 단계로 잇고 마지막 문장이 축 (규칙 22). 사실 주장을 지울 때도 문장 수를 줄이지 않는다`); }
  // full-v7.1 판정 반영 (2026-09-15, T260915-001~004 직접 수정 85건): 화자 없는 인용 예고 · 발행 시기 · 해설자 전환 선언 · 발화 안 가운뎃점
  const quoteCueRe = /((이런|그런|이) (문장|표현|구절|말)(이|도|을|가) (있어요|있는데요|있습니다|나와요|하나 있|있거든요)|(글|기사|책|보고서|논문|연구)(도|은|는|이|가|에서)? ?이렇게 (말해요|말합니다|적어요|적었어요|씁니다|썼어요|써요))/;
  const quoteCue = eTurns.filter((t) => quoteCueRe.test(t.text)).map((t) => t.id ?? "?");
  if (quoteCue.length) v.push(`해설 턴 ${quoteCue.length}개가 화자 없는 인용 예고("이런 문장이 있어요"·"그 글도 이렇게 말해요")로 들어감 (${quoteCue.slice(0, 6).join(", ")}) — 표지를 지우고 해설자의 문장으로 두거나 화자를 붙인다 (규칙 20·23)`);
  const pubDateRe = /20\d\d년(?: \d{1,2}월)?에 [^.!?…]{0,14}(?:낸|발표한|실린|나온|쓴|펴낸|출간한|발행한|올린|내놓은) /;
  const pubDate = eTurns.filter((t) => pubDateRe.test(t.text)).map((t) => t.id ?? "?");
  if (pubDate.length) v.push(`해설 턴 ${pubDate.length}개가 소스의 발행 시기를 말함 (${pubDate.slice(0, 6).join(", ")}) — "2026년 8월에 낸"은 각주다. 시점이 축에 필요한 비교가 아니면 뺀다 (규칙 21)`);
  const handoffRe = /(다음 (질문|얘기|이야기)(은|는|이) (이거|이건|이렇)|다음 (얘기|이야기|질문)(예요|이에요|입니다)|다음으로 넘어가)/;
  const handoff = eTurns.filter((t) => handoffRe.test(t.text)).map((t) => t.id ?? "?");
  if (handoff.length) v.push(`해설 턴 ${handoff.length}개가 구간 전환을 선언함 (${handoff.slice(0, 6).join(", ")}) — "그럼 다음 질문은 이거죠"는 대본 진행을 알리는 말이다. 앞 구간이 남긴 질문에서 진행자가 묻거나 내용으로 잇는다 (규칙 1)`);
  const midDot = p.turns.filter((t) => /[가-힣A-Za-z)]·[가-힣A-Za-z(]/.test(t.text)).map((t) => t.id ?? "?");
  if (midDot.length) v.push(`턴 ${midDot.length}개의 발화 안에 가운뎃점(·) 나열 (${midDot.slice(0, 6).join(", ")}) — 귀로는 낱말이 붙어 들린다. 쉼표로 나누거나 둘로 줄인다 (규칙 14)`);
  // ── v9.4 (2026-09-29, 자동화 29편 실측 — 규칙은 있었는데 안 지켜진 정형 문제. 임계는 29편 분포에서 상위 절반이 걸리게 잡았다, .work/verdicts/v93) ──
  v.push(...v94Violations(p.turns));
  // full-v7 (2026-09-15): 귀속 표현 턴 비율 검사는 폐지 — 32~36% 인 편에서도 소스 순회(재식별 15건)가 있었다. 구조 검사로 대체
  v.push(...attributionViolations(scriptMd, p.turns, opts));
  return v;
}

/**
 * v9.4 정형 검사 (2026-09-29) — 29편 실측에서 편마다 같은 틀로 나온 것들. 규칙 문구(1·3·5·13-1·16·22·24)는 v9.3 에도 대부분 있었으나 지켜지지 않았다.
 * 임계값 근거(29편): 정리형 진행 턴 평균 29%(최대 56%) · "아니라" 편당 12.5회 · 사전 문형 2.2회 · "잠깐" 26편 · "○○님이라면" 28편 · 클로징 다짐형 24편 · "결국"/"이해하게 됩니다" 각 6·12편.
 * 지목한 턴을 메시지에 적는다 — 수정 호출은 최소 수정 원칙이라 턴을 지목해야 고친다(v8.3 뜸 교훈).
 */
export function v94Violations(turns: ScriptTurn[]): string[] {
  const v: string[] = [];
  const E = turns.filter((t) => t.id?.startsWith("E"));
  const Y = turns.filter((t) => t.id?.startsWith("Y"));
  const bodyY = Y.filter((t) => t.section !== "인트로" && t.section !== "마무리");
  const ids = (xs: { id: string | null }[], n = 8) => xs.slice(0, n).map((t) => t.id ?? "?").join(", ");
  // 규칙 3: 물음표 없는 정리형 진행 턴 비율 — 어휘만 바꾼 요약이 진행자의 절반이면 청취자 대리가 아니라 자막기다
  // 2026-10-01 수정: 느낌·추측 어미(같아요·같습니다·겠어요·겠네요)는 정리형이 아니다 — 그 어미가 포함돼 있어 "느낌으로 바꾸라"는 지시를 따라도 다시 걸렸다(T261001-001·002: 10/28·10/24 가 수정 2회 뒤에도 그대로, 검토 대기 2편)
  const summaryRe = /(네요|군요|거군요|거네요|말이군요|뜻이군요|들려요|들립니다|들리네요|셈이네요|얘기네요|말이네요|거죠|는 거죠)[.!]?\s*$/;
  const summaryY = bodyY.filter((t) => !/\?/.test(t.text) && summaryRe.test(t.text.trim()));
  if (bodyY.length >= 12 && summaryY.length / bodyY.length > 0.35) {
    // 2026-09-30: 바꿀 턴을 지목한다 — "N개 이상"만 말하면 수정 호출이 모자라게 고쳐 L0 수정 2회를 다 썼다(T260930-001: 9 → 8 → 7개). 한 개 여유를 두고 고르게 뽑는다
    const over = summaryY.length - Math.floor(bodyY.length / 3) + 1;
    const step = summaryY.length / over;
    const picks = Array.from({ length: over }, (_, i) => summaryY[Math.min(summaryY.length - 1, Math.floor(i * step + step / 2))]).filter((t, i, arr) => arr.indexOf(t) === i);
    v.push(`진행 턴 ${bodyY.length}개 중 ${summaryY.length}개가 물음표 없는 정리형("~네요"·"~군요"·"~로 들려요")으로 끝남 — 셋 중 하나가 상한이다. 다음 ${picks.length}개 턴을 전부 바꾼다: ${ids(picks, 12)}. 자기 처지에서의 느낌·망설임, 한두 마디 수긍, 이해가 막힌 자리의 되물음 가운데 하나로 — 앞 해설을 다시 정리하는 문장으로 바꾸지 않는다 (규칙 3·25)`);
  }
  // 규칙 3: 진행자가 각주를 부르는 질문 — 청취자는 조사 기관·표본·척도·오차·통계 절차를 묻지 않는다
  const footnoteQ = bodyY.filter((t) => /\?/.test(t.text) && /(표본|응답률|척도|오차|조사 기관|조사 방식|조사 방법|대조군|통계적|통계 (절차|처리)|재현(됐|되|이)|인과(관계)?(를|가) (입증|확인|증명)|유의)/.test(t.text));
  if (footnoteQ.length) v.push(`진행 턴 ${footnoteQ.length}개가 조사 기관·표본·척도·오차·통계 절차를 묻음 (${ids(footnoteQ)}) — 청취자가 하지 않는 질문이고 해설이 각주로 답하게 된다. 그 자리의 내용에서 막히는 것을 묻는다 (규칙 3)`);
  // 규칙 16: "A가 아니라 B" 대조 문장 밀도 — 블록당 한 번. 29편 평균 12.5회, 거의 모든 블록 마지막 문장이 이 틀
  const contrast = E.filter((t) => /아니라/.test(t.text));
  const contrastN = E.reduce((a, t) => a + (t.text.match(/아니라/g)?.length ?? 0), 0);
  if (contrastN >= 7) v.push(`해설에 "~가 아니라 ~다" 대조 문장이 ${contrastN}회 (${ids(contrast, 10)}) — 블록당 한 번, 편 전체 여섯 번 이하다. 블록 끝의 대조 경구를 그 블록의 구체 내용으로 바꾼다 (규칙 16)`);
  // 규칙 24: 사전 정의 문형 "X는 ~을 뜻해요/말해요/가리켜요"
  const glossRe = /[가-힣A-Za-z0-9 ]{1,30}(은|는|이란|란)\s[^.!?]{2,60}(을|를|이라고|라고)\s(뜻|말|가리)(해요|합니다|킵니다|켜요|하는|하죠|하거든요)/;
  const gloss = E.filter((t) => glossRe.test(t.text));
  if (gloss.length >= 3) v.push(`해설 턴 ${gloss.length}개가 용어를 사전 정의 문형("X는 ~을 뜻해요/말해요")으로 풀음 (${ids(gloss)}) — 그 말이 쓰이는 상황이나 앞 문장과의 차이로 풀거나 진행자의 되물음으로 해소한다 (규칙 24)`);
  // 규칙 1: 화제 끼워 넣기 표지 — "잠깐"·"딴 얘기"가 29편 중 26편, 거의 같은 자리(#4 첫 진행 턴)
  const interject = Y.filter((t) => /(^|[.!?…]\s*)잠깐[,\s]|딴 (얘기|이야기)|끼워 (볼게요|넣|보고)|끼어드는 것 같/.test(t.text.trim()));
  if (interject.length) v.push(`진행 턴 ${interject.length}개가 "잠깐"·"딴 얘기"로 화제를 끼워 넣음 (${ids(interject)}) — 구간 이동 선언이다. 앞 해설에서 남은 의문을 내용으로 묻는다 (규칙 1)`);
  // 규칙 5: 역질문 서두 "○○님이라면" — 예고 관용구가 됐다(28/29편)
  const rq = turns.filter((t) => /(이음|윤아)\s?님이라면/.test(t.text));
  if (rq.length) v.push(`턴 ${rq.length}개가 "○○님이라면"으로 역질문을 여는 관용구 (${ids(rq)}) — 이미 설명한 상황의 선택·느낌을 바로 묻는다. 서두 없이, 두 갈래 고르기 형식도 매번 반복하지 않는다 (규칙 5)`);
  // 규칙 22: 클로징 슬롯 다짐형 "저도/저는 ~하겠습니다·것 같습니다" (24/29편)
  const last = turns[turns.length - 1];
  if (last?.id?.startsWith("Y") && /저(도|는)\s[^.!?]{2,80}(겠습니다|겠어요|것 같습니다|것 같아요|보려 합니다|해 두겠습니다|두겠습니다)[.!]?/.test(last.text)) {
    v.push(`마지막 턴 ${last.id} 의 슬롯이 "저도/저는 ~하겠습니다" 다짐형 — 이 편의 내용에서 나온 감상·남은 질문·짧은 장면 가운데 하나로 바꾼다. 청취자에게 시키지도 않는다 (규칙 22)`);
  }
  // 규칙 13-1·22: 정리 턴 마지막 문장 "결국 …" / "… 이해하게 됩니다"
  const closingE = [...E].reverse().find((t) => t.section === "마무리");
  if (closingE) {
    const sents = closingE.text.split(/(?<=[.?!])\s+/).filter((x) => x.trim());
    const lastS = (sents[sents.length - 1] ?? "").trim();
    const bad: string[] = [];
    if (/^결국/.test(lastS)) bad.push('"결국"으로 시작');
    if (/이해(하게|할 수 있게) (됩니다|돼요|되는 겁니다|될 것입니다)\.?$|이해할 수 있습니다\.?$/.test(lastS)) bad.push('"~을 이해하게 됩니다"로 끝남');
    if (bad.length) v.push(`마무리 정리 턴 ${closingE.id} 의 마지막 문장이 ${bad.join("·")} — 축 문장을 그대로 말하고 끝낸다. 접속사 서두와 고정 어미를 뺀다 (규칙 13-1·22)`);
  }
  // ── v9.5 (2026-09-30, v9.4 판정 3편): 정리형을 막자 진행 턴이 질문 생성기가 됐고(질문 비율 48% → 63·88·61%), 한계 고지가 든 해설 턴이 늘었다(1.8 → 0·5·7) ──
  // 규칙 3: 본문 진행 턴의 질문은 절반~3분의 2. 넘치면 반응(느낌·망설임·짧은 수긍)으로 바꿀 턴을 지목한다
  const questionY = bodyY.filter((t) => /\?/.test(t.text));
  if (bodyY.length >= 12 && questionY.length / bodyY.length > 0.7) {
    const over = questionY.length - Math.floor((bodyY.length * 2) / 3);
    const picks = questionY.filter((_, i) => i % 3 === 1).slice(0, Math.max(over, 1));
    v.push(`진행 턴 ${bodyY.length}개 중 ${questionY.length}개가 질문 — 질문은 절반에서 3분의 2다. 이 가운데 ${over}개 이상을 자기 처지에서의 느낌·망설임·짧은 수긍으로 바꾼다(요약으로 바꾸지 않는다). 바꿀 턴: ${ids(picks, 10)} (규칙 3)`);
  }
  // 규칙 3: 진행자가 한계·단서를 유도하는 질문 — 해설이 매 구간을 한계 고지로 닫게 만든다
  const leadRe = /(단정|일반화|확정|입증)[^?]{0,25}\?|그대로 (넓|적용|옮)[^?]{0,20}\?|(없겠죠|어렵겠죠|아니겠죠|문제겠죠|지나치겠네요|조심해야겠[죠네])\??/;
  const leadY = bodyY.filter((t) => leadRe.test(t.text));
  if (leadY.length >= 2) v.push(`진행 턴 ${leadY.length}개가 결과의 한계·단서를 유도함 (${ids(leadY)}) — 범위와 한계는 해설자가 필요한 자리에서 먼저 말한다. 진행자는 그 자리의 내용에서 막히는 것을 묻거나 자기 느낌으로 받는다 (규칙 3)`);
  // 규칙 29: 한계 고지가 든 해설 턴 — 편 전체 네 번 이하
  const limitRe = /(단정할 수(는)? 없|확정(하지|할 수) (않|없)|말할 수(는)? 없|넓히기 어렵|옮길 수(는)? 없|읽어서는 안|입증(했다고|하지는|하지) |배제할 수 없|일반화|까지만 (갈|말할)|설명하지는 않|뜻은 아니|보장하(는 건|지는) (아|않)|더 지켜봐야)/;
  const limitE = E.filter((t) => t.section !== "마무리" && limitRe.test(t.text));
  if (limitE.length >= 5) v.push(`해설 턴 ${limitE.length}개에 한계 고지 (${ids(limitE, 10)}) — 한계는 구간에 한 번, 편 전체 네 번 이하다. 같은 구간의 한계는 한 문장으로 합치고, 구간의 마지막 문장은 그 구간이 답한 내용으로 둔다. claims 의 양태("~일 수 있다")는 그대로 둔다 (규칙 29)`);
  // 규칙 20: 이미 아는 것처럼 소스를 행위의 주어로 세운 소개("조사는 …살폈어요", "모의실험이 이 질문을 나눠 봤습니다") — 직접 수정 4건이 "한 조사가"·"~이 하나 있어요"·"글이 있는데"로 바꿨다. "한 ~"·"어떤 ~"으로 처음 소개하는 문장은 통과
  const srcActRe = /(?<!한 )(?<!어떤 )(글|조사|연구|해설|자료|모의실험|분석|보고서|검토)(이|가|은|는) [^.!?]{0,45}(살폈|살핍니|다뤘|다룹니|다뤄요|풀어냈|나눠 봤|권합니다|권해요|예측합니다|연결합니다|정리했)/;
  const srcAct = E.filter((t) => srcActRe.test(t.text));
  if (srcAct.length) v.push(`해설 턴 ${srcAct.length}개가 글·조사·연구를 행위의 주어로 세움 (${ids(srcAct)}) — 소개는 처음 듣는 사람에게 "그런 글·조사·연구가 하나 있다"고 알리는 한 문장이고, 그 뒤는 주어 없이 내용을 말한다. 실험 하나의 결과는 사례 하나로 소개한다 (규칙 20)`);
  // ── v9.7 (2026-10-01, v9.5 판정 3편) ──
  // 규칙 4: 내용 없는 한 마디 진행 턴("네.") — 사람: "차라리 없는 게 나을 정도의 무의미한 턴"
  const emptyY = bodyY.filter((t) => !/\?/.test(t.text) && t.text.replace(/[\s.,!…"'“”‘’]/g, "").length <= 4);
  if (emptyY.length) v.push(`진행 턴 ${emptyY.length}개가 내용 없는 한 마디 수긍 (${ids(emptyY)}) — 앞 해설의 어느 지점을 받았는지 드러나는 한 문장으로 바꾸거나, 턴을 지우고 해설을 잇는다 (규칙 4)`);
  // 규칙 20: 한 턴 안에서 발언자를 갈아타는 중계("한 분석가는 … 다른 경제학자는 …") — 직접 수정이 "~해석하는 전문가들도 있어요"로 묶었다
  // 2026-10-01 범위 축소: 전언 동사(설명·해석·분석·평가·지적·진단·전망)로 옮긴 발언만 센다 — 엇갈리는 두 사람의 태도("한 참가자는 …걱정했습니다. 다른 참가자는 …우려했고요")는 대비 자체가 내용이고, 사람이 직접 수정에서 그대로 뒀다(T260930-002 E11)
  const speakerRe = /(한|어떤|다른|또 다른|어느) (?:[가-힣]{1,8} )?(분석가|경제학자|교수|연구자|전문가|기자|평론가|학자|관계자|당국자|투자자|애널리스트|의원|관리자)(는|은|이|가) [^.!?]{0,80}(설명|해석|분석|평가|지적|진단|전망)(했|합니다|해요|하고|했고)/g;
  const relay = E.filter((t) => (t.text.match(speakerRe)?.length ?? 0) >= 2);
  if (relay.length) v.push(`해설 턴 ${relay.length}개가 한 턴 안에서 발언자를 갈아타며 옮김 (${ids(relay)}) — 같은 방향의 의견은 한 문장으로 묶어 해설자의 말로 한다. 발언자별 전언을 차례로 잇지 않는다 (규칙 20)`);
  return v;
}

/**
 * full-v7 귀속 구조 검사 (guidelines 규칙 20~22·25). claims.md(구간·귀속 열)·sources.md(이름)·script-notes.md(턴별 claims)가 있을 때만
 * 구조를 검사하고, 없으면(구 형식 산출물) 진행 턴 검사만 한다. 이름 검출은 sources.md 머리의 발행처·저자 원문 표기와 발음 맵의 한글 표기로 잰다 —
 * 못 잡는 이름이 있을 수는 있어도 잡힌 것은 확실하다(보수적).
 */
export function attributionViolations(scriptMd: string, turns: { id: string | null; text: string }[], opts: L0AttributionInput): string[] {
  const v: string[] = [];
  const yTurns = turns.filter((t) => t.id?.startsWith("Y"));
  // 규칙 25: 진행 턴은 되물음 하나 아니면 수긍 하나 (판정 001 "반문이 너무 과도함", 직접 수정 Y11·Y4). 물음표 둘은 ⭐ 턴(003 Y12 "…금지라고요? …인사말 아닌가요?")에도
  // 흔해 기준으로 못 쓴다 — 셋부터 잡는다. 꼬리 질문 자체는 루브릭 3.12 가 본다
  const manyQ = yTurns.filter((t) => (t.text.match(/\?/g)?.length ?? 0) >= 3).map((t) => t.id ?? "?");
  if (manyQ.length) v.push(`진행 턴 ${manyQ.length}개에 질문이 셋 이상 (${manyQ.slice(0, 6).join(", ")}) — 진행 턴은 되물음 하나 아니면 수긍 하나. 꼬리 질문을 뺀다 (규칙 25)`);
  // 진행만 하는 짧은 되물음 턴 (규칙 25, full-v7.1 판정 반영 — 002 Y36 "셌더니요?"·Y41, 003 Y13 "어떤 일이었는데요?" 가 "없어도 되는 턴"으로 삭제됨): 열 자 이하의 물음 한 마디
  // 4편 실측 10턴("첫 번째가 뭔데요?"·"뭘 물어봤는데요?"…) 중 사람이 지운 건 002·003 의 3턴 — 한둘은 리듬이라 셋부터 잡는다(001 2턴 통과, 002 5·003 3 적중)
  const stubQ = yTurns.filter((t) => /\?/.test(t.text) && t.text.replace(/[\s.,!?…"'“”‘’]/g, "").length <= 10).map((t) => t.id ?? "?");
  if (stubQ.length >= 3) v.push(`진행 턴 ${stubQ.length}개가 내용 없이 다음 해설을 부르는 한 마디 되물음 (${stubQ.slice(0, 6).join(", ")}) — 해설이 끊지 않고 이어 말한다. 되물음은 청취자가 막히는 자리에만 (규칙 4·25)`);
  // 진행자가 만든 비유 — "로 치면"은 콜백(003 ⭐ Y21 "아까 회사 얘기로 치면")에도 쓰여 제외, 명시적 비유 표지만
  const yMeta = yTurns.filter((t) => /(비유하자면|같은 거예요|같은 셈이|인 셈이(에요|네요|죠))/.test(t.text)).map((t) => t.id ?? "?");
  if (yMeta.length) v.push(`진행 턴 ${yMeta.length}개가 비유를 만듦 (${yMeta.join(", ")}) — 진행자는 비유를 만들지 않는다. 자기 말로 바꿔 되돌린다 (규칙 3·25)`);

  const { claimsMd, sourcesMd, notesMd } = opts;
  if (!claimsMd || !sourcesMd) return v;
  // claims.md (full-v7): | ID | 주장 | 발췌 ID | 유형 | 구간 | 저명 | 의견 | 귀속 |
  const claims = new Map<string, { source: number | null; section: number | null; grade: string }>();
  for (const m of claimsMd.matchAll(/^\|\s*(C\d{2,3})\s*\|[^\n]*$/gm)) {
    const cells = m[0].split("|").map((s) => s.trim());
    if (cells.length < 10) continue; // 구 형식(귀속 5열)은 구조 검사 대상이 아니다
    const src = cells[3].match(/S(\d+)-/)?.[1];
    const sec = cells[5].match(/\d+/)?.[0];
    claims.set(m[1], { source: src ? Number(src) : null, section: sec ? Number(sec) : null, grade: cells[8] });
  }
  if (!claims.size) return v;
  const axis = Number(claimsMd.match(/^> 축 소스: S(\d+)/m)?.[1] ?? NaN);
  const bodySections = [...scriptMd.matchAll(/^### #(\d+)/gm)].map((m) => Number(m[1]));
  // 소스별 이름 후보 — sources.md 머리의 발행처·저자. 인명은 원문 표기(규칙 14)라 영문으로 잡히고, 기관은 발음 맵의 한글 표기로도 잡는다
  const names = new Map<number, string[]>();
  for (const m of sourcesMd.matchAll(/^## S(\d+)\. (.+?) — "/gm)) names.set(Number(m[1]), [m[2].trim()]);
  for (const m of sourcesMd.matchAll(/^## S(\d+)\.[^\n]*\n- URL:[^\n]*· 저자 ([^\n·]+)/gm)) {
    const list = names.get(Number(m[1])) ?? [];
    for (const n of m[2].split(/,\s*/).map((s) => s.trim()).filter((s) => s.length >= 3)) list.push(n);
    names.set(Number(m[1]), list);
  }
  const readings = opts.pronunciations ?? {};
  const eText = turns.filter((t) => t.id?.startsWith("E")).map((t) => t.text).join("\n");
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const countIn = (hay: string, needle: string) => hay.match(new RegExp(esc(needle), "g"))?.length ?? 0;
  void bodySections;
  // 같은 이름 3회 이상 (규칙 21, full-v7.1 — 002 Sanjay Khosla ×6): 소개 때 한 번, 이후는 지시어
  const known = new Set<string>();
  for (const list of names.values()) for (const n of list) if (n.length >= 3) known.add(n);
  for (const n of known) { const c = countIn(eText, n); if (c >= 3) v.push(`"${n}" 이 해설 턴에서 ${c}회 — 이름은 소개 때 한 번, 이후는 지시어("이 사람"·"연구팀")로 잇는다 (규칙 21)`); }
  // v9.7 (2026-10-01): 낯선 인명의 첫 등장 문장에 역할이 없다 — T260930-002 "서평자가 누구인지도 밝혀지지 않았는데 이름을 써버림". 저자 이름(소스 머리 byline)과 라틴 두 토큰 이름을 본다.
  // 역할 낱말이 같은 문장이나 바로 앞 문장에 있으면 소개로 친다. 매체·기관명(발행처)은 대상이 아니다
  {
    const roleRe = /(교수|학자|작가|기자|연구자|연구원|저자|서평자|서평|언론인|박사|대표|장관|의원|전문가|평론가|철학자|소설가|시인|감독|사업가|창업자|대통령|총리|장군|사학자|경제학자|심리학자|과학자|의사|변호사|판사|목사|신부|승려|화가|음악가|편집자|편집장|칼럼니스트|분석가|관리자|CEO|회장|사장|이사|교사|강사|활동가|정치인|외교관|관료|지도자|지휘관|왕|황제|여왕|왕비|장수|승상|재상|세자)/;
    const persons = new Set<string>();
    for (const m of sourcesMd.matchAll(/^## S\d+\.[^\n]*\n- URL:[^\n]*· 저자 ([^\n·]+)/gm)) for (const n of m[1].split(/,\s*/).map((x) => x.trim())) if (n.length >= 3 && !/^(staff|editor|editorial|admin|team)/i.test(n)) persons.add(n);
    for (const m of eText.matchAll(/(?<![A-Za-z])([A-Z][A-Za-z.'-]+ [A-Z][A-Za-z.'-]+)(?![A-Za-z])/g)) persons.add(m[1]);
    const noRole: string[] = [];
    for (const n of persons) {
      const t = turns.find((x) => x.id?.startsWith("E") && x.text.includes(n)); if (!t) continue;
      const sents = t.text.split(/(?<=[.?!])\s+/); const i = sents.findIndex((x) => x.includes(n)); if (i < 0) continue;
      const window = (i > 0 ? sents[i - 1] + " " : "") + sents[i];
      if (!roleRe.test(window)) noRole.push(`${n}@${t.id}`);
    }
    if (noRole.length) v.push(`이름 ${noRole.length}개가 첫 등장 문장에 역할 소개 없이 불림 (${noRole.slice(0, 5).join(", ")}) — 낯선 이름은 처음 부르는 문장에서 무엇을 하는 사람인지 밝힌다. 이름 자체가 정보가 아니면 익명("한 역사학자는")으로 (규칙 21)`);
  }
  // 소스 목록에 없는 이름 (규칙 21 — 001 "Knowable Magazine"): 라틴 문자 고유명(두 단어 이상)과 "X 라는 매체/곳/기관"이 sources.md·claims·발음 맵에 없으면 지어낸 것
  // 라틴 문자 이름의 대조 코퍼스는 sources.md(원문 발췌·발행처·저자)뿐 — claims.md 는 QA 기록에, pronunciations.json 은 모델이 새 표기마다 발음을 넣어서
  // 지어낸 이름("Knowable Magazine")이 둘 다에 남아 있었다. 한글 토큰("LG경영연구원 이라는")만 발음 맵의 한글 표기까지 허용한다
  const latinCorpus = sourcesMd;
  const koreanCorpus = sourcesMd + "\n" + Object.values(readings).join("\n");
  const candidates = new Map<string, string>(); // 이름 → 대조 코퍼스
  for (const m of eText.matchAll(/(?<![A-Za-z])([A-Z][A-Za-z.&'-]+(?: [A-Z][A-Za-z.&'-]+)+)(?![A-Za-z])/g)) candidates.set(m[1], latinCorpus);
  // "X 라는 매체/곳": X 는 공백 없는 한 토큰만 — 공백을 허용하면 앞 문장 끝("자리예요. Eos")까지 끌려 들어와 오탐이 난다. 라틴 두 단어 이상은 위 정규식이 잡는다
  for (const m of eText.matchAll(/(?<![A-Za-z0-9가-힣])([A-Za-z0-9가-힣&'-]{2,20})\s?(?:이라는|라는) (?:[가-힣]+ )?(?:매체|곳|회사|기관|연구소|연구원|저널|신문)/g)) if (!candidates.has(m[1])) candidates.set(m[1], /[가-힣]/.test(m[1]) ? koreanCorpus : latinCorpus);
  // 대소문자·구두점 무시 — 매체가 URL 로만 있는 경우("Eos" ↔ eos.org, "Nautilus" ↔ nautil.us)를 허용한다
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9가-힣]/g, "");
  const invented = [...candidates].filter(([n, corpus]) => n.length >= 3 && !norm(corpus).includes(norm(n))).map(([n]) => n);
  const inventedTop = invented.filter((n) => !invented.some((o) => o !== n && o.includes(n))); // "Quantum Weekly"가 잡히면 부분 문자열 "Weekly"는 따로 세지 않는다
  if (inventedTop.length) v.push(`소스 목록에 없는 이름 (${inventedTop.slice(0, 5).join(", ")}) — 매체명·기관명·인명은 sources.md 에 있는 것만 부른다. 없으면 익명("한 매체에서")으로 (규칙 21)`);
  // 되돌림 표지 (규칙 22): 앞 블록의 소스를 다시 식별하지 않는다 — 축 소스도 내용으로만 되짚는다
  const backRe = /(로 돌아가(면|서|볼게요|볼까요)|아까 그 |앞에서 말한 그 |아까 말한 그 )/;
  const back = turns.filter((t) => backRe.test(t.text)).map((t) => t.id ?? "?");
  // v9.7 (2026-10-01 박수헌): 축 소스이거나 편에서 한 번뿐인 재사용이면 표지 하나는 허용 — 003 직접 수정이 "앞서 나온 삼성의 경우"로 표지를 더했다. 둘부터 잡는다
  if (back.length >= 2) v.push(`되돌림 표지("~로 돌아가면"·"아까 그") ${back.length}턴 (${back.slice(0, 5).join(", ")}) — 앞 구간의 사례를 다시 쓰는 것은 축 소스이거나 편에서 한 번뿐일 때이고, 표지도 그 한 번뿐이다. 나머지는 내용으로만 되짚는다 (규칙 22)`);
  // 블록 첫 해설 턴이 앞 블록의 지시어로 시작 (규칙 22 — 004 "그 교수"가 #4·#5 에서 다른 사람)
  {
    let sec = 0; let seen = new Set<number>(); const bad: string[] = [];
    for (const line of scriptMd.split(/\r?\n/)) {
      const s = line.match(/^### #(\d+)/); if (s) { sec = Number(s[1]); continue; }
      const t = line.match(/^\s*(?:\[[^\]]+\]\s*)?\**(E\d+)\b\s*[·:]?\s*(.*)$/);
      if (!t || !sec || seen.has(sec)) continue;
      seen.add(sec);
      if (/^(그|이) (교수|연구|연구팀|연구진|팀|사람|글|보고서|회장|저자|연구자|기사|논문)/.test(t[2].trim())) bad.push(`${t[1]}(#${sec})`);
    }
    if (bad.length) v.push(`블록의 첫 해설 턴이 앞 블록의 지시어로 시작 (${bad.join(", ")}) — 새 블록은 소개 한 문장으로 연다. 익명이어도 된다("미국의 한 대학 연구팀이") (규칙 22)`);
  }
  // 이름 형태: 풀네임(두 토큰 이상)이 한 번이라도 나왔으면 성만 따로 부르지 않는다 (직접 수정 "Sucher 교수 → Sandra Sucher 교수")
  for (const list of names.values()) for (const n of list) {
    const parts = n.split(/\s+/);
    if (parts.length < 2 || !eText.includes(n)) continue;
    const last = parts[parts.length - 1];
    if (last.length < 3) continue;
    const bare = eText.match(new RegExp(`(?<!${esc(parts.slice(0, -1).join(" "))}\\s)${esc(last)}`, "g"))?.length ?? 0;
    if (bare > 0) v.push(`"${n}" 을 풀네임으로 부른 뒤 "${last}" 만으로도 ${bare}회 부름 — 이름 형태는 첫 등장 그대로, 성만 따로 부르지 않는다 (규칙 21)`);
  }
  // 구간 밖 사용·마무리 claims — script-notes 의 턴별 claims 로 (모델 자기 보고지만 구간 경계는 대본에서 직접 잰다)
  if (!notesMd) return v;
  type Zone = number | "인트로" | "도입" | "마무리";
  const turnZone = new Map<string, Zone>();
  let cur: Zone = "인트로";
  for (const line of scriptMd.split(/\r?\n/)) {
    const h = line.match(/^## \[(인트로|도입|본문|마무리)\]/);
    if (h) { if (h[1] !== "본문") cur = h[1] as Zone; continue; }
    const s = line.match(/^### #(\d+)/);
    if (s) { cur = Number(s[1]); continue; }
    const t = line.match(/^\s*(?:\[[^\]]+\]\s*)?\**([EY]\d+)\b/); // 줄 문법: "[이음] E1 · …" (spec/04 4장)
    if (t) turnZone.set(t[1], cur);
  }
  const outside: string[] = [];
  const closing: string[] = [];
  for (const m of notesMd.matchAll(/^\|\s*([EY]\d+)\s*\|\s*([^|]*)\|/gm)) {
    const ids = m[2].match(/C\d{2,3}/g) ?? [];
    if (!ids.length) continue;
    const zone = turnZone.get(m[1]);
    if (zone === "마무리") { closing.push(m[1]); continue; }
    if (typeof zone !== "number") continue;
    for (const id of ids) {
      const c = claims.get(id);
      if (!c || c.section === null || c.source === null || c.source === axis) continue;
      if (c.section !== zone) outside.push(`${m[1]}:${id}(S${c.source}→#${c.section})`);
    }
  }
  if (outside.length) v.push(`소스가 배정 구간 밖에서 쓰임 (${outside.slice(0, 6).join(", ")}${outside.length > 6 ? " …" : ""}) — 소스는 claims 의 구간에서만, 축 소스만 도입·착지 (규칙 22)`);
  if (closing.length) v.push(`마무리 턴 ${closing.join(", ")} 이 claims 를 씀 — 마무리는 새 사실 없는 무귀속 요약이다 (규칙 22)`);
  return v;
}

/** 귀속 표현 — 규칙 22 의 자기 점검 지표. 매체·저자 고유명은 알 수 없으니 전언·지시 표현으로 잰다 */
const attributionRe = /(에 따르면|라고 합니다|라고 해요|라고 하는데요|고 합니다|고 해요|다고 적|라고요|다고요|냐고요|라고 불러요|라고 부르|라고 썼|라고 써요|썼어요|씁니다|말을 남겼|문장이 있어요|문장을 남겼|가 말하는 건|가 말하기를|이 말하는 건|라고 봤|라고 봅니다|라고 믿|라고 주장|내놓는 처방|내놓은|이 글|그 글|이 기사|그 기사|같은 글|같은 기사|아까 그|저자는|저자가|저자들|필자는|말로는|라고 봐요|라고 보고|고 보고하|라고 지적|연구진은|연구진이|연구팀은|연구자는|연구자도|기사는|글은|글에서|기사에서|논문에서|보고서에서|책에서)|(지적|주장|반론|비판|우려|의견|결론|해석|제안|발표|논의|반박|평가|분석)(이|도|가|은|는)? ?(나왔|있었|제기|이어졌|나온)|라고 (했|하셨|한)(고요|어요|는데요|죠|습니다)|다뤘(어요|는데요|습니다)|자리(가|에서) (있었|나왔)|도마에 올|정리한 얘기/; // full-v6.3: "~라고요"·"라고 불러요"·"그가 말하는 건"을 못 세어 전언 68% 대본(T260910-018)을 통과시켰다 // full-v8.3: 회의 중계체(지적·주장이 나왔/있었, ~라고 했고요, 다뤘어요, 자리에서) — 001 E16~E19·003 E25~E28 을 못 세었다
/** 귀속 표현이 있는 해설 턴의 비율 */
export function attributionStats(turns: { id: string | null; text: string }[]): { eTurns: number; attributed: number; ratio: number } {
  const e = turns.filter((t) => t.id?.startsWith("E"));
  const attributed = e.filter((t) => attributionRe.test(t.text)).length;
  return { eTurns: e.length, attributed, ratio: e.length ? attributed / e.length : 0 };
}
