import path from "node:path";
import { cfg, executedBy } from "../config.js";
import { getBacklog, getEpisode, insertRun, setJobProgress, upsertEpisode, type Job } from "../db.js";
import type { Executor } from "../executors/index.js";
import { buildCriticPrompt, CRITIC_SCHEMA, CRITIC_SCHEMA_V2 } from "@ear/pipeline";
import { readFile } from "node:fs/promises";
import { log } from "../util.js";

interface CriticOut { scores: { immersion: number; naturalness: number; density: number; persona: number; structure: number }; violations: number; suspects: number; stars: number; report_written: boolean; summary: string }
interface CriticV2Out {
  scores: { content: { value: number; argument: number; perspective: number; resonance: number }; structure: { opening: number; flow: number; ending: number }; naturalness: { spoken: number; exchange: number }; immersion: number; persona: { voice: number; listener: number } };
  evidence: Record<string, string>; total: number; violations: number; suspects: number; stars: number; report_written: boolean; summary: string;
}

/** 비평 (spec/09 7장) — QA 통과본 기준으로만 실행 (검수 순서 규정). 판정 열은 비워 사람 몫으로. */
export async function runCritic(job: Job, ex: Executor) {
  const episodeId = String(job.payload.episode_id ?? "");
  const backlogId = String(job.payload.backlog_id ?? "");
  const ep = await getEpisode(episodeId);
  const cand = await getBacklog(backlogId);
  if (!ep || !cand) throw new Error(`에피소드/백로그 없음: ${episodeId}/${backlogId}`);
  const rel = `episodes/${episodeId}`;
  const dir = path.join(cfg.workRoot, rel);
  const scriptFile = ep.script_key?.startsWith("local:") ? path.join(cfg.workRoot, ep.script_key.slice(6)) : undefined;

  const rubric: "v1" | "v2" = job.payload.rubric === "v2" ? "v2" : "v1";
  if (rubric === "v2") return runCriticV2(job, ex, { episodeId, backlogId, rel, dir, scriptFile, title: cand.title, midTopic: cand.mid_topic });

  const prompt = buildCriticPrompt({ assetRoot: cfg.assetRoot, workRoot: cfg.workRoot, episodeId, title: cand.title, midTopic: cand.mid_topic, scriptFile });
  log(`  critic ${episodeId}`);
  const r = await ex.run<CriticOut>({
    prompt, schema: CRITIC_SCHEMA,
    allowedTools: ["Read", `Write(${rel}/critic-report.md)`, `Edit(${rel}/critic-report.md)`],
    addDirs: [dir, cfg.assetRoot], cwd: cfg.workRoot, timeoutMs: 40 * 60_000, model: cfg.criticModel,
    onProgress: (pr) => setJobProgress(job.id, { ...pr, phase: "비평" }).catch(() => {}),
    describe: (tool, input, counts) => {
      const f = String(input?.file_path ?? "").split("/").pop() ?? "";
      if (tool === "Read") return f.startsWith("gold-") ? "골드 예시 대조 중" : f === "rubric.md" ? "루브릭 확인 중" : f === "script.md" ? "대본 정독 중" : `자료 검토 (${counts.Read ?? 1}건째)`;
      if (tool === "Write" || tool === "Edit") return "비평 리포트 작성";
      return null;
    },
  });
  const o = r.output; const s = o.scores;
  await upsertEpisode({ id: episodeId, backlog_id: backlogId, prompt_version: ep.prompt_version, critic_report_key: `local:${rel}/critic-report.md` });
  await insertRun({ backlog_id: backlogId, phase: "critic", attempt: 1, result: `비평 완료 (QA 통과본 기준). 종합: 몰입${s.immersion}·자연${s.naturalness}·밀도${s.density}·페르소나${s.persona}·구성${s.structure}. 플래그 위반 ${o.violations}·의심 ${o.suspects}, ⭐${o.stars}. ${o.summary} · 사람 판정 대기`, prompt_version: "critic-v1.3 (C2·C4 tpl-v1 동기화 · F5 골드 대조 확장, worker)", artifacts: [`local:${rel}/critic-report.md`], executed_by: executedBy, model: r.model });
  return { episode_id: episodeId, scores: s, violations: o.violations, suspects: o.suspects, stars: o.stars, summary: o.summary, model: r.model };
}

