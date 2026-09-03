import fs from "node:fs/promises";
import path from "node:path";
import { cfg, executedBy } from "../config.js";
import { enqueue, getBacklog, getEpisode, getSetting, insertRun, majorOfMidTopic, nextEpisodeId, setBacklogStatus, setJobProgress, updateJobPayload, upsertEpisode, pool, type Job } from "../db.js";
import type { Executor } from "../executors/index.js";
import { buildDraftPrompt, buildDraftRevisionPrompt, DRAFT_SCHEMA, DRAFT_REVISION_SCHEMA, episodeDatePrefix, pickIntroStyle, type Templates } from "@ear/pipeline";
import { exists, hostOf, log, RetryLater } from "../util.js";
import { prepareAssets, workerRev } from "../assets.js";
import { pullPrefix, pushPrefix, s3Key } from "../storage.js";
import { parseScriptForTts } from "../tts/script.js";

interface DraftOut { turns: number; chars: number; minutes: number; cold_open_turn: string; cold_open_verified: boolean; sources_used: string[]; sources_excluded: { url: string; reason: string }[]; self_check_fixes: string[]; notes: string }
interface RevisionOut { fixes: { location: string; before: string; after: string }[]; cold_open_updated: boolean; cold_open_verified: boolean; notes: string }

/**
 * 대본 단계 (spec/04). attempt 1 = 생성, attempt 2~3 = QA 실패 사항 최소 수정 (재생성 루프, spec/05 4장).
 * 산출물은 S3 `episodes/{id}/` 가 원본 — 단계 전 내려받고(재집기·웹 수정본) 끝나면 올린다 (spec/10 3.3). WORK_ROOT 는 캐시.
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
  } else {
    episodeId = String(job.payload.episode_id ?? "");
    if (!episodeId || !(await getEpisode(episodeId))) throw new Error(`재생성인데 episode_id 가 없거나 미등록: '${episodeId}'`);
  }
  // 규칙 묶음: 에피소드에 고정된 버전이 있으면 그것, 없으면 지금 active 를 읽어 고정한다 (spec/10 3.2)
  const prior = await getEpisode(episodeId);
  const { assetRoot, bundle } = await prepareAssets(prior?.asset_versions ?? null);
  const promptVersion = bundle.labels.draft;
  if (!prior?.asset_versions) await upsertEpisode({ id: episodeId, backlog_id: backlogId, prompt_version: promptVersion, asset_versions: bundle.versions });
  const rel = `episodes/${episodeId}`;
  const dir = path.join(cfg.workRoot, rel);
  await fs.mkdir(dir, { recursive: true });
  await pullPrefix(`${rel}/`); // S3 가 원본 — 다른 기기에서 만든 산출물·웹에서 고친 대본을 먼저 받는다
  const fileTools = [`Write(${rel}/**)`, `Edit(${rel}/**)`, "Bash(python3 *)", "Bash(wc *)", "Bash(ls *)"];

  let summary: string;
  let model: string | null;
  let out: DraftOut | RevisionOut;
  let costUsd: number | undefined;
  let tokens: unknown;
  const resumable = attempt === 1 && (await allArtifactsSettled(dir));
  if (attempt === 1 && !resumable && (await exists(path.join(dir, "script.md")))) {
    throw new RetryLater(`${episodeId} 산출물이 아직 작성 중으로 보임(다른 프로세스) — 재생성 대신 잠시 후 재시도`, 90_000);
  }
  if (resumable) {
    log(`  draft ${episodeId}: 산출물이 이미 존재 — 재생성 없이 이어받기 (재집기 복구)`);
    out = { turns: 0, chars: 0, minutes: 0, cold_open_turn: "", cold_open_verified: false, sources_used: [], sources_excluded: [], self_check_fixes: [], notes: "재집기 복구 — 수치는 QA 참고치로 대체" };
    model = null;
    summary = `${episodeId} 초안 이어받기 (워커 재집기 복구 — 기존 산출물 사용, 생성 재실행 없음)`;
  } else if (attempt === 1) {
    const introSeed = await countEpisodes();
    const intro = pickIntroStyle(introSeed);
    const [templates, majorTopic] = await Promise.all([getSetting<Templates>("templates"), majorOfMidTopic(cand.mid_topic)]);
    const prompt = buildDraftPrompt({ assetRoot, workRoot: cfg.workRoot, episodeId, candidate: cand, introStyle: intro, promptVersion, templates, majorTopic: majorTopic ?? undefined });
    const hosts = Array.from(new Set(cand.sources.map((s) => hostOf(s.url)).filter(Boolean)));
    log(`  draft ${episodeId} ← ${backlogId} "${cand.title}" (도입: ${intro.label}, 소스 ${cand.sources.length})`);
    const r = await ex.run<DraftOut>({
      prompt, schema: DRAFT_SCHEMA,
      allowedTools: ["Read", ...hosts.map((h) => `WebFetch(domain:${h})`), ...fileTools],
      addDirs: [dir, assetRoot], cwd: cfg.workRoot, timeoutMs: 100 * 60_000, model: cfg.claudeModel,
      onProgress: (pr) => setJobProgress(job.id, { ...pr, phase: "대본 생성" }).catch(() => {}),
      describe: (tool, input, counts) => {
        if (tool === "WebFetch") return `소스 정독 ${counts.WebFetch}/${cand.sources.length}`;
        const f = String(input?.file_path ?? "").split("/").pop() ?? "";
        if (tool === "Write" || tool === "Edit") return f === "script.md" ? "대본 작성" : f === "sources.md" ? "발췌 정리" : f === "claims.md" ? "claims 대조표 작성" : f === "pronunciations.json" ? "발음 맵 작성" : `${f} 작성`;
        if (tool === "Bash") return "자기 점검 (분량·콜드오픈 검증)";
        return null;
      },
    });
    out = r.output; model = r.model; costUsd = r.listCostUsd; tokens = (r.raw as { usage?: unknown } | undefined)?.usage;
    for (const f of ["script.md", "claims.md", "sources.md"]) if (!(await exists(path.join(dir, f)))) throw new Error(`산출물 누락: ${rel}/${f}`);
    const o = r.output;
    summary = `${episodeId} 초안 완료 (${ex.kind}, 도입 ${intro.label}, 템플릿 ${templates?.version ?? "미적용"}). ${o.turns}턴·${o.chars}자·약 ${o.minutes}분. 소스 ${o.sources_used.length}/${cand.sources.length} 사용${o.sources_excluded.length ? ` (제외: ${o.sources_excluded.map((x) => `${hostOf(x.url)} ${x.reason}`).join("; ").slice(0, 300)})` : ""}. 콜드오픈 ${o.cold_open_turn}${o.cold_open_verified ? " 검증" : " 미검증"}. 자기 점검 수정 ${o.self_check_fixes.length}건. ${o.notes}`;
  } else {
    const failures = (job.payload.qa_failures ?? []) as { location: string; item: string; reason: string }[];
    const prompt = buildDraftRevisionPrompt({ assetRoot, workRoot: cfg.workRoot, episodeId, candidate: cand, introStyle: pickIntroStyle(0), promptVersion, attempt, qaFailures: failures });
    log(`  draft(revision ${attempt}) ${episodeId}: QA 지적 ${failures.length}건 최소 수정`);
    const r = await ex.run<RevisionOut>({ prompt, schema: DRAFT_REVISION_SCHEMA, allowedTools: ["Read", ...fileTools], addDirs: [dir, assetRoot], cwd: cfg.workRoot, timeoutMs: 40 * 60_000, model: cfg.claudeModel,
      onProgress: (pr) => setJobProgress(job.id, { ...pr, phase: `대본 수정 (attempt ${attempt})` }).catch(() => {}),
      describe: (tool) => (tool === "Read" ? "지적 대조 중" : tool === "Edit" || tool === "Write" ? "대본 수정 중" : null),
    });
    out = r.output; model = r.model; costUsd = r.listCostUsd; tokens = (r.raw as { usage?: unknown } | undefined)?.usage;
    summary = `${episodeId} 재생성 attempt ${attempt} (QA 피드백 ${failures.length}건 → 수정 ${r.output.fixes.length}건${r.output.cold_open_updated ? ", 콜드오픈 갱신" : ""}${r.output.cold_open_verified ? ", 자구 일치 검증" : ""}). ${r.output.notes}`;
  }

  // 발음 맵 (spec/04 8장) — 모델이 빠뜨렸거나 구 에피소드 이어받기면 빈 맵을 둔다 (웹 "발음" 탭·TTS 병합의 기준 파일. 누락 표기는 TTS 잔존 검사가 잡는다)
  const pronFile = path.join(dir, "pronunciations.json");
  if (!(await exists(pronFile))) await fs.writeFile(pronFile, "{}\n", "utf8");
  await pushPrefix(`${rel}/`); // 먼저 S3 에 — DB 키가 가리키는 객체가 있어야 한다
  const artifacts = [s3Key(`${rel}/script.md`), s3Key(`${rel}/sources.md`), s3Key(`${rel}/claims.md`), s3Key(`${rel}/pronunciations.json`)];
  if (attempt === 1) {
    await upsertEpisode({ id: episodeId, backlog_id: backlogId, prompt_version: promptVersion, script_key: artifacts[0], claims_key: artifacts[2], sources_key: artifacts[1] });
    await setBacklogStatus(backlogId, "drafted");
  }
  // L0 형식 검사 (spec/09 6.2 "대본 형식 계약", spec/04 4장 줄 문법) — 위반 대본은 QA 로 보내지 않고 재생성 연쇄(spec/05 4장)로 돌린다.
  // 여기서 잡지 않으면 QA·비평을 통과해 TTS 에서야 터진다 (2026-09-03 T260903-001/003 실측)
  const violations = formatViolations(await fs.readFile(path.join(dir, "script.md"), "utf8"));
  if (violations.length) {
    if (attempt >= 3) throw new Error(`대본 형식 위반이 attempt ${attempt}까지 남음 — 웹 턴 수정으로 처리 필요: ${violations.join(" / ")}`);
    const fixes = violations.map((v) => ({ location: "대본 전체", item: "L0 형식 계약 (spec/04 4장 줄 문법)", reason: v }));
    await insertRun({ backlog_id: backlogId, phase: "draft", attempt, result: `${summary} — L0 형식 위반 ${violations.length}건, QA 생략하고 수정 재생성: ${violations.join(" / ").slice(0, 300)}`, prompt_version: `${promptVersion} (worker)`, artifacts, executed_by: executedBy, model, cost_usd: costUsd, tokens, worker_rev: workerRev() });
    const fixJobId = await enqueue({ type: "draft", requires_ai: true, payload: { episode_id: episodeId, backlog_id: backlogId, attempt: attempt + 1, qa_failures: fixes }, parent_job_id: job.id, attempt: attempt + 1 });
    log(`  draft ${episodeId}: L0 형식 위반 ${violations.length}건 — 수정 재생성 연쇄 (attempt ${attempt + 1})`);
    return { episode_id: episodeId, attempt, summary, model, l0_violations: violations, next: { draft_fix_job_id: fixJobId } };
  }
  await insertRun({ backlog_id: backlogId, phase: "draft", attempt, result: summary, prompt_version: `${promptVersion} (worker)`, artifacts, executed_by: executedBy, model, cost_usd: costUsd, tokens, worker_rev: workerRev() });
  const qaJobId = await enqueue({ type: "qa", requires_ai: true, payload: { episode_id: episodeId, backlog_id: backlogId, attempt }, parent_job_id: job.id, attempt });
  return { episode_id: episodeId, attempt, summary, model, next: { qa_job_id: qaJobId }, output: out };
}

/** L0 형식 검사 — spec/04 4장 줄 문법 위반을 기계로 검출한다. 파서가 변형을 일부 수용하므로, 여기서 걸리면 파서로도 못 살리는 수준의 이탈이다 */
function formatViolations(md: string): string[] {
  const p = parseScriptForTts(md);
  const v: string[] = [];
  if (p.turns.length < 10) v.push(`파싱된 발화 턴이 ${p.turns.length}개 — 줄 문법("[윤아] E1 · 문장") 위반 가능성 (spec/04 4장)`);
  else {
    const noId = p.turns.filter((t) => !t.id);
    if (noId.length > Math.ceil(p.turns.length * 0.3)) v.push(`턴 번호(E·Y) 없는 발화가 ${noId.length}/${p.turns.length}개 — 번호 턴은 "[화자] E1 · 문장" 형식 (spec/04 4장)`);
  }
  if (!p.coldOpen) v.push("콜드오픈 구역에서 발화를 찾지 못함 (spec/04 4장 구조)");
  else if (p.coldOpen.sourceTurn && !p.turns.some((t) => t.id === p.coldOpen!.sourceTurn)) v.push(`콜드오픈 발췌 원본 ${p.coldOpen.sourceTurn} 턴이 본편에 없음 — 발췌 위치 표기 또는 턴 번호 오류`);
  return v;
}

/** script/claims/sources 가 모두 있고 마지막 수정이 3분 이상 지났으면(고아 프로세스가 아직 쓰는 중이 아니면) 완료된 산출물로 본다.
 *  S3 에서 내려받은 파일은 mtime 이 S3 LastModified 라 다른 기기의 완료분도 같은 기준으로 판정된다 */
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
