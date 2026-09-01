import fs from "node:fs/promises";
import path from "node:path";
import { cfg, executedBy } from "../config.js";
import { enqueue, getBacklog, getEpisode, getSetting, insertRun, majorOfMidTopic, nextEpisodeId, setBacklogStatus, setJobProgress, updateJobPayload, upsertEpisode, pool, type Job } from "../db.js";
import type { Executor } from "../executors/index.js";
import { buildDraftPrompt, buildDraftRevisionPrompt, DRAFT_SCHEMA, DRAFT_REVISION_SCHEMA, episodeDatePrefix, pickIntroStyle, type Templates } from "@ear/pipeline";
import { exists, hostOf, log, RetryLater } from "../util.js";

interface DraftOut { turns: number; chars: number; minutes: number; cold_open_turn: string; cold_open_verified: boolean; sources_used: string[]; sources_excluded: { url: string; reason: string }[]; self_check_fixes: string[]; notes: string }
interface RevisionOut { fixes: { location: string; before: string; after: string }[]; cold_open_updated: boolean; cold_open_verified: boolean; notes: string }

/**
 * 대본 단계 (spec/04). attempt 1 = 생성, attempt 2~3 = QA 실패 사항 최소 수정 (재생성 루프, spec/05 4장).
 * 산출물은 로컬 episodes/{id}/ (S3 이관 전 — runs.artifacts 는 local: 경로).
 */
