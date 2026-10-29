import fs from "node:fs/promises";
import { applySeriesMaterial } from "./series-draft.js";
import path from "node:path";
import { cfg } from "../config.js";
import { insertRun, setJobProgress, updateJobPayload, type Job } from "../db.js";
import { executedBy } from "../config.js";
import { workerRev } from "../assets.js";
import { ApiLimit, RetryLater } from "../util.js";
import type { Executor } from "../executors/index.js";
import { assetPaths, buildDesignPrompt, buildWritePromptParts, DESIGN_SCHEMA, buildWritePromptPartsEn, outlineMarks, pipelineLocale, scriptZones, WRITE_SCHEMA, WRITE_SCHEMA_EN, type BacklogCandidate, type IntroStyle, type SeriesDraftContext, type Templates, speakerNames } from "@ear/pipeline";
import { exists, hostOf, log } from "../util.js";
import { parseScriptForTts, type ScriptTurn } from "../tts/script.js";
import { runDesignSingle } from "./design-single.js";
import { countWords, MIN_MINUTES_EN, MIN_WORDS_EN, WORDS_PER_MIN_EN } from "../script-length.js";
import { lengthProfileOf, lengthSpecOf, pickShortHook, type ShortRules } from "@ear/pipeline";
import { addPronunciations } from "../tts/normalize.js";

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
  introStyle: IntroStyle; fileTools: string[];
  signoffSeed?: number;
  /** 실험 no-gold (2026-09-15): 설계·대본 프롬프트에서 골드 예시를 뺀다 — settings.experiments.no_gold_backlog_ids 에 든 후보만 */
  noGold?: boolean;
  /** 재제작 원본(0040, KAN-296) — short 프로필 편이면 원본 제목·축. 설계가 같은 질문을 유지하게 한다 */
  remakeOf?: { title: string; axis?: string | null } | null;
  /** 짧은 판 규칙 자산(skills/draft/short.md, 2026-10-30) — short 편만 */
  shortRules?: ShortRules;
  /** 시리즈 편(spec/11 5장) — 설계·작성 블록, 설계 뒤 연결 재료 */
  series?: SeriesDraftContext;
  seriesId?: string;
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
    const d = await runDesignSingle({ job, ex, episodeId, candidate: cand, dir, assetRoot: a.assetRoot, promptVersion: a.promptVersion, noGold: a.noGold || pipelineLocale() === "en", series: a.series, remakeOf: a.remakeOf, shortRules: a.shortRules }); // 글로벌판 설계는 골드를 쓰지 않는다(대본 단계만)
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
    const floorMin = pipelineLocale() === "en" ? MIN_MINUTES_EN : lengthSpecOf(cand.length_profile).floorMin; // 0040: short 프로필은 5분
    if (design.estimated_minutes && design.estimated_minutes < floorMin) {
      throw new Error(`재료 부족 — 설계 예상 분량 ${design.estimated_minutes}분 < 하한 ${floorMin}분. ${design.notes.slice(0, 200)}`);
    }
    designSummary = `설계: 축 [${design.axis_type}] ${design.axis} · 구간 ${design.sections.length} (착지 #${design.landing_section}) · 발췌 ${design.excerpts}·claims ${design.claims} · 예상 ${design.estimated_minutes}분${design.gaps.length ? ` · 빈 역할 ${design.gaps.join("/")}` : ""}${design.sources_excluded.length ? ` · 제외 ${design.sources_excluded.map((x) => `${hostOf(x.url)} ${x.reason}`).join("; ").slice(0, 200)}` : ""}${design.split_proposal ? ` · ⚠ 분할 제안: ${design.split_proposal.slice(0, 200)}` : ""}`;
  }

  // ── 시리즈 편: 연결 재료(회상 claims 행 · sources 절 · series-links.json) — 설계 검증 뒤에 붙인다(spec/11 5.3, 멱등)
  if (a.series && !a.seriesId) throw new Error("시리즈 맥락에 series_id 가 없다");
  const series = a.series && a.seriesId ? await applySeriesMaterial(dir, a.seriesId, a.series) : undefined;

  // ── 2단계 대본 (단발) ─────────────────────────────────────────────────────────
  const ap = assetPaths(a.assetRoot, cfg.workRoot);
  const read = (p: string) => fs.readFile(p, "utf8");
  const [guidelines, specScript, goldFullEum, goldFullYuna, sourcesMd, claimsMd, outlineMd] = await Promise.all([
    // 글로벌판 골드(full-en-v0.19 골드 실험): gold-en-1·2 를 같은 두 칸으로 넘긴다 — 번들에 없으면(선택 자산) 골드 없이
    read(ap.guidelines), read(ap.specScript),
    a.noGold ? Promise.resolve("") : pipelineLocale() === "en" ? read(ap.goldEn[0]).catch(() => "") : read(ap.goldFullEum),
    a.noGold ? Promise.resolve("") : pipelineLocale() === "en" ? read(ap.goldEn[1]).catch(() => "") : read(ap.goldFullYuna),
    read(path.join(dir, "sources.md")), read(path.join(dir, "claims.md")), read(path.join(dir, "outline.md")),
  ]);
  const pronFile = path.join(dir, "pronunciations.json");
  const pronunciationsJson = (await exists(pronFile)) ? await read(pronFile) : "{}";
  const estimatedMinutes = design?.estimated_minutes || Number(outlineMd.match(outlineMarks().estimate)?.[1]) || 15; // 설계 이어받기면 outline.md 에서 읽는다
  const en = pipelineLocale() === "en"; // 글로벌판: 영어 대본 프롬프트·스키마 (global-prompts.ts)
  const shortHook = !en && lengthProfileOf(cand.length_profile) === "short" ? pickShortHook(Number(cand.id.replace(/\D/g, "")) || 0) : undefined; // 0040: 짧은 판 도입 훅 — 후보 번호로 번갈아(선취형·약속형)
  const parts = (en ? buildWritePromptPartsEn : buildWritePromptParts)({ episodeId, candidate: cand, introStyle: a.introStyle, promptVersion: a.promptVersion, templates: a.templates, majorTopic: a.majorTopic, signoffSeed: a.signoffSeed, estimatedMinutes, guidelines, specScript, goldFullEum, goldFullYuna, sourcesMd, claimsMd, outlineMd, pronunciationsJson, series, shortHook, shortRules: a.shortRules });
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
    prompt: parts.user, systemPrompt: parts.system, schema: en ? WRITE_SCHEMA_EN : WRITE_SCHEMA,
    tools: [], allowedTools: [], cwd: cfg.workRoot, timeoutMs: 60 * 60_000, model: cfg.draftWriteModel, maxThinkingTokens: cfg.thinkingWrite, effort: cfg.effortWrite, // 60분 — opus 대본 실측 30분+ (2026-09-09)
    onProgress: (pr) => setJobProgress(job.id, { ...pr, phase: "대본 2/2 — 단발 작성", detail: pr.turns > 0 ? "대본 작성 중 (도구 없음)" : pr.detail }).catch(() => {}),
  }); }
  const o = w.output;
  if (!o.script || !o.script.includes(`## [${scriptZones().intro}]`)) throw new Error(`2단계 대본이 비었거나 구역 헤더가 없음 (script ${o.script?.length ?? 0}자). notes="${(o.notes ?? "").slice(0, 200)}"`);

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
    addPronunciations(cur, o.pronunciations_added); // 글로벌판은 힌트 없는 등재도 남긴다(명세 6.7)
    await fs.writeFile(pronFile, JSON.stringify(cur, null, 2) + "\n", "utf8");
  }

  const stats = scriptStats(o.script);
  const writeCost = w.listCostUsd ?? 0;
  const summary = `${episodeId} 초안 완료 (2단계 · ${ex.kind}, 도입 ${shortHook ? `짧은 판 ${shortHook.label} 훅 · ${a.shortRules?.version ?? "규칙 없음"}` : a.introStyle.label}, 템플릿 ${a.templates?.version ?? "미적용"}). ${designSummary}. 대본: "${o.title}" ${stats.turns}턴·${stats.words !== undefined ? `${stats.words}단어` : `${stats.chars}자`}·약 ${stats.minutes}분 · claims 대응 턴 ${o.turn_claims.length} · 새 연결 ${o.bridges.length} · 자기 점검 수정 ${o.self_check_fixes.length}건 · 구간 준수 ${o.sections_followed ? "예" : "아니오"}. 비용 설계 $${designCost.toFixed(2)} + 대본 $${writeCost.toFixed(2)} (effort ${cfg.effortDesign ?? "기본"}/${cfg.effortWrite ?? "기본"}). ${o.notes}`;
  return {
    summary, model: w.model ?? designModel, costUsd: designCost + writeCost,
    tokens: { design: designTokens, write: (w.raw as { usage?: unknown } | undefined)?.usage, design_model: designModel, write_model: w.model },
    design, write: o, stats,
  };
}

/** 공백·기호 제외 글자 수·턴 수·분량 환산 (341자/분 — eleven_v4 실측, 2026-10-08) — 모델 자기보고 대신 워커가 센다.
 *  글로벌판은 단어 수를 더하고 분량을 단어 ÷ 150 으로 낸다(script-length.ts, KAN-203). 한국판에는 words 키가 없다 */
export function scriptStats(md: string): { turns: number; chars: number; minutes: number; words?: number } {
  const p = parseScriptForTts(md);
  const chars = p.turns.reduce((n, t) => n + (t.text.match(/[가-힣A-Za-z0-9]/g)?.length ?? 0), 0);
  if (pipelineLocale() === "en") {
    const words = p.turns.reduce((n, t) => n + countWords(t.text), 0);
    return { turns: p.turns.length, chars, words, minutes: Math.round((words / WORDS_PER_MIN_EN) * 10) / 10 };
  }
  return { turns: p.turns.length, chars, minutes: Math.round((chars / 341) * 10) / 10 };
}

