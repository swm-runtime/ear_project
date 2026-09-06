import pg from "pg";
import { log } from "./util.js";
import { cfg } from "./config.js";
import type { BacklogCandidate, SourceRef } from "@ear/pipeline";

export const pool = new pg.Pool({ connectionString: cfg.databaseUrl, max: 3, idleTimeoutMillis: 10_000, keepAlive: true });
// Supabase 풀러가 유휴 연결을 끊으면 풀이 'error' 를 낸다 — 받지 않으면 EventEmitter 규칙상 프로세스가 죽는다 (2026-08-31 워커 사망 원인 후보)
pool.on("error", (e) => console.error(`[pg pool] 연결 오류 (무시하고 재연결): ${e.message}`));

export type JobType = "sweep" | "cluster" | "draft" | "qa" | "critic" | "tts" | "package" | "domain_check";
export interface Job {
  id: string;
  type: JobType;
  requires_ai: boolean;
  payload: Record<string, any>;
  status: string;
  attempt: number;
  parent_job_id: string | null;
  created_at: string;
}

export async function claimJob(worker: string, canAi: boolean, canTts: boolean): Promise<Job | null> {
  const r = await pool.query("select * from public.claim_job($1, $2, $3)", [worker, canAi, canTts]);
  return (r.rows[0] as Job) ?? null;
}
export async function heartbeat(jobId: string) {
  await pool.query("update public.jobs set heartbeat_at = now() where id = $1", [jobId]);
}
export async function startJob(jobId: string) {
  await pool.query("update public.jobs set status = 'running', started_at = now(), heartbeat_at = now() where id = $1", [jobId]);
}
export async function finishJob(jobId: string, result: unknown) {
  await pool.query("update public.jobs set status = 'done', finished_at = now(), result = $2 where id = $1", [jobId, JSON.stringify(result ?? null)]);
}
export async function failJob(jobId: string, error: string) {
  await pool.query("update public.jobs set status = 'failed', finished_at = now(), error = $2 where id = $1", [jobId, error.slice(0, 4000)]);
}
const lastProgressLog = new Map<string, number>();
/** 진행 상황을 jobs.progress에 기록 (웹 UI가 읽음) + 터미널에도 30초에 한 번 한 줄 (2026-09-01: 웹을 안 띄워도 보이게). */
export async function setJobProgress(jobId: string, progress: unknown) {
  await pool.query("update public.jobs set progress = $2::jsonb, heartbeat_at = now() where id = $1", [jobId, JSON.stringify(progress)]);
  const now = Date.now();
  if (now - (lastProgressLog.get(jobId) ?? 0) < 30_000) return;
  lastProgressLog.set(jobId, now);
  const p = (progress ?? {}) as { phase?: string; detail?: string; lastTool?: string; turns?: number; elapsedMs?: number; rateLimit?: { fiveHour?: number } };
  const min = Math.round((p.elapsedMs ?? 0) / 60_000);
  const rl = p.rateLimit?.fiveHour != null ? ` · 구독 5h ${Math.round(p.rateLimit.fiveHour * 100)}%` : "";
  log(`  … ${jobId.slice(0, 8)} ${p.phase ?? ""} — ${p.detail ?? p.lastTool ?? ""} (${p.turns ?? 0}턴, ${min}분${rl})`);
}
export async function updateJobPayload(jobId: string, patch: Record<string, unknown>) {
  await pool.query("update public.jobs set payload = payload || $2::jsonb where id = $1", [jobId, JSON.stringify(patch)]);
}
export async function requeueJob(jobId: string) {
  await pool.query("update public.jobs set status = 'queued', claimed_by = null, claimed_at = null, heartbeat_at = null where id = $1 and status in ('claimed','running')", [jobId]);
}
export async function enqueue(j: { type: JobType; requires_ai: boolean; payload: Record<string, unknown>; parent_job_id?: string | null; attempt?: number; requested_by?: string | null }): Promise<string> {
  const r = await pool.query(
    "insert into public.jobs (type, requires_ai, payload, parent_job_id, attempt, requested_by) values ($1,$2,$3,$4,$5,$6) returning id",
    [j.type, j.requires_ai, JSON.stringify(j.payload), j.parent_job_id ?? null, j.attempt ?? 1, j.requested_by ?? null],
  );
  return r.rows[0].id as string;
}

