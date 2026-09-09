import fs from "node:fs/promises";
import path from "node:path";
import { cfg, executedBy } from "../config.js";
import { enqueue, getEpisode, insertRun, setBacklogStatus, setJobProgress, upsertEpisode, type Job } from "../db.js";
import type { Executor } from "../executors/index.js";
import { buildQaPrompt, buildQaPromptInline, QA_SCHEMA, QA_INLINE_SCHEMA, todayKst } from "@ear/pipeline";
import { log } from "../util.js";
import { prepareAssets, workerRev } from "../assets.js";
import { localPathOf, pullPrefix, pushPrefix, s3Key } from "../storage.js";

interface QaOut { verdict: "qa_passed" | "failed"; failures: { location: string; item: string; reason: string }[]; holds: string[]; report_written?: boolean; summary: string }
interface QaInlineOut extends QaOut { resolved_prior: { location: string; resolved: boolean; note: string }[]; report_md: string }

const MAX_ATTEMPTS = 3;

/** QA (spec/05) — 독립 실행: 새 프로세스, 입력 3종 + spec/05 + qa 프롬프트만. 실패 시 draft 재생성 연쇄, 3회 초과 시 review_required. */
export async function runQa(job: Job, ex: Executor) {
  const episodeId = String(job.payload.episode_id ?? "");
  const backlogId = String(job.payload.backlog_id ?? "");
  const attempt = Number(job.payload.attempt ?? 1);
  const ep = await getEpisode(episodeId);
  if (!ep) throw new Error(`에피소드 ${episodeId} 없음`);
  const rel = `episodes/${episodeId}`;
  const dir = path.join(cfg.workRoot, rel);
  await fs.mkdir(dir, { recursive: true });
  await pullPrefix(`${rel}/`); // S3 가 원본 — 대본(사람 수정 포함)·claims·발췌·기존 QA 리포트를 받는다 (spec/10 3.3)
  const scriptFile = localPathOf(ep.script_key);
  const { assetRoot, bundle } = await prepareAssets(ep.asset_versions ?? null); // 에피소드에 고정된 규칙 (spec/10 3.2)

  let r: Awaited<ReturnType<typeof ex.run<QaOut>>>;
  if (cfg.qaMode === "single") {
    // 단발 호출 (2026-09-08 비용 절감 ②): 입력 3종 + 자산을 인라인, 도구 없음. 리포트는 JSON 으로 받아 워커가 qa-report.md 에 추기한다
    const read = (p: string) => fs.readFile(p, "utf8");
    const [scriptMd, claimsMd, sourcesMd] = await Promise.all([read(scriptFile ?? path.join(dir, "script.md")), read(path.join(dir, "claims.md")), read(path.join(dir, "sources.md"))]);
    const prompt = buildQaPromptInline({
      episodeId, attempt, qaPromptMd: bundle.contents["skills/qa/prompt.md"], specQaMd: bundle.contents["spec/05-qa.md"], scriptMd, claimsMd, sourcesMd,
      priorFailures: (job.payload.prior_failures ?? []) as QaOut["failures"], fixes: (job.payload.fixes ?? []) as { location: string; before: string; after: string }[],
      humanRevision: !!job.payload.human_revision,
    });
    log(`  qa ${episodeId} attempt ${attempt} (단발, 프롬프트 ${Math.round(prompt.length / 1000)}K자)`);
    const ri = await ex.run<QaInlineOut>({
      prompt, schema: QA_INLINE_SCHEMA, tools: [], allowedTools: [], cwd: cfg.workRoot, timeoutMs: 30 * 60_000, model: cfg.qaModel, maxThinkingTokens: cfg.thinkingQa,
      onProgress: (pr) => setJobProgress(job.id, { ...pr, phase: `QA 검증 (attempt ${attempt}, 단발)`, detail: pr.turns > 0 ? "발췌 대조·판정 중 (도구 없음)" : pr.detail }).catch(() => {}),
    });
    const reportFile = path.join(dir, "qa-report.md");
    const head = `# QA 리포트 — ${episodeId}\n\n> QA: 독립 실행 (${bundle.labels.qa}, 단발) · 입력 3종 + spec/05만\n`;
    const prior = (await fs.readFile(reportFile, "utf8").catch(() => "")) || head;
    const resolved = ri.output.resolved_prior.length ? `\n### 이전 회차 실패 해소 여부\n${ri.output.resolved_prior.map((x) => `- ${x.resolved ? "해소" : "**미해소**"} · ${x.location} — ${x.note}`).join("\n")}\n` : "";
    await fs.writeFile(reportFile, `${prior.trimEnd()}\n\n## attempt ${attempt} (${todayKst()})\n\n${ri.output.report_md.trim()}\n${resolved}`, "utf8");
    r = { ...ri, output: { verdict: ri.output.verdict, failures: ri.output.failures, holds: ri.output.holds, summary: ri.output.summary, report_written: true } };
  } else {
    const prompt = buildQaPrompt({ assetRoot, workRoot: cfg.workRoot, episodeId, attempt, scriptFile });
    log(`  qa ${episodeId} attempt ${attempt}`);
    r = await ex.run<QaOut>({
      prompt, schema: QA_SCHEMA,
      allowedTools: ["Read", `Write(${rel}/qa-report.md)`, `Edit(${rel}/qa-report.md)`, "Bash(python3 *)"],
      addDirs: [dir, assetRoot], cwd: cfg.workRoot, timeoutMs: 40 * 60_000, model: cfg.qaModel,
      onProgress: (pr) => setJobProgress(job.id, { ...pr, phase: `QA 검증 (attempt ${attempt})` }).catch(() => {}),
      describe: (tool, input, counts) => {
        const f = String(input?.file_path ?? "").split("/").pop() ?? "";
        if (tool === "Read") return f === "sources.md" ? "발췌 대조 중" : f === "script.md" ? "대본 검토 중" : f === "claims.md" ? "claims 확인 중" : `입력 검토 (${counts.Read ?? 1}건째)`;
        if (tool === "Write" || tool === "Edit") return "QA 리포트 작성";
        if (tool === "Bash") return "기계 검사 (표기·구조)";
        return null;
      },
    });
  }
  const o = r.output;
  const failTxt = o.failures.map((f) => `${f.location} [항목 ${f.item}] ${f.reason}`).join(" / ");
  await pushPrefix(`${rel}/`); // qa-report.md — 먼저 S3 에
  const reportKey = s3Key(`${rel}/qa-report.md`);
  await upsertEpisode({ id: episodeId, backlog_id: backlogId, prompt_version: ep.prompt_version, qa_report_key: reportKey, ...(ep.asset_versions ? {} : { asset_versions: bundle.versions }) });
  await insertRun({ backlog_id: backlogId, phase: "qa", attempt, result: `${o.verdict} — 실패 ${o.failures.length}·보류 ${o.holds.length}. ${o.summary}${failTxt ? ` · 실패 상세: ${failTxt}`.slice(0, 1200) : ""}`, prompt_version: `${bundle.labels.qa}${cfg.qaMode === "single" ? "+single" : ""} (worker)`, artifacts: [reportKey], executed_by: executedBy, model: r.model, cost_usd: r.listCostUsd, tokens: (r.raw as { usage?: unknown } | undefined)?.usage, worker_rev: workerRev() });

  let next: Record<string, unknown> = {};
  if (o.verdict === "qa_passed") {
    await setBacklogStatus(backlogId, "qa_passed");
    const criticJobId = await enqueue({ type: "critic", requires_ai: true, payload: { episode_id: episodeId, backlog_id: backlogId, rubric: cfg.criticRubric }, parent_job_id: job.id }); // 기본 v2 (spec/09 7.1) — 사람이 판정하는 리포트만 만든다
    next = { critic_job_id: criticJobId };
  } else if (attempt < MAX_ATTEMPTS) {
    const draftJobId = await enqueue({ type: "draft", requires_ai: true, payload: { backlog_id: backlogId, episode_id: episodeId, attempt: attempt + 1, qa_failures: o.failures }, parent_job_id: job.id, attempt: attempt + 1 });
    next = { draft_revision_job_id: draftJobId };
  } else {
    await setBacklogStatus(backlogId, "review_required");
    next = { review_required: true };
  }
  return { episode_id: episodeId, attempt, verdict: o.verdict, failures: o.failures, holds: o.holds, model: r.model, next };
}