/** critic-v2 초안 실행 (spec/09 v2 · rubric-v2.md). 리포트는 critic-report-v2.md — v1 스냅샷은 보존. 앵커 없음 기준선. */
async function runCriticV2(job: Job, ex: Executor, e: { episodeId: string; backlogId: string; rel: string; dir: string; scriptFile?: string; title: string; midTopic: string }) {
  const scriptPath = e.scriptFile ?? path.join(e.dir, "script.md");
  const scriptText = await readFile(scriptPath, "utf8").catch(() => "");
  const preTemplate = /\{인트로[^}]*\}|\{클로징[^}]*\}/.test(scriptText); // tpl-v1 이전 세대: 자리표기 감점 금지
  const prompt = buildCriticPrompt({ assetRoot: cfg.assetRoot, workRoot: cfg.workRoot, episodeId: e.episodeId, title: e.title, midTopic: e.midTopic as never, scriptFile: e.scriptFile, rubric: "v2", preTemplate });
  log(`  critic v2 ${e.episodeId}${preTemplate ? " (tpl 이전 세대)" : ""}`);
  const r = await ex.run<CriticV2Out>({
    prompt, schema: CRITIC_SCHEMA_V2,
    allowedTools: ["Read", `Write(${e.rel}/critic-report-v2.md)`, `Edit(${e.rel}/critic-report-v2.md)`],
    addDirs: [e.dir, cfg.assetRoot], cwd: cfg.workRoot, timeoutMs: 45 * 60_000, model: cfg.criticModel,
    onProgress: (pr) => setJobProgress(job.id, { ...pr, phase: "비평 v2 (100점 채점)" }).catch(() => {}),
    describe: (tool, input, counts) => {
      const f = String(input?.file_path ?? "").split("/").pop() ?? "";
      if (tool === "Read") return f.startsWith("gold-") ? "골드 예시 대조 중" : f.startsWith("rubric") ? "루브릭 v2 확인 중" : f === "script.md" || f.startsWith("script") ? "대본 정독 중" : `자료 검토 (${counts.Read ?? 1}건째)`;
      if (tool === "Write" || tool === "Edit") return "비평 리포트 v2 작성";
      return null;
    },
  });
  const o = r.output; const s = o.scores;
  const sum = { content: s.content.value + s.content.argument + s.content.perspective + s.content.resonance, structure: s.structure.opening + s.structure.flow + s.structure.ending, naturalness: s.naturalness.spoken + s.naturalness.exchange, immersion: s.immersion, persona: s.persona.voice + s.persona.listener };
  const total = sum.content + sum.structure + sum.naturalness + sum.immersion + sum.persona;
  if (total !== o.total) log(`  ⚠ total 불일치: 보고 ${o.total} vs 합산 ${total} — 합산값 기록`);
  const ep = await getEpisode(e.episodeId);
  await upsertEpisode({ id: e.episodeId, backlog_id: e.backlogId, prompt_version: ep?.prompt_version ?? "unknown", critic_report_key: `local:${e.rel}/critic-report-v2.md` });
  await insertRun({
    backlog_id: e.backlogId, phase: "critic", attempt: 1,
    result: `비평 v2 완료 (앵커 없음 기준선${preTemplate ? " · tpl 이전 세대" : ""}). 합계 ${total}/100 — 내용 ${sum.content}/35 · 구성 ${sum.structure}/20 · 자연 ${sum.naturalness}/20 · 몰입 ${sum.immersion}/15 · 페르소나 ${sum.persona}/10. 플래그 위반 ${o.violations}·의심 ${o.suspects}, ⭐${o.stars}. ${o.summary} · 사람 판정 대기`,
    prompt_version: "critic-v2 (초안 · 앵커 없음, worker)", artifacts: [`local:${e.rel}/critic-report-v2.md`], executed_by: executedBy, model: r.model,
  });
  return { episode_id: e.episodeId, rubric: "v2", pre_template: preTemplate, scores: s, sums: sum, total, violations: o.violations, suspects: o.suspects, stars: o.stars, summary: o.summary, model: r.model };
}