export async function insertRun(r: { backlog_id?: string | null; phase: string; attempt?: number; result: string; prompt_version: string; artifacts?: string[]; executed_by: string; model?: string | null; cost_usd?: number | null; tokens?: unknown; worker_rev?: string | null }) {
  // cost_usd·tokens·worker_rev (0009): API 전환 비용 원료 + spec 체크아웃 추적 (spec/08 3.1)
  await pool.query(
    "insert into public.runs (backlog_id, phase, attempt, result, prompt_version, artifacts, executed_by, model, cost_usd, tokens, worker_rev) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
    [r.backlog_id ?? null, r.phase, r.attempt ?? 1, r.result, r.prompt_version, r.artifacts ?? [], r.executed_by, r.model ?? null, r.cost_usd ?? null, r.tokens == null ? null : JSON.stringify(r.tokens), r.worker_rev ?? null],
  );
}

export async function getSetting<T = any>(key: string): Promise<T | null> {
  const r = await pool.query("select value from public.settings where key = $1", [key]);
  return (r.rows[0]?.value as T) ?? null;
}
export async function majorOfMidTopic(mid: string): Promise<string | null> {
  const r = await pool.query("select major from public.topics where mid = $1", [mid]);
  return r.rows[0]?.major ?? null;
}
export async function getBacklog(id: string): Promise<BacklogCandidate | null> {
  const r = await pool.query("select id, mid_topic, title, target_fit, angle, sources from public.backlog where id = $1", [id]);
  if (!r.rows[0]) return null;
  const row = r.rows[0];
  return { id: row.id, mid_topic: row.mid_topic, title: row.title, target_fit: row.target_fit, angle: row.angle, sources: (row.sources ?? []) as SourceRef[] };
}
export async function setBacklogStatus(id: string, status: string, extra: Record<string, unknown> = {}) {
  const sets = ["status = $2", "updated_at = now()"];
  const vals: unknown[] = [id, status];
  for (const [k, v] of Object.entries(extra)) {
    vals.push(v);
    sets.push(`${k} = $${vals.length}`);
  }
  await pool.query(`update public.backlog set ${sets.join(", ")} where id = $1`, vals);
}
/** 승인 후보 선점 — UPDATE 가 원자적이라 워커 여러 대가 같은 후보를 동시에 집어 draft 를 두 번 만들지 못한다 (spec/10 M-R) */
export async function claimApprovedBacklog(id: string, worker: string): Promise<boolean> {
  const r = await pool.query("update public.backlog set status = 'claimed', claimed_by = $2, claimed_at = now(), updated_at = now() where id = $1 and status = 'approved' returning id", [id, worker]);
  return (r.rowCount ?? 0) > 0;
}
/** 승인됐지만 아직 집기(claimed) 전인 후보 — 워커가 draft 작업을 만들고 claimed 로 전환 */
export async function listApprovedBacklog(): Promise<string[]> {
  const r = await pool.query("select id from public.backlog where status = 'approved' order by approved_at nulls last, id");
  return r.rows.map((x) => x.id as string);
}
export async function nextBacklogNumber(): Promise<number> {
  const r = await pool.query("select coalesce(max(substring(id from 2)::int), 0) + 1 as n from public.backlog where id ~ '^C[0-9]+$'");
  return Number(r.rows[0].n);
}
export async function insertBacklog(c: { id: string; mid_topic: string; title: string; summary: string; target_fit: string; angle: string; sources: unknown[]; dedup_note: string }) {
  await pool.query(
    "insert into public.backlog (id, mid_topic, title, summary, target_fit, angle, sources, status, dedup_note) values ($1,$2,$3,$4,$5,$6,$7,'proposed',$8) on conflict (id) do nothing",
    [c.id, c.mid_topic, c.title, c.summary, c.target_fit, c.angle, JSON.stringify(c.sources), c.dedup_note],
  );
}
/** 중복 대조는 전 중분류 대상 — 축이 겹치는 후보가 다른 중분류로 들어오는 것을 막는다 (C32↔C26 사례, 2026-08-29) */
export async function existingBacklogTitles(): Promise<string[]> {
  const r = await pool.query("select id || ' [' || mid_topic || '] ' || title as t from public.backlog where status not in ('rejected','expired') order by id");
  return r.rows.map((x) => x.t as string);
}

