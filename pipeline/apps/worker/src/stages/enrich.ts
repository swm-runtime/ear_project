import fs from "node:fs/promises";
import path from "node:path";
import { cfg, executedBy } from "../config.js";
import { insertRun, setJobProgress, type Job } from "../db.js";
import type { Executor } from "../executors/index.js";
import { buildEnrichPrompt, ENRICH_JOB_CATEGORIES_DEFAULT, ENRICH_SCHEMA, ENRICH_YEARS, ENRICHMENT_SCHEMA_VERSION, normalizeEnrichment } from "@ear/pipeline";
import { log } from "../util.js";
import { workerRev } from "../assets.js";
import { getFile, putFile, s3Key } from "../storage.js";

/**
 * 추천 메타 부여 (KAN-53, 0021 · docs/ai/metadata-pipeline.md 4.2·4.4 · .claude/skills/metadata-enrichment 의 워커판).
 * payload: { content_id, episode_id?, title, description, topic_names[], origin, job_categories?[] }
 * - 대본은 episode_id 가 있으면 S3 episodes/<id>/script.md, 없으면 4.5 폴백(제목+설명, source=title_description).
 * - 산출물은 datasets/enrichment/<content_id>.json (+ .report.json: 근거·경고). **DB·제품에 쓰지 않는다** — 반영은 콘솔이 브라우저 세션으로
 *   PATCH /admin/contents/:id 에 enrichment_file 만 보낸다(admin-api 4.10, 버전 무변경). 이 워커는 제품 API 를 부를 수 없다.
 * - 임베딩(Phase B)은 모델 미확정이라 생략(스킬과 같음).
 */
export const ENRICH_KEY = (contentId: string) => `datasets/enrichment/${contentId}.json`;
/**
 * 두 모드:
 * - **에피소드 모드** `{ episode_id, backlog_id }` — 패키지 직후 자동(spec/07 2장 · metadata-pipeline 2장). 제목·설명·주제는 upload-meta.json 에서,
 *   산출물은 episodes/<id>/enrichment.json — 업로드 화면이 발행할 때 enrichment_file 로 같이 보낸다.
 * - **콘텐츠 모드** `{ content_id, episode_id?, title, description, topic_names, origin }` — 발행분 소급(KAN-53). 산출물은 datasets/enrichment/<content_id>.json.
 */
