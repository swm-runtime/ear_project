import fs from "node:fs/promises";
import { cfg, executedBy } from "../config.js";
import { blockedTierHosts, domainTierByHost, existingBacklogTitles, findDomainForUrl, getBacklogFull, insertCandidateDomain, insertRun, majorOfMidTopic, midsOfMajor, poolDomainsForTopics, recentSourcesForTopics, setBacklogStatus, setJobProgress, upsertSource, type Job, tierOfUrl, countReinforceRuns, recordFetchStatus } from "../db.js";
import type { Executor } from "../executors/index.js";
import { assetPaths, globalGaps, KOREAN_SOURCE_MIN_EN, GLOBAL_ROLES, buildClusterPromptV2, buildReinforceSearchPrompt, buildReinforceSearchPromptEn, buildTopicJudgePromptEn, CLUSTER_SCHEMA_V2, CLUSTER_SCHEMA_V2_EN, judgeToInternal, pipelineLocale, REINFORCE_SEARCH_SCHEMA, REINFORCE_SEARCH_SCHEMA_EN, SOURCE_ROLES, todayKst } from "@ear/pipeline";
import { hostOf, log } from "../util.js";
import { fetchArticle, fetchStatusOf, robotsAllows } from "../sources/fetch.js";
import { rememberRobotsBlocked } from "../sources/robots-memory.js";
import { prepareAssets, workerRev } from "../assets.js";
import { putFile, s3Key } from "../storage.js";
import { checkCandidateSources } from "./candidate-check.js";

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
  // 상한: 한국판 1회(reinforced_at, 종전 그대로) · 글로벌판 2회(2026-10-23 — 첫 배치 반려 9개 중 7개가 1회 뒤 빈 역할·국문 소스 미달. 두 번째는 사례·국문 소스에 집중한다)
  const REINFORCE_MAX = pipelineLocale() === "en" ? 2 : 1;
  const prior = pipelineLocale() === "en" ? await countReinforceRuns(backlogId) : (cand.reinforced_at ? 1 : 0);
  if (prior >= REINFORCE_MAX && !job.payload.force) throw new Error(`후보 ${backlogId} 는 이미 ${prior}회 보강했다${cand.reinforced_at ? ` (${String(cand.reinforced_at).slice(0, 10)})` : ""} — 상한 ${REINFORCE_MAX}회`);
  const major = await majorOfMidTopic(cand.mid_topic);
  const mids = major ? await midsOfMajor(major) : [cand.mid_topic];
  const poolDomains = await poolDomainsForTopics(mids);
  const enRoles = pipelineLocale() === "en"; // 글로벌판 역할(생활 관행 포함)·선택 역할은 빈 역할이 아니다 (2026-10-17 소개형 전환)
  const gaps = enRoles ? globalGaps((cand.gaps ?? []).filter((g) => GLOBAL_ROLES.includes(g))) : (cand.gaps ?? []).filter((g) => (SOURCE_ROLES as string[]).includes(g));

  // ── 1. 검색
  await setJobProgress(job.id, { phase: `보강 1/2 — 검색 (${cand.id}, ${gaps.length ? `빈 역할 ${gaps.join("·")}` : "발행처 다양화"})`, detail: `풀 도메인 ${poolDomains.length}곳`, toolCounts: {}, turns: 0, elapsedMs: 0 }).catch(() => {});
  const maxSearches = Number(job.payload.max_searches ?? 8);
  const en = pipelineLocale() === "en"; // 글로벌판: 영어 검색·재판정 프롬프트, 판정 결과는 내부 값으로 바꿔 저장 (global-prompts.ts)
  const searchPrompt = (en ? buildReinforceSearchPromptEn : buildReinforceSearchPrompt)({ candidate: { id: cand.id, title: cand.title, mid_topic: cand.mid_topic, axis: cand.axis ?? null, axis_type: cand.axis_type ?? null, gaps, sources: cand.sources.map((s) => ({ publisher: s.publisher, title: s.title })) }, poolHosts: poolDomains.map((d) => d.domain).slice(0, 80), maxSearches });
  const r1 = await ex.run<SearchOut>({
    prompt: searchPrompt, schema: en ? REINFORCE_SEARCH_SCHEMA_EN : REINFORCE_SEARCH_SCHEMA, allowedTools: ["WebSearch"], cwd: cfg.workRoot, timeoutMs: 20 * 60_000, model: cfg.clusterModel, effort: "medium",
    onProgress: (pr) => setJobProgress(job.id, { ...pr, phase: `보강 1/2 — 검색 (${cand.id})`, detail: pr.toolCounts?.WebSearch ? `검색 ${pr.toolCounts.WebSearch}회` : pr.detail }).catch(() => {}),
  });
  const found = r1.output.sources ?? [];
  const sweptAt = new Date().toISOString();
  const added: string[] = []; const outside: string[] = []; const dup: string[] = []; const newDomains: string[] = [];
  const existingUrls = new Set(cand.sources.map((s) => s.url));
  // 글로벌판: 본문 접근 가능성 선검사 (2026-10-23) — 검색 결과를 세기 전에 실제로 열리는지 본다. 403·500·빈 본문은 적재는 하되(fetch_status 기록 → 군집화 제외) 역할표에는 넣지 않는다.
  // 첫 배치에서 소스 10건을 모아 놓고 설계 단계에서 2건만 열려 자동 반려된 편이 2개였다. 403 은 우회하지 않는다 — 세지 않을 뿐이다
  const bodyOk = en ? new Map(await Promise.all(found.map(async (s) => [s.url, await fetchArticle(0, s.url).catch(() => null)] as const))) : null;
  for (const s of found) {
    if (!/^https?:\/\//.test(s.url) || existingUrls.has(s.url)) { dup.push(s.url); continue; }
    let d = await findDomainForUrl(s.url);
    // 글로벌판(사후 판정, 글로벌 명세 6.2): 풀 밖 결과도 판정 대기 도메인으로 등록하고 소스로 바로 쓴다 — 주제 기획과 같은 정책.
    // 판정된 풀이 비어 있으면 한국판 규칙(등록된 도메인만)으로는 보강이 소스를 더하지 못한다(2026-10-15 C1). 보류 도메인·robots 불허는 뺀다
    if (en && d?.tier === "hold") { outside.push(`${d.domain} (보류)`); continue; }
    if (en && !d) {
      let u: URL | null = null; try { u = new URL(s.url); } catch { u = null; }
      if (!u) { outside.push(`${hostOf(s.url)} (URL 오류)`); continue; }
      if (!(await robotsAllows(u).catch(() => true))) {
        outside.push(`${hostOf(s.url)} (robots)`);
        await rememberRobotsBlocked(u, s, cand.mid_topic, `보강 검색 발견 ${todayKst()} (${cand.id})`, sweptAt).catch(() => {}); // 다음 검색에서 빼게 기억 (robots-memory.ts)
        continue;
      }
      const host = u.hostname.replace(/^www\./, "");
      await insertCandidateDomain({ domain: host, publisher: s.publisher || host, topic_coverage: [cand.mid_topic], note: `보강 검색 발견 ${todayKst()} (${cand.id} "${cand.title.slice(0, 40)}"): ${s.url} — 글로벌판은 소스를 바로 적재(사후 판정). 판정 대기` });
      d = await findDomainForUrl(s.url);
      if (d) newDomains.push(host);
    }
    if (d && d.tier !== "blocked" && !d.fetch_blocked_at) {
      await upsertSource({ domain_id: d.id, url: s.url, title: s.title, summary: s.summary, author: "", published: s.published, swept_at: sweptAt, origin: "search" });
      const f = bodyOk?.get(s.url);
      if (bodyOk && (!f || !f.ok)) { await recordFetchStatus(s.url, f ? fetchStatusOf(f) : "network").catch(() => {}); outside.push(`${hostOf(s.url)} (본문 ${f ? f.status : "network"})`); continue; }
      added.push(s.url);
    } else if (!d) {
      const host = hostOf(s.url).replace(/^www\./, "");
      if (host && (await insertCandidateDomain({ domain: host, publisher: s.publisher || host, topic_coverage: [cand.mid_topic], note: `보강 검색 발견 ${todayKst()} (${cand.id} "${cand.title.slice(0, 40)}"): ${s.url} — 피드 없음, 판정 후 다음 보강에서 쓸 수 있다` }))) outside.push(host);
      else outside.push(host + " (이미 후보)");
    } else outside.push(`${d.domain} (${d.tier === "blocked" ? "차단" : "접근 차단"})`);
  }
  log(`  reinforce ${cand.id}: 검색 ${r1.output.queries?.length ?? 0}회 → 결과 ${found.length}건 · 풀 안 적재 ${added.length} · 풀 밖 ${outside.length} · 중복 ${dup.length}${newDomains.length ? ` · 새 판정 대기 도메인 ${newDomains.length}(소스 적재)` : ""}`);

  // ── 2. 재판정 (군집화 v2, 후보 하나 · 축 고정)
  await setJobProgress(job.id, { phase: `보강 2/2 — 재판정 (${cand.id}, 새 소스 ${added.length}건)`, detail: "", toolCounts: {}, turns: 0, elapsedMs: 0 }).catch(() => {});
  const { assetRoot, bundle } = await prepareAssets(null);
  const specBacklog = await fs.readFile(assetPaths(assetRoot, cfg.workRoot).specBacklog, "utf8");
  const excerpt = (en ? ["## 2. Topics", "## 3. Candidate structure", "## 6. Gate 1"] : ["## 3. 후보의 구성", "## 6. 게이트 1"]).map((h) => { const a = specBacklog.indexOf(h); if (a < 0) return ""; const b = specBacklog.indexOf("\n## ", a + 3); return specBacklog.slice(a, b < 0 ? undefined : b); }).join("\n");
  // 소스 목록 = 현재 후보 소스 + 새 검색 소스 (+ 같은 중분류의 최근 소스 소량 — 검색이 빈 손이어도 풀에 이미 있던 소스로 채울 수 있게)
  const recent = await recentSourcesForTopics([cand.mid_topic], 60, 60);
  const meta: { n: number; url: string; title: string; summary: string | null; publisher: string; domain: string; published: string | null; tier?: string }[] = [];
  const seen = new Set<string>();
  const tiersPre = null as Awaited<ReturnType<typeof domainTierByHost>> | null; // 판정자에게 도메인 등급을 보이지 않는다(2026-10-17 — 한국판과 같게). 뼈대 1군 검사는 글로벌 게이트 1(명세 6.3)
  const push = (s: { url: string; title: string; summary: string | null; publisher: string; domain: string; published: string | null }) => { if (seen.has(s.url)) return; seen.add(s.url); meta.push({ n: meta.length + 1, ...s, ...(tiersPre ? { tier: tierOfUrl(tiersPre, s.url, s.domain) ?? "candidate" } : {}) }); };
  const blockedHosts = await blockedTierHosts();
  const isBlockedTier = (url: string) => { try { const u = new URL(url); const h = u.hostname.replace(/^www\./, ""); const seg = u.pathname.split("/").filter(Boolean)[0]; return blockedHosts.has(h) || (!!seg && blockedHosts.has(`${h}/${seg}`)); } catch { return false; } };
  const droppedBlocked = cand.sources.filter((s) => isBlockedTier(s.url)).map((s) => hostOf(s.url));
  for (const s of cand.sources) if (!isBlockedTier(s.url)) push({ url: s.url, title: s.title, summary: null, publisher: s.publisher, domain: hostOf(s.url), published: s.published ?? null }); // 차단 도메인 소스는 재판정 목록에서 뺀다 — 보강이 차단 소스를 걷어내는 통로
  const currentM = meta.map((m) => `M${m.n}`);
  for (const s of found) if (added.includes(s.url)) push({ url: s.url, title: s.title, summary: s.summary, publisher: s.publisher, domain: hostOf(s.url), published: s.published });
  // 같은 주제 영역의 최근 풀 소스는 한국판만 — 글로벌판은 이 후보의 소스와 이번 검색 결과만 (박수헌 2026-10-15)
  if (!en) for (const s of recent) push({ url: s.url, title: s.title, summary: s.summary, publisher: s.publisher, domain: s.domain, published: s.published });
  const judgePrompt = (en ? buildTopicJudgePromptEn : buildClusterPromptV2)({ midTopics: mids, majorTopic: major, nextIdNumber: Number(cand.id.replace(/\D/g, "")) || 0, sources: meta, existingTitles: (await existingBacklogTitles()).filter((t) => !t.startsWith(`${cand.id} `)), specBacklogExcerpt: excerpt,
    reinforce: { id: cand.id, title: cand.title, axis: cand.axis ?? "", axis_type: cand.axis_type ?? "", gaps, currentM }, reinforceMidTopic: cand.mid_topic });
  const r2raw = await ex.run<JudgeOut>({ prompt: judgePrompt, schema: en ? CLUSTER_SCHEMA_V2_EN : CLUSTER_SCHEMA_V2, tools: [], allowedTools: [], cwd: cfg.workRoot, timeoutMs: 20 * 60_000, model: cfg.clusterModel, maxThinkingTokens: cfg.thinkingDesign,
    onProgress: (pr) => setJobProgress(job.id, { ...pr, phase: `보강 2/2 — 재판정 (${cand.id})`, detail: pr.turns > 0 ? "역할표 재구성 중" : pr.detail }).catch(() => {}) });
  const r2 = en ? { ...r2raw, output: judgeToInternal(r2raw.output) } : r2raw;
  const c = r2.output.candidates?.[0];
  if (!c) throw new Error("재판정 결과에 후보가 없다");
  const byM = new Map(meta.map((s) => [`M${s.n}`, s]));
  const srcs = c.sources.filter((s) => byM.has(s.m.trim().toUpperCase())).map((s) => ({ ...byM.get(s.m.trim().toUpperCase())!, roles: s.roles, why: s.why }));
  const tiers = await domainTierByHost();
  const { pubs, maxShare, roleSet, problems, missingCore } = checkCandidateSources(srcs, en ? { minKorean: KOREAN_SOURCE_MIN_EN } : {}); // spec/03 다양성 기준 — topic-seed 와 공유
  const newGaps = Array.from(new Set([...(enRoles ? globalGaps(c.gaps) : c.gaps), ...missingCore]));
  const ok = c.verdict === "성립" && problems.length === 0;
  const filled = gaps.filter((g) => roleSet.has(g));
  const summary = `보강 ${prior + 1}회 ${todayKst()}: 검색 ${r1.output.queries?.length ?? 0}회 · 새 소스 ${added.length}건(풀 밖 ${outside.length})${droppedBlocked.length ? ` · 차단 소스 ${droppedBlocked.length}건 제외` : ""} · 채운 역할 ${filled.join("·") || "없음"}${newGaps.length ? ` · 여전히 빈 역할 ${newGaps.join("·")}` : ""}${problems.length ? ` · ${problems.join(", ")}` : ""} → ${ok ? "성립" : "보류 유지"}`;
  await setBacklogStatus(cand.id, ok ? "proposed" : "held", {
    sources: JSON.stringify(srcs.map((s) => ({ url: s.url, tier: tierOfUrl(tiers, s.url, s.domain) ?? "candidate", title: s.title, backbone: s.roles.includes("근거 앵커"), published: s.published, publisher: s.publisher || s.domain, roles: s.roles, role_why: s.why }))),
    gaps: ok ? [] : newGaps, reinforced_at: sweptAt, reinforce_note: summary,
    dedup_note: `${ok ? "성립" : `보강 필요 (${[...problems, ...(newGaps.length ? ["빈 역할 " + newGaps.join("·")] : [])].join(", ")})`} · 발행처 ${pubs.size}곳 · 최다 ${Math.round(maxShare * 100)}% · 역할 ${roleSet.size}종 · ${c.dedup_note} · ${summary} | ${(cand.dedup_note ?? "").replace(/^⚠️[^|]*\| /, "")}`,
  });
  const artifactKey = `sweeps/reinforce/${todayKst()}-${cand.id}-${job.id.slice(0, 8)}.json`;
  await putFile(artifactKey, JSON.stringify({ job_id: job.id, backlog_id: cand.id, gaps, pool_hosts: poolDomains.length, search: r1.output, added, outside, dup, judge: r2.output, result: summary }, null, 1)).catch((e) => log(`  reinforce 결과 보존 실패 (${String(e?.message ?? e).slice(0, 100)})`));
  const cost = (r1.listCostUsd ?? 0) + (r2.listCostUsd ?? 0);
  await insertRun({ backlog_id: cand.id, phase: "sweep", result: `모드 B-① 보강 · ${cand.id} "${cand.title.slice(0, 40)}" · ${summary}${outside.length ? ` · 풀 밖 도메인 후보 등록: ${[...new Set(outside)].join(", ").slice(0, 300)}` : ""}${r1.output.notes ? ` · 검색 메모: ${r1.output.notes.slice(0, 200)}` : ""}`,
    prompt_version: `reinforce-v1.1 (검색 ${maxSearches}회 상한 · 재판정 cluster-v2, spec ${bundle.specDigest})`, artifacts: [s3Key(artifactKey)], executed_by: executedBy, model: r2.model ?? r1.model, cost_usd: cost, tokens: { search: (r1.raw as { usage?: unknown } | undefined)?.usage, web_search: (r1.raw as { web_search?: unknown } | undefined)?.web_search, judge: (r2.raw as { usage?: unknown } | undefined)?.usage }, worker_rev: workerRev() });
  log(`  reinforce ${cand.id}: ${summary} ($${cost.toFixed(2)})`);
  return { backlog_id: cand.id, status: ok ? "proposed" : "held", added: added.length, outside, filled, gaps: ok ? [] : newGaps, list_cost_usd: cost };
}

