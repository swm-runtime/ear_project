import fs from "node:fs/promises";
import path from "node:path";
import { cfg, executedBy } from "../config.js";
import { enqueue, getEpisode, insertRun, setBacklogStatus, setJobProgress, upsertEpisode, type Job } from "../db.js";
import type { Executor } from "../executors/index.js";
import { buildQaPrompt, QA_SCHEMA } from "@ear/pipeline";
import { log } from "../util.js";
import { prepareAssets, workerRev } from "../assets.js";
import { localPathOf, pullPrefix, pushPrefix, s3Key } from "../storage.js";

interface QaOut { verdict: "qa_passed" | "failed"; failures: { location: string; item: string; reason: string }[]; holds: string[]; report_written: boolean; summary: string }

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

  const prompt = buildQaPrompt({ assetRoot, workRoot: cfg.workRoot, episodeId, attempt, scriptFile });
  log(`  qa ${episodeId} attempt ${attempt}`);
  const r = await ex.run<QaOut>({
    prompt, schema: QA_SCHEMA,
    allowedTools: ["Read", `Write(${rel}/qa-report.md)`, `Edit(${rel}/qa-report.md)`, "Bash(python3 *)"],
    addDirs: [dir, assetRoot], cwd: cfg.workRoot, timeoutMs: 40 * 60_000, model: cfg.qaModel,
    onProgress: (pr) => setJobProgress(job.id, { ...pr, phase: `QA 검증 (attempt ${attempt})` }).catch(() => {}),
    describe: (tool, input, counts) => {
      const f = String(input?.file_path ?? "").split("/").pop() ?? "";
      if (tool === "Read") return f === "sources.md" ? "발췌 대조 중" : f === "script.md" ? "대본 검토 중" : f === "claims.md" ? "claims 확인 중" : `입력 검토 (${counts.Read ?? 1}건째)`;
      if (tool === "Write" || tool === "Edit") return "QA 리포트 작성";
      if (tool === "Bash") return "기계 검사 (콜드오픈·표기)";
      return null;
    },
  });
  const o = r.output;
  const failTxt = o.failures.map((f) => `${f.location} [항목 ${f.item}] ${f.reason}`).join(" / ");
  await pushPrefix(`${rel}/`); // qa-report.md — 먼저 S3 에
  const reportKey = s3Key(`${rel}/qa-report.md`);
  await upsertEpisode({ id: episodeId, backlog_id: backlogId, prompt_version: ep.prompt_version, qa_report_key: reportKey, ...(ep.asset_versions ? {} : { asset_versions: bundle.versions }) });
  await insertRun({ backlog_id: backlogId, phase: "qa", attempt, result: `${o.verdict} — 실패 ${o.failures.length}·보류 ${o.holds.length}. ${o.summary}${failTxt ? ` · 실패 상세: ${failTxt}`.slice(0, 1200) : ""}`, prompt_version: `${bundle.labels.qa} (worker)`, artifacts: [reportKey], executed_by: executedBy, model: r.model, cost_usd: r.listCostUsd, tokens: (r.raw as { usage?: unknown } | undefined)?.usage, worker_rev: workerRev() });

  let next: Record<string, unknown> = {};
  if (o.verdict === "qa_passed") {
    await setBacklogStatus(backlogId, "qa_passed");
    const criticJobId = await enqueue({ type: "critic", requires_ai: true, payload: { episode_id: episodeId, backlog_id: backlogId }, parent_job_id: job.id });
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
