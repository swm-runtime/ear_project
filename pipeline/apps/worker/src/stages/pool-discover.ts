import { cfg, executedBy } from "../config.js";
import { domainTierByHost, enqueue, insertDiscoveredDomain, insertRun, majorOfMidTopic, midsOfMajor, poolDomainsForTopics, setJobProgress, type Job } from "../db.js";
import type { Executor } from "../executors/index.js";
import { buildPoolDiscoverPrompt, buildPoolDiscoverPromptEn, pipelineLocale, POOL_DISCOVER_SCHEMA } from "@ear/pipeline";
import { log } from "../util.js";

interface Out { queries: string[]; sources: { url: string; publisher: string; category: string; feed_url: string | null; why: string; coverage: string[] }[]; notes: string }

export const POOL_DISCOVER_MARK = "🔎 소스 풀 채우기";
export const POOL_DISCOVER_VERSION = "pool-discover-v1";

/** 발행 주체가 다른 공유 호스트 — 첫 경로 세그먼트까지가 도메인 단위다 (spec/01 3장: medium.com/daangn) */
const SHARED_HOSTS = new Set(["medium.com", "aws.amazon.com", "blog.naver.com", "post.naver.com", "cafe.naver.com", "brunch.co.kr", "velog.io", "github.com", "sites.google.com", "note.com"]);
/** 발행처가 아닌 곳 — SNS·위키·커뮤니티·상품·검색·개인 블로그 플랫폼·유료 DB. 사람 판정 전에 코드가 거른다(spec/01 4장: AI 는 candidate 생성까지만, 그 전에 명백한 비발행처는 뺀다) */
const EXCLUDED = /(^|\.)(youtube\.com|youtu\.be|facebook\.com|instagram\.com|threads\.net|x\.com|twitter\.com|tiktok\.com|linkedin\.com|reddit\.com|pinterest\.[a-z.]+|wikipedia\.org|wikimedia\.org|namu\.wiki|fandom\.com|quora\.com|dcinside\.com|clien\.net|ruliweb\.com|fmkorea\.com|ppomppu\.co\.kr|theqoo\.net|google\.[a-z.]+|bing\.com|naver\.com|daum\.net|kakao\.com|tistory\.com|blog\.me|researchgate\.net|ssrn\.com|academia\.edu|semanticscholar\.org|scholar\.google\.[a-z.]+|amazon\.[a-z.]+|coupang\.com|gmarket\.co\.kr|11st\.co\.kr|apple\.com|play\.google\.com|spotify\.com|substack\.com)$/i;
/** 플랫폼이지만 경로가 발행처를 가르는 곳은 남긴다 — blog.naver.com/<id> 류는 개인 블로그라 뺀다 */
const EXCLUDED_SHARED = new Set(["blog.naver.com", "post.naver.com", "cafe.naver.com", "brunch.co.kr", "velog.io", "github.com", "sites.google.com", "note.com"]);

/** URL → 풀의 도메인 키 (spec/01 3장: 호스트, www. 제거, 공유 호스트는 첫 경로 세그먼트까지). 발행처가 아닌 곳이면 null */
export function domainKeyOf(url: string): string | null {
  let u: URL; try { u = new URL(url); } catch { return null; }
  if (!/^https?:$/.test(u.protocol)) return null;
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  if (!host.includes(".")) return null;
  const seg = u.pathname.split("/").filter(Boolean)[0];
  if (SHARED_HOSTS.has(host)) { if (EXCLUDED_SHARED.has(host)) return null; return seg ? `${host}/${seg}` : null; }
  if (EXCLUDED.test(host)) return null;
  return host;
}

/**
 * 소스 풀 채우기 — 스윕 모드 P (2026-10-21, 팀원 요청: "사람이 세션에 시켜 찾아오던 소스 풀을 콘솔에서"). payload: { mode: "P", mid_topic, hint?, max_searches? }
 *
 * 주제 기획(B-②)과 같은 검색 실행기(WebSearch 만, 본문 안 읽음)로 **발행처**를 찾는다. 결과는 호스트 단위로 정규화해 이미 풀에 있는 곳(어느 계층이든)·비발행처 플랫폼을 빼고
 * `candidate` 행으로만 만든다(category·feed_url·topic_coverage·note). 새 행에는 domain_check(확인 ①~④)를 바로 건다. 계층 판정은 사람만(spec/01 4장) — 이 단계는 tier 를 건드리지 않는다.
 */