export async function runEnrich(job: Job, ex: Executor) {
  const contentId = job.payload.content_id ? String(job.payload.content_id) : null;
  const episodeId = job.payload.episode_id ? String(job.payload.episode_id) : null;
  if (contentId && !/^[A-Za-z0-9-]{1,64}$/.test(contentId)) throw new Error("payload.content_id 형식 오류");
  if (!contentId && !episodeId) throw new Error("payload.content_id 또는 episode_id 필요");
  let title = String(job.payload.title ?? ""), description = String(job.payload.description ?? "");
  let topicNames = Array.isArray(job.payload.topic_names) ? (job.payload.topic_names as unknown[]).map(String) : [];
  const origin = String(job.payload.origin ?? "ai_generated");
  const jobCategories = Array.isArray(job.payload.job_categories) && (job.payload.job_categories as unknown[]).length ? (job.payload.job_categories as unknown[]).map(String) : ENRICH_JOB_CATEGORIES_DEFAULT;
  if (!contentId && episodeId) { // 에피소드 모드 — 패키지 산출물에서 입력을 읽는다
    const metaText = await getFile(`episodes/${episodeId}/upload-meta.json`);
    if (!metaText) throw new Error(`${episodeId}/upload-meta.json 없음 — 패키지 이후에`);
    const m = JSON.parse(metaText) as { title?: string; description?: string; mid_topic?: string; major_topic?: string };
    title = title || String(m.title ?? ""); description = description || String(m.description ?? "");
    if (!topicNames.length) topicNames = [m.mid_topic, m.major_topic].filter((x): x is string => !!x);
  }
  const outKey = contentId ? ENRICH_KEY(contentId) : `episodes/${episodeId}/enrichment.json`;
  const reportKey = contentId ? `datasets/enrichment/${contentId}.report.json` : `episodes/${episodeId}/enrichment.report.json`;
  const label = contentId ? contentId.slice(0, 8) : episodeId!;
  const backlogId = job.payload.backlog_id ? String(job.payload.backlog_id) : null;
  if (!title) throw new Error("payload.title 필요");

  await setJobProgress(job.id, { phase: `메타 부여 — 입력 수집 (${label})`, detail: episodeId ? `대본 ${episodeId}` : "폴백(제목+설명)", toolCounts: {}, turns: 0, elapsedMs: 0 }).catch(() => {});
  let script: string | null = null;
  if (episodeId) {
    script = await getFile(`episodes/${episodeId}/script.md`);
    if (!script) log(`  enrich ${label}: ${episodeId}/script.md 없음 — 폴백(제목+설명)으로`);
  }
  // 판정 기준의 원본은 스킬의 reference 파일 — 레포 체크아웃(ASSET_ROOT = docs/ai 의 두 단계 위)에서 읽는다. 없으면 명세 4.2 요약으로 대신한다
  const repoRoot = path.resolve(cfg.assetSourceRoot, "..", "..");
  const criteria = await fs.readFile(path.join(repoRoot, ".claude/skills/metadata-enrichment/reference/judgment-criteria.md"), "utf8").catch(() => FALLBACK_CRITERIA);
  const prompt = buildEnrichPrompt({ title, description, topicNames, origin, script, jobCategories, yearsRanges: [...ENRICH_YEARS], criteria });
  await setJobProgress(job.id, { phase: `메타 부여 — 판정 (${label})`, detail: `${script ? `대본 ${script.length}자` : "폴백"} · ${cfg.enrichModel}`, toolCounts: {}, turns: 0, elapsedMs: 0 }).catch(() => {});
  const r = await ex.run<Record<string, unknown> & { evidence?: Record<string, string> }>({ prompt, schema: ENRICH_SCHEMA, tools: [], allowedTools: [], cwd: cfg.workRoot, timeoutMs: 10 * 60_000, model: cfg.enrichModel, effort: "medium",
    onProgress: (pr) => setJobProgress(job.id, { ...pr, phase: `메타 부여 — 판정 (${label})` }).catch(() => {}) });
  const { evidence, ...raw } = r.output;
  if (!script) raw.source = "title_description";
  const n = normalizeEnrichment(raw, topicNames, jobCategories);
  const report = { content_id: contentId, episode_id: episodeId, schema_version: ENRICHMENT_SCHEMA_VERSION, script_chars: script?.length ?? 0, fallback: !script, evidence: evidence ?? {}, warnings: n.warnings, errors: n.errors, model: r.model, cost_usd: r.listCostUsd, at: new Date().toISOString() };
  await putFile(reportKey, JSON.stringify(report, null, 1));
  if (!n.file) {
    await insertRun({ backlog_id: backlogId, phase: "enrich", result: `메타 부여 실패 ${label} "${title.slice(0, 30)}" — ${n.errors.join("; ").slice(0, 300)} (enum 밖 값은 산출물을 내지 않는다, 명세 7장)`, prompt_version: `enrich-v1 (schema ${ENRICHMENT_SCHEMA_VERSION})`, artifacts: [s3Key(reportKey)], executed_by: executedBy, model: r.model, cost_usd: r.listCostUsd, tokens: (r.raw as { usage?: unknown } | undefined)?.usage, worker_rev: workerRev() });
    throw new Error(`메타 판정이 값 집합을 벗어남: ${n.errors.join("; ")}`);
  }
  const key = outKey;
  await putFile(key, JSON.stringify(n.file, null, 2) + "\n");
  const summary = `메타 부여 ${label} "${title.slice(0, 30)}" — ${[n.file.difficulty, n.file.format, n.file.is_evergreen == null ? null : n.file.is_evergreen ? "evergreen" : "시의성", n.file.keywords ? `키워드 ${n.file.keywords.length}` : null, n.file.target_audiences ? `청자 ${n.file.target_audiences.length}세트` : null].filter(Boolean).join(" · ")}${n.file.source ? " · 폴백(제목+설명)" : ""}${n.warnings.length ? ` · ${n.warnings.join(" / ").slice(0, 200)}` : ""}${contentId ? " · 반영 대기(콘솔 [반영])" : " · 발행 시 enrichment_file 로 첨부"}`;
  await insertRun({ backlog_id: backlogId, phase: "enrich", result: summary, prompt_version: `enrich-v1 (schema ${ENRICHMENT_SCHEMA_VERSION})`, artifacts: [s3Key(key), s3Key(reportKey)], executed_by: executedBy, model: r.model, cost_usd: r.listCostUsd, tokens: (r.raw as { usage?: unknown } | undefined)?.usage, worker_rev: workerRev() });
  log(`  enrich: ${summary} ($${(r.listCostUsd ?? 0).toFixed(2)})`);
  return { content_id: contentId, episode_id: episodeId, key, file: n.file, warnings: n.warnings, fallback: !script, list_cost_usd: r.listCostUsd };
}

const FALLBACK_CRITERIA = `- difficulty: 청자(2030 주니어 직장인) 전제 지식 기준 — beginner 는 용어를 풀어 설명, intermediate 는 기본 용어 전제, advanced 는 실무 경험 전제. 분량이 가장 많은 설명의 깊이로 본다.
- format: 지배적 서술 형식 하나 — news_analysis(시사 해설) · howto(절차) · interview(소재가 인터뷰) · opinion(주장) · case_study(사례가 뼈대) · overview(개괄·입문, "모르겠으면"의 기본값이 아님).
- is_evergreen: 본론이 원리·방법론이면 true, 특정 시점 수치·제도에 의존하면 false.
- keywords: 대본에 실제로 다뤄진 세부 개념의 명사구 3~8개. 주제명 반복 금지.
- target_audiences: 대본이 전제하는 직무 맥락(직군)과 경험 수준(연차 구간). 범용이면 생략.`;
