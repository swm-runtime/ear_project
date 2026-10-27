import fs from "node:fs/promises";
import { cfg, executedBy } from "../config.js";
import { seriesSiblingIds, retireSeriesEpisodeCandidates, domainTierByHost, existingBacklogTitles, findDomainForUrl, insertBacklogAlloc, insertCandidateDomain, insertRun, majorOfMidTopic, midsOfMajor, poolDomainsForTopics, recentSourcesForTopics, recordFetchStatus, setBacklogStatus, setJobProgress, upsertSource, type Job, allTopicMids, tierOfUrl } from "../db.js";
import type { Executor } from "../executors/index.js";
import { assetPaths, globalGaps, KOREAN_SOURCE_MIN_EN, buildClusterPromptV2, buildTopicJudgePromptEn, buildTopicSeedSearchPrompt, buildTopicSeedSearchPromptEn, CLUSTER_SCHEMA_V2, CLUSTER_SCHEMA_V2_EN, judgeToInternal, REINFORCE_SEARCH_SCHEMA, REINFORCE_SEARCH_SCHEMA_EN, todayKst, pipelineLocale } from "@ear/pipeline";
import { hostOf, log } from "../util.js";
import { prepareAssets, workerRev } from "../assets.js";
import { putFile, s3Key } from "../storage.js";
import { fetchArticle, fetchStatusOf, robotsAllows } from "../sources/fetch.js";
import { checkCandidateSources } from "./candidate-check.js";
import { rememberRobotsBlocked } from "../sources/robots-memory.js";

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
 * 검색 단계는 WebSearch 만 쓰는 요청이라 웹 검색을 처리하는 실행기만 집는다 — 서버 워커(OpenAI 웹 검색, executors/openai-search.ts)가 운영 경로이고 노트북 Claude CLI 도 집을 수 있다(2026-10-16 KAN-222).
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
  // 글로벌판 기획 입력만 싣는 값(2026-10-15 KAN-209 — 보조 주제·배제 주제 판정). 한국판 payload 에는 없어 이 줄을 타지 않는다
  if (job.payload.sub_topic || job.payload.screen) await setBacklogStatus(id, "held", { ...(job.payload.sub_topic ? { sub_topic: String(job.payload.sub_topic) } : {}), ...(job.payload.screen ? { gate1_checks: JSON.stringify({ screen: job.payload.screen }) } : {}) });
  // 시리즈 편 (0029, spec/11 4장): 시리즈 승인이 편마다 건 작업 — 후보에 시리즈·화 번호를 단다
  const seriesId = job.payload.series_id ? String(job.payload.series_id) : null;
  if (seriesId) {
    const no = Number(job.payload.series_no);
    // 같은 화 번호의 살아 있는 후보는 반려로 비운다(0035, 2026-10-27) — 앞선 시도가 남긴 "검색 진행 중" 행·[다시 기획] 전의 보류 행이 자리를 차지해 duplicate key 로 실패했다. 초안 이후 후보가 있으면 유니크가 막아 이 작업이 실패한다(그 화는 재작성 흐름)
    const retired = await retireSeriesEpisodeCandidates(seriesId, no, id);
    if (retired.length) log(`  topic-seed ${id}: ${no}화 앞선 후보 ${retired.join(", ")} 를 대체(반려)`);
    await setBacklogStatus(id, "held", { series_id: seriesId, series_no: no });
  }
  log(`  topic-seed ${id}: "${topic}" (${midTopic}) — 검색 시작`);
  try {
    // ── 1. 검색
    const mids = await midsOfMajor(major);
    const poolDomains = await poolDomainsForTopics(mids.length ? mids : [midTopic]);
    await setJobProgress(job.id, { phase: `기획 1/2 — 검색 (${id})`, detail: `"${topic.slice(0, 40)}"`, toolCounts: {}, turns: 0, elapsedMs: 0 }).catch(() => {});
    const en = pipelineLocale() === "en"; // 글로벌판: 영어 검색·판정 프롬프트, 판정 결과는 내부 값으로 바꿔 저장 (global-prompts.ts, KAN-209)
    const r1 = await ex.run<SearchOut>({
      prompt: (en ? buildTopicSeedSearchPromptEn : buildTopicSeedSearchPrompt)({ id, topic, hint, midTopic, poolHosts: poolDomains.map((d) => d.domain), maxSearches }), schema: en ? REINFORCE_SEARCH_SCHEMA_EN : REINFORCE_SEARCH_SCHEMA,
      allowedTools: ["WebSearch"], cwd: cfg.workRoot, timeoutMs: 20 * 60_000, model: cfg.clusterModel, effort: "medium",
      onProgress: (pr) => setJobProgress(job.id, { ...pr, phase: `기획 1/2 — 검색 (${id})`, detail: pr.toolCounts?.WebSearch ? `검색 ${pr.toolCounts.WebSearch}회` : pr.detail }).catch(() => {}),
    });
    const found = r1.output.sources ?? [];
    const sweptAt = new Date().toISOString();
    const added: typeof found = []; const dropped: string[] = []; const newDomains: string[] = [];
    const seenUrl = new Set<string>();
    // 글로벌판: 본문 접근 가능성 선검사 (2026-10-23) — 세기 전에 실제로 열리는지 본다. 못 여는 소스는 적재하되(fetch_status 기록) 역할표에는 넣지 않는다. 403 은 우회하지 않는다
    const bodyOk = en ? new Map(await Promise.all(found.map(async (s) => [s.url, await fetchArticle(0, s.url).catch(() => null)] as const))) : null;
    for (const s of found) {
      if (!/^https?:\/\//.test(s.url) || seenUrl.has(s.url)) continue;
      seenUrl.add(s.url);
      let u: URL; try { u = new URL(s.url); } catch { continue; }
      let d = await findDomainForUrl(s.url);
      if (d && (d.tier === "blocked" || d.tier === "hold" || d.fetch_blocked_at)) { dropped.push(`${d.domain} (${d.tier === "hold" ? "보류" : "차단"})`); continue; }
      // 접근 제한 사전 검사 — robots 가 막으면 설계 단계에서 어차피 못 읽는다
      if (!(await robotsAllows(u).catch(() => true))) { // 막힌 사이트를 기억해 다음 검색에서 빼게 한다 (robots-memory.ts, 2026-10-15)
        dropped.push(`${hostOf(s.url)} (robots)`);
        await rememberRobotsBlocked(u, s, midTopic, `${TOPIC_SEED_MARK} 검색 발견 ${todayKst()} (${id})`, sweptAt).catch((e) => log(`  topic-seed ${id}: robots 차단 기록 실패 (${String(e?.message ?? e).slice(0, 80)})`));
        continue;
      }
      if (!d) {
        const host = u.hostname.replace(/^www\./, "");
        if (await insertCandidateDomain({ domain: host, publisher: s.publisher || host, topic_coverage: [midTopic], note: `${TOPIC_SEED_MARK} 검색 발견 ${todayKst()} (${id} "${topic.slice(0, 40)}"): ${s.url} — 피드 미확인, 소스는 이 모드에서 바로 적재(B-② 정책). 판정 대기` })) newDomains.push(host);
        d = await findDomainForUrl(s.url);
        if (!d) { dropped.push(`${host} (도메인 등록 실패)`); continue; }
      }
      await upsertSource({ domain_id: d.id, url: s.url, title: s.title, summary: s.summary, author: "", published: s.published, swept_at: sweptAt, origin: "search" });
      const f = bodyOk?.get(s.url);
      if (bodyOk && (!f || !f.ok)) { await recordFetchStatus(s.url, f ? fetchStatusOf(f) : "network").catch(() => {}); dropped.push(`${hostOf(s.url)} (본문 ${f ? f.status : "network"})`); continue; }
      added.push(s);
    }
    log(`  topic-seed ${id}: 검색 ${r1.output.queries?.length ?? 0}회 → ${found.length}건 · 적재 ${added.length} · 제외 ${dropped.length} · 새 도메인 ${newDomains.length}`);

    // ── 2. 판정 (군집화 v2 · 주제 고정)
    await setJobProgress(job.id, { phase: `기획 2/2 — 판정 (${id}, 소스 ${added.length}건)`, detail: "", toolCounts: {}, turns: 0, elapsedMs: 0 }).catch(() => {});
    const { assetRoot, bundle } = await prepareAssets(null);
    const specBacklog = await fs.readFile(assetPaths(assetRoot, cfg.workRoot).specBacklog, "utf8");
    const excerpt = (en ? ["## 2. Topics", "## 3. Candidate structure", "## 6. Gate 1"] : ["## 3. 후보의 구성", "## 6. 게이트 1"]).map((h) => { const a = specBacklog.indexOf(h); if (a < 0) return ""; const b = specBacklog.indexOf("\n## ", a + 3); return specBacklog.slice(a, b < 0 ? undefined : b); }).join("\n\n");
    const meta: { n: number; url: string; title: string; summary: string | null; publisher: string; domain: string; published: string | null; tier?: string }[] = [];
    const seen = new Set<string>();
    const tiersPre = null as Awaited<ReturnType<typeof domainTierByHost>> | null; // 판정자에게 도메인 등급을 보이지 않는다(2026-10-17 — 한국판과 같게). 뼈대 1군 검사는 글로벌 게이트 1(명세 6.3)
    const push = (s: { url: string; title: string; summary: string | null; publisher: string; domain: string; published: string | null }) => { if (seen.has(s.url)) return; seen.add(s.url); meta.push({ n: meta.length + 1, ...s, ...(tiersPre ? { tier: tierOfUrl(tiersPre, s.url, s.domain) ?? "candidate" } : {}) }); };
    for (const s of added) push({ url: s.url, title: s.title, summary: s.summary, publisher: s.publisher, domain: hostOf(s.url), published: s.published });
    // 한국판만: 풀의 최근 소스 소량 — 검색이 빈 손이어도 채울 수 있게. 글로벌판은 사람이 정한 주제로 찾은 소스만 쓴다 (박수헌 2026-10-15)
    if (!en) for (const s of await recentSourcesForTopics([midTopic], 60, 30)) push({ url: s.url, title: s.title, summary: s.summary, publisher: s.publisher, domain: s.domain, published: s.published }); // 풀의 최근 소스 소량 — 검색이 빈 손이어도 채울 수 있게
    const siblings = seriesId ? await seriesSiblingIds(seriesId) : []; // 형제 편은 겹침 비교에서 뺀다 — 범위 구분은 hint 가 준다(spec/11 4장)
    const judgePrompt = (en ? buildTopicJudgePromptEn : buildClusterPromptV2)({ midTopics: [midTopic], majorTopic: major, nextIdNumber: Number(id.replace(/\D/g, "")) || 0, sources: meta, existingTitles: (await existingBacklogTitles()).filter((t) => !t.startsWith(`${id} `) && !siblings.some((b) => t.startsWith(`${b} `))) /* 목록은 "C1 [주제] 제목" 형식 — 이 후보 자신을 ID 로 뺀다(제목 비교는 늘 어긋나 자기 자신과 겹친다고 적혔다, 2026-10-15) */, specBacklogExcerpt: excerpt, seed: { id, topic, hint, midTopic }, ...(en ? { subTopicOptions: (await allTopicMids()).filter((t) => t !== midTopic) } : {}) });
    const r2raw = await ex.run<JudgeOut>({ prompt: judgePrompt, schema: en ? CLUSTER_SCHEMA_V2_EN : CLUSTER_SCHEMA_V2, tools: [], allowedTools: [], cwd: cfg.workRoot, timeoutMs: 20 * 60_000, model: cfg.clusterModel, maxThinkingTokens: cfg.thinkingDesign,
      onProgress: (pr) => setJobProgress(job.id, { ...pr, phase: `기획 2/2 — 판정 (${id})`, detail: pr.turns > 0 ? "축·역할표 구성 중" : pr.detail }).catch(() => {}) });
    const r2 = en ? { ...r2raw, output: judgeToInternal(r2raw.output) } : r2raw;
    const c = r2.output.candidates?.[0];
    if (!c) throw new Error("판정 결과에 후보가 없다");
    const byM = new Map(meta.map((s) => [`M${s.n}`, s]));
    const srcs = c.sources.filter((s) => byM.has(s.m.trim().toUpperCase())).map((s) => ({ ...byM.get(s.m.trim().toUpperCase())!, roles: s.roles, why: s.why }));
    const tiers = await domainTierByHost();
    const { pubs, maxShare, roleSet, problems, missingCore } = checkCandidateSources(srcs, en ? { minKorean: KOREAN_SOURCE_MIN_EN } : {});
    const gaps = Array.from(new Set([...(en ? globalGaps(c.gaps) : c.gaps), ...missingCore])); // 글로벌판: 반론·한계·수치·조사는 선택 역할 (2026-10-17 소개형 전환)
    const ok = c.verdict === "성립" && problems.length === 0;
    const summary = `${TOPIC_SEED_MARK} ${todayKst()}: 입력 "${topic.slice(0, 60)}" · 검색 ${r1.output.queries?.length ?? 0}회 → 소스 ${added.length}건 적재(새 도메인 ${newDomains.length}, 제외 ${dropped.length}) · 판정 ${ok ? "성립" : `보강 필요 (${[...problems, ...(gaps.length ? ["빈 역할 " + gaps.join("·")] : [])].join(", ")})`}`;
    // 글로벌판 보조 주제: 사람이 고르지 않았을 때만 판정의 제안을 싣는다 — 사람이 고른 값은 바꾸지 않는다 (글로벌 명세 2장·6.1)
    const judgedSub = en && !job.payload.sub_topic ? (c as { sub_topic?: string | null }).sub_topic ?? null : null;
    const subOk = judgedSub && judgedSub !== midTopic && (await allTopicMids()).includes(judgedSub) ? judgedSub : null;
    await setBacklogStatus(id, ok ? "proposed" : "held", {
      ...(subOk ? { sub_topic: subOk } : {}),
      title: c.title || topic, summary: c.axis_note, target_fit: c.target_fit, angle: c.landing, axis: c.axis, axis_type: c.axis_type,
      sources: JSON.stringify(srcs.map((s) => ({ url: s.url, tier: tierOfUrl(tiers, s.url, s.domain) ?? "candidate", title: s.title, backbone: s.roles.includes("근거 앵커"), published: s.published, publisher: s.publisher, roles: s.roles, why: s.why }))),
      gaps: ok ? [] : gaps, reinforce_note: summary,
      dedup_note: `${TOPIC_SEED_MARK} · ${ok ? "성립" : "보강 필요"} · 발행처 ${pubs.size}곳 · 최다 ${Math.round(maxShare * 100)}% · 역할 ${roleSet.size}종 · ${c.dedup_note}`,
    });
    const artifactKey = `sweeps/topic-seed/${todayKst()}-${id}-${job.id.slice(0, 8)}.json`;
    await putFile(artifactKey, JSON.stringify({ job_id: job.id, backlog_id: id, topic, hint, mid_topic: midTopic, search: r1.output, added: added.map((s) => s.url), dropped, new_domains: newDomains, judge: r2.output, result: summary }, null, 1)).catch((e) => log(`  topic-seed ${id}: 산출물 저장 실패 ${e?.message ?? e}`));
    // 배제 주제 판정(콘솔이 작업 전에 부른 OpenAI 호출) 비용도 이 기획의 비용에 더한다 — 작업이 아니라 따로 남을 자리가 없다 (2026-10-15)
    const screenCost = Number((job.payload.screen as { cost_usd?: number } | undefined)?.cost_usd ?? 0) || 0;
    const cost = (r1.listCostUsd ?? 0) + (r2.listCostUsd ?? 0) + screenCost;
    await insertRun({ backlog_id: id, phase: "sweep", result: `모드 B-② 기획 검색 · ${id} · ${summary}${newDomains.length ? ` · 새 도메인 후보: ${newDomains.join(", ").slice(0, 200)}` : ""}${dropped.length ? ` · 제외: ${dropped.join(", ").slice(0, 200)}` : ""}`,
      prompt_version: `topic-seed-v1.1 (검색 ${maxSearches}회 상한 · 판정 cluster-v2 seed, spec ${bundle.specDigest})`, artifacts: [s3Key(artifactKey)], executed_by: executedBy, model: r2.model ?? r1.model, cost_usd: cost,
      tokens: { search: (r1.raw as { usage?: unknown } | undefined)?.usage, web_search: (r1.raw as { web_search?: unknown } | undefined)?.web_search, judge: (r2.raw as { usage?: unknown } | undefined)?.usage }, worker_rev: workerRev() }); // web_search: 호출·검색 수·검색어·본 URL (OpenAI 실행기만 — KAN-222)
    log(`  topic-seed ${id}: ${summary} ($${cost.toFixed(2)})`);
    return { backlog_id: id, status: ok ? "proposed" : "held", added: added.length, dropped, new_domains: newDomains, gaps: ok ? [] : gaps, list_cost_usd: cost };
  } catch (e: any) {
    // 실패한 후보는 지우지 않고 held 에 사유를 남긴다 — 사람이 [보강]·[반려]로 정리한다
    await setBacklogStatus(id, "held", { dedup_note: `⚠️ ${TOPIC_SEED_MARK} 검색 실패 (${todayKst()}): ${String(e?.message ?? e).slice(0, 200)} · 입력 "${topic.slice(0, 60)}"` }).catch(() => {});
    throw e;
  }
}