export async function runDraft(job: Job, ex: Executor) {
  const backlogId = String(job.payload.backlog_id ?? "");
  const attempt = Number(job.payload.attempt ?? 1);
  const cand = await getBacklog(backlogId);
  if (!cand) throw new Error(`백로그 ${backlogId} 없음`);
  if (cand.sources.length < 3) throw new Error(`소스 ${cand.sources.length}건 — 3건 하한 미달 (불변 원칙 5)`);

  let episodeId: string;
  if (attempt === 1) {
    // 재집기(워커 사망 후 회수) 시 같은 에피소드를 이어받도록 작업 payload 에 ID 를 고정한다
    episodeId = String(job.payload.episode_id ?? "") || (await nextEpisodeId(episodeDatePrefix("T")));
    if (!job.payload.episode_id) await updateJobPayload(job.id, { episode_id: episodeId });
    await upsertEpisode({ id: episodeId, backlog_id: backlogId, prompt_version: cfg.promptVersion });
  } else {
    episodeId = String(job.payload.episode_id ?? "");
    if (!episodeId || !(await getEpisode(episodeId))) throw new Error(`재생성인데 episode_id 가 없거나 미등록: '${episodeId}'`);
  }
  const dir = path.join(cfg.workRoot, "episodes", episodeId);
  await fs.mkdir(dir, { recursive: true });
  const rel = `episodes/${episodeId}`;
  const fileTools = [`Write(${rel}/**)`, `Edit(${rel}/**)`, "Bash(python3 *)", "Bash(wc *)", "Bash(ls *)"];

  let summary: string;
  let model: string | null;
  let out: DraftOut | RevisionOut;
  const resumable = attempt === 1 && (await allArtifactsSettled(dir));
  if (attempt === 1 && !resumable && (await exists(path.join(dir, "script.md")))) {
    throw new RetryLater(`${episodeId} 산출물이 아직 작성 중으로 보임(다른 프로세스) — 재생성 대신 잠시 후 재시도`, 90_000);
  }
  if (resumable) {
    log(`  draft ${episodeId}: 산출물이 이미 존재 — 재생성 없이 이어받기 (재집기 복구)`);
    out = { turns: 0, chars: 0, minutes: 0, cold_open_turn: "", cold_open_verified: false, sources_used: [], sources_excluded: [], self_check_fixes: [], notes: "재집기 복구 — 수치는 QA 참고치로 대체" };
    model = null;
    summary = `${episodeId} 초안 이어받기 (워커 재집기 복구 — 기존 산출물 사용, 생성 재실행 없음)`;
    await upsertEpisode({ id: episodeId, backlog_id: backlogId, prompt_version: cfg.promptVersion, script_key: `local:${rel}/script.md`, claims_key: `local:${rel}/claims.md`, sources_key: `local:${rel}/sources.md` });
    await setBacklogStatus(backlogId, "drafted");
  } else if (attempt === 1) {
    const introSeed = await countEpisodes();
    const intro = pickIntroStyle(introSeed);
    const [templates, majorTopic] = await Promise.all([getSetting<Templates>("templates"), majorOfMidTopic(cand.mid_topic)]);
    const prompt = buildDraftPrompt({ assetRoot: cfg.assetRoot, workRoot: cfg.workRoot, episodeId, candidate: cand, introStyle: intro, promptVersion: cfg.promptVersion, templates, majorTopic: majorTopic ?? undefined });
    const hosts = Array.from(new Set(cand.sources.map((s) => hostOf(s.url)).filter(Boolean)));
    log(`  draft ${episodeId} ← ${backlogId} "${cand.title}" (도입: ${intro.label}, 소스 ${cand.sources.length})`);
    const r = await ex.run<DraftOut>({
      prompt, schema: DRAFT_SCHEMA,
      allowedTools: ["Read", ...hosts.map((h) => `WebFetch(domain:${h})`), ...fileTools],
      addDirs: [dir, cfg.assetRoot], cwd: cfg.workRoot, timeoutMs: 100 * 60_000, model: cfg.claudeModel,
      onProgress: (pr) => setJobProgress(job.id, { ...pr, phase: "대본 생성" }).catch(() => {}),
      describe: (tool, input, counts) => {
        if (tool === "WebFetch") return `소스 정독 ${counts.WebFetch}/${cand.sources.length}`;
        const f = String(input?.file_path ?? "").split("/").pop() ?? "";
        if (tool === "Write" || tool === "Edit") return f === "script.md" ? "대본 작성" : f === "sources.md" ? "발췌 정리" : f === "claims.md" ? "claims 대조표 작성" : `${f} 작성`;
        if (tool === "Bash") return "자기 점검 (분량·콜드오픈 검증)";
        return null;
      },
    });
    out = r.output; model = r.model;
    for (const f of ["script.md", "claims.md", "sources.md"]) if (!(await exists(path.join(dir, f)))) throw new Error(`산출물 누락: ${rel}/${f}`);
    const o = r.output;
    summary = `${episodeId} 초안 완료 (${ex.kind}, 도입 ${intro.label}, 템플릿 ${templates?.version ?? "미적용"}). ${o.turns}턴·${o.chars}자·약 ${o.minutes}분. 소스 ${o.sources_used.length}/${cand.sources.length} 사용${o.sources_excluded.length ? ` (제외: ${o.sources_excluded.map((x) => `${hostOf(x.url)} ${x.reason}`).join("; ").slice(0, 300)})` : ""}. 콜드오픈 ${o.cold_open_turn}${o.cold_open_verified ? " 검증" : " 미검증"}. 자기 점검 수정 ${o.self_check_fixes.length}건. ${o.notes}`;
    await upsertEpisode({ id: episodeId, backlog_id: backlogId, prompt_version: cfg.promptVersion, script_key: `local:${rel}/script.md`, claims_key: `local:${rel}/claims.md`, sources_key: `local:${rel}/sources.md` });
    await setBacklogStatus(backlogId, "drafted");
  } else {
    const failures = (job.payload.qa_failures ?? []) as { location: string; item: string; reason: string }[];
    const prompt = buildDraftRevisionPrompt({ assetRoot: cfg.assetRoot, workRoot: cfg.workRoot, episodeId, candidate: cand, introStyle: pickIntroStyle(0), promptVersion: cfg.promptVersion, attempt, qaFailures: failures });
    log(`  draft(revision ${attempt}) ${episodeId}: QA 지적 ${failures.length}건 최소 수정`);
    const r = await ex.run<RevisionOut>({ prompt, schema: DRAFT_REVISION_SCHEMA, allowedTools: ["Read", ...fileTools], addDirs: [dir, cfg.assetRoot], cwd: cfg.workRoot, timeoutMs: 40 * 60_000, model: cfg.claudeModel,
      onProgress: (pr) => setJobProgress(job.id, { ...pr, phase: `대본 수정 (attempt ${attempt})` }).catch(() => {}),
      describe: (tool) => (tool === "Read" ? "지적 대조 중" : tool === "Edit" || tool === "Write" ? "대본 수정 중" : null),
    });
    out = r.output; model = r.model;
    summary = `${episodeId} 재생성 attempt ${attempt} (QA 피드백 ${failures.length}건 → 수정 ${r.output.fixes.length}건${r.output.cold_open_updated ? ", 콜드오픈 갱신" : ""}${r.output.cold_open_verified ? ", 자구 일치 검증" : ""}). ${r.output.notes}`;
  }

  await insertRun({ backlog_id: backlogId, phase: "draft", attempt, result: summary, prompt_version: cfg.promptVersion + " + 골드 사용법·도입 분산 지시 (worker)", artifacts: [`local:${rel}/script.md`, `local:${rel}/sources.md`, `local:${rel}/claims.md`], executed_by: executedBy, model });
  const qaJobId = await enqueue({ type: "qa", requires_ai: true, payload: { episode_id: episodeId, backlog_id: backlogId, attempt }, parent_job_id: job.id, attempt });
  return { episode_id: episodeId, attempt, summary, model, next: { qa_job_id: qaJobId }, output: out };
}

/** script/claims/sources 가 모두 있고 마지막 수정이 3분 이상 지났으면(고아 프로세스가 아직 쓰는 중이 아니면) 완료된 산출물로 본다 */
async function allArtifactsSettled(dir: string): Promise<boolean> {
  const files = ["script.md", "claims.md", "sources.md"].map((f) => path.join(dir, f));
  for (const f of files) if (!(await exists(f))) return false;
  const stats = await Promise.all(files.map((f) => fs.stat(f)));
  const newest = Math.max(...stats.map((s) => s.mtimeMs));
  return Date.now() - newest > 3 * 60_000;
}

async function countEpisodes(): Promise<number> {
  const r = await pool.query("select count(*)::int as n from public.episodes");
  return Number(r.rows[0].n);
}
