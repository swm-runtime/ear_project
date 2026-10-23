/**
 * 글로벌 판정·재작성 루프 — 워커 단계 `judge_loop` (2026-10-22, 글로벌 명세 6.10 · judge/README.md 6장 · 미결 #15 해소).
 *
 * 비평이 끝난 글로벌 편에 서버 API(GPT)만으로 판정과 재작성을 돌린다. 박수헌 2026-10-22: "운영은 서버 API 만으로 돌아야 한다.
 * Claude 판정은 외부 잣대다." — 루프 안의 신호(편집자 3회 중앙값 · 한국어·사실 검토 · 단계 전환 · 중단 · 최고판)는 전부 GPT 이고,
 * 최종 판정도 GPT 다. Claude 는 루프 밖 표본 채점(세션)으로 GPT 기준값을 보정할 때만 쓴다.
 *
 * 회차(최대 3): GPT 재작성(구조 단계 → 구조 점수가 안 오르면 잠그고 세부 단계) → L0(한 번 되돌림) → GPT 한국어·사실 검토 → must_fix 턴만 수리
 *   → GPT 편집자 3회(눈가림, effort medium) 항목별 중앙값. 합계가 최고판을 넘으면 최고판 갱신, 세부 단계에서 안 오르면 중단.
 * 끝: 최고판을 episodes/<ep>/script.md 에 쓰고(S3 버저닝으로 이전 판이 남는다), 판정을 episodes.critic_verdicts 에 저장한다(README 4장 형식,
 *   judged_by `agent:<모델>`). 발행 가능 = 편집자 중앙값 ≥ 기준(settings.automation.judge_threshold, 기본 60 — 2026-10-23 박수헌, 종전 65)
 *   · 한국어·사실 발행 가능 · 한국어 must_fix 전부 수리. 편집자 지적은 점수에 녹아 있으므로 관문이 아니고 기록만 한다(agent.editor_findings).
 * 발행 준비 자동 스위치가 켜져 있으면 이 저장을 보고 워커가 tts 연쇄를 건다(automation.ts autoPublishPrepGlobal).
 *
 * 실험 원본: pipeline/.work/global-infra/rewrite-loop-server.mts (3편 +6.0, 7편 평균 +4.8 — $S/design/BENCH.md).
 */
import fs from "node:fs/promises";
import path from "node:path";
import { cfg, executedBy } from "../config.js";
import { enqueue, getBacklog, getBacklogStatus, getEpisode, insertRun, setCriticVerdicts, setJobProgress, type Job } from "../db.js";
import type { Executor } from "../executors/index.js";
import { assetPaths, pipelineLocale, promptBody } from "@ear/pipeline";
import { readAutomation } from "../automation.js";
import { log } from "../util.js";
import { prepareAssets, workerRev } from "../assets.js";
import { pullPrefix, pushPrefix, s3Key } from "../storage.js";
import { scriptStats, twoStageViolationsEn } from "./draft-two-stage.js";

export const JUDGE_LOOP_VERSION = "judge-loop-v1.3"; // v1.3 (2026-10-23): 0회차 원판도 한국어 must_fix 를 수리한다 — 최고판이 원판에 머문 편(G261023-010·018·020, 60~61점)이 must_fix 미수리로만 막혔다
export const DEFAULT_THRESHOLD = 60; // 2026-10-23 박수헌: 65 → 60 (첫 배치 28편 중 6편 통과. 60~64 편의 편집자 평은 "필수 수정 없이 발행 가능, 장면보다 설명이 많다"로 66~70 편과 같은 지적 — 정확성 아닌 연출 밀도 차이). 한국어·사실 must_fix 관문은 그대로
const MAX_ROUNDS = 3;
export const K = ["3.1", "3.2", "3.3", "3.4", "3.5", "3.6", "3.7", "3.8", "3.9", "3.10", "3.11", "3.12"] as const;
const STRUCT = ["3.1", "3.5", "3.6", "3.7"];

export interface Finding { turn: string; turns?: string[]; quote: string; problem: string; kind: "must_fix" | "should_fix"; evidence?: string }
export interface Edit { turn: string; after: string; fixes: number[]; reason: string }
export interface Editor { scores: Record<string, { score: number; reason: string }>; retell: string; findings: Finding[]; edits: Edit[]; publishable: boolean; publishable_reason: string; summary_ko: string }
export interface Korea { findings: Finding[]; edits: Edit[]; other_changes: { file: string; before: string; after: string; fixes: number[]; reason: string }[]; publishable: boolean; publishable_reason: string; summary_ko: string }
interface RewriteOut { title: string; plan: string; script: string; turn_claims: { turn: string; claims: string[] }[]; pronunciations_added: { term: string; reading: string }[]; changes: string }
interface RepairOut { fixes: { turn: string; after: string }[]; pronunciations_added: { term: string; reading: string }[] }
export interface RoundRec { t: number; mode: "original" | "structure" | "detail"; totals: number[]; median: Record<string, number>; total: number; struct: number; koreaPub: boolean; koreaMf: number; repaired: string[]; l0: number; words: number; cost: number }

