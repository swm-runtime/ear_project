import fs from "node:fs/promises";
import { cfg, executedBy } from "../config.js";
import { domainTierByHost, existingBacklogTitles, findDomainForUrl, insertBacklogAlloc, insertCandidateDomain, insertRun, majorOfMidTopic, midsOfMajor, poolDomainsForTopics, recentSourcesForTopics, recordFetchStatus, setBacklogStatus, setJobProgress, upsertSource, type Job } from "../db.js";
import type { Executor } from "../executors/index.js";
import { assetPaths, buildClusterPromptV2, buildTopicSeedSearchPrompt, CLUSTER_SCHEMA_V2, REINFORCE_SEARCH_SCHEMA, todayKst } from "@ear/pipeline";
import { hostOf, log } from "../util.js";
import { prepareAssets, workerRev } from "../assets.js";
import { putFile, s3Key } from "../storage.js";
import { robotsAllows } from "../sources/fetch.js";
import { checkCandidateSources } from "./candidate-check.js";

interface SearchOut { queries: string[]; sources: { url: string; title: string; publisher: string; published: string | null; summary: string; roles: string[]; why: string; in_pool: boolean }[]; notes: string }
interface JudgeOut { candidates: { id: string; mid_topic: string; title: string; axis_type: string; axis: string; axis_note: string; verdict: "성립" | "보강 필요"; gaps: string[]; sources: { m: string; roles: string[]; why: string }[]; target_fit: string; landing: string; dedup_note: string }[] }

export const TOPIC_SEED_MARK = "🔎 기획";

/**
 * 주제 기획 — 모드 B-② (spec/02 6장, 2026-09-26 박수헌). payload: { mode: "B2", mid_topic, topic, hint?, max_searches? }
 *
 * 순서가 뒤집힌 군집화다: 소스를 모아 주제를 찾는 대신, **사람이 준 주제로 소스를 찾아 후보 하나를 세운다.** 그 뒤(승인 → 초안 → …)는 기존과 같다.
 *   0. 후보 행을 먼저 만든다(held, "🔎 기획 검색 진행 중") — 실패해도 화면에 흔적이 남는다.
 *   1. 검색 — WebSearch 만(본문 안 읽음). **풀에 가두지 않는다**: 어느 발행처든 좋되, 차단·보류 도메인·robots 불허·유료 DB 는 뺀다.
 *      풀 밖 도메인은 candidate 행을 만들고 **소스도 적재한다**(B-① 과 다른 점 — 이 모드 한정, PIPELINE.md 불변 원칙 2 조건부 개정).
 *   2. 판정 — 군집화 v2 를 "주제 고정·축은 소스에서" 모드로 이 후보 하나에 돌린다. 성립이면 proposed, 아니면 held(빈 역할 기록 — [보강] 1회 가능).
 * 도구(WebSearch)가 필요해 B-① 처럼 Claude CLI 워커(노트북)만 집는다.
 */