export async function runPoolDiscover(job: Job, ex: Executor) {
  const midTopic = String(job.payload.mid_topic ?? "").trim();
  const hint = job.payload.hint ? String(job.payload.hint).trim() : null;
  if (!midTopic) throw new Error("payload.mid_topic 필요");
  const major = await majorOfMidTopic(midTopic);
  if (!major) throw new Error(`중분류 '${midTopic}' 를 topics 에서 찾지 못했다`);
  const maxSearches = Number(job.payload.max_searches ?? 8);
  const mids = await midsOfMajor(major); const midSet = new Set(mids.length ? mids : [midTopic]);
  const tiers = await domainTierByHost();
  const existingForTopic = (await poolDomainsForTopics(mids.length ? mids : [midTopic])).map((d) => d.domain);
  await setJobProgress(job.id, { phase: `소스 풀 채우기 — 검색 (${midTopic})`, detail: hint ?? "", toolCounts: {}, turns: 0, elapsedMs: 0 }).catch(() => {});
  log(`  pool-discover "${midTopic}" (${major}) — 검색 시작 · 풀 ${existingForTopic.length}곳`);
  const en = pipelineLocale() === "en";
  const input = { midTopic, hint, mids: [...midSet], existingHosts: existingForTopic, maxSearches };
  const r = await ex.run<Out>({
    prompt: en ? buildPoolDiscoverPromptEn(input) : buildPoolDiscoverPrompt(input), schema: POOL_DISCOVER_SCHEMA,
    allowedTools: ["WebSearch"], cwd: cfg.workRoot, timeoutMs: 20 * 60_000, model: cfg.clusterModel, effort: "medium",
    onProgress: (pr) => setJobProgress(job.id, { ...pr, phase: `소스 풀 채우기 — 검색 (${midTopic})`, detail: pr.toolCounts?.WebSearch ? `검색 ${pr.toolCounts.WebSearch}회` : pr.detail }).catch(() => {}),
  });
  const found = r.output.sources ?? [];
  const added: { domain: string; publisher: string; category: string }[] = []; const existing: string[] = []; const dropped: string[] = []; const ids: string[] = [];
  const seen = new Set<string>(); const today = new Date().toISOString().slice(0, 10);
  for (const s of found) {
    const key = domainKeyOf(s.url);
    if (!key) { dropped.push(s.url); continue; }
    if (seen.has(key)) continue; seen.add(key);
    if (tiers.has(key) || tiers.has(key.split("/")[0])) { existing.push(`${key}(${tiers.get(key) ?? tiers.get(key.split("/")[0])})`); continue; }
    const coverage = (s.coverage ?? []).filter((c) => midSet.has(c)); if (!coverage.includes(midTopic)) coverage.unshift(midTopic);
    const feed = s.feed_url && /^https?:\/\//.test(s.feed_url) ? s.feed_url : null;
    const note = `${POOL_DISCOVER_MARK} (${today}, 중분류 ${midTopic}${hint ? `, 메모 "${hint.slice(0, 60)}"` : ""}): ${s.why.slice(0, 300)} · 대표 페이지 ${s.url}`;
    const id = await insertDiscoveredDomain({ domain: key, publisher: s.publisher.trim() || key, category: s.category.trim() || "미분류", feed_url: feed, topic_coverage: coverage, note });
    if (id) { ids.push(id); added.push({ domain: key, publisher: s.publisher, category: s.category }); } else existing.push(`${key}(기존)`);
  }
  let checkJobId: string | null = null;
  if (ids.length) checkJobId = await enqueue({ type: "domain_check", requires_ai: false, payload: { domain_ids: ids, only_unchecked: false }, parent_job_id: job.id }); // 확인 ①~④ 자동 수집 — 판정은 사람
  const queries = r.output.queries ?? [];
  const summary = `모드 P 소스 풀 채우기 · ${midTopic} · 검색 ${queries.length}회 · 새 후보 ${added.length}건${added.length ? ` (${added.map((a) => a.domain).join(", ").slice(0, 300)})` : ""} · 이미 풀에 ${existing.length}건 · 제외 ${dropped.length}건${r.output.notes ? ` · 메모: ${r.output.notes.slice(0, 200)}` : ""}`;
  await insertRun({ backlog_id: null, phase: "sweep", result: summary, prompt_version: POOL_DISCOVER_VERSION, executed_by: executedBy, model: r.model ?? null, cost_usd: r.listCostUsd ?? null, tokens: (r.raw as { usage?: unknown } | undefined)?.usage });
  log(`  pool-discover 끝 — ${summary.slice(0, 200)}`);
  return { summary, mode: "P", mid_topic: midTopic, added, existing, dropped, queries, notes: r.output.notes ?? "", domain_check_job: checkJobId, model: r.model, costUsd: r.listCostUsd ?? 0 };
}
