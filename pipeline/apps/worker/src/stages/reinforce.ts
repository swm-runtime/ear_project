import fs from "node:fs/promises";
import { cfg, executedBy } from "../config.js";
import { blockedTierHosts, domainTierByHost, existingBacklogTitles, findDomainForUrl, getBacklogFull, insertCandidateDomain, insertRun, majorOfMidTopic, midsOfMajor, poolDomainsForTopics, recentSourcesForTopics, setBacklogStatus, setJobProgress, upsertSource, type Job } from "../db.js";
import type { Executor } from "../executors/index.js";
import { assetPaths, buildClusterPromptV2, buildReinforceSearchPrompt, CLUSTER_SCHEMA_V2, REINFORCE_SEARCH_SCHEMA, SOURCE_ROLES, todayKst } from "@ear/pipeline";
import { hostOf, log } from "../util.js";
import { prepareAssets, workerRev } from "../assets.js";
import { putFile, s3Key } from "../storage.js";

interface SearchOut { queries: string[]; sources: { url: string; title: string; publisher: string; published: string | null; summary: string; roles: string[]; why: string; in_pool: boolean }[]; notes: string }
interface JudgeOut { candidates: { id: string; mid_topic: string; title: string; axis_type: string; axis: string; axis_note: string; verdict: "성립" | "보강 필요"; gaps: string[]; sources: { m: string; roles: string[]; why: string }[]; target_fit: string; landing: string; dedup_note: string }[] }

/**
 * 보강 스윕 — 모드 B-① (spec/02 6장, 0019, 2026-09-10). payload: { mode: "B", backlog_id }
 *
 * held 후보(축은 서 있는데 역할이 빈 후보)를 위해 파이프라인이 처음으로 풀 밖으로 나간다:
 *   1. 검색 — 축·빈 역할로 검색어를 만들어 WebSearch(도구는 이것뿐, 본문 안 읽음). 풀 도메인을 site: 로 우선.
 *   2. 적재 — 풀 안 도메인의 결과만 sources(origin='search') 에 넣는다. 풀 밖 도메인은 후보 행만 만든다(spec/02 7장).
 *   3. 재판정 — 군집화 v2 를 이 후보 하나에 대해(축 고정) 돌려 역할표를 다시 짠다. 채워지면 proposed, 아니면 held 에 남긴다.
 * 후보당 1회(reinforced_at). "보강해도 미달이면 폐기"는 자동 반려하지 않고 사람 판단으로 남긴다.
 */