export async function nextEpisodeId(datePrefix: string): Promise<string> {
  const r = await pool.query("select coalesce(max(substring(id from 9)::int), 0) + 1 as n from public.episodes where id like $1", [`${datePrefix}-%`]);
  return `${datePrefix}-${String(r.rows[0].n).padStart(3, "0")}`;
}
export async function upsertEpisode(e: { id: string; backlog_id: string; prompt_version: string; asset_versions?: Record<string, string> } & Partial<Record<"script_key" | "claims_key" | "sources_key" | "qa_report_key" | "critic_report_key" | "audio_master_key" | "audio_dist_key", string>>) {
  const { id, backlog_id, prompt_version, ...keys } = e;
  const cols = Object.keys(keys);
  const vals = Object.values(keys).map((v) => (v != null && typeof v === "object" ? JSON.stringify(v) : v));
  await pool.query(
    `insert into public.episodes (id, backlog_id, prompt_version${cols.map((c) => `, ${c}`).join("")}) values ($1,$2,$3${cols.map((_, i) => `, $${i + 4}`).join("")})
     on conflict (id) do update set updated_at = now()${cols.map((c) => `, ${c} = excluded.${c}`).join("")}`,
    [id, backlog_id, prompt_version, ...vals],
  );
}
export async function getEpisode(id: string): Promise<{ id: string; backlog_id: string; prompt_version: string; script_key: string | null; asset_versions: Record<string, string> | null } | null> {
  const r = await pool.query("select id, backlog_id, prompt_version, script_key, asset_versions from public.episodes where id = $1", [id]);
  return r.rows[0] ?? null;
}

export interface SweepDomain { id: string; domain: string; publisher: string; feed_url: string; tier: string }
export async function sweepDomains(midTopic: string, includeCandidates: boolean): Promise<SweepDomain[]> {
  const tiers = includeCandidates ? ["allow_open", "allow_support", "candidate"] : ["allow_open", "allow_support"];
  const r = await pool.query(
    "select id, domain, publisher, feed_url, tier from public.domains where $1 = any(topic_coverage) and tier = any($2) and coalesce(feed_url,'') <> '' order by domain",
    [midTopic, tiers],
  );
  return r.rows as SweepDomain[];
}
export interface CheckDomain { id: string; domain: string; publisher: string; feed_url: string | null; note: string | null; evidence: unknown }
/** 계층 확인(domain_check) 대상 — ids 지정 시 그것만, 아니면 후보 전부(onlyUnchecked면 evidence 없는 곳만) */
export async function listDomainsForCheck(ids: string[] | null, onlyUnchecked: boolean): Promise<CheckDomain[]> {
  const r = ids && ids.length
    ? await pool.query("select id, domain, publisher, feed_url, note, evidence from public.domains where id = any($1::uuid[]) order by domain", [ids])
    : await pool.query(`select id, domain, publisher, feed_url, note, evidence from public.domains where tier = 'candidate' ${onlyUnchecked ? "and evidence is null" : ""} order by domain`);
  return r.rows;
}
export async function saveDomainEvidence(domainId: string, evidence: unknown) {
  await pool.query("update public.domains set evidence = $2::jsonb where id = $1", [domainId, JSON.stringify(evidence)]);
}
/** 접근 확인용 표본 — 그 도메인에서 가장 최근 스윕된 기사 URL */
export async function latestSourceUrl(domainId: string): Promise<string | null> {
  const r = await pool.query("select url from public.sources where domain_id = $1 order by swept_at desc nulls last limit 1", [domainId]);
  return r.rows[0]?.url ?? null;
}
export async function appendDomainNote(domainId: string, note: string) {
  await pool.query("update public.domains set note = coalesce(nullif(note,''),'') || ' | ' || $2 where id = $1", [domainId, note]);
}
export async function upsertSource(s: { domain_id: string; url: string; title: string; summary: string; author: string; published: string | null; swept_at: string }) {
  await pool.query(
    `insert into public.sources (domain_id, url, title, summary, author, published, swept_at) values ($1,$2,$3,$4,$5,$6,$7)
     on conflict (url) do update set title = excluded.title, summary = excluded.summary, swept_at = excluded.swept_at`,
    [s.domain_id, s.url, s.title, s.summary, s.author, s.published, s.swept_at],
  );
}
export async function recentSourcesForTopic(midTopic: string, days: number, limit: number) {
  const r = await pool.query(
    `select s.url, s.title, s.summary, d.publisher, d.domain, to_char(s.published, 'YYYY-MM-DD') as published
       from public.sources s join public.domains d on d.id = s.domain_id
      where $1 = any(d.topic_coverage) and s.swept_at >= now() - ($2 || ' days')::interval
      order by s.published desc nulls last limit $3`,
    [midTopic, String(days), limit],
  );
  return r.rows as { url: string; title: string; summary: string | null; publisher: string; domain: string; published: string | null }[];
}
export async function domainTierByHost(): Promise<Map<string, string>> {
  const r = await pool.query("select domain, tier from public.domains");
  return new Map(r.rows.map((x) => [x.domain as string, x.tier as string]));
}