// ── 순수 함수 (테스트 대상) ──
export const editorTotal = (e: Editor) => K.reduce((a, k) => a + Number(e.scores[k]?.score ?? 0), 0);
/** 항목별 세 번의 가운데 값 (README 2장 4번) */
export function medianScores(eds: Editor[]): Record<string, number> {
  return Object.fromEntries(K.map((k) => [k, [...eds.map((e) => Number(e.scores[k]?.score ?? 0))].sort((a, b) => a - b)[Math.floor(eds.length / 2)]]));
}
export const sumOf = (m: Record<string, number>, keys: readonly string[] = K) => keys.reduce((a, k) => a + (m[k] ?? 0), 0);
/** 합계가 가운데인 번 (동률이면 앞 번) — retell·findings·edits 는 이 번을 쓴다 */
export function medianIndex(eds: Editor[]): number {
  const tot = eds.map(editorTotal); return tot.indexOf([...tot].sort((a, b) => a - b)[Math.floor(tot.length / 2)]);
}
/** 작성자 눈가림 (README 2장 2번): 첫 줄 메타(규칙 버전·생성 방식·출처)를 `<제목> · <주제>` 로 */
export function blindScript(s: string): string {
  const l = s.split("\n"); const m = l[0].split(" · "); l[0] = m.length > 2 ? `${m[1]} · ${m[2]}` : m[0]; return l.join("\n");
}
/** claims.md → notes.md: 머리말 인용 블록과 `## QA attempt` 이하를 지우고 제목을 Research notes 로 */
export function blindNotes(claims: string): string {
  let c = claims.split(/^## QA attempt/m)[0];
  c = c.split("\n").filter((l) => !l.startsWith(">")).join("\n");
  c = c.replace(/^# claims[^\n]*/m, "# Research notes");
  return c.replace(/\n{3,}/g, "\n\n").trim() + "\n";
}
/** sources.md: 수집·선정 방식 설명 줄과 Gist 줄을 지운다 */
export function blindSources(sources: string): string {
  return sources.split("\n").filter((l) => !/^> Excerpts are|^- Gist:/.test(l)).join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}
/** 지적 턴만 바꾼다 — 라벨·번호·가운뎃점은 그대로, 본문만 교체 (catch-n-repair) */
export function applyFixes(script: string, fixes: { turn: string; after: string }[]): string {
  let s = script;
  for (const f of fixes) {
    const re = new RegExp(`^(\\[[^\\]]+\\] ${f.turn.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} · ).*$`, "m");
    if (re.test(s)) s = s.replace(re, (_m, head: string) => head + f.after.replace(/\s*\n\s*/g, " ").trim());
  }
  return s;
}
export function mergePron(pron: string, added: { term: string; reading: string }[] | undefined): string {
  const cur = JSON.parse(pron) as Record<string, string>;
  for (const p of added ?? []) if (p.term && !(p.term in cur)) cur[p.term] = p.reading ?? "";
  return JSON.stringify(cur, null, 2) + "\n";
}
/** 재작성 출력의 메타 줄 보정 — 제목만 바꾸고 나머지(주제·화자·규칙 라벨)는 원판 그대로 */
export function fixMeta(o: { title: string; script: string }, base: string): string {
  const ls = o.script.split("\n"); const m = ls[0].split(" · "); const bm = base.split("\n")[0].split(" · ");
  if (m.length >= 6) { m[1] = o.title || m[1]; ls[0] = m.join(" · "); } else { bm[1] = o.title || bm[1]; ls.unshift(bm.join(" · ")); }
  return ls.join("\n").trim() + "\n";
}
/** 판정 저장 형식 (README 4장) — 발행 가능 = 중앙값 ≥ 기준 · 한국어 가 · 한국어 must_fix 전부 수리 */
export function buildVerdict(a: { episodeId: string; rounds: RoundRec[]; bestRound: number; eds: Editor[]; korea: Korea; repaired: string[]; threshold: number; model: string; reportKey: string; cost: number }) {
  const mi = medianIndex(a.eds); const med = medianScores(a.eds); const total = sumOf(med);
  const kMust = a.korea.findings.filter((f) => f.kind === "must_fix");
  const at = new Date().toISOString();
  const must_fix = kMust.map((f, i) => ({ id: `M${i + 1}`, turn: f.turn, issue: f.problem, by: "korea", status: a.repaired.includes(f.turn) ? "fixed" : "open", edit_at: a.repaired.includes(f.turn) ? at : null }));
  const openK = must_fix.filter((m) => m.status !== "fixed");
  const reasons: string[] = [];
  if (total < a.threshold) reasons.push(`편집자 중앙값 ${total} < 기준 ${a.threshold}`);
  if (!a.korea.publishable) reasons.push(`한국어·사실 검토 발행 불가 — ${a.korea.publishable_reason}`);
  if (openK.length) reasons.push(`한국어 필수 수정 ${openK.length}건 미수리 (${openK.map((m) => `${m.id} ${m.turn}`).join(", ")})`);
  const publishable = reasons.length === 0;
  const r0 = a.rounds[0];
  return {
    flags: {}, stars: {},
    scores: Object.fromEntries(K.map((k) => [k, { human: String(med[k]), reason: a.eds[mi].scores[k]?.reason ?? "" }])),
    extra: `${JUDGE_LOOP_VERSION} — 편집자(GPT 3회 중앙값) ${total}점 (세 번 ${a.eds.map(editorTotal).join("·")}) · 원판 ${r0.total} → 최고판 ${a.bestRound}회차 · 한국어·사실 ${a.korea.publishable ? "가" : "불가"} must_fix ${kMust.length}건(수리 ${must_fix.length - openK.length}). 편집자: ${a.eds[mi].summary_ko} / 한국어: ${a.korea.summary_ko}`,
    judged_by: `agent:${a.model}`, judged_at: at,
    agent: {
      publishable, publishable_reason: publishable ? `편집자 중앙값 ${total} ≥ ${a.threshold} · 한국어·사실 가 · 필수 수정 전부 수리` : reasons.join(" · "),
      must_fix, report_key: a.reportKey, reviewers: { editor: "editor.md", korea: "korea-check.md" },
      editor_findings: a.eds[mi].findings.filter((f) => f.kind === "must_fix").map((f) => ({ turn: f.turn, issue: f.problem })),
      loop: { version: JUDGE_LOOP_VERSION, threshold: a.threshold, best: a.bestRound, cost_usd: Math.round(a.cost * 1000) / 1000, rounds: a.rounds.map((r) => ({ t: r.t, mode: r.mode, total: r.total, totals: r.totals, struct: r.struct, korea: r.koreaPub, must_fix: r.koreaMf, repaired: r.repaired.length })) },
    },
  };
}
export function reportMd(a: { episodeId: string; title: string; verdict: ReturnType<typeof buildVerdict>; rounds: RoundRec[]; eds: Editor[]; korea: Korea }): string {
  const v = a.verdict; const mi = medianIndex(a.eds);
  const scoreRow = K.map((k) => v.scores[k].human).join(" | ");
  return [
    `# ${a.episodeId} 에이전트 판정 (서버 루프)`, "",
    `- 에피소드: ${a.title}`, `- 판정: ${v.judged_by} · ${JUDGE_LOOP_VERSION} · ${v.judged_at}`,
    `- **${v.agent.publishable ? "발행 가능" : "발행 불가"}** — ${v.agent.publishable_reason}`, "",
    "## 회차", "", "| 회차 | 단계 | 편집자 3회 | 중앙값 | 구조 | 한국어 | must_fix | 수리 |", "|---|---|---|---|---|---|---|---|",
    ...a.rounds.map((r) => `| ${r.t} | ${r.mode} | ${r.totals.join("·")} | **${r.total}**${r.t === v.agent.loop.best ? " ★" : ""} | ${r.struct}/32 | ${r.koreaPub ? "가" : "불가"} | ${r.koreaMf} | ${r.repaired.length} |`), "",
    "## 점수 (최고판, 편집자 중앙값)", "", `| ${K.join(" | ")} | 합계 |`, `|${K.map(() => "---").join("|")}|---|`, `| ${scoreRow} | **${sumOf(medianScores(a.eds))}** |`, "",
    "## 한국어·사실 필수 수정", "", ...(v.agent.must_fix.length ? ["| id | 턴 | 문제 | 상태 |", "|---|---|---|---|", ...v.agent.must_fix.map((m) => `| ${m.id} | ${m.turn} | ${m.issue} | ${m.status} |`)] : ["없음"]), "",
    "## 편집자 지적 (가운데 번, 기록용)", "", ...(a.eds[mi].findings.length ? a.eds[mi].findings.map((f) => `- [${f.kind}] ${f.turn} — "${f.quote}" — ${f.problem}`) : ["없음"]), "",
    "## 요약", "", `- 편집자: ${a.eds[mi].summary_ko}`, `- 한국어·사실: ${a.korea.summary_ko}`, "",
  ].join("\n");
}

// ── 출력 형식(검토자 JSON) — docs/ai/global/judge/README.md 3장 ──
const FE = `Output format — end with exactly one JSON block:
{"scores": {"3.1": {"score": 0, "reason": ""}, "...": {}, "3.12": {"score": 0, "reason": ""}}, "retell": "", "findings": [{"turn": "E14", "turns": ["E14"], "quote": "", "problem": "", "kind": "must_fix | should_fix"}], "edits": [{"turn": "E14", "after": "the whole new turn", "fixes": [0], "reason": ""}], "publishable": false, "publishable_reason": "", "summary_ko": ""}
- scores has all 12 keys 3.1 to 3.12. "turns" only for patterns across turns. "fixes" lists finding indexes (0-based).`;
const FK = `Output format — end with exactly one JSON block:
{"findings": [{"turn": "E14", "turns": ["E14"], "quote": "", "problem": "", "kind": "must_fix | should_fix", "evidence": "excerpt or note quoted"}], "edits": [{"turn": "E14", "after": "the whole new turn", "fixes": [0], "reason": ""}], "other_changes": [{"file": "", "before": "", "after": "", "fixes": [0], "reason": ""}], "publishable": false, "publishable_reason": "", "summary_ko": ""}
- "turns" only for patterns across turns. "other_changes" only for changes outside turns. "fixes" lists finding indexes (0-based).`;
const EDITOR_SCHEMA = { type: "object", additionalProperties: false, required: ["scores", "retell", "findings", "edits", "publishable", "publishable_reason", "summary_ko"], properties: {
  scores: { type: "object", additionalProperties: false, required: [...K], properties: Object.fromEntries(K.map((k) => [k, { type: "object", additionalProperties: false, required: ["score", "reason"], properties: { score: { type: "integer" }, reason: { type: "string" } } }])) },
  retell: { type: "string" },
  findings: { type: "array", items: { type: "object", additionalProperties: false, required: ["turn", "turns", "quote", "problem", "kind"], properties: { turn: { type: "string" }, turns: { type: "array", items: { type: "string" } }, quote: { type: "string" }, problem: { type: "string" }, kind: { type: "string", enum: ["must_fix", "should_fix"] } } } },
  edits: { type: "array", items: { type: "object", additionalProperties: false, required: ["turn", "after", "fixes", "reason"], properties: { turn: { type: "string" }, after: { type: "string" }, fixes: { type: "array", items: { type: "integer" } }, reason: { type: "string" } } } },
  publishable: { type: "boolean" }, publishable_reason: { type: "string" }, summary_ko: { type: "string" } } } as const;
const KOREA_SCHEMA = { type: "object", additionalProperties: false, required: ["findings", "edits", "other_changes", "publishable", "publishable_reason", "summary_ko"], properties: {
  findings: { type: "array", items: { type: "object", additionalProperties: false, required: ["turn", "turns", "quote", "problem", "kind", "evidence"], properties: { turn: { type: "string" }, turns: { type: "array", items: { type: "string" } }, quote: { type: "string" }, problem: { type: "string" }, kind: { type: "string", enum: ["must_fix", "should_fix"] }, evidence: { type: "string" } } } },
  edits: { type: "array", items: { type: "object", additionalProperties: false, required: ["turn", "after", "fixes", "reason"], properties: { turn: { type: "string" }, after: { type: "string" }, fixes: { type: "array", items: { type: "integer" } }, reason: { type: "string" } } } },
  other_changes: { type: "array", items: { type: "object", additionalProperties: false, required: ["file", "before", "after", "fixes", "reason"], properties: { file: { type: "string" }, before: { type: "string" }, after: { type: "string" }, fixes: { type: "array", items: { type: "integer" } }, reason: { type: "string" } } } },
  publishable: { type: "boolean" }, publishable_reason: { type: "string" }, summary_ko: { type: "string" } } } as const;
const OUT_SCHEMA = { type: "object", additionalProperties: false, required: ["title", "plan", "script", "turn_claims", "pronunciations_added", "changes"], properties: {
  title: { type: "string" }, plan: { type: "string" }, script: { type: "string" },
  turn_claims: { type: "array", items: { type: "object", additionalProperties: false, required: ["turn", "claims"], properties: { turn: { type: "string" }, claims: { type: "array", items: { type: "string" } } } } },
  pronunciations_added: { type: "array", items: { type: "object", additionalProperties: false, required: ["term", "reading"], properties: { term: { type: "string" }, reading: { type: "string" } } } },
  changes: { type: "string" } } } as const;
const FIX_SCHEMA = { type: "object", additionalProperties: false, required: ["fixes", "pronunciations_added"], properties: {
  fixes: { type: "array", items: { type: "object", additionalProperties: false, required: ["turn", "after"], properties: { turn: { type: "string" }, after: { type: "string" } } } },
  pronunciations_added: { type: "array", items: { type: "object", additionalProperties: false, required: ["term", "reading"], properties: { term: { type: "string" }, reading: { type: "string" } } } } } } as const;

const fence = (s: string) => "```\n" + s.trim() + "\n```";
const fmtScores = (e: Editor) => K.map((k) => `- ${k}: ${e.scores[k].score} — ${e.scores[k].reason}`).join("\n");
const fmtFindings = (fs_: Finding[]) => fs_.map((f, i) => `${i}. [${f.kind}] ${f.turn}${(f.turns?.length ?? 0) > 1 ? ` (${f.turns!.join(", ")})` : ""} — "${f.quote}" — ${f.problem}${f.evidence ? ` — evidence: ${f.evidence}` : ""}`).join("\n") || "(none)";
const fmtEdits = (es: Edit[]) => (es ?? []).map((e) => `- ${e.turn}: ${e.after}`).join("\n") || "(none)";
const notesMd = (tc: { turn: string; claims: string[] }[]) => ["## 해설 턴별 사용 claims", "| 턴 | claims |", "|---|---|", ...tc.map((t) => `| ${t.turn} | ${t.claims.join(", ")} |`)].join("\n");
const repairSystem = `You are the script writer for "ear". A Korean fact reviewer flagged turns in your script against the materials. Repair only the flagged turns, as the smallest change that resolves each finding: narrow a claim to its conditions, restore who holds a view (by role), remove a fact the materials do not support, or drop a sentence. Use only claims.md and sources.md. Keep the turn's job, speaker, and length. Keep every other turn unchanged. A suggested edit is a guide, not a source. Return the full text of each repaired turn (without the label, number, or middle dot). Output only the requested JSON.`;

/** 판정 단계 진입점 — 글로벌 인스턴스 전용. payload: { episode_id, backlog_id } */
export async function runJudgeLoop(job: Job, ex: Executor) {
  if (pipelineLocale() !== "en") throw new Error("judge_loop 은 글로벌 인스턴스 전용이다 (명세 6.10)");
  const episodeId = String(job.payload.episode_id ?? ""); const backlogId = String(job.payload.backlog_id ?? "");
  const ep = await getEpisode(episodeId); const cand = await getBacklog(backlogId);
  if (!ep || !cand) throw new Error(`에피소드/백로그 없음: ${episodeId}/${backlogId}`);
  const st = (await getBacklogStatus(backlogId))?.status;
  if (st !== "qa_passed") throw new Error(`판정 루프는 qa_passed 에서만 (현재: ${st})`); // 불변 원칙 6 — QA 통과본 기준
  const rel = `episodes/${episodeId}`; const dir = path.join(cfg.workRoot, rel); const jdir = path.join(dir, "judge");
  await fs.mkdir(jdir, { recursive: true });
  await pullPrefix(`${rel}/`); // S3 가 원본
  const rd = (f: string) => fs.readFile(path.join(dir, f), "utf8");
  const [script0raw, claims, sources, outline, pron0raw, notes0] = await Promise.all([rd("script.md"), rd("claims.md"), rd("sources.md"), rd("outline.md"), rd("pronunciations.json"), rd("script-notes.md").catch(() => "")]);
  let script0 = script0raw; let pron0 = pron0raw;
  const meta = script0.split("\n")[0].split(" · "); const [explainer, host] = (meta[3] ?? "").split("/");
  if (!explainer || !host) throw new Error("대본 메타 줄에서 화자를 읽지 못했다");
  const { assetRoot, bundle } = await prepareAssets(ep.asset_versions ?? null);
  const guidelines = promptBody(await fs.readFile(assetPaths(assetRoot, cfg.workRoot).guidelines, "utf8")); // 번들은 프로파일 키(guidelines.gpt.md)를 기본 키 경로(guidelines.md)에 내려놓는다 (assets.ts PROFILE_KEYS)
  const JD = path.join(cfg.assetSourceRoot, "judge"); // 판정 지시문은 prompt_assets 가 아니라 저장소 파일(README 1장 — 눈가림용, 시딩 안 함)
  const [editorMd, scoringMd, koreaMd, houseMd] = await Promise.all(["editor.md", "scoring.md", "korea-check.md", "house-style.md"].map((f) => fs.readFile(path.join(JD, f), "utf8")));
  const threshold = Number((await readAutomation()).judge_threshold ?? DEFAULT_THRESHOLD);
  const est = Number(outline.match(/^Estimated length:\s*([\d.]+)/m)?.[1] ?? 6);
  let cost = 0; let model: string | null = null;
  const progress = (phase: string, detail = "") => setJobProgress(job.id, { phase, detail, toolCounts: {}, turns: 0, elapsedMs: 0 }).catch(() => {});

  // 결과가 작은 JSON 인 채점·검토·수리 호출의 출력 상한(생각 포함). 정상 호출은 생각 몇천~1만 토큰이면 끝난다 — 폭주(2026-10-23: 원판 채점이 65536 까지 13분, 편집자 채점이 20분 시간 초과)를 몇 분 안에 끊고 한 번 다시 부르려고 낮춘다. 재작성은 대본 전체를 내므로 기본값(65536) 그대로
  const SCORE_MAX_OUT = 24_576;
  async function gpt<T>(system: string, prompt: string, schema: object, minutes: number, effort: "high" | "medium", maxOutputTokens?: number): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      try {
        const r = await ex.run<T>({ prompt, systemPrompt: system, schema, allowedTools: [], tools: [], cwd: cfg.workRoot, timeoutMs: minutes * 60_000, effort, background: true, maxOutputTokens }); // 재작성 한 호출이 10분을 넘으면 동기 요청은 끊긴다 — 백그라운드 모드 (types.ts)
        cost += r.listCostUsd ?? 0; model = r.model ?? model; return r.output;
      } catch (e) {
        const msg = String(e); const transient = /fetch failed|OpenAI (?:0|5\d\d|429)|ECONNRESET|ETIMEDOUT|socket hang up/i.test(msg);
        // 생각 폭주(출력 상한 도달·시간 초과)는 같은 입력을 다시 불러도 대개 정상으로 끝난다 — 한 번만 더 (비용은 상한만큼)
        const runaway = /응답 미완료 \(incomplete|요청 시간 초과/.test(msg);
        if (transient && attempt < 4) { log(`  judge_loop ${episodeId}: OpenAI 일시 오류(${attempt}/3) — ${msg.slice(0, 80)} · ${attempt * 30}s 뒤 재시도`); await new Promise((r) => setTimeout(r, attempt * 30_000)); continue; }
        if (runaway && attempt < 2) { log(`  judge_loop ${episodeId}: OpenAI 출력 폭주 — ${msg.slice(0, 120)} · 한 번 재시도`); continue; }
        throw e;
      }
    }
  }
  const editorOnce = (script: string) => gpt<Editor>(`${editorMd.trim()}\n\nThe two input files are inlined in the next message.\n\n## scoring.md\n${scoringMd.trim()}`, `## script.md\n${fence(blindScript(script))}\n\n${FE}\n\nReturn the JSON object only.`, EDITOR_SCHEMA, 20, "medium", SCORE_MAX_OUT);
  const editors = (script: string) => Promise.all([1, 2, 3].map(() => editorOnce(script)));
  const korea = (script: string, pron: string) => gpt<Korea>(`${koreaMd.trim()}\n\nThe input files are inlined in the next message.\n\n## house-style.md\n${houseMd.trim()}`,
    `## script.md\n${fence(blindScript(script))}\n\n## notes.md\n${fence(blindNotes(claims))}\n\n## sources.md\n${fence(blindSources(sources))}\n\n## pronunciations.json\n${fence(pron)}\n\n${FK}\n\nReturn the JSON object only.`, KOREA_SCHEMA, 30, "high", SCORE_MAX_OUT);
  const l0 = (script: string, pron: string, tc: { turn: string; claims: string[] }[]) => twoStageViolationsEn(script, outline, { pronunciations: JSON.parse(pron), notesMd: notesMd(tc) });
  const materials = (pron: string) => `## Outline — outline.md (the contract)\n${fence(outline)}\n\n## Claims — claims.md (every fact you may use)\n${fence(claims)}\n\n## Excerpts — sources.md\n${fence(sources)}\n\n## Pronunciation map — pronunciations.json\n${fence(pron)}`;
  const formatBlock = `## Format (the parser and checks read it exactly)
- First line (meta): keep the current first line, replacing only the title field.
- Zones: \`## [Intro]\` \`## [Opening]\` \`## [Body]\` \`## [Closing]\`, once each, in this order. Inside Body, each section starts with \`### #n Title\`, with the outline's numbers and order.
- Turns: \`[${explainer}] E1 · sentence\` and \`[${host}] Y1 · sentence\`. E is the explainer, Y the host, each numbered from 1 in order. The last turn is the host's sign-off, unchanged.`;
  const baseSystem = (mode: "structure" | "detail") => `You are the script writer for "ear", an audio service. You wrote a two-person podcast script for a general listener who is new to the topic and often speaks English as a second language. A native English editor read it three times and a Korean fact reviewer checked it against the materials. Their reviews are in the next message. Revise the script so that it passes both reviews.

There are no sources and no tools. The only facts you may use are in claims.md. The outline is the contract. Do not add from memory; a script with a fact outside the excerpts is discarded.

## 1. Rules — guidelines (${bundle.labels.draft})
${fence(guidelines)}

## 2. How to revise — ${mode === "structure" ? "structure phase" : "detail phase (structure locked)"}
${mode === "structure" ? `Work in two steps in this one response.
Step 1 — Global plan (put it in plan, never in the script). Read the reviewers' reasons for 3.1, 3.5, 3.6 and 3.7 and the structural findings first. Then write: (a) the one answer to the axis question in one sentence, resting on the outline's Axis answer claims; (b) for each Body section in the outline's order: the step of the answer it gives, the claims that carry it, the moment it is told through (a person, a place, an action and one concrete detail from a claim, or "none"), and the question its last turn leaves for the next section; (c) the familiar picture the Opening starts from; (d) the Closing's answer in new words.
Step 2 — Rewrite the script to follow the plan. Change anything the plan needs: which claims each section uses (within the outline's section assignments), what opens each section, every host turn, the wrap-up. Keep word for word: the Intro turn (Y1), the host's final sign-off turn, the zone and section headers, the speaker names. Renumber E and Y turns from 1.` : `The structure is locked. Keep each section's step of the answer, the claims it uses, the Opening's familiar picture, and the Closing's answer as they are in the current script. Put a one-line note in plan saying the structure is unchanged. Change only turn-level matters: the concrete details of scenes, host turns (one job each, varied forms, at least two that change where the next explanation goes), sentence-level spoken English for a B2 listener (one idea per sentence, plain words, no written-style phrasing), and every must_fix and should_fix finding. Do not add, drop, or move claims between sections. Keep word for word: the Intro turn (Y1), the host's final sign-off turn, the headers, the speaker names. Renumber E and Y turns from 1.`}
- Resolve every must_fix finding and every should_fix finding the materials allow. A reviewer's suggested edit is a guide, not a source: take its wording only where every fact in it is in claims.md.
- Facts come only from claims.md. Do not invent words people said, numbers, names, places, or outcomes. When a claim holds the words people said, you may say them once.
- Tell facts and practices directly, in the explainer's own voice. Do not relay a source or a named person as a frame ("The director said", "In one consultant's view", "One view is that"). A view keeps who holds it, by role, inside the sentence, at most once per view.
- Length: about ${est} minutes = about ${Math.round(est * 146)} spoken words (within 15 percent), never below 730.

${formatBlock}

## 3. Report — output only the requested JSON. Put the whole script.md in script, from the meta line to the last turn. List in turn_claims the claim IDs each explainer turn uses. List in pronunciations_added every Korean word or name not in the pronunciation map (reading in Hangul, or empty). In changes, say in up to five sentences what you changed and why.`;
  const reading = (e: Editor, label: string, full: boolean) => `### ${label} — total ${editorTotal(e)}\nScores:\n${fmtScores(e)}\nFindings:\n${fmtFindings(e.findings)}${full ? `\nSuggested edits (a guide, not a source):\n${fmtEdits(e.edits)}\nRetell: ${e.retell}\nSummary: ${e.summary_ko}` : ""}`;
  const userPrompt = (script: string, eds: Editor[], kr: Korea, repairedTurns: string[], pron: string) => {
    const mi = medianIndex(eds);
    return `## This episode (${episodeId})\n- Explainer: **${explainer}** / host: **${host}** — fixed roles.\n\n## Editor reviews of the current script — three independent readings\n${reading(eds[mi], "Reading A (use this one first)", true)}\n${eds.map((e, i) => (i === mi ? "" : reading(e, `Reading ${i < mi ? "B" : "C"}`, false))).filter(Boolean).join("\n")}\n\n## Korean fact review of the current script\nPublishable: ${kr.publishable} — ${kr.publishable_reason}\n${repairedTurns.length ? `Turns ${repairedTurns.join(", ")} were already repaired after this review; keep them within the claims.\n` : ""}Findings:\n${fmtFindings(kr.findings)}\nSuggested edits (a guide, not a source):\n${fmtEdits(kr.edits)}\n\n## Current script — script.md\n${fence(script)}\n\n${materials(pron)}\n\nRevise by the rules above and output only the report JSON.`;
  };
  const save = async (name: string, body: string) => fs.writeFile(path.join(jdir, name), body, "utf8");

  // 한국어 must_fix 수리 — 지적된 턴만의 최소 변경(README 6.2). 회차 안에서도, 0회차 원판에도 같은 수리를 쓴다
  const repairMustFix = async (script: string, pron: string, kr: Korea): Promise<{ script: string; pron: string; repaired: string[] }> => {
    const mustFix = kr.findings.filter((f) => f.kind === "must_fix");
    const r = await gpt<RepairOut>(repairSystem, `## Findings (must_fix)\n${fmtFindings(mustFix)}\n\n## Suggested edits (a guide, not a source)\n${fmtEdits(kr.edits)}\n\n## script.md (line format \`[${explainer}] E1 · sentence\` / \`[${host}] Y1 · sentence\`)\n${fence(script)}\n\n## claims.md\n${fence(claims)}\n\n## sources.md\n${fence(sources)}\n\n## pronunciations.json\n${fence(pron)}\n\nRepair and output only the report JSON.`, FIX_SCHEMA, 20, "high", SCORE_MAX_OUT);
    const valid = r.fixes.filter((f) => /^[EY]\d+$/.test(f.turn) && f.after.trim());
    return { script: applyFixes(script, valid), pron: mergePron(pron, r.pronunciations_added), repaired: valid.map((f) => f.turn) };
  };

  // 0회차 — 원판의 GPT 기준선 (루프의 비교는 GPT 점수끼리)
  await progress("판정 루프 0회차 — 원판 채점");
  log(`  judge_loop ${episodeId} 시작 (기준 ${threshold})`);
  const [eds0, kr0] = await Promise.all([editors(script0), korea(script0, pron0)]);
  const med0 = medianScores(eds0);
  // v1.3: 원판의 must_fix 도 여기서 수리한다. 종전에는 회차 안에서만 수리해, 최고판이 원판에 머문 편은 점수가 기준을 넘어도 must_fix 미수리로 막혔다(G261023-010·018·020).
  // 편집자 점수는 수리 전 판의 것 — 수리는 지적 턴만의 최소 변경이라 점수를 바꾸지 않는 것으로 본다(회차 안 수리와 같은 전제). L0 는 초안의 script-notes.md(턴별 claims)로 다시 돈다
  let repaired0: string[] = []; let l00 = 0;
  if (kr0.findings.some((f) => f.kind === "must_fix")) {
    await progress("판정 루프 0회차 — 원판 필수 수정 수리");
    const rp = await repairMustFix(script0, pron0, kr0);
    const v0 = twoStageViolationsEn(rp.script, outline, { pronunciations: JSON.parse(rp.pron), notesMd: notes0 || undefined });
    if (v0.length) log(`  judge_loop ${episodeId} 0회차 수리본 L0 ${v0.length}건 — 수리를 버리고 원판 유지: ${v0[0].slice(0, 120)}`);
    else { script0 = rp.script; pron0 = rp.pron; repaired0 = rp.repaired; }
    l00 = v0.length;
  }
  const rounds: RoundRec[] = [{ t: 0, mode: "original", totals: eds0.map(editorTotal), median: med0, total: sumOf(med0), struct: sumOf(med0, STRUCT), koreaPub: kr0.publishable, koreaMf: kr0.findings.filter((f) => f.kind === "must_fix").length, repaired: repaired0, l0: l00, words: scriptStats(script0).words ?? 0, cost: Math.round(cost * 1000) / 1000 }];
  await save("round0.json", JSON.stringify({ editors: eds0, korea: kr0 }, null, 1));
  type State = { script: string; pron: string; eds: Editor[]; korea: Korea; repaired: string[]; round: number };
  let base: State = { script: script0, pron: pron0, eds: eds0, korea: kr0, repaired: repaired0, round: 0 };
  let best: State & { total: number; struct: number } = { ...base, total: rounds[0].total, struct: rounds[0].struct };
  let mode: "structure" | "detail" = "structure";
  log(`  judge_loop ${episodeId} 0회차 — GPT ${rounds[0].totals.join("·")} 중앙 ${rounds[0].total} (구조 ${rounds[0].struct}/32) · 한국어 ${kr0.publishable ? "가" : "불가"} mf${rounds[0].koreaMf} 수리 ${repaired0.length}`);

  for (let t = 1; t <= MAX_ROUNDS; t++) {
    const c0 = cost;
    await progress(`판정 루프 ${t}회차 — ${mode === "structure" ? "구조" : "세부"} 재작성`);
    let o = await gpt<RewriteOut>(baseSystem(mode), userPrompt(base.script, base.eds, base.korea, base.repaired, base.pron), OUT_SCHEMA, 40, "high");
    let script = fixMeta(o, base.script); let pron = mergePron(base.pron, o.pronunciations_added); let tc = o.turn_claims;
    let v = l0(script, pron, tc);
    if (v.length) {
      const o2 = await gpt<RewriteOut>(baseSystem(mode), `## Format check (L0) findings on your revision — resolve all, change nothing else, and return the full script again\n${v.map((x, i) => `${i + 1}. ${x}`).join("\n")}\n\n## Your revision — script.md\n${fence(script)}\n\n${materials(pron)}\n\nFix by the rules above and output only the report JSON (same fields; plan may repeat the previous plan).`, OUT_SCHEMA, 40, "high");
      script = fixMeta(o2, script); pron = mergePron(pron, o2.pronunciations_added); tc = o2.turn_claims; v = l0(script, pron, tc); o = { ...o2, plan: o.plan || o2.plan };
    }
    await save(`round${t}-plan.md`, `# ${t}회차 ${mode}\n\n${o.plan}\n\n## 바꾼 것\n${o.changes}\n\n${notesMd(tc)}\n`);
    // 한국어·사실 검토와 편집자 3회를 같은 판에 병렬로 (2026-10-23: 직렬이면 회차당 16~17분, 편당 1시간). 편집자는 must_fix 수리 전 판을 채점한다 —
    // 수리는 지적된 턴만의 최소 변경이라 점수를 바꾸지 않는 것으로 본다(README 6.2). 수리 뒤 L0 는 다시 돈다
    await progress(`판정 루프 ${t}회차 — 한국어·사실 검토 · 편집자 3회 채점`);
    const [kr, eds] = await Promise.all([korea(script, pron), editors(script)]);
    const mustFix = kr.findings.filter((f) => f.kind === "must_fix");
    let repaired: string[] = [];
    if (mustFix.length) {
      const rp = await repairMustFix(script, pron, kr);
      script = rp.script; pron = rp.pron; repaired = rp.repaired;
      v = l0(script, pron, tc);
    }
    const med = medianScores(eds); const totalT = sumOf(med), structT = sumOf(med, STRUCT);
    rounds.push({ t, mode, totals: eds.map(editorTotal), median: med, total: totalT, struct: structT, koreaPub: kr.publishable, koreaMf: mustFix.length, repaired, l0: v.length, words: scriptStats(script).words ?? 0, cost: Math.round((cost - c0) * 1000) / 1000 });
    await save(`round${t}-script.md`, script); await save(`round${t}.json`, JSON.stringify({ editors: eds, korea: kr, repaired, l0: v }, null, 1));
    log(`  judge_loop ${episodeId} ${t}회차(${mode}) — GPT ${eds.map(editorTotal).join("·")} 중앙 ${totalT} (구조 ${structT}/32) · 한국어 ${kr.publishable ? "가" : "불가"} mf${mustFix.length} 수리 ${repaired.length} · L0 ${v.length}`);
    // 단계 전환·중단·최고판
    const cur: State = { script, pron, eds, korea: kr, repaired, round: t };
    const prev = { total: best.total, struct: best.struct }; const gained = totalT > prev.total;
    if (gained) best = { ...cur, total: totalT, struct: structT };
    // 중단: 세부 단계에서 이득이 없으면, 그리고 2회차부터는 단계와 무관하게 이득이 없으면 다음 회차를 돌리지 않는다
    // (2026-10-23 조기 종료 — G261023-001 이 1회차 66 → 2회차 66 → 3회차 64 로 세 번째 회차는 비용·20분만 썼다)
    if (!gained && (mode === "detail" || t >= 2)) break;
    if (mode === "structure" && structT < prev.struct + 1) mode = "detail";
    base = gained || mode === "structure" ? cur : { ...best };
  }

  // 최고판 → 대본·발음 사전 덮어쓰기(원판이면 그대로) · 판정 저장 · 보고서
  const reportKey = s3Key(`${rel}/agent-verdict.md`);
  const verdict = buildVerdict({ episodeId, rounds, bestRound: best.round, eds: best.eds, korea: best.korea, repaired: best.repaired, threshold, model: model ?? "gpt", reportKey, cost });
  if (best.round > 0 || best.repaired.length) { await fs.writeFile(path.join(dir, "script.md"), best.script, "utf8"); await fs.writeFile(path.join(dir, "pronunciations.json"), best.pron, "utf8"); } // 원판이 최고판이어도 must_fix 수리본이면 덮어쓴다(v1.3)
  await fs.writeFile(path.join(dir, "agent-verdict.md"), reportMd({ episodeId, title: cand.title, verdict, rounds, eds: best.eds, korea: best.korea }), "utf8");
  await save("summary.json", JSON.stringify({ episodeId, rounds, best: best.round, threshold, cost: Math.round(cost * 1000) / 1000 }, null, 1));
  await pushPrefix(`${rel}/`); // 대본(버저닝)·judge/·보고서 — 먼저 S3 에
  await setCriticVerdicts(episodeId, verdict);
  await insertRun({
    backlog_id: backlogId, phase: "judge", attempt: 1,
    result: `판정 루프 ${JUDGE_LOOP_VERSION} — ${verdict.agent.publishable ? "발행 가능" : "발행 불가"}: ${verdict.agent.publishable_reason}. GPT ${rounds.map((r) => `${r.t}:${r.total}`).join(" ")} · 최고판 ${best.round}회차`,
    prompt_version: `${JUDGE_LOOP_VERSION} (worker)`, artifacts: [reportKey], executed_by: executedBy, model, cost_usd: cost, worker_rev: workerRev(),
  });
  log(`  judge_loop ${episodeId} 끝 — ${verdict.agent.publishable ? "발행 가능" : "발행 불가"} (${verdict.agent.publishable_reason}) · $${cost.toFixed(2)}`);
  return { episode_id: episodeId, publishable: verdict.agent.publishable, reason: verdict.agent.publishable_reason, best_round: best.round, totals: rounds.map((r) => r.total), threshold, cost_usd: cost, model };
}

/** 비평 뒤 연결 (critic.ts) — 글로벌 인스턴스에서만, 이미 걸려 있으면 건너뛴다 */
export async function enqueueJudgeLoop(episodeId: string, backlogId: string, parentJobId: string): Promise<string | null> {
  if (pipelineLocale() !== "en") return null;
  return enqueue({ type: "judge_loop", requires_ai: true, payload: { episode_id: episodeId, backlog_id: backlogId }, parent_job_id: parentJobId });
}