export async function runTopicSeed(job: Job, ex: Executor) {
  const midTopic = String(job.payload.mid_topic ?? "").trim();
  const topic = String(job.payload.topic ?? "").trim();
  const hint = job.payload.hint ? String(job.payload.hint).trim() : null;
  if (!midTopic || !topic) throw new Error("payload.mid_topic·topic 필요");
  const major = await majorOfMidTopic(midTopic);
  if (!major) throw new Error(`중분류 '${midTopic}' 를 topics 에서 찾지 못했다`);
  const maxSearches = Number(job.payload.max_searches ?? 8);

  // ── 0. 후보 행 (held)
  const id = await insertBacklogAlloc({ mid_topic: midTopic, title: topic, summary: hint ?? "", target_fit: "", angle: "", sources: [], status: "held", dedup_note: `${TOPIC_SEED_MARK} 검색 진행 중 (${todayKst()}, 입력: "${topic.slice(0, 60)}")`, cluster_version: "v2", gaps: [] });
  log(`  topic-seed ${id}: "${topic}" (${midTopic}) — 검색 시작`);
  try {
    // ── 1. 검색
    const mids = await midsOfMajor(major);
    const poolDomains = await poolDomainsForTopics(mids.length ? mids : [midTopic]);
    await setJobProgress(job.id, { phase: `기획 1/2 — 검색 (${id})`, detail: `"${topic.slice(0, 40)}"`, toolCounts: {}, turns: 0, elapsedMs: 0 }).catch(() => {});
    const r1 = await ex.run<SearchOut>({
      prompt: buildTopicSeedSearchPrompt({ id, topic, hint, midTopic, poolHosts: poolDomains.map((d) => d.domain), maxSearches }), schema: REINFORCE_SEARCH_SCHEMA,
      allowedTools: ["WebSearch"], cwd: cfg.workRoot, timeoutMs: 20 * 60_000, model: cfg.clusterModel, effort: "medium",
      onProgress: (pr) => setJobProgress(job.id, { ...pr, phase: `기획 1/2 — 검색 (${id})`, detail: pr.toolCounts?.WebSearch ? `검색 ${pr.toolCounts.WebSearch}회` : pr.detail }).catch(() => {}),
    });
    const found = r1.output.sources ?? [];
    const sweptAt = new Date().toISOString();
    const added: typeof found = []; const dropped: string[] = []; const newDomains: string[] = [];
    const seenUrl = new Set<string>();
    for (const s of found) {
      if (!/^https?:\/\//.test(s.url) || seenUrl.has(s.url)) continue;
      seenUrl.add(s.url);
      let u: URL; try { u = new URL(s.url); } catch { continue; }
      let d = await findDomainForUrl(s.url);
      if (d && (d.tier === "blocked" || d.tier === "hold" || d.fetch_blocked_at)) { dropped.push(`${d.domain} (${d.tier === "hold" ? "보류" : "차단"})`); continue; }
      // 접근 제한 사전 검사 — robots 가 막으면 설계 단계에서 어차피 못 읽는다
      if (!(await robotsAllows(u).catch(() => true))) { dropped.push(`${hostOf(s.url)} (robots)`); await recordFetchStatus(s.url, "robots").catch(() => {}); continue; }
      if (!d) {
        const host = u.hostname.replace(/^www\./, "");
        if (await insertCandidateDomain({ domain: host, publisher: s.publisher || host, topic_coverage: [midTopic], note: `${TOPIC_SEED_MARK} 검색 발견 ${todayKst()} (${id} "${topic.slice(0, 40)}"): ${s.url} — 피드 미확인, 소스는 이 모드에서 바로 적재(B-② 정책). 판정 대기` })) newDomains.push(host);
        d = await findDomainForUrl(s.url);
        if (!d) { dropped.push(`${host} (도메인 등록 실패)`); continue; }
      }
      await upsertSource({ domain_id: d.id, url: s.url, title: s.title, summary: s.summary, author: "", published: s.published, swept_at: sweptAt, origin: "search" });
      added.push(s);
    }
    log(`  topic-seed ${id}: 검색 ${r1.output.queries?.length ?? 0}회 → ${found.length}건 · 적재 ${added.length} · 제외 ${dropped.length} · 새 도메인 ${newDomains.length}`);

    // ── 2. 판정 (군집화 v2 · 주제 고정)
    await setJobProgress(job.id, { phase: `기획 2/2 — 판정 (${id}, 소스 ${added.length}건)`, detail: "", toolCounts: {}, turns: 0, elapsedMs: 0 }).catch(() => {});
    const { assetRoot, bundle } = await prepareAssets(null);
    const specBacklog = await fs.readFile(assetPaths(assetRoot, cfg.workRoot).specBacklog, "utf8");
    const excerpt = ["## 3. 후보의 구성", "## 6. 게이트 1"].map((h) => { const a = specBacklog.indexOf(h); if (a < 0) return ""; const b = specBacklog.indexOf("\n## ", a + 3); return specBacklog.slice(a, b < 0 ? undefined : b); }).join("\n\n");
    const meta: { n: number; url: string; title: string; summary: string | null; publisher: string; domain: string; published: string | null }[] = [];
    const seen = new Set<string>();
    const push = (s: { url: string; title: string; summary: string | null; publisher: string; domain: string; published: string | null }) => { if (seen.has(s.url)) return; seen.add(s.url); meta.push({ n: meta.length + 1, ...s }); };
    for (const s of added) push({ url: s.url, title: s.title, summary: s.summary, publisher: s.publisher, domain: hostOf(s.url), published: s.published });
    for (const s of await recentSourcesForTopics([midTopic], 60, 30)) push({ url: s.url, title: s.title, summary: s.summary, publisher: s.publisher, domain: s.domain, published: s.published }); // 풀의 최근 소스 소량 — 검색이 빈 손이어도 채울 수 있게
    const judgePrompt = buildClusterPromptV2({ midTopics: [midTopic], majorTopic: major, nextIdNumber: Number(id.replace(/\D/g, "")) || 0, sources: meta, existingTitles: (await existingBacklogTitles()).filter((t) => t !== topic), specBacklogExcerpt: excerpt, seed: { id, topic, hint, midTopic } });
    const r2 = await ex.run<JudgeOut>({ prompt: judgePrompt, schema: CLUSTER_SCHEMA_V2, tools: [], allowedTools: [], cwd: cfg.workRoot, timeoutMs: 20 * 60_000, model: cfg.clusterModel, maxThinkingTokens: cfg.thinkingDesign,
      onProgress: (pr) => setJobProgress(job.id, { ...pr, phase: `기획 2/2 — 판정 (${id})`, detail: pr.turns > 0 ? "축·역할표 구성 중" : pr.detail }).catch(() => {}) });
    const c = r2.output.candidates?.[0];
    if (!c) throw new Error("판정 결과에 후보가 없다");
    const byM = new Map(meta.map((s) => [`M${s.n}`, s]));
    const srcs = c.sources.filter((s) => byM.has(s.m.trim().toUpperCase())).map((s) => ({ ...byM.get(s.m.trim().toUpperCase())!, roles: s.roles, why: s.why }));
    const tiers = await domainTierByHost();
    const { pubs, maxShare, roleSet, problems, missingCore } = checkCandidateSources(srcs);
    const gaps = Array.from(new Set([...c.gaps, ...missingCore]));
    const ok = c.verdict === "성립" && problems.length === 0;
    const summary = `${TOPIC_SEED_MARK} ${todayKst()}: 입력 "${topic.slice(0, 60)}" · 검색 ${r1.output.queries?.length ?? 0}회 → 소스 ${added.length}건 적재(새 도메인 ${newDomains.length}, 제외 ${dropped.length}) · 판정 ${ok ? "성립" : `보강 필요 (${[...problems, ...(gaps.length ? ["빈 역할 " + gaps.join("·")] : [])].join(", ")})`}`;
    await setBacklogStatus(id, ok ? "proposed" : "held", {
      title: c.title || topic, summary: c.axis_note, target_fit: c.target_fit, angle: c.landing, axis: c.axis, axis_type: c.axis_type,
      sources: JSON.stringify(srcs.map((s) => ({ url: s.url, tier: tiers.get(hostOf(s.url)) ?? tiers.get(s.domain) ?? "candidate", title: s.title, backbone: s.roles.includes("근거 앵커"), published: s.published, publisher: s.publisher, roles: s.roles, why: s.why }))),
      gaps: ok ? [] : gaps, reinforce_note: summary,
      dedup_note: `${TOPIC_SEED_MARK} · ${ok ? "성립" : "보강 필요"} · 발행처 ${pubs.size}곳 · 최다 ${Math.round(maxShare * 100)}% · 역할 ${roleSet.size}종 · ${c.dedup_note}`,
    });
    const artifactKey = `sweeps/topic-seed/${todayKst()}-${id}-${job.id.slice(0, 8)}.json`;
    await putFile(artifactKey, JSON.stringify({ job_id: job.id, backlog_id: id, topic, hint, mid_topic: midTopic, search: r1.output, added: added.map((s) => s.url), dropped, new_domains: newDomains, judge: r2.output, result: summary }, null, 1)).catch((e) => log(`  topic-seed ${id}: 산출물 저장 실패 ${e?.message ?? e}`));
    const cost = (r1.listCostUsd ?? 0) + (r2.listCostUsd ?? 0);
    await insertRun({ backlog_id: id, phase: "sweep", result: `모드 B-② 기획 검색 · ${id} · ${summary}${newDomains.length ? ` · 새 도메인 후보: ${newDomains.join(", ").slice(0, 200)}` : ""}${dropped.length ? ` · 제외: ${dropped.join(", ").slice(0, 200)}` : ""}`,
      prompt_version: `topic-seed-v1 (검색 ${maxSearches}회 상한 · 판정 cluster-v2 seed, spec ${bundle.specDigest})`, artifacts: [s3Key(artifactKey)], executed_by: executedBy, model: r2.model ?? r1.model, cost_usd: cost, worker_rev: workerRev() });
    log(`  topic-seed ${id}: ${summary} ($${cost.toFixed(2)})`);
    return { backlog_id: id, status: ok ? "proposed" : "held", added: added.length, dropped, new_domains: newDomains, gaps: ok ? [] : gaps, list_cost_usd: cost };
  } catch (e: any) {
    // 실패한 후보는 지우지 않고 held 에 사유를 남긴다 — 사람이 [보강]·[반려]로 정리한다
    await setBacklogStatus(id, "held", { dedup_note: `⚠️ ${TOPIC_SEED_MARK} 검색 실패 (${todayKst()}): ${String(e?.message ?? e).slice(0, 200)} · 입력 "${topic.slice(0, 60)}"` }).catch(() => {});
    throw e;
  }
}