/** 2단계 L0 — 구성안 계약(구간 수·순서)과 분량 하한(13분 ≈ 4,300자)을 기계로 검사한다. 위반은 재생성 연쇄로. 하한은 2026-10-08 박수헌: eleven_v4 말 속도(실측 341자/분)에 맞춰 4,000 → 4,300 */
/** @param opts.signoffHeads 템플릿 클로징 인사 골격들의 고정 머리(첫 {슬롯} 앞 문구, tpl-v2). 있으면 마지막 턴이 진행(Y) 턴이고 그중 하나를 담아야 한다 */
export interface L0AttributionInput { claimsMd?: string; sourcesMd?: string; notesMd?: string; pronunciations?: Record<string, string> }
export function twoStageViolations(scriptMd: string, outlineMd: string, opts: { signoffHeads?: string[]; /** 0040: short 면 하한 1,700자·상한 4,100자 */ lengthProfile?: string | null } & L0AttributionInput = {}): string[] {
  if (pipelineLocale() === "en") return twoStageViolationsEn(scriptMd, outlineMd, opts);
  const v: string[] = [];
  const spec = lengthSpecOf(opts.lengthProfile);
  const planned = [...outlineMd.matchAll(/^구간 #(\d+)/gm)].map((m) => Number(m[1]));
  const written = [...scriptMd.matchAll(/^### #(\d+)/gm)].map((m) => Number(m[1]));
  if (planned.length && written.length !== planned.length) v.push(`구성안 구간 ${planned.length}개인데 대본의 "### #n" 헤더가 ${written.length}개 — 구간 계약 위반 (outline.md 순서대로 전 구간을 써야 한다)`);
  else if (planned.length && written.some((n, i) => n !== planned[i])) v.push(`구간 번호 순서가 구성안과 다름 (구성안 ${planned.join(",")} / 대본 ${written.join(",")})`);
  const s = scriptStats(scriptMd);
  if (s.chars < spec.floorChars) v.push(`분량 ${s.chars}자(약 ${s.minutes}분) — 하한 ${spec.floorMin}분(약 ${spec.floorChars.toLocaleString()}자) 미달. 채우기 없이 구성안 재료(예비 재료·역사 맥락)를 더 실행해 늘린다`);
  if (spec.maxChars && s.chars > spec.maxChars) v.push(`분량 ${s.chars}자(약 ${s.minutes}분) — ${spec.label} 상한 ${spec.maxMin}분(약 ${spec.maxChars.toLocaleString()}자) 초과. 재료를 빼지 말고 해설 턴의 풀어 쓰기를 줄인다`);
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
  v.push(...v98Violations(scriptMd, p.turns));
  v.push(...v99Violations(p.turns));
  v.push(...v910Violations(p.turns));
  v.push(...v911Violations(p.turns));
  // full-v7 (2026-09-15): 귀속 표현 턴 비율 검사는 폐지 — 32~36% 인 편에서도 소스 순회(재식별 15건)가 있었다. 구조 검사로 대체
  v.push(...attributionViolations(scriptMd, p.turns, opts));
  return v;
}

/**
 * 글로벌판 L0 (글로벌 명세 6.5, KAN-203) — 형식 계약만 본다: 구역 헤더·구성안 구간 계약·분량 하한(단어)·과다 분량·마지막 턴과 클로징 머리 문구.
 * 한국어 문체·귀속 검사는 돌지 않는다. 영어 문체 검사는 영어 규칙 자산 v0 와 함께 정하고 파일럿 판정으로 늘린다.
 * 메시지는 영어다 — 수정 재생성 프롬프트가 그대로 읽는다(명세 4.5: 모델이 읽는 글은 영어). 문체 검사(enStyleViolations)는 아래.
 */
export function twoStageViolationsEn(scriptMd: string, outlineMd: string, opts: { signoffHeads?: string[]; pronunciations?: Record<string, string>; notesMd?: string } = {}): string[] {
  const v: string[] = [];
  const z = scriptZones();
  const order = [z.intro, z.lead, z.body, z.outro];
  const zones = [...scriptMd.matchAll(/^#{2,}\s*\[([^\]]+)\]/gm)].map((m) => m[1].trim());
  if (zones.join("\u0000") !== order.join("\u0000")) v.push(`Zone headers are ${zones.length ? zones.map((x) => `[${x}]`).join(" ") : "missing"} — the script has exactly four zones, in this order: ${order.map((x) => `## [${x}]`).join(" → ")}`);
  const marks = outlineMarks();
  const planned = [...outlineMd.matchAll(marks.section)].map((m) => Number(m[1]));
  const written = [...scriptMd.matchAll(/^### #(\d+)/gm)].map((m) => Number(m[1]));
  if (planned.length && written.length !== planned.length) v.push(`The outline has ${planned.length} sections but the script has ${written.length} "### #n" headers — write every outline section, in outline order`);
  else if (planned.length && written.some((n, i) => n !== planned[i])) v.push(`Section order differs from the outline (outline ${planned.join(",")} / script ${written.join(",")})`);
  const s = scriptStats(scriptMd);
  const words = s.words ?? 0;
  if (words < MIN_WORDS_EN) v.push(`Length ${words} words (about ${s.minutes} min) — below the ${MIN_MINUTES_EN}-minute floor (${MIN_WORDS_EN} words). Use more of the outline's material (reserve material, background); do not pad`);
  const est = Number(outlineMd.match(marks.estimate)?.[1]);
  if (est && s.minutes > est * 1.6) v.push(`Length ${words} words (about ${s.minutes} min) — more than 1.6× the outline estimate of ${est} min. Keep the material; shorten long explainer turns to land within ±15% of the estimate`);
  const heads = (opts.signoffHeads ?? []).map((h) => h.replace(/\s+/g, " ").trim()).filter(Boolean);
  if (heads.length) {
    const p = parseScriptForTts(scriptMd);
    const last = p.turns[p.turns.length - 1];
    const text = last?.text.replace(/\s+/g, " ") ?? "";
    if (!last?.id?.startsWith("Y")) v.push(`The last turn is not a host (Y) turn (${last?.id ?? "none"}) — after the explainer's wrap-up, the host closes with one sign-off turn ("${heads[0]} …")`);
    else if (!heads.some((h) => text.includes(h))) v.push(`The last turn ${last.id} lacks the sign-off frame ("${heads[0]}"${heads.length > 1 ? ` or ${heads.length - 1} other${heads.length > 2 ? "s" : ""}` : ""}) — keep the sign-off line word for word as the end of that turn; a series sentence, if the episode has one, comes right before it in the same turn`);
  }
  // 클로징 도입 칸 (tpl-en-v4, 2026-10-18): {episode_recap} 은 인트로의 {episode_line} 과 같은 주제를 다른 말로 — 같은 단어면 인트로 되풀이다(G261018-001~003)
  {
    const tt = parseScriptForTts(scriptMd).turns;
    const norm = (x: string) => x.toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9' ]+/g, " ").replace(/\s+/g, " ").trim();
    const introLine = tt[0]?.text.match(/Today we're talking about (.+?)\.(?:\s|$)/)?.[1];
    const lead = tt.find((t) => t.section === z.outro);
    const recap = lead?.text.match(/We've been talking about (.+?)\.(?:\s|$)/)?.[1];
    if (introLine && recap && norm(introLine) === norm(recap)) v.push(`The closing lead ${lead!.id} repeats the intro's line ("${recap.slice(0, 80)}") — fill {episode_recap} with the same topic in different words`);
  }
  // 화자 라벨 (2026-10-17 출연진 4명): 이 편의 2인조와 맞아야 한다 — 파서는 네 이름을 다 받으므로 다른 팀 이름이 섞여도 여기서 잡는다
  const [explainer, host] = speakerNames();
  const wrong = parseScriptForTts(scriptMd).turns.filter((t) => t.id && (t.id.startsWith("E") ? t.speaker !== explainer : t.speaker !== host)).map((t) => `${t.id} [${t.speaker}]`);
  if (wrong.length) v.push(`Speaker labels do not match this episode's pair (${wrong.slice(0, 6).join(", ")}${wrong.length > 6 ? " …" : ""}) — E turns are [${explainer}], Y turns are [${host}]`);
  v.push(...enStyleViolations(parseScriptForTts(scriptMd).turns));
  v.push(...outlineCopyViolations(scriptMd, outlineMd));
  v.push(...axisAnswerViolations(outlineMd, opts.notesMd));
  // 한국어 표현을 가리키면서 표현을 말하지 않는 해설 턴 (규칙 50, full-en-v0.6) — G261017-001 E22·E29: 설계가 등재한 동사형 표현 4개가 대본에서 빠지고 "Neither expression…"·"Korean expressions distinguish…" 만 남았다.
  // 등재 표제어가 하나도 없는 턴만 잡는다 — 영어 표현을 가리키는 "English expression" 과 "an expression of regret" 같은 일반 명사 쓰임은 뺀다
  const keys = Object.keys(opts.pronunciations ?? {}).map((k) => k.trim()).filter(Boolean);
  if (keys.length) {
    const alt = keys.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
    const keyRe = new RegExp(`(?<![A-Za-z0-9])(?:${alt})(?![A-Za-z0-9])`, "i");
    const vague = parseScriptForTts(scriptMd).turns.filter((t) => t.id?.startsWith("E") && /(?<!English )\bexpressions?\b(?! of\b)/i.test(t.text) && !keyRe.test(t.text)).map((t) => t.id!);
    if (vague.length) v.push(`${EN_STYLE_MARK} explainer turns speak of a Korean expression without saying it (${vague.join(", ")}) — say the romanized expression in that turn, with its meaning (rule 50)`);
  }
  return v;
}

/**
 * 축 답 claims 누락 (규칙 38, full-en-v0.16 — G261019-003: 구성안이 '왜'에 답하는 claims C04·C25·C26·C34 를 배정했는데 대본이 넷 다 빼고 3.1 6점).
 * 구성안 `Axis answer:` 줄의 claim 이 script-notes 의 해설 턴별 claims 표에 하나라도 없으면 위반. 표가 없으면(설계 이어받기 전 편) 보지 않는다
 */
export function axisAnswerViolations(outlineMd: string, notesMd?: string): string[] {
  const ids = outlineMd.match(/^Axis answer:\s*(.+)$/m)?.[1].match(/\bC\d{2,3}\b/g) ?? [];
  if (!ids.length || !notesMd) return [];
  const used = new Set<string>();
  for (const m of notesMd.matchAll(/^\|\s*E\d+\s*\|\s*([^|]*)\|/gm)) for (const c of m[1].match(/\bC\d{2,3}\b/g) ?? []) used.add(c);
  const missing = [...new Set(ids)].filter((c) => !used.has(c));
  return missing.length ? [`Axis answer claims ${missing.join(", ")} are not used in any explainer turn — use every claim on the outline's Axis answer line in the section it belongs to; the Closing answer rests on them (rule 38)`] : [];
}

/**
 * 구성안 지시 문구의 대사 유출 (규칙 36, full-en-v0.9 — G261017-004~006: "A possible starting picture is …"·"That reported connection concerns …"·결론형 Opens with 가 그대로 대사가 됐다).
 * 지시 줄(Familiar picture·Opens with·Scene·Insider detail·Purpose·Transition·Development·Interaction)과 대본 턴이 8단어 이상 그대로 겹치면 문체 위반.
 * 축·클로징 문장은 대본이 축을 말해야 하므로(규칙 40), Host question·Question 은 진행자가 그대로 물어도 되므로 대조에서 뺀다
 * full-en-v0.10 (G261017-009~011): Terms 줄의 풀이가 대사가 됐다("the traditional clothing forms being discussed") — Terms 도 대조한다
 */
export function outlineCopyViolations(scriptMd: string, outlineMd: string): string[] {
  const N = 8;
  const words = (t: string) => t.toLowerCase().replace(/[’']/g, "'").match(/[a-z0-9']+/g) ?? [];
  const grams = new Set<string>();
  for (const m of outlineMd.matchAll(/^\s*(?:Familiar picture|Terms|Opens with|Scene|Insider detail|Purpose|Transition|Development|Interaction):\s*(.+)$/gim)) {
    const w = words(m[1]);
    for (let k = 0; k + N <= w.length; k++) grams.add(w.slice(k, k + N).join(" "));
  }
  if (!grams.size) return [];
  const hits: string[] = [];
  for (const t of parseScriptForTts(scriptMd).turns) {
    const w = words(t.text);
    for (let k = 0; k + N <= w.length; k++) if (grams.has(w.slice(k, k + N).join(" "))) { hits.push(`${t.id ?? t.section} "${w.slice(k, k + N).join(" ")}"`); break; }
  }
  return hits.length ? [`${EN_STYLE_MARK} turns copy the outline's instruction wording (${hits.slice(0, 6).join(", ")}${hits.length > 6 ? " …" : ""}) — the outline's lines are instructions, not dialogue; say it in new words (rule 36)`] : [];
}

/** 글로벌판 문체 위반 표지 — 이 머리로 시작하는 위반은 L0 한도 뒤 남아도 QA 로 넘긴다(한국판 비율 규칙과 같은 취급, RATIO_RULE_MARKS) */
export const EN_STYLE_MARK = "Style limit:";

/**
 * 글로벌판 문체 L0 (guidelines full-en 규칙 9·13·14·21·22·23~33·36·45·46, 2026-10-15). 정규식으로 잡히는 것만 — 판단이 필요한 것은 QA·비평이 본다.
 * 계약 위반(대본 ID·제작 용어·군말과 지문·상대 시점·긴 해설 턴·턴당 수치 과다)은 한도 뒤 남으면 실패, 문체 위반(EN_STYLE_MARK)은 QA 로 넘긴다.
 * 임계값은 첫 판이다 — 파일럿 첫 3편의 위반 분포를 보고 조정한다(CHANGELOG full-en-v0.1). 지목한 턴을 메시지에 적는다(수정 호출은 지목한 턴을 고친다).
 * 템플릿 턴(인트로 Y1·[Closing] 첫 턴·마지막 턴)은 상대 시점·첫마디 검사에서 뺀다 — 골격 문구("Today we're talking about")가 걸리지 않게
 */
export function enStyleViolations(turns: ScriptTurn[]): string[] {
  const v: string[] = [];
  const zones = scriptZones();
  const closingFirst = turns.findIndex((t) => t.section === zones.outro);
  const isTemplate = (i: number) => i === 0 || i === turns.length - 1 || i === closingFirst;
  const label = (t: ScriptTurn) => t.id ?? t.section;
  const list = (hits: string[]) => `${hits.slice(0, 8).join(", ")}${hits.length > 8 ? " …" : ""}`;
  const find = (re: RegExp, pick: (t: ScriptTurn, i: number) => boolean = () => true) =>
    turns.flatMap((t, i) => { if (!pick(t, i)) return []; const m = t.text.match(re); return m ? [`${label(t)} "${m[0].trim()}"`] : []; });
  const expl = (t: ScriptTurn) => !!t.id?.startsWith("E");

  // ── 계약 (한도 뒤 남으면 실패) ──
  const ids = find(/\bC\d{2,3}\b|\bS\d+-\d{2}\b/);
  if (ids.length) v.push(`Claim or excerpt IDs in spoken lines (${list(ids)}) — IDs go only in turn_claims; remove them from the script (rule 36)`);
  const prod = find(/\b(?:axis|outline|excerpts?|gold examples?|claims? (?:table|IDs?)|attributed)\b|\b(?:this|next|last|previous|earlier|that) (?:section|block)\b/i);
  if (prod.length) v.push(`Production words in spoken lines (${list(prod)}) — say it in the speakers' own words; never name the axis, outline, sections, blocks, claims, excerpts, or attribution (rule 36)`);
  const noise = find(/\b(?:um+|uh+|erm)\b|\b(?:ha){2,}\b|\[[A-Za-z][A-Za-z ]*\]|\*[A-Za-z][A-Za-z ]*\*|\((?:laughs?|sighs?|pause|chuckles?)[^)]*\)/i);
  if (noise.length) v.push(`Fillers, sound tags, or stage directions (${list(noise)}) — remove them; naturalness comes from content and rhythm (rule 32)`);
  const time = find(/\b(?:today|nowadays|these days|currently|recently|this year|last year|next year)\b/i, (_t, i) => !isTemplate(i));
  if (time.length) v.push(`Relative time words outside the templates (${list(time)}) — show time by tense: past practices in the past tense, current ones in the present (rule 46)`);
  const sentences = (t: string) => t.replace(/\.{2,}|…/g, " ").match(/[.!?](?:["'”’)]*)(?:\s|$)/g)?.length ?? 0;
  const long = turns.filter((t) => expl(t) && sentences(t.text) > 6).map((t) => `${label(t)} (${sentences(t.text)})`);
  if (long.length) v.push(`Explainer turns over six sentences (${list(long)}) — split with a host question or tighten; a turn has at most 6 sentences (rule 22)`);
  const numRe = /\d{1,2}:\d{2}|\d[\d,.]*/g; // 시각 9:30 은 수 하나
  const nums = turns.filter((t) => expl(t) && (t.text.match(numRe)?.length ?? 0) >= 5).map((t) => `${label(t)} (${t.text.match(numRe)!.length})`);
  if (nums.length) v.push(`Explainer turns with five or more numbers (${list(nums)}) — keep at most three per turn; drop numbers the point does not need (rule 45)`);

  // ── 문체 (한도 뒤 남으면 QA 로) ──
  const punct = find(/—|\s[–-]\s|;|\(|\)|:(?!\d)/);
  if (punct.length) v.push(`${EN_STYLE_MARK} dashes, semicolons, colons, or parentheses in spoken lines (${list(punct)}) — use periods and commas (rule 21)`);
  const vocab = find(/\b(?:crucial|pivotal|vital|fascinating|remarkable|profound|intricate|delv(?:e|es|ed|ing)|tapestry|testament|realm|underscor(?:e|es|ed|ing)|showcas(?:e|es|ed|ing)|foster(?:s|ed|ing)?|leverag(?:e|es|ed|ing)|resonat(?:e|es|ed|ing)|unpack(?:s|ed|ing)?|multifaceted|nuanced|seamless(?:ly)?|robust|transformative|groundbreaking|game-changer|ever-evolving)\b/i);
  if (vocab.length) v.push(`${EN_STYLE_MARK} rating words or AI vocabulary (${list(vocab)}) — state the fact and its effect in plain words (rules 23 and 24)`);
  const brochure = find(/\b(?:vibrant|timeless|iconic|nestled|steeped in|deeply rooted|hidden gem|must-see|breathtaking|rich (?:culture|cultural|history|heritage|tradition)|tradition meets modernity|where old meets new|land of the morning calm)\b/i);
  if (brochure.length) v.push(`${EN_STYLE_MARK} brochure language (${list(brochure)}) — describe the specific thing (rule 25)`);
  const inflated = find(/\b(?:serves as|stands as|plays an? (?:key|crucial|vital|pivotal|important) role|boasts)\b|,\s(?:highlighting|underscoring|reflecting|showcasing|emphasizing|signaling|symbolizing|demonstrating)\b/i);
  if (inflated.length) v.push(`${EN_STYLE_MARK} inflated verbs or a comment tail (${list(inflated)}) — use "is" or a direct verb; say the meaning in its own sentence or drop it (rules 26 and 27)`);
  const stock = find(/^(?:exactly|absolutely|totally|definitely|100%)\b|(?:^|[.!?]\s+)(?:exactly|absolutely|totally)[.!]|\b(?:great (?:question|point)|i love that|you're absolutely right|that makes sense|that's fascinating|oh,? interesting|and that's the (?:key|thing)|think of it like|in other words|i never thought of it that way|what a great way)\b|\bwow\b/i);
  if (stock.length) v.push(`${EN_STYLE_MARK} stock reactions or praise (${list(stock)}) — pick up the specific detail instead (rules 13, 14, and 29)`);
  const sign = find(/\b(?:let's (?:dive|unpack|break (?:it|this) down)|deep dive|here's the (?:thing|kicker)|here's where it gets|it's worth noting|it's important to note|that being said|at its core|to recap|in a nutshell|the bottom line|generally speaking)\b/i);
  if (sign.length) v.push(`${EN_STYLE_MARK} signposting or tone hedges (${list(sign)}) — go straight to the content (rules 29 and 33)`);
  const selfQ = find(/\b(?:the answer|why|how|the reason|the result)\?\s+[A-Z]/i, (t) => expl(t));
  if (selfQ.length) v.push(`${EN_STYLE_MARK} self-answered questions in explainer turns (${list(selfQ)}) — questions belong to the host (rule 30)`);
  const moral = find(/\b(?:it reminds us|food for thought|the real lesson|at the end of the day|it goes to show)\b/i);
  if (moral.length) v.push(`${EN_STYLE_MARK} morals or slogans (${list(moral)}) — end on what the block answered (rule 31)`);
  const contrastRe = /\bnot (?:just|only) \w|\bit'?s not [^.?!]{1,40}, it'?s\b|\brather than\b|\bnot [^.?!,]{1,30}, but\b/gi;
  const contrast = turns.flatMap((t) => (t.text.match(contrastRe) ? [label(t)] : []));
  const contrastN = turns.reduce((n, t) => n + (t.text.match(contrastRe)?.length ?? 0), 0);
  if (contrastN > 2) v.push(`${EN_STYLE_MARK} contrast frames ("not X, but Y", "rather than", "not just") used ${contrastN} times (${list(contrast)}) — at most two per episode, only to correct a stated view (rule 28)`);
  const opener = (t: string) => t.toLowerCase().replace(/[^a-z' ]/g, " ").trim().split(/\s+/).slice(0, 2).join(" ");
  const counts = new Map<string, string[]>();
  turns.forEach((t, i) => { if (isTemplate(i)) return; const o = opener(t.text); if (o) counts.set(o, [...(counts.get(o) ?? []), label(t)]); });
  const repeated = [...counts].filter(([, ids]) => ids.length > 3).map(([o, ids]) => `"${o}" ×${ids.length} (${ids.slice(0, 4).join(", ")})`);
  if (repeated.length) v.push(`${EN_STYLE_MARK} the same turn opener more than three times: ${repeated.join("; ")} — vary how turns start (rule 13)`);
  const soTurns = turns.filter((t, i) => !isTemplate(i) && /^(?:so|okay,? so)\b/i.test(t.text.trim())).map(label);
  if (soTurns.length >= 3 && soTurns.length > turns.length / 10) v.push(`${EN_STYLE_MARK} ${soTurns.length} turns open with "So" or "Okay, so" (${list(soTurns)}) — at most one turn in ten (rule 13)`);
  // full-en-v0.2 (2026-10-16, G261015-001 에이전트 판정): 첫 두 단어로 세면 "I'd feel"·"I'd still" 이 갈려 진행 턴 9개가 "I'd" 로 시작해도 빠져나갔다 — 진행 턴은 첫 단어로 따로 센다. 의문사·조동사로 여는 질문은 뺀다
  const QUESTION_HEAD = new Set(["what", "how", "why", "when", "where", "which", "who", "whose", "does", "do", "did", "is", "are", "was", "were", "can", "could", "would", "will", "should", "has", "have"]);
  const hostHead = new Map<string, string[]>();
  turns.forEach((t, i) => { if (isTemplate(i) || !t.id?.startsWith("Y")) return; const w = t.text.trim().split(/\s+/)[0]?.toLowerCase().replace(/[^a-z']/g, "").replace(/’/g, "'"); if (w && !QUESTION_HEAD.has(w)) hostHead.set(w, [...(hostHead.get(w) ?? []), label(t)]); });
  const hostRepeated = [...hostHead].filter(([, ids]) => ids.length > 4).map(([w, ids]) => `"${w}" ×${ids.length} (${ids.slice(0, 6).join(", ")})`);
  if (hostRepeated.length) v.push(`${EN_STYLE_MARK} the same first word opens more than four host turns: ${hostRepeated.join("; ")} — vary the host's forms: a question, a guess, a doubt, how it sounds from outside (rules 9 and 13)`);
  // 해설이 진행자의 말을 되받아 시작한다 (규칙 10) — 첫 문장이 진행자의 질문·추측·망설임을 이름 붙여 다시 말하는 턴
  const firstSentence = (t: string) => t.trim().split(/(?<=[.!?])\s+/)[0] ?? "";
  const echoRe = /\b(?:your|that|this|the) (?:hesitation|preference|doubt|guess|question|choice|concern|worry|point|reaction|instinct|feeling|uncertainty)\b|\byou(?:'ve| have)? (?:chose|chosen|picked|said|mentioned|asked|described|noticed)\b/i;
  const echo = turns.filter((t, i) => !isTemplate(i) && expl(t) && echoRe.test(firstSentence(t.text))).map(label);
  if (echo.length > 3) v.push(`${EN_STYLE_MARK} ${echo.length} explainer turns open by restating the host's words (${list(echo)}) — answer in the first sentence; do not name or paraphrase the host's question, guess, or feeling (rule 10)`);
  // 소스가 문장 주어 (규칙 42) — 단락마다 소스 명사 + 전달 동사로 시작하는 해설 문장. 소개 한 문장 + 하나까지
  const srcSubj = /^(?:the|this|that|one|another|a|an) (?:(?:[a-z]+|[A-Z][\w-]*) ){0,3}(?:guide|compiler|report|study|article|author|authors|researchers?|participant|participants|dictionary|entry|survey|book|writer|reporter|museum|encyclopedia|page|source|conversation|interview|essay|column|columnist|union|records?|maker)\b[^.?!]{0,40}?\b(?:says|said|describes|described|lists|listed|gives|gave|reports|reported|notes|noted|explains|explained|connects|connected|calls|called|treats|treated|warns|warned|includes|included|mentions|mentioned|adds|added|suggests|suggested|argues|argued|shows|showed|writes|wrote|uses|used|puts|links|separates|pairs|allows|presents|advises|rejects|recommends)\b/i;
  // full-en-v0.6 (G261017-001): 주어 꼴만 세니 "According to KEL"·"In KEL's account"·"KEL presents" 처럼 이름을 붙인 문장이 #4 에서 여덟 번 나와도 빠져나갔다 — 이름 붙이기 꼴도 같이 센다.
  // 대문자 약어 주어(KEL)만 고유명사로 본다 — 첫 글자만 대문자인 주어는 한국어 표현("Jeongi deulda describes…")과 가를 수 없다
  // full-en-v0.7 (G261017-002·003): "In the essay's explanation"·"according to the report"·"Its warning…"·"It argues…" 처럼 일반 명사·대명사로 출처를 부르는 꼴도 센다
  const srcRef = /^(?:[Aa]ccording to (?:the |this |that )?(?:[A-Z]|(?:essay|report|article|guide|column|study|survey|union|records?)\b)|[Ii]n (?:(?:the|this|that) )?(?:[A-Z][\w-]*|its|their|guide|article|essay|report|column|study|survey|union|records?)(?:'s|’s)? (?:[a-z]+ )?(?:article|guide|account|description|view|guidance|report|explanation|example|warning)\b|[A-Z]{2,}\b[^.?!]{0,20}?\b(?:says|advises|presents|describes|explains|warns|notes|argues|lists|gives|calls|treats|recommends|rejects|allows)\b)/;
  // 대명사로 출처를 부르는 꼴(v0.7 의 "It argues…"·"Its warning…")은 **바로 앞 문장이 출처 문장일 때만** 센다(2026-10-23 — G261023-024 E9 "The expression is iyeolchiyeol… It connects traditional belief…" 의 It 은 관용구인데 출처로 세어져 초안 L0 수정 3회를 허비했다). 정규식은 선행사를 모르므로 앞 문장으로 가늠한다 — 앞 문장이 출처면 대명사 문장도 출처, 그 다음 대명사 문장도 이어진다
  const srcPron = /^(?:(?:It|She|He|They) (?:says|argues|points|describes|reports|connects|warns|dates|explains|notes|suggests|adds|lists|calls)\b|Its (?:explanation|warning|account|view|description|guidance|claim|argument)\b)/;
  // full-en-v0.13 (G261018-006~008): 이름이 빠지자 출처 종류·연도가 그 자리를 차지했다 — "A drama commentator reads…"·"For a food writer"·"that 2017 description"·"A sociologist speaking in 2026"·"In 2026, guest lists had become".
  // 문장 머리의 보유자 종류, 연도를 붙인 자료 명사, "<분사> in 연도", 연도로 연 과거완료 문장을 센다. 통계의 자료 연도("about 18 percent in 2022")는 세지 않는다
  const srcKind = /^(?:(?:For|To) )?(?:a|an|one|the|another|that|this) (?:[a-z]+ )?(?:commentator|critic|writer|reporter|columnist|researcher|scholar|sociologist|historian|journalist|blogger|author|professor|expert)s?\b|\b(?:a|an|the|that|this|one) (?:19|20)\d{2} (?:description|report|account|article|guide|survey|study|column|essay|explanation|interview|list)\b|\b(?:described|given|written|speaking|reported|published|listed) in (?:19|20)\d{2}\b|^In (?:19|20)\d{2},? [^.?!]*\bhad (?:become|been|grown|shrunk|moved|changed|started|turned)\b|^(?:One|Another|A) (?:common |main |key |major )?(?:concern|assessment|criticism|critique|complaint|worry|proposal|argument|view) (?:is|was) that\b|^Another proposal is\b|\b(?:respondents|buyers surveyed|people surveyed)\b/i;
  // full-en-v0.23 (2026-10-25 — 10-22~25 운영 83편: 한국어·사실 필수 수정 38건·24편이 문장 가운데의 출처 지칭): "in a food researcher's view"·"in a survey"·"the same survey"·
  // "as Kakao's co-chief executive explained"·"At a press interview"·"interviewed"·"a music critic calls it". 문장 머리만 보던 srcKind 가 놓친 자리다 — 관찰자 역할 + 견해 명사, 자료 명사 앞의 전치사, 취재 동사를 센다.
  // 관행 속 역할(parent·fan·shop owner)은 세지 않고, 관찰자 명사도 "a professor" 단독(실제 교수가 관행의 인물일 때)은 세지 않는다 — 견해 명사나 전달 동사가 붙을 때만
  const OBSERVER = "(?:researcher|professor|critic|journalist|reporter|columnist|curator|publisher|commentator|scholar|historian|sociologist|anthropologist|economist|analyst|expert|executive|spokesperson|official|interviewee)s?";
  const srcMid = new RegExp(
    `\\b(?:in|from|per|according to) (?:a|an|the|one|another|that|this|the same) (?:[a-z]+ )?(?:survey|poll|study|report|interview|press interview|article|column|essay|paper)\\b` +
    `|\\b(?:a|an|the|one|another|that|this|[A-Z][\\w-]*'s) (?:[a-z-]+ )?${OBSERVER}(?:'|’)s? (?:view|views|opinion|words|account|estimate|explanation|reading|interpretation|description|assessment|telling)\\b` +
    `|\\b(?:a|an|the|one|another|[A-Z][\\w-]*'s) (?:[a-z-]+ )?${OBSERVER} (?:explained|explains|said|says|argued|argues|noted|notes|described|describes|pointed out|points out|put it|puts it|estimated|estimates|wrote|writes|warned|warns|told|tells|called|calls|found|finds)\\b` +
    `|\\b(?:interviewed|surveyed)\\b|\\bin an? (?:[a-z]+ )?interview\\b|\\bat a press (?:interview|conference|briefing)\\b|\\btold (?:a|the) (?:reporter|newspaper|magazine|interviewer|broadcaster)\\b`, "i");
  const perSection = new Map<string, string[]>();
  let prevSrc: boolean = false; let prevTopic: string | undefined;
  for (const t of turns) {
    if (!expl(t) || t.section !== zones.body) continue;
    if ((t.topic ?? t.section) !== prevTopic) { prevSrc = false; prevTopic = t.topic ?? t.section; } // 구간이 바뀌면 선행사도 끊긴다
    let n = 0;
    for (const raw of t.text.split(/(?<=[.!?])\s+/)) { const x = raw.trim(); const direct = srcSubj.test(x) || srcRef.test(x) || srcKind.test(x) || srcMid.test(x); const pron: boolean = !direct && prevSrc && srcPron.test(x); if (direct || pron) n++; prevSrc = direct || pron; }
    for (let k = 0; k < n; k++) perSection.set(t.topic ?? t.section, [...(perSection.get(t.topic ?? t.section) ?? []), label(t)]);
  }
  // full-en-v0.12 (G261018-001~003, 박수헌 2026-10-18 "귀속 빼"): 출처는 앱이 보여 준다 — 대사에서 출처를 부르는 문장은 하나도 두지 않는다
  const srcLoops = [...perSection].filter(([, ids]) => ids.length > 0).map(([sec, ids]) => `"${sec}" ${ids.length} (${[...new Set(ids)].join(", ")})`);
  if (srcLoops.length) v.push(`${EN_STYLE_MARK} sources named in lines: ${srcLoops.join("; ")} — the app lists sources; do not name them or point to them by kind or year, tell the content directly as an insider; "According to", "In … account", "in a researcher's view", "in a survey", "interviewed", and "a critic calls it" count too; give a view to the people the claim names, by a role in the practice, not an observer (rule 42)`);
  // full-en-v0.21 (15회차 세 편 모두 내부자 3.11 2 — "One view is that"·"In her view"·"One interpretation" 거리두기 틀이 턴마다): 해설 문장의 견해 틀은 에피소드에 한 번까지
  const viewFrame = /\b(?:One (?:view|interpretation|reading|explanation|way to (?:understand|see|read|think about))|Another (?:view|interpretation|way to (?:understand|see))|In (?:that|this|her|his|their|one|its [a-z]+'s|the [a-z]+'s) (?:view|interpretation|reading))\b/i;
  const frames = turns.flatMap((t, i) => (!isTemplate(i) && expl(t) ? t.text.split(/(?<=[.!?])\s+/).filter((x) => viewFrame.test(x)).map(() => label(t)) : []));
  if (frames.length > 1) v.push(`${EN_STYLE_MARK} ${frames.length} explainer sentences use a view frame such as "One view is", "One way to understand", or "In that view" (${list(frames)}) — at most one per episode; give the view to the people the claim names, by role, or tell the practice directly (rule 42)`);
  // 턴 끝 요약 (규칙 31, full-en-v0.7 — G261015-001 · G261017-001·002·003 에이전트 판정에서 네 편 연속): 세 문장 이상인 해설 턴의 마지막 문장이
  // So·This·That·These·Those·Both·Each 로 시작해 앞 내용을 묶으면 센다. 넷 이상이면 문체 위반(한도 뒤 QA 로). 마지막 문장 지우기 시험은 규칙 31 이 맡는다
  const lastSentence = (t: string) => { const s = t.trim().split(/(?<=[.!?])\s+/).filter(Boolean); return s.length >= 3 ? s[s.length - 1] : ""; };
  const tails = turns.filter((t, i) => !isTemplate(i) && expl(t) && /^(?:So|This|That|These|Those|Both|Each|Their)\b[^?]*\.$/.test(lastSentence(t.text))).map(label); // Their: full-en-v0.15 (G261018-013 E12 "Their relationship to the speaker differs.")
  if (tails.length > 3) v.push(`${EN_STYLE_MARK} ${tails.length} explainer turns end on a sentence that sums up the turn (${list(tails)}) — end on the newest point; delete a last sentence the turn does not need (rule 31)`);
  // full-en-v0.9 (G261017-004~006): 장면이 "Imagine a …" 한 문장 틀로 굳었다 — 해설 턴에서 Imagine 으로 시작하는 문장이 셋 이상이면 문체 위반(규칙 3·39)
  // full-en-v0.10 (G261017-009~011): "Picture …"·"In an imagined comparison" 으로 같은 틀이 이어졌다(010 넷 · 011 셋) — 같이 센다
  const imagine = turns.flatMap((t, i) => (!isTemplate(i) && expl(t) ? t.text.trim().split(/(?<=[.!?])\s+/).filter((x) => /^(?:Imagine|Picture)\b|\bimagined\b/i.test(x.trim())).map(() => label(t)) : []));
  // full-en-v0.13 (G261018-008): 오프닝이 "Imagine …" 한 줄로 열렸다 — Opening 은 Familiar picture 로 연다. 한 번도 문체 위반(규칙 37)
  // full-en-v0.19 (12회차 004·009 두 회차 연속): "Suppose" 도 같은 틀
  const openImagine = turns.flatMap((t, i) => (!isTemplate(i) && t.section === zones.lead && /^(?:Imagine|Picture|Suppose)\b/.test(t.text.trim()) ? [label(t)] : []));
  if (openImagine.length) v.push(`${EN_STYLE_MARK} the Opening starts with "Imagine", "Picture", or "Suppose" (${list(openImagine)}) — start from the familiar picture, in plain words (rule 37)`);
  // full-en-v0.13 (G261018-006~008, 3.11 3·2·3): 진행자의 질문 아닌 턴이 "I'd …"·"I would …" 가정형 틀로 굳었다 — 넷 이상이면 문체 위반(규칙 9)
  // full-en-v0.14 (G261018-010~012): would 를 막자 "to me"·"I find"·"I notice"·"I feel" 자기 상태 서술로 같은 틀이 옮겨 갔다 — 함께 센다
  // full-en-v0.15 (G261018-014): 낱말 목록 상한에 정확히 맞추고 목록 밖 "I hadn't considered"로 넷째가 나왔다 — 낱말 대신 1인칭(I·me·my)과 would 로 센다
  const firstPerson = (s: string) => /(?<![A-Za-z'’])I(?:['’](?:m|d|ve|ll))?(?![A-Za-z])/.test(s) || /\b(?:me|my|mine|would)\b/i.test(s);
  const hostSelf = turns.filter((t, i) => !isTemplate(i) && t.id?.startsWith("Y") && !t.text.includes("?") && firstPerson(t.text)).map(label);
  if (hostSelf.length > 3) v.push(`${EN_STYLE_MARK} ${hostSelf.length} host turns that are not questions speak in the first person (I, me, my) or with "would" (${list(hostSelf)}) — at most three; make the rest a guess about the scene or a doubt (rule 9)`);
  // full-en-v0.17 (G261019-001·G261020-001·003, 9·10회차 연속): 1인칭을 막자 질문 아닌 진행 턴이 "That sounds like …"·"That feels …" 반응 틀로 굳었다 — 셋 이상이면 문체 위반(규칙 9)
  const hostSounds = turns.filter((t, i) => !isTemplate(i) && t.id?.startsWith("Y") && !t.text.includes("?") && /\b(?:sounds?|feels?|seems?)\b/i.test(t.text)).map(label);
  // full-en-v0.20 (13회차 G261020-012: 질문 아닌 진행 턴 넷이 전부 "Perhaps/probably" 추측 — 골드 1 의 형식이 옮겨 왔다) — 추측 낱말 셋 이상 · 같은 첫 낱말(관사 제외) 셋 이상이면 문체 위반
  const hostPlain = turns.filter((t, i) => !isTemplate(i) && t.id?.startsWith("Y") && !t.text.includes("?"));
  // full-en-v0.21 (15회차 G261021-002~004: probably 를 막자 질문 아닌 진행 턴이 전부 "might" 추측으로 옮겨 갔다) — might·may 도 같이 센다
  const hedged = hostPlain.filter((t) => /\b(?:might|may|probably|perhaps|maybe)\b/i.test(t.text)).map(label);
  if (hedged.length > 2) v.push(`${EN_STYLE_MARK} ${hedged.length} host turns that are not questions are built on "might", "may", "probably", "perhaps", or "maybe" (${list(hedged)}) — at most two; mix a guess, a doubt, and a plain observation of a detail (rule 9)`);
  const firstWord = new Map<string, string[]>();
  for (const t of hostPlain) { const w = t.text.trim().split(/\s+/)[0]?.toLowerCase().replace(/[^a-z']/g, ""); if (w && !["the", "a", "an"].includes(w)) firstWord.set(w, [...(firstWord.get(w) ?? []), label(t)]); }
  // 관사는 세지 않고 같은 첫 낱말 셋부터 — 진행 턴이 서른 개인 긴 대본에서도 틀만 잡는다
  const sameStart = [...firstWord].filter(([, ids]) => ids.length > 2).map(([w, ids]) => `"${w}" ×${ids.length} (${ids.join(", ")})`);
  if (sameStart.length) v.push(`${EN_STYLE_MARK} host turns that are not questions start with the same word: ${sameStart.join("; ")} — start each one differently (rule 9)`);
  if (hostSounds.length > 2) v.push(`${EN_STYLE_MARK} ${hostSounds.length} host turns that are not questions react with "sounds", "feels", or "seems" (${list(hostSounds)}) — at most two; make the rest a guess about the scene or a doubt (rule 9)`);
  // 사례 틀 반복 (규칙 3, full-en-v0.15 — G261018-015 "one family's / another family's remembered …"가 턴마다 붙었다) — 셋 이상이면 문체 위반
  const caseFrame = turns.flatMap((t, i) => (!isTemplate(i) && expl(t) ? (t.text.match(/\b(?:one|another|a different) family['’]s\b|\bremembered\b/gi) ?? []).map(() => label(t)) : []));
  if (caseFrame.length > 2) v.push(`${EN_STYLE_MARK} the case frame "one family's" / "another family's" / "remembered" is used ${caseFrame.length} times (${list([...new Set(caseFrame)])}) — say who a case is about once, then tell the moment (rule 3)`);
  if (imagine.length > 2) v.push(`${EN_STYLE_MARK} ${imagine.length} imagined scenes ("Imagine", "Picture", "imagined") (${list(imagine)}) — keep at most two; build scenes from a claim with words said, an object, or a sound (rules 3 and 39)`);
  // 읽기·설계 흔적 — 구성안·claims 를 옮겨 적은 말(규칙 36, G261017-005·006)
  // full-en-v0.13 (G261018-008 E14): 구성안 Scene 메모가 대사가 됐다 — "A broader K-pop café event gives one example"
  // full-en-v0.10 (G261017-009·011): 자료를 가리키는 말·보이지 않는 그림 — "the palace named in the report"·"quoted in the reporting"·"the report mentioned earlier"·"this picture of a charye table"
  const meta = find(/\b(?:described here|described above|reported connection|possible starting picture|as the (?:outline|plan) says|named in the report|in the reporting|being discussed|working meaning|(?:report|study|survey|article|source) mentioned earlier|this (?:picture|image|illustration) of|(?:gives|offers) (?:one|an) example|broader [^.?!,]{1,30}? (?:event|example)|familiar picture|insider detail)\b/i);
  if (meta.length) v.push(`${EN_STYLE_MARK} planning or reading wording in lines (${list(meta)}) — say it in the speakers' own words (rule 36)`);
  // 해설자 질문 (규칙 15) — full-en-v0.14 (G261018-011·012, 006): 본문의 해설자 퀴즈를 편집자가 세 편째 역할 역전으로 짚었다 — Opening 에서 한 번만, 본문·클로징은 0
  const eQ = turns.filter((t, i) => !isTemplate(i) && expl(t) && t.text.includes("?"));
    // full-en-v0.18 (10회차 001 E1 · 11회차 006 E1 — Opening 의 해설자 질문도 역할 섞임): 상한 1 → 0
  if (eQ.length) v.push(`${EN_STYLE_MARK} the explainer asks questions in ${eQ.length} turn${eQ.length > 1 ? "s" : ""} (${list(eQ.map(label))}) — the explainer asks nothing in any zone; questions belong to the host (rule 15)`);
  // 안내문 말투 (규칙 1, full-en-v0.14 — G261018-010·011: 출처를 지우자 지침의 "are instructed to"·안내서의 "should" 가 해설자 목소리가 됐다) — 해설 턴의 규범형이 셋 이상이면 문체 위반
  const norm = turns.flatMap((t, i) => (!isTemplate(i) && expl(t) ? (t.text.match(/\b(?:should|shouldn't|are (?:instructed|required|expected|told) to|must)\b/gi) ?? []).map(() => label(t)) : []));
  if (norm.length > 2) v.push(`${EN_STYLE_MARK} explainer turns tell the listener what to do ("should", "are instructed to", "must") ${norm.length} times (${list([...new Set(norm)])}) — describe what people do in that place or on that day, not what they should do (rule 1)`);
  const bodyY = turns.filter((t) => t.section === zones.body && t.id?.startsWith("Y"));
  if (bodyY.length >= 6) {
    const q = bodyY.filter((t) => t.text.includes("?")).length;
    const r = q / bodyY.length;
    // 폭 40~75% (full-en-v0.22, 2026-10-23 — 종전 50~67%): 14턴이면 7~9개만 허용돼 QA 가 턴 하나를 고치게 할 때마다 비율에 걸리고, 비율을 맞추려 넣은 추측 턴이 다시 QA 항목 8(결론 선점)에 걸려 C76 이 3회 헛돌았다
    if (r < 0.4 || r > 0.75) v.push(`${EN_STYLE_MARK} ${q} of ${bodyY.length} Body host turns are questions (${Math.round(r * 100)}%) — between two in five and three in four are questions; the rest are guesses, doubts, or observations (rule 9)`);
  }
  return v;
}

/**
 * v9.4 정형 검사 (2026-09-29) — 29편 실측에서 편마다 같은 틀로 나온 것들. 규칙 문구(1·3·5·13-1·16·22·24)는 v9.3 에도 대부분 있었으나 지켜지지 않았다.
 * 임계값 근거(29편): 정리형 진행 턴 평균 29%(최대 56%) · "아니라" 편당 12.5회 · 사전 문형 2.2회 · "잠깐" 26편 · "○○님이라면" 28편 · 클로징 다짐형 24편 · "결국"/"이해하게 됩니다" 각 6·12편.
 * 지목한 턴을 메시지에 적는다 — 수정 호출은 최소 수정 원칙이라 턴을 지목해야 고친다(v8.3 뜸 교훈).
 */
/**
 * 비율 규칙 (2026-10-07 박수헌) — 편 전체에서 차지하는 비율로 판정하는 L0 3종. 지목한 턴만 고쳐서는 잘 풀리지 않아(고친 턴이 같은 갈래로 가거나 다른 턴이 늘어남)
 * L0 수정 한도를 다 쓴 뒤 이것만 남으면 실패시키지 않고 QA 로 넘긴다. 메시지와 판별이 같은 문구를 쓰도록 상수로 둔다 — 문구를 바꾸면 판별도 함께 바뀐다
 * "편 전체 N회 이하" 같은 횟수 상한(대조 문장·한계 고지·조건절 질문)은 비율이 아니다 — 한도 뒤에 남으면 실패
 */
export const RATIO_RULE_MARKS = ["셋 중 하나가 상한이다", "질문은 절반에서 3분의 2다", "같은 말끝은 질문의 5분의 2 이하다", "다체는 해설 문장의 30% 이하다",
  // v9.9.1 (2026-10-14): 문체 횟수 상한 둘도 한도 뒤엔 QA 로 넘긴다 — 사실·형식 위반이 아니라 말맛이라 초안을 멈출 사유가 아니다
  "명사절 감싸기는 편에 넷까지다", "\"~적인·~적으로\"는 편에 일곱 번까지다",
  // v9.10 (2026-10-14): 진행자의 추측을 맞장구 한마디로 받는 곳 — 주고받기 문체 규칙
  "추측을 맞장구 한마디로 받는 곳은 편에 한 번까지다",
  // v9.11 (2026-10-27, KAN-269 — PodBench 기준선): 리듬·진행 반응·도입 예고 문체 규칙. 같은 화자 해설 연속은 형식이라 여기 넣지 않는다(한도 뒤 실패)
  "같은 문장 수의 해설 턴은 다섯 턴 연속까지다", "진행자의 \"것 같아요\"는 편에 다섯 번까지다", "도입에서 구분을 예고하지 않는다",
  // 글로벌판 문체 위반(enStyleViolations) — 한국판 메시지와 겹치지 않는 영어 머리
  "Style limit:",
  // 시리즈 범위 검사(spec/11 6장, 2026-10-17) — 다른 편 몫을 풀어 쓴 곳. 판단 검사라 한도 뒤엔 QA 로
  "시리즈 범위:", "Series scope:"] as const;
export const isRatioViolation = (v: string): boolean => RATIO_RULE_MARKS.some((m) => v.includes(m));

/** L0 수정 한도 (2026-10-07: 2 → 3) — QA 회차(qa.ts MAX_ATTEMPTS = QA 실행 3회, 실패 뒤 수정 2회)와 따로 센다 */
export const L0_FIX_MAX = 3;
export type L0Next = { action: "fix" } | { action: "fail"; hard: string[] } | { action: "pass"; residual: string[] };
/** L0 위반이 있을 때 다음 동작 — 한도 전이면 수정, 한도 뒤에는 비율 위반만 남았으면 QA 로 넘기고(pass) 그 밖의 위반이 남았으면 실패(fail). 위반이 없으면 null */
export function l0Next(violations: string[], l0Fixes: number): L0Next | null {
  if (!violations.length) return null;
  if (l0Fixes < L0_FIX_MAX) return { action: "fix" };
  const hard = violations.filter((v) => !isRatioViolation(v));
  return hard.length ? { action: "fail", hard } : { action: "pass", residual: violations };
}

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
    v.push(`진행 턴 ${bodyY.length}개 중 ${summaryY.length}개가 물음표 없는 정리형("~네요"·"~군요"·"~로 들려요")으로 끝남 — ${RATIO_RULE_MARKS[0]}. 다음 ${picks.length}개 턴을 전부 바꾼다: ${ids(picks, 12)}. 자기 처지에서의 느낌, 한두 마디 수긍, 이해가 막힌 자리의 되물음 가운데 하나로 — 앞 해설을 다시 정리하는 문장으로 바꾸지 않는다 (규칙 3·25)`);
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
  // 규칙 3: 본문 진행 턴의 질문은 절반~3분의 2. 넘치면 반응(느낌·짧은 수긍)으로 바꿀 턴을 지목한다
  const questionY = bodyY.filter((t) => /\?/.test(t.text));
  if (bodyY.length >= 12 && questionY.length / bodyY.length > 0.7) {
    const over = questionY.length - Math.floor((bodyY.length * 2) / 3);
    const picks = questionY.filter((_, i) => i % 3 === 1).slice(0, Math.max(over, 1));
    v.push(`진행 턴 ${bodyY.length}개 중 ${questionY.length}개가 질문 — ${RATIO_RULE_MARKS[1]}. 이 가운데 ${over}개 이상을 자기 처지에서의 느낌이나 짧은 수긍으로 바꾼다(요약으로 바꾸지 않는다). 바꿀 턴: ${ids(picks, 10)} (규칙 3)`);
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
 * v9.8 정형 검사 (2026-10-02, v9.7 판정 3편 T261001-004·005·006) — 규칙(16·20·25)은 있었는데 안 지켜졌거나 측정으로 드러난 틀.
 * - 소스 중계 연쇄: 004 #3 에서 "~라는 제안이 있습니다"·"견해도 제시돼요"가 다섯 턴 연달아(플래그 2건 동의 + 직접 수정 3건). 사람은 고친 뒤에도 블록에 두 턴("견해도 제시돼요"·"의견도 있습니다")을 남겼다 —
 *   블록당 두 턴까지 두고 세 번째부터 지목한다. 최근 35편에서 걸리는 편은 004 뿐
 * - 긴 해설 문장: 사람 "한 문장에 너무 많은 내용". 골드 해설 문장 평균 6.7~9.6어절 · GPT 11~12. 20어절↑(상위 약 5%)만 지목하고, 고치는 법은 구조로(결론 먼저) — 길이 목표치는 두지 않는다(사람: "억지로 통제하면 글 솜씨가 떨어지지 않을까")
 * - 질문 말끝 쏠림·조건절 질문: 진행 질문 36개 중 35개가 질문 한 문장뿐, 말끝이 "~나요·~가요"로 몰림(골드는 "~요·~죠"). 사람 "진행이 단조롭다"
 */
export function v98Violations(scriptMd: string, turns: ScriptTurn[]): string[] {
  const v: string[] = [];
  const ids = (xs: { id: string | null }[], n = 8) => xs.slice(0, n).map((t) => t.id ?? "?").join(", ");
  const blockOf = new Map<string, string>();
  let block = "";
  for (const line of scriptMd.split("\n")) {
    const h = line.match(/^###\s*(#\d+)/); if (h) { block = h[1]; continue; }
    if (/^##\s*\[/.test(line)) { block = ""; continue; }
    const m = line.match(/^\[[^\]]+\]\s*([EY]\d+)\s*·/); if (m && block) blockOf.set(m[1], block);
  }
  const E = turns.filter((t) => t.id?.startsWith("E"));
  const bodyY = turns.filter((t) => t.id?.startsWith("Y") && t.section !== "인트로" && t.section !== "마무리");
  // 규칙 20: 다른 사람의 제안·견해를 "있다·나온다·제시된다·소개된다"로 옮기는 턴 — 블록당 두 턴까지
  // v9.8.1 (2026-10-03, T261002-003 직접 수정 5건 + A9 동의 2건): 문장 끝 전언 동사("~하라고 권합니다"·"~를 제안합니다"·"~라고 설명합니다"·"~로 제시돼요")도 같은 중계다.
  // 사람은 소스를 실제로 소개해야 하는 자리가 있다며 001 을 부분동의했다 — 같은 상한(블록당 두 턴)에 함께 센다
  const relayRe = /(제안|견해|주장|의견|권고|조언|지적|해석|평가|목소리)(들)?(이|도|은|가)?\s?(있(어요|습니다|죠|고|다는|는데요)|나와요|나옵니다|나오고|나왔(어요|습니다)|제시(돼요|됩니다|되고|됐)|소개(돼요|됩니다|되고|됐))|(권(합니다|해요|했어요|했습니다|하고요)|제안(합니다|해요|했어요|했습니다)|설명(합니다|해요|했어요|했습니다)|제시(돼요|됩니다|됐어요|됐습니다)|조언(합니다|해요|했어요)|강조(합니다|해요|했어요))[.!]?(\s|$)/;
  const perBlock = new Map<string, number>(); const relayExtra: ScriptTurn[] = [];
  for (const t of E) { const b = blockOf.get(t.id ?? ""); if (!b || !relayRe.test(t.text)) continue; const n = (perBlock.get(b) ?? 0) + 1; perBlock.set(b, n); if (n > 2) relayExtra.push(t); }
  if (relayExtra.length) v.push(`해설 턴 ${relayExtra.length}개가 같은 블록에서 세 번째 이상으로 다른 사람의 제안·견해·권고를 옮김("있다·나온다·제시된다"·"권합니다·제안합니다·설명합니다") (${ids(relayExtra)}) — 블록에 두 번까지다. 이 턴들은 옮기는 말을 빼고 그 내용을 해설자의 말로 바로 한다 (규칙 20)`);
  // 규칙 21·23: 글 안에서 다른 사람의 주장을 다시 소개하는 중첩 소개("또 다른 글에는 작가 ○○의 주장이 소개됩니다")
  const nestedRe = /(글|기사|자료|보고서|칼럼|책)(에는|에서는|에|에서)\s?[^.!?]{0,40}(주장|의견|견해|말|연구|사례)(이|가|도|을)?\s?(소개|인용)(돼|됩|되|했)/;
  const nested = E.filter((t) => nestedRe.test(t.text));
  if (nested.length) v.push(`해설 턴 ${nested.length}개가 글 안에서 다른 사람의 주장을 다시 소개함 (${ids(nested)}) — 글과 그 안의 인물을 둘 다 부르지 않는다. 그 주장을 해설자의 말로 바로 한다 (규칙 21·23)`);
  // 규칙 16: 20어절 이상 해설 문장 — 조건을 앞에 쌓고 결론을 끝에 둔 문장. 결론 먼저, 조건·이유는 다음 문장으로
  const words = (s: string) => s.replace(/\.{3}|…/g, " ").split(/\s+/).filter(Boolean).length;
  // 두 개까지는 둔다(골드도 20어절↑ 문장이 있다) — 셋 이상이면 전부 지목한다(최대 12). 최근 35편: 편당 1~14개, 중앙 7
  const longS = E.flatMap((t) => t.text.split(/(?<=[.?!])\s+/).filter((s) => words(s) >= 20).map((s) => ({ id: t.id, n: words(s) })));
  if (longS.length >= 3) v.push(`해설 문장 ${longS.length}개가 20어절 이상 (${longS.slice(0, 12).map((x) => `${x.id} ${x.n}어절`).join(", ")}) — 한 문장에 판단 하나다. 결론을 먼저 말하고 조건과 이유는 다음 문장으로 나눈다. 연결어로 잇고 내용과 헤지는 지우지 않는다 (규칙 16)`);
  // 규칙 25: 질문 말끝 쏠림 — 같은 말끝 갈래가 질문의 5분의 2 이하. 갈래로 묶어 센다 — "~나요"를 막으면 "~까요"로 몰리는 것도 잡는다
  const qY = bodyY.filter((t) => /\?\s*$/.test(t.text.trim()));
  const endClass = (t: string) => { const x = t.trim().replace(/\?\s*$/, ""); return /(나요|가요)$/.test(x) ? "~나요·~가요" : /까요$/.test(x) ? "~까요" : /죠$/.test(x) ? "~죠" : /(다고|라고|냐고)요$/.test(x) ? "~다고요" : /요$/.test(x) ? "~요" : /니까$/.test(x) ? "~니까" : "기타"; };
  const byEnd = new Map<string, ScriptTurn[]>(); for (const t of qY) { const k = endClass(t.text); byEnd.set(k, [...(byEnd.get(k) ?? []), t]); }
  const [topEnd, sameEnd] = [...byEnd.entries()].sort((a, b) => b[1].length - a[1].length)[0] ?? ["", []];
  // 2026-10-02 수정(T261002-001): 상한을 내림으로 잡고 "말끝을 바꾼다"만 말하자, 상한 근처의 두 갈래(~나요·~가요 7 · ~까요 6) 사이에서 같은 턴(Y17)을
  // 오가며 수정 2회를 헛돌았다. 상한은 올림으로, 메시지에 상한에 닿은 갈래를 모두 적어 그 밖의 말끝으로 바꾸게 한다
  const capEnd = Math.ceil(qY.length * 0.4);
  if (qY.length >= 6 && sameEnd.length > capEnd) {
    const over = sameEnd.length - capEnd; const step = sameEnd.length / over;
    const picks = Array.from({ length: over }, (_, i) => sameEnd[Math.min(sameEnd.length - 1, Math.floor(i * step + step / 2))]).filter((t, i, a) => a.indexOf(t) === i);
    // 피할 갈래: 지목한 턴이 모두 그 갈래로 가면 넘치는 갈래
    const full = [...byEnd.entries()].filter(([k, ts]) => k !== "기타" && ts.length + picks.length > capEnd).map(([k, ts]) => `${k} ${ts.length}개`).join(" · ");
    // 2026-10-20 (v9.10 155편 실측): 격식체 지적 25건이 전부 이 수정 직후였다 — "~니까"도 한 갈래로 세니 "~습니까?"로 옮겨 가 격식체 검사(계약)에 걸렸고 3편이 L0 한도 뒤 실패.
    // 바꿀 대화체 갈래를 넘치지 않는 것만 적고 격식체를 막는다
    const fullKeys = new Set([...byEnd.entries()].filter(([k, ts]) => k !== "기타" && ts.length + picks.length > capEnd).map(([k]) => k));
    const open = ["~죠", "~까요", "~요", "~다고요"].filter((k) => !fullKeys.has(k)).join("·");
    v.push(`진행 질문 ${qY.length}개 중 ${sameEnd.length}개가 같은 말끝(${topEnd})으로 끝남 — ${RATIO_RULE_MARKS[2]}. 다음 ${picks.length}개 턴의 묻는 말끝을 바꾼다: ${ids(picks, 10)}. 이미 많은 갈래(${full})가 아닌 대화체 말끝(${open})으로 바꾸고, 격식체("~습니까?"·"~합니까?")로는 바꾸지 않는다 (규칙 25)`);
  }
  // 규칙 19·28 (v9.8.1, 2026-10-03): 진행자의 격식체 질문("~습니까?"·"~합니까?") — 말끝 쏠림 L0 가 "~나요"를 밀어내자 이리로 옮겨 갔다(T261002-001 Y3·Y13,
  // 002 Y9·Y16 — D1 동의 2건, 002 Y9 직접 수정 "있지 않습니까?" → "있지 않을까요?"). 진행자와 해설자는 같은 대화체다 — 전부 지목
  const formalY = qY.filter((t) => /니까\?\s*$/.test(t.text.trim()));
  if (formalY.length) v.push(`진행 질문 ${formalY.length}개가 격식체("~습니까?"·"~합니까?")로 끝남 (${ids(formalY, 10)}) — 진행자는 해설자와 같은 대화체로 묻는다. 이 턴들의 말끝을 대화체로 바꾼다. 이미 많은 말끝 갈래로 몰지 않는다 (규칙 19·28)`);
  // 규칙 25: 조건절로 시작해 묻는 질문("~다면, ~?") — 편에 세 번 이하
  const condRe = /(다면|라면|이라면|한다면|된다면|으면|하면|되면|려면|으려면)\s?,[^?]*\?\s*$/;
  const condY = qY.filter((t) => condRe.test(t.text.trim()));
  if (condY.length > 3) v.push(`진행 질문 ${condY.length}개가 조건절로 시작해 물음 (${ids(condY, 10)}) — 편에 세 번 이하다. 이 가운데 ${condY.length - 3}개 이상을 조건 없이 직접 묻거나, 앞 해설에서 받은 한 문장 뒤에 묻는다 (규칙 25)`);
  return v;
}

/**
 * v9.9 구어체 검사 (2026-10-12, 자동화 18편 실측 T260929-001~T261007-003 vs 골드 3편) — PM "호흡이 길고 문장 단위가 복잡해서 구어체가 아니다".
 * - 다체 비율: 해설 문장 끝이 "~니다·~니까" 인 비율. 골드 본편 0~11% · v9.3~9.7 평균 54% · v9.8.1 66~70%(규칙 19 의 "각각 30% 이상"이 다체 쪽으로 쏠렸다).
 *   30% 이하로 둔다 — 넘친 만큼 다체가 많은 턴부터 지목한다. 비율 규칙이라 한도 뒤에 남으면 QA 로 넘긴다(RATIO_RULE_MARKS)
 * - 명사절 감싸기: "~다는 것이·~다는 점에서·~다는 설명이·~다는 가능성을" — 문장을 명사절 안에 통째로 넣어 귀로는 끝까지 가야 풀린다.
 *   골드 0·4편 · v9.8.1 8~11. 다섯 번부터 해당 턴을 전부 지목한다. 20어절 L0 를 통과한 17~19어절 문장이 대개 이 꼴이었다
 */
export function v99Violations(turns: ScriptTurn[]): string[] {
  const v: string[] = [];
  const E = turns.filter((t) => t.id?.startsWith("E"));
  const sents = (t: string) => t.replace(/\.{3}|…/g, " ").split(/(?<=[.?!])\s+/).map((s) => s.trim()).filter(Boolean);
  // 규칙 19: 다체 비율 — 요체·다체로 끝난 문장만 센다(인용 끝·명사 종결은 빼고)
  const daRe = /(니다|니까)[.?!]?$/;
  const yoRe = /(요|죠)[.?!]?$/;
  const perTurn = E.map((t) => { const ss = sents(t.text); return { t, da: ss.filter((s) => daRe.test(s)).length, yo: ss.filter((s) => yoRe.test(s)).length }; });
  const da = perTurn.reduce((n, x) => n + x.da, 0);
  const total = da + perTurn.reduce((n, x) => n + x.yo, 0);
  if (total >= 10 && da > total * 0.3) {
    const need = da - Math.floor(total * 0.3);
    const picks: ScriptTurn[] = []; let covered = 0;
    for (const x of [...perTurn].filter((x) => x.da > 0).sort((a, b) => b.da - a.da)) { if (covered >= need) break; picks.push(x.t); covered += x.da; }
    v.push(`해설 문장 ${total}개 중 ${da}개(${Math.round((da / total) * 100)}%)가 다체("~합니다")로 끝남 — ${RATIO_RULE_MARKS[3]}. 다음 턴들의 "~니다"를 해요체("~해요·~거든요·~죠·~는 거예요")로 바꾼다: ${picks.slice(0, 12).map((t) => t.id ?? "?").join(", ")}. 정리나 강한 단정 한두 문장만 다체로 남기고, 내용과 헤지는 그대로 둔다 (규칙 19)`);
  }
  // 규칙 16: 명사절 감싸기 — 편에 넷까지. v9.9.1: 분열문("핵심은·답은 ~입니다", im-not-ai D-8)과 "~다는 것입니다" 결말(I-3)도 같은 계열로 센다
  const nomRe = /(다는|라는|냐는|자는)\s(것|점|설명|사실|가능성|뜻|의미|해석|얘기|말)(이|은|을|도|에서|으로|에|과|만)?(?=[\s,.?!]|$)/g;
  const cleftRe = /(핵심|문제|관건|답|요점|중요한 것|필요한 것|중요한 건)(은|는)\s[^.?!]{2,60}(입니다|이에요|예요|이죠)[.?!]?$/;
  const endNomRe = /(다는|라는) (것|뜻)(입니다|이에요|예요|이죠)[.?!]?$/;
  const nomOf = (text: string) => (text.match(nomRe) ?? []).length + sents(text).filter((s) => cleftRe.test(s) || endNomRe.test(s)).length;
  const nom = E.map((t) => ({ t, n: nomOf(t.text) })).filter((x) => x.n > 0);
  const nomCount = nom.reduce((n, x) => n + x.n, 0);
  if (nomCount >= 5) v.push(`해설 문장이 명사절로 감싸여 있음 ${nomCount}곳("~다는 것이·~다는 점에서·~다는 설명이"·"핵심은·답은 ~입니다"·"~다는 것입니다") (${nom.slice(0, 12).map((x) => x.t.id ?? "?").join(", ")}) — ${RATIO_RULE_MARKS[4]}. 안에 든 문장을 주어와 동사로 먼저 말하고, 그 뜻이나 평가는 다음 문장에 둔다. 내용과 헤지는 지우지 않는다 (규칙 16)`);
  // 규칙 16 (v9.9.1, im-not-ai F-4·F-5): "~적인·~적으로" 추상 수식 — 18편 편당 2~18회 · 골드 157문장에 4회. 여덟 번부터 많은 턴부터 지목
  const jeokRe = /적(인|으로)(?=\s)/g;
  const jeok = E.map((t) => ({ t, n: (t.text.match(jeokRe) ?? []).length })).filter((x) => x.n > 0);
  const jeokCount = jeok.reduce((n, x) => n + x.n, 0);
  if (jeokCount >= 8) {
    const picks = [...jeok].sort((a, b) => b.n - a.n);
    const chosen: ScriptTurn[] = []; let cut = 0;
    for (const x of picks) { if (cut >= jeokCount - 7) break; chosen.push(x.t); cut += x.n; }
    v.push(`해설 턴의 "~적인·~적으로" ${jeokCount}회 — ${RATIO_RULE_MARKS[5]}. 다음 턴에서 추상 명사를 꾸미는 "~적인·~적으로"를 풀어 쓴다("구조적인 문제" → "구조가 만든 문제", "실질적으로" → "실제로"): ${chosen.slice(0, 12).map((t) => t.id ?? "?").join(", ")}. 뜻은 그대로 둔다 (규칙 16)`);
  }
  return v;
}

/**
 * full-v7 귀속 구조 검사 (guidelines 규칙 20~22·25). claims.md(구간·귀속 열)·sources.md(이름)·script-notes.md(턴별 claims)가 있을 때만
 * 구조를 검사하고, 없으면(구 형식 산출물) 진행 턴 검사만 한다. 이름 검출은 sources.md 머리의 발행처·저자 원문 표기와 발음 맵의 한글 표기로 잰다 —
 * 못 잡는 이름이 있을 수는 있어도 잡힌 것은 확실하다(보수적).
 */
/**
 * 낯선 인명의 첫 등장 문장에 역할 소개가 없는 이름 — `이름@턴` 목록 (v9.7, 2026-10-01 — T260930-002 "서평자가 누구인지도 밝혀지지 않았는데 이름을 써버림").
 * 저자 이름(소스 머리 byline)과 라틴 두 토큰 이름을 본다. 역할 낱말이 같은 문장이나 바로 앞 문장에 있으면 소개로 친다. 매체·기관명(발행처)은 대상이 아니다.
 * 2026-10-07: 목록에 없던 직함("암호 해독가 Alan Turing"·"인쇄 기술자 Johannes Gutenberg")을 오탐해 두 편이 L0 수정 한도에서 멈췄다(T261007-002·003)
 * — 이름 바로 앞 낱말이 직함 꼴(3자 이상, ~가·~자·~인·~사·~원·~관)이면 소개로 친다. 2자("그가"·"제가")는 대명사일 수 있어 목록으로만 본다
 */
const ROLE_RE = /(교수|학자|작가|기자|연구자|연구원|저자|서평자|서평|언론인|박사|대표|장관|의원|전문가|평론가|철학자|소설가|시인|감독|사업가|창업자|대통령|총리|장군|사학자|경제학자|심리학자|과학자|의사|변호사|판사|목사|신부|승려|화가|음악가|편집자|편집장|칼럼니스트|분석가|관리자|CEO|회장|사장|이사|교사|강사|활동가|정치인|외교관|관료|지도자|지휘관|왕|황제|여왕|왕비|장수|승상|재상|세자|기술자|해독가|발명가|엔지니어|개발자|설계자|건축가|탐험가|기업가|투자자|발행인|출판인|장인|선교사|수도사|선수|코치|사상가|이론가|번역가|역사가|비평가|디자이너|프로그래머)/;
const TITLE_SUFFIX_RE = /(가|자|인|사|원|관)$/;
export function unintroducedNames(turns: { id: string | null; text: string }[], sourcesMd: string): string[] {
  const eText = turns.filter((t) => t.id?.startsWith("E")).map((t) => t.text).join("\n");
  const persons = new Set<string>();
  for (const m of sourcesMd.matchAll(/^## S\d+\.[^\n]*\n- URL:[^\n]*· 저자 ([^\n·]+)/gm)) for (const n of m[1].split(/,\s*/).map((x) => x.trim())) if (n.length >= 3 && !/^(staff|editor|editorial|admin|team)/i.test(n)) persons.add(n);
  for (const m of eText.matchAll(/(?<![A-Za-z])([A-Z][A-Za-z.'-]+ [A-Z][A-Za-z.'-]+)(?![A-Za-z])/g)) persons.add(m[1]);
  const noRole: string[] = [];
  for (const n of persons) {
    const t = turns.find((x) => x.id?.startsWith("E") && x.text.includes(n)); if (!t) continue;
    const sents = t.text.split(/(?<=[.?!])\s+/); const i = sents.findIndex((x) => x.includes(n)); if (i < 0) continue;
    const window = (i > 0 ? sents[i - 1] + " " : "") + sents[i];
    const prevWord = sents[i].slice(0, sents[i].indexOf(n)).match(/([가-힣]+)\s*$/)?.[1] ?? "";
    const titled = prevWord.length >= 3 && TITLE_SUFFIX_RE.test(prevWord);
    if (!ROLE_RE.test(window) && !titled) noRole.push(`${n}@${t.id}`);
  }
  return noRole;
}

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
  // v9.7 (2026-10-01): 낯선 인명의 첫 등장 문장에 역할이 없다 — 판정은 unintroducedNames (아래, 테스트 대상)
  {
    const noRole = unintroducedNames(turns, sourcesMd);
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
  // 2026-10-20: 규칙 22 는 마무리에 "새 claims" 를 넣지 말라는 것이다 — 본문에서 쓴 claims 를 정리에서 잇는 것은 규칙 13-1 의 수렴이고,
  // 자기 점검은 사실 문장마다 claims 를 보고하게 한다. 종전엔 ID 가 하나라도 있으면 잡아(v9.10 155편 중 33건) 표에서 ID 만 빼는 수정을 불렀다. 본문에 없던 claim 만 잡는다
  const bodyUsed = new Set<string>();
  const closingRows: { turn: string; ids: string[] }[] = [];
  for (const m of notesMd.matchAll(/^\|\s*([EY]\d+)\s*\|\s*([^|]*)\|/gm)) {
    const ids = m[2].match(/C\d{2,3}/g) ?? [];
    if (!ids.length) continue;
    const zone = turnZone.get(m[1]);
    if (zone === "마무리") { closingRows.push({ turn: m[1], ids }); continue; }
    if (typeof zone !== "number") continue;
    for (const id of ids) bodyUsed.add(id);
    for (const id of ids) {
      const c = claims.get(id);
      if (!c || c.section === null || c.source === null || c.source === axis) continue;
      if (c.section !== zone) outside.push(`${m[1]}:${id}(S${c.source}→#${c.section})`);
    }
  }
  if (outside.length) v.push(`소스가 배정 구간 밖에서 쓰임 (${outside.slice(0, 6).join(", ")}${outside.length > 6 ? " …" : ""}) — 소스는 claims 의 구간에서만, 축 소스만 도입·착지 (규칙 22)`);
  const closing = closingRows.flatMap((r) => r.ids.filter((id) => !bodyUsed.has(id)).map((id) => `${r.turn}:${id}`));
  if (closing.length) v.push(`마무리 턴이 본문에서 쓰지 않은 claims 를 씀 (${closing.slice(0, 6).join(", ")}${closing.length > 6 ? " …" : ""}) — 마무리는 새 사실 없이 본문에서 얻은 내용을 잇는다. 이 claim 의 내용을 마무리에서 빼거나 본문의 배정 구간으로 옮긴다 (규칙 22)`);
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

/**
 * v9.10 주고받기 검사 (2026-10-14, 2인 대담 레퍼런스 대조 + 자동화 18편) — 진행자의 추측·자기 처지 대입을 해설이 받지 않는다.
 * 추측으로 끝난 진행 턴 바로 뒤 해설 턴이 맞장구 한마디("맞아요."·"그렇죠."·"정확한 구분이에요.")로 시작하면 진행자의 말이 대화에 남지 않는다
 * (규칙 4). 18편 중 7편이 두 번 이상(T261002-002 는 4/4) · 골드 0. 두 번부터 지목하고, 문체 규칙이라 한도 뒤엔 QA 로 넘긴다(RATIO_RULE_MARKS).
 * "준비한 설명을 그대로 이어 읽기"는 문형으로 잡히지 않아 규칙과 critic 3.9 가 본다
 */
export function v910Violations(turns: ScriptTurn[]): string[] {
  const v: string[] = [];
  const body = turns.filter((t) => t.section !== "인트로" && t.section !== "마무리");
  const guessRe = /(것 같아요|것 같은데요|것 같네요|겠어요|겠는데요|겠네요|제 생각엔|저라면|저 같으면)[.?!]?\s*$/;
  const bareRe = /^(네|예|맞아요|맞습니다|그렇죠|그렇습니다|그럴 수 있어요|정확해요|정확합니다|좋은 질문이에요|바로 그거예요|그 말이 맞아요|정확한 [가-힣]+(이에요|예요|입니다))[.!]$/;
  const hits: ScriptTurn[] = [];
  for (let i = 0; i + 1 < body.length; i++) {
    const y = body[i]; const e = body[i + 1];
    if (!y.id?.startsWith("Y") || !e.id?.startsWith("E") || !guessRe.test(y.text.trim())) continue;
    const first = e.text.trim().split(/(?<=[.?!])\s+/)[0] ?? "";
    if (bareRe.test(first)) hits.push(e);
  }
  if (hits.length >= 2) v.push(`진행자의 추측 뒤 해설 턴 ${hits.length}개가 맞장구 한마디로 시작함 (${hits.slice(0, 10).map((t) => t.id ?? "?").join(", ")}) — ${RATIO_RULE_MARKS[6]}. 이 턴들의 첫 문장을 진행자 말의 어느 부분이 맞는지 내용으로 짚는 문장으로 바꾸거나, 빠진 조건을 더한다. 뒤 설명은 그 말에서 잇는다 (규칙 4)`);
  return v;
}


/**
 * v9.11 리듬 검사 (2026-10-27, KAN-269) — PodBench(arXiv 2601.14903) Stage 2 기준선(v9.10 8편 54.1점 · 골드 79)의 최저 칸
 * 리듬·긴장 41% 에서 문형으로 잡히는 것만 L0 로 둔다. 기준은 받아 둔 운영 대본 408편(v9.10 249 · 이전 158 · 골드 T260918-001)으로 맞췄다.
 * - 같은 화자 해설 연속: 한 구간 안에서 해설 턴이 진행 턴 없이 같은 화자로 이어진다 — v9.10 19% · 이전 51% · 골드 0. 형식 결함이라 한도 뒤 실패
 * - 같은 문장 수: 본문 해설 턴 문장 수가 같은 값으로 여섯 턴 이상 이어진다(규칙 9) — 최장 연속 평균 v9.10 11.2턴 · 골드 5턴, 여섯 이상 v9.10 81% · 골드 0
 * - 진행자 "것 같아요": 편에 여섯 번부터(규칙 3) — v9.10 89% 가 여섯 번 이상 · 골드 3회
 * - 도입 구분 예고: 도입에서 "나눠 보다·나누어 묻다"로 답의 틀을 미리 말한다(규칙 13) — v9.10 19% · 골드 0
 * 뺀 것: "짧은 교환 구간마다"(골드도 본문 2문장 이하 해설 턴 0 — 리듬의 원인이 아니었다) · "다른 질문이에요"로 맺는 턴(편당 0.6회로 드물다 — 규칙 29·critic 이 본다)
 */
export function v911Violations(turns: ScriptTurn[]): string[] {
  const v: string[] = [];
  const sents = (t: string) => t.replace(/\.{3}|…/g, " ").split(/(?<=[.?!])\s+/).map((s) => s.trim()).filter(Boolean);
  const isE = (t: ScriptTurn) => !!t.id?.startsWith("E");
  const isY = (t: ScriptTurn) => !!t.id?.startsWith("Y");
  const ids = (xs: ScriptTurn[], n = 10) => xs.slice(0, n).map((t) => t.id ?? "?").join(", ");
  // 같은 화자 해설 연속 — 구간 경계(헤더 바로 다음 턴)는 규칙 1 의 "해설자가 한 문장으로 다음 내용을 연다"라 뺀다
  const runOn: ScriptTurn[] = [];
  for (let i = 1; i < turns.length; i++) {
    const a = turns[i - 1], b = turns[i];
    if (isE(a) && isE(b) && a.section === b.section && !b.blockStart && a.speaker === b.speaker) runOn.push(b);
  }
  if (runOn.length) v.push(`해설 턴이 진행 턴 없이 같은 화자로 이어짐 (${ids(runOn)}) — 앞 턴과 한 턴으로 합치거나, 사이에 진행자가 앞 해설의 막힌 지점을 묻는 한 문장을 둔다 (규칙 11)`);
  // 같은 문장 수 여섯 턴 연속 — 본문 해설 턴만
  const bodyE = turns.filter((t) => t.section === "본문" && isE(t));
  const starts: ScriptTurn[] = [];
  let runStart = 0;
  for (let i = 1; i <= bodyE.length; i++) {
    const same = i < bodyE.length && sents(bodyE[i].text).length === sents(bodyE[i - 1].text).length;
    if (!same) { if (i - runStart >= 6) starts.push(bodyE[runStart]); runStart = i; }
  }
  if (starts.length) v.push(`본문 해설 턴 문장 수가 같은 값으로 여섯 턴 이상 이어짐 (${ids(starts)}부터) — ${RATIO_RULE_MARKS[7]}. 그 구간에서 의외의 결과를 말하는 턴은 한두 문장으로 짧게, 원리·맥락을 펴는 턴은 충분히 길게 해 길이를 벌린다. 설명을 빼서 줄이지 않는다 (규칙 9)`);
  // 진행자 "것 같아요"
  const guessY = turns.filter((t) => isY(t) && t.section !== "인트로" && /것 같(아요|은데요|네요|습니다)/.test(t.text));
  if (guessY.length >= 6) v.push(`진행 턴 ${guessY.length}개가 "것 같아요"로 자기 처지를 대입함 (${ids(guessY, 12)}) — ${RATIO_RULE_MARKS[8]}. 이 가운데 ${guessY.length - 5}개 이상을 짧은 수긍이나 의외라는 반응, 막힌 지점의 되물음으로 바꾼다 (규칙 3)`);
  // 도입 구분 예고
  const previewRe = /나눠(서)? (보|살펴|물어|짚어|따져)|나누어 (보|살펴|물어|짚어)|둘로 나눠/;
  const preview = turns.filter((t) => t.section === "도입" && previewRe.test(t.text));
  if (preview.length) v.push(`도입 턴 ${preview.length}개가 답의 틀을 미리 말함 (${ids(preview)}) — ${RATIO_RULE_MARKS[9]}. "나눠 보자" 대신 청취자가 처음 품을 질문 하나로 열고, 구분은 본문의 결과로 드러나게 한다 (규칙 13)`);
  return v;
}