export async function runReinforce(job: Job, ex: Executor) {
  const backlogId = String(job.payload.backlog_id ?? "");
  if (!backlogId) throw new Error("payload.backlog_id 필요");
  const cand = await getBacklogFull(backlogId);
  if (!cand) throw new Error(`후보 ${backlogId} 없음`);
  if (!["held", "proposed"].includes(cand.status)) throw new Error(`후보 ${backlogId} 는 ${cand.status} — held/proposed 만 보강한다`);
  if (cand.reinforced_at && !job.payload.force) throw new Error(`후보 ${backlogId} 는 이미 보강했다 (${String(cand.reinforced_at).slice(0, 10)}) — 상한 1회`);
  const major = await majorOfMidTopic(cand.mid_topic);
  const mids = major ? await midsOfMajor(major) : [cand.mid_topic];
  const poolDomains = await poolDomainsForTopics(mids);
  const gaps = (cand.gaps ?? []).filter((g) => (SOURCE_ROLES as string[]).includes(g));

  // ── 1. 검색
  await setJobProgress(job.id, { phase: `보강 1/2 — 검색 (${cand.id}, 빈 역할 ${gaps.join("·") || "다양성"})`, detail: `풀 도메인 ${poolDomains.length}곳`, toolCounts: {}, turns: 0, elapsedMs: 0 }).catch(() => {});
  const maxSearches = Number(job.payload.max_searches ?? 8);
  const searchPrompt = buildReinforceSearchPrompt({ candidate: { id: cand.id, title: cand.title, mid_topic: cand.mid_topic, axis: cand.axis ?? null, axis_type: cand.axis_type ?? null, gaps, sources: cand.sources.map((s) => ({ publisher: s.publisher, title: s.title })) }, poolHosts: poolDomains.map((d) => d.domain).slice(0, 80), maxSearches });
  const r1 = await ex.run<SearchOut>({
    prompt: searchPrompt, schema: REINFORCE_SEARCH_SCHEMA, allowedTools: ["WebSearch"], cwd: cfg.workRoot, timeoutMs: 20 * 60_000, model: cfg.clusterModel, effort: "medium",
    onProgress: (pr) => setJobProgress(job.id, { ...pr, phase: `보강 1/2 — 검색 (${cand.id})`, detail: pr.toolCounts?.WebSearch ? `검색 ${pr.toolCounts.WebSearch}회` : pr.detail }).catch(() => {}),
  });
  const found = r1.output.sources ?? [];
  const sweptAt = new Date().toISOString();
  const added: string[] = []; const outside: string[] = []; const dup: string[] = [];
  const existingUrls = new Set(cand.sources.map((s) => s.url));
  for (const s of found) {
    if (!/^https?:\/\//.test(s.url) || existingUrls.has(s.url)) { dup.push(s.url); continue; }
    const d = await findDomainForUrl(s.url);
    if (d && d.tier !== "blocked" && !d.fetch_blocked_at) {
      await upsertSource({ domain_id: d.id, url: s.url, title: s.title, summary: s.summary, author: "", published: s.published, swept_at: sweptAt, origin: "search" });
      added.push(s.url);
    } else if (!d) {
      const host = hostOf(s.url).replace(/^www\./, "");
      if (host && (await insertCandidateDomain({ domain: host, publisher: s.publisher || host, topic_coverage: [cand.mid_topic], note: `보강 검색 발견 ${todayKst()} (${cand.id} "${cand.title.slice(0, 40)}"): ${s.url} — 피드 없음, 판정 후 다음 보강에서 쓸 수 있다` }))) outside.push(host);
      else outside.push(host + " (이미 후보)");
    } else outside.push(`${d.domain} (${d.tier === "blocked" ? "차단" : "접근 차단"})`);
  }
  log(`  reinforce ${cand.id}: 검색 ${r1.output.queries?.length ?? 0}회 → 결과 ${found.length}건 · 풀 안 적재 ${added.length} · 풀 밖 ${outside.length} · 중복 ${dup.length}`);

  // ── 2. 재판정 (군집화 v2, 후보 하나 · 축 고정)
  await setJobProgress(job.id, { phase: `보강 2/2 — 재판정 (${cand.id}, 새 소스 ${added.length}건)`, detail: "", toolCounts: {}, turns: 0, elapsedMs: 0 }).catch(() => {});
  const { assetRoot, bundle } = await prepareAssets(null);
  const specBacklog = await fs.readFile(assetPaths(assetRoot, cfg.workRoot).specBacklog, "utf8");
  const excerpt = ["## 3. 후보의 구성", "## 6. 게이트 1"].map((h) => { const a = specBacklog.indexOf(h); if (a < 0) return ""; const b = specBacklog.indexOf("\n## ", a + 3); return specBacklog.slice(a, b < 0 ? undefined : b); }).join("\n");
  // 소스 목록 = 현재 후보 소스 + 새 검색 소스 (+ 같은 중분류의 최근 소스 소량 — 검색이 빈 손이어도 풀에 이미 있던 소스로 채울 수 있게)
  const recent = await recentSourcesForTopics([cand.mid_topic], 60, 60);
  const meta: { n: number; url: string; title: string; summary: string | null; publisher: string; domain: string; published: string | null }[] = [];
  const seen = new Set<string>();
  const push = (s: { url: string; title: string; summary: string | null; publisher: string; domain: string; published: string | null }) => { if (seen.has(s.url)) return; seen.add(s.url); meta.push({ n: meta.length + 1, ...s }); };
  const blockedHosts = await blockedTierHosts();
  const isBlockedTier = (url: string) => { try { const u = new URL(url); const h = u.hostname.replace(/^www\./, ""); const seg = u.pathname.split("/").filter(Boolean)[0]; return blockedHosts.has(h) || (!!seg && blockedHosts.has(`${h}/${seg}`)); } catch { return false; } };
  const droppedBlocked = cand.sources.filter((s) => isBlockedTier(s.url)).map((s) => hostOf(s.url));
  for (const s of cand.sources) if (!isBlockedTier(s.url)) push({ url: s.url, title: s.title, summary: null, publisher: s.publisher, domain: hostOf(s.url), published: s.published ?? null }); // 차단 도메인 소스는 재판정 목록에서 뺀다 — 보강이 차단 소스를 걷어내는 통로
  const currentM = meta.map((m) => `M${m.n}`);
  for (const s of found) if (added.includes(s.url)) push({ url: s.url, title: s.title, summary: s.summary, publisher: s.publisher, domain: hostOf(s.url), published: s.published });
  for (const s of recent) push({ url: s.url, title: s.title, summary: s.summary, publisher: s.publisher, domain: s.domain, published: s.published });
  const judgePrompt = buildClusterPromptV2({ midTopics: mids, majorTopic: major, nextIdNumber: Number(cand.id.replace(/\D/g, "")) || 0, sources: meta, existingTitles: (await existingBacklogTitles()).filter((t) => !t.startsWith(`${cand.id} `)), specBacklogExcerpt: excerpt,
    reinforce: { id: cand.id, title: cand.title, axis: cand.axis ?? "", axis_type: cand.axis_type ?? "", gaps, currentM } });
  const r2 = await ex.run<JudgeOut>({ prompt: judgePrompt, schema: CLUSTER_SCHEMA_V2, tools: [], allowedTools: [], cwd: cfg.workRoot, timeoutMs: 20 * 60_000, model: cfg.clusterModel, maxThinkingTokens: cfg.thinkingDesign,
    onProgress: (pr) => setJobProgress(job.id, { ...pr, phase: `보강 2/2 — 재판정 (${cand.id})`, detail: pr.turns > 0 ? "역할표 재구성 중" : pr.detail }).catch(() => {}) });
  const c = r2.output.candidates?.[0];
  if (!c) throw new Error("재판정 결과에 후보가 없다");
  const byM = new Map(meta.map((s) => [`M${s.n}`, s]));
  const srcs = c.sources.filter((s) => byM.has(s.m.trim().toUpperCase())).map((s) => ({ ...byM.get(s.m.trim().toUpperCase())!, roles: s.roles, why: s.why }));
  const tiers = await domainTierByHost();
  const pubs = new Map<string, number>(); for (const s of srcs) pubs.set(s.publisher || s.domain, (pubs.get(s.publisher || s.domain) ?? 0) + 1);
  const maxShare = srcs.length ? Math.max(...pubs.values()) / srcs.length : 1;
  const roleSet = new Set(srcs.flatMap((s) => s.roles));
  const problems: string[] = [];
  if (srcs.length < 3) problems.push(`소스 ${srcs.length}건`);
  if (pubs.size < 3) problems.push(`발행처 ${pubs.size}곳`);
  if (maxShare > 0.5) problems.push(`한 발행처 ${Math.round(maxShare * 100)}%`);
  if (!roleSet.has("근거 앵커")) problems.push("근거 앵커 없음");
  if (roleSet.size < 3) problems.push(`역할 ${roleSet.size}종`);
  const newGaps = Array.from(new Set([...c.gaps, ...SOURCE_ROLES.filter((role) => !roleSet.has(role) && (role === "근거 앵커" || role === "사례"))]));
  const ok = c.verdict === "성립" && problems.length === 0;
  const filled = gaps.filter((g) => roleSet.has(g));
  const summary = `보강 1회 ${todayKst()}: 검색 ${r1.output.queries?.length ?? 0}회 · 새 소스 ${added.length}건(풀 밖 ${outside.length})${droppedBlocked.length ? ` · 차단 소스 ${droppedBlocked.length}건 제외` : ""} · 채운 역할 ${filled.join("·") || "없음"}${newGaps.length ? ` · 여전히 빈 역할 ${newGaps.join("·")}` : ""}${problems.length ? ` · ${problems.join(", ")}` : ""} → ${ok ? "성립" : "보류 유지"}`;
  await setBacklogStatus(cand.id, ok ? "proposed" : "held", {
    sources: JSON.stringify(srcs.map((s) => ({ url: s.url, tier: tiers.get(hostOf(s.url)) ?? tiers.get(s.domain) ?? "candidate", title: s.title, backbone: s.roles.includes("근거 앵커"), published: s.published, publisher: s.publisher || s.domain, roles: s.roles, role_why: s.why }))),
    gaps: ok ? [] : newGaps, reinforced_at: sweptAt, reinforce_note: summary,
    dedup_note: `${ok ? "성립" : `보강 필요 (${[...problems, ...(newGaps.length ? ["빈 역할 " + newGaps.join("·")] : [])].join(", ")})`} · 발행처 ${pubs.size}곳 · 최다 ${Math.round(maxShare * 100)}% · 역할 ${roleSet.size}종 · ${c.dedup_note} · ${summary} | ${(cand.dedup_note ?? "").replace(/^⚠️[^|]*\| /, "")}`,
  });
  const artifactKey = `sweeps/reinforce/${todayKst()}-${cand.id}-${job.id.slice(0, 8)}.json`;
  await putFile(artifactKey, JSON.stringify({ job_id: job.id, backlog_id: cand.id, gaps, pool_hosts: poolDomains.length, search: r1.output, added, outside, dup, judge: r2.output, result: summary }, null, 1)).catch((e) => log(`  reinforce 결과 보존 실패 (${String(e?.message ?? e).slice(0, 100)})`));
  const cost = (r1.listCostUsd ?? 0) + (r2.listCostUsd ?? 0);
  await insertRun({ backlog_id: cand.id, phase: "sweep", result: `모드 B-① 보강 · ${cand.id} "${cand.title.slice(0, 40)}" · ${summary}${outside.length ? ` · 풀 밖 도메인 후보 등록: ${[...new Set(outside)].join(", ").slice(0, 300)}` : ""}${r1.output.notes ? ` · 검색 메모: ${r1.output.notes.slice(0, 200)}` : ""}`,
    prompt_version: `reinforce-v1 (검색 ${maxSearches}회 상한 · 재판정 cluster-v2, spec ${bundle.specDigest})`, artifacts: [s3Key(artifactKey)], executed_by: executedBy, model: r2.model ?? r1.model, cost_usd: cost, tokens: { search: (r1.raw as { usage?: unknown } | undefined)?.usage, judge: (r2.raw as { usage?: unknown } | undefined)?.usage }, worker_rev: workerRev() });
  log(`  reinforce ${cand.id}: ${summary} ($${cost.toFixed(2)})`);
  return { backlog_id: cand.id, status: ok ? "proposed" : "held", added: added.length, outside, filled, gaps: ok ? [] : newGaps, list_cost_usd: cost };
}

