import fs from "node:fs/promises";
import { cfg, executedBy } from "../config.js";
import { domainTierByHost, existingBacklogTitles, insertBacklogAlloc, insertRun, liveCandidateSources, midsOfMajor, nextBacklogNumber, recentSourcesForTopics, setJobProgress, usedSourceUrls, type Job, recordFetchStatus, refreshDomainFetchBlock } from "../db.js";
import { robotsAllows } from "../sources/fetch.js";
import type { Executor } from "../executors/index.js";
import { assetPaths, buildClusterPromptV2, CLUSTER_SCHEMA_V2, SOURCE_ROLES } from "@ear/pipeline";
import { hostOf, log } from "../util.js";
import { prepareAssets, workerRev } from "../assets.js";
import { putFile, s3Key } from "../storage.js";

interface ClusterV2Out {
  candidates: { id: string; mid_topic: string; title: string; axis_type: "대립" | "역설" | "재정의"; axis: string; axis_note: string; verdict: "성립" | "보강 필요"; gaps: string[]; sources: { m: string; roles: string[]; why: string }[]; target_fit: string; landing: string; dedup_note: string }[];
  axis_pool?: string[]; // 2026-09-12 이후 요구하지 않는다(안전장치) — 옛 결과 호환용
  dropped_notes?: string[];
}

/**
 * 군집화 v2 (spec/03 2장 v2, "축이 이끄는 파이프라인" ①): 축 → 역할 → 다양성. 단발 호출.
 * payload: { mid_topic } 또는 { major_topic } (대분류 풀 — 축은 중분류 경계를 넘어 잡히는 경우가 많다) · days · limit
 * 다양성 기준은 워커가 코드로 판정한다: 성립 → proposed, 보강 필요/미달 → held + gaps. 후보에 axis·역할(sources[].roles)·gaps 기록.
 */
export async function runClusterV2(job: Job, ex: Executor) {
  const major = String(job.payload.major_topic ?? "");
  const mid = String(job.payload.mid_topic ?? "");
  const mids = major ? await midsOfMajor(major) : mid ? [mid] : [];
  if (!mids.length) throw new Error("payload.mid_topic 또는 major_topic 필요");
  const pool0 = await recentSourcesForTopics(mids, Number(job.payload.days ?? 45), Number(job.payload.limit ?? 400));
  // robots 사전 검사 (0017, 2026-09-10): 접근 결과가 없는 소스는 robots.txt 만 확인해(도메인당 1회 캐시) 막힌 것을 풀에서 빼고 기록한다.
  // 본문 fetch 는 설계 단계가 하고 그때 403 등이 기록된다 — 후보 11건 중 5건이 본문 3건 미만이던 원인은 대부분 robots 였다
  await setJobProgress(job.id, { phase: `군집화 v2 — robots 사전 검사 (${pool0.length}건)`, detail: "", toolCounts: {}, turns: 0, elapsedMs: 0 }).catch(() => {});
  const unchecked = pool0.filter((s) => !s.fetch_status);
  const blockedUrls = new Set<string>();
  for (let i = 0; i < unchecked.length; i += 25) {
    await Promise.all(unchecked.slice(i, i + 25).map(async (s) => {
      let u: URL; try { u = new URL(s.url); } catch { return; }
      if (!(await robotsAllows(u))) { blockedUrls.add(s.url); await recordFetchStatus(s.url, "robots").catch(() => {}); }
    }));
  }
  if (blockedUrls.size) await refreshDomainFetchBlock([...blockedUrls]).catch(() => {});
  const sources = pool0.filter((s) => !blockedUrls.has(s.url));
  if (blockedUrls.size) log(`  cluster v2 ${major || mid}: robots 차단 ${blockedUrls.size}건 제외 (검사 ${unchecked.length}건, 기록됨)`);
  if (sources.length < 5) throw new Error(`${major || mid} 최근 소스가 ${sources.length}건 — 군집화 v2 불가(5건 하한)`);
  const [existing, nextN, used, tiers, liveSrc] = await Promise.all([existingBacklogTitles(), nextBacklogNumber(), usedSourceUrls(), domainTierByHost(), liveCandidateSources()]);
  const { assetRoot, bundle } = await prepareAssets(null);
  const specBacklog = await fs.readFile(assetPaths(assetRoot, cfg.workRoot).specBacklog, "utf8");
  const excerpt = ["## 3. 후보의 구성", "## 6. 게이트 1"].map((h) => { const a = specBacklog.indexOf(h); if (a < 0) return ""; const b = specBacklog.indexOf("\n## ", a + 3); return specBacklog.slice(a, b < 0 ? undefined : b); }).join("\n");
  const meta = sources.map((s, n) => ({ n: n + 1, url: s.url, title: s.title, summary: s.summary, publisher: s.publisher, domain: s.domain, published: s.published, midTopics: s.mids, used: used.has(s.url) }));
  const prompt = buildClusterPromptV2({ midTopics: mids, majorTopic: major || null, nextIdNumber: nextN, sources: meta, existingTitles: existing, specBacklogExcerpt: excerpt });
  log(`  cluster v2 ${major || mid}: 소스 ${sources.length}건(중분류 ${mids.length}), 다음 ID C${nextN} (프롬프트 ${Math.round(prompt.length / 1000)}K자)`);
  const r = await ex.run<ClusterV2Out>({ prompt, schema: CLUSTER_SCHEMA_V2, tools: [], allowedTools: [], cwd: cfg.workRoot, timeoutMs: 30 * 60_000, model: cfg.clusterModel, maxThinkingTokens: cfg.thinkingDesign,
    onProgress: (pr) => setJobProgress(job.id, { ...pr, phase: `군집화 v2 (소스 ${sources.length}건, 단발)`, detail: pr.turns > 0 ? "축·역할 배정 중 (도구 없음)" : pr.detail }).catch(() => {}),
  });

  const byM = new Map(meta.map((s) => [`M${s.n}`, s]));
  const inserted: string[] = []; const held: string[] = [];
  for (const c of r.output.candidates) {
    const srcs = c.sources.filter((s) => byM.has(s.m.trim().toUpperCase())).map((s) => ({ ...byM.get(s.m.trim().toUpperCase())!, roles: s.roles, why: s.why }));
    if (srcs.length < 3) { log(`  후보 '${c.title}' 유효 소스 ${srcs.length}건 — 제외 (M-ID 불일치)`); continue; }
    // 다양성 — 코드가 판정한다
    const pubs = new Map<string, number>(); for (const s of srcs) pubs.set(s.publisher || s.domain, (pubs.get(s.publisher || s.domain) ?? 0) + 1);
    const maxShare = Math.max(...pubs.values()) / srcs.length;
    const roleSet = new Set(srcs.flatMap((s) => s.roles));
    const usedCount = srcs.filter((s) => s.used).length;
    const problems: string[] = [];
    if (pubs.size < 3) problems.push(`발행처 ${pubs.size}곳`);
    if (maxShare > 0.5) problems.push(`한 발행처 ${Math.round(maxShare * 100)}%`);
    if (!roleSet.has("근거 앵커")) problems.push("근거 앵커 없음");
    if (roleSet.size < 3) problems.push(`역할 ${roleSet.size}종`);
    if (usedCount > 1) problems.push(`사용된 소스 ${usedCount}건`);
    const gaps = Array.from(new Set([...c.gaps, ...SOURCE_ROLES.filter((role) => !roleSet.has(role) && (role === "근거 앵커" || role === "사례"))]));
    const ok = c.verdict === "성립" && problems.length === 0;
    const diversity = `발행처 ${pubs.size}곳 · 최다 ${Math.round(maxShare * 100)}% · 역할 ${roleSet.size}종`;
    // 소스 겹침 표시 (2026-09-10, T260910-005↔013): 살아 있는 다른 후보(같은 실행에서 방금 넣은 것 포함)와 URL 이 2건 이상 겹치면 승인 화면에 배지로 보인다.
    // 막지 않는다 — 같은 소스를 써도 설계 단계가 그 편이 쓴 문단을 제외하므로 같은 대목이 두 번 풀리지는 않는다. 승인자가 같은 이야기인지 보고 고른다.
    const overlapBy = new Map<string, number>();
    for (const s of srcs) for (const other of liveSrc.get(s.url) ?? []) overlapBy.set(other, (overlapBy.get(other) ?? 0) + 1);
    const overlaps = [...overlapBy].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).map(([id, n]) => `${id} ${n}건`);
    const overlapNote = overlaps.length ? `⚠️ 소스 겹침: ${overlaps.join(", ")} | ` : "";
    const id = await insertBacklogAlloc({
      mid_topic: mids.includes(c.mid_topic) ? c.mid_topic : mids[0], title: c.title, summary: c.axis_note, target_fit: c.target_fit,
      angle: `${c.axis_note}\n예상 착지: ${c.landing}`,
      sources: srcs.map((s) => ({ url: s.url, tier: tiers.get(hostOf(s.url)) ?? tiers.get(s.domain) ?? "candidate", title: s.title, backbone: s.roles.includes("근거 앵커"), published: s.published, publisher: s.domain, roles: s.roles, role_why: s.why })),
      status: ok ? "proposed" : "held",
      axis: c.axis, axis_type: c.axis_type, gaps: ok ? [] : gaps, cluster_version: "v2",
      dedup_note: `${overlapNote}${ok ? "성립" : `보강 필요 (${[...problems, ...(c.gaps.length ? ["빈 역할 " + c.gaps.join("·")] : [])].join(", ")})`} · ${diversity} · ${c.dedup_note} · 워커 군집화 v2 ${job.id.slice(0, 8)} (${r.model ?? ex.kind})`,
    });
    for (const s of srcs) liveSrc.set(s.url, [...(liveSrc.get(s.url) ?? []), id]); // 같은 실행의 다음 후보와도 대조
    (ok ? inserted : held).push(`${id} ${c.title} (${srcs.length}건, ${diversity}${overlaps.length ? `, 소스 겹침 ${overlaps.join("·")}` : ""})`);
  }
  // 원본 결과를 S3 에 남긴다 (2026-09-09): ID 충돌로 삽입이 유실됐을 때 실행 기록 요약만으로는 복구가 안 됐다 (M-ID·역할·축 소실)
  const artifactKey = `sweeps/cluster-v2/${new Date().toISOString().slice(0, 10)}-${(major || mid).replace(/[^\p{L}\p{N}]+/gu, "_")}-${job.id.slice(0, 8)}.json`;
  await putFile(artifactKey, JSON.stringify({ job_id: job.id, major, mids, input_sources: sources.length, meta, output: r.output, inserted, held }, null, 1)).catch((e) => log(`  cluster v2 결과 보존 실패 (${String(e?.message ?? e).slice(0, 100)})`));
  await insertRun({
    phase: "cluster",
    result: `v2 · ${major ? `대분류 ${major}` : `중분류 ${mid}`} · 입력 ${sources.length}건 → 성립 ${inserted.length}건 proposed: ${inserted.join(" / ").slice(0, 700)}${held.length ? ` · 보강 필요 ${held.length}건 held: ${held.join(" / ").slice(0, 500)}` : ""}${r.output.axis_pool?.length ? ` · 검토한 축: ${r.output.axis_pool.join(" | ").slice(0, 400)}` : ""}`,
    artifacts: [s3Key(artifactKey)], prompt_version: `cluster-v2 (축·역할·다양성, spec ${bundle.specDigest})`, executed_by: executedBy, model: r.model, cost_usd: r.listCostUsd, tokens: (r.raw as { usage?: unknown } | undefined)?.usage, worker_rev: workerRev(),
  });
  return { scope: major || mid, mids, input_sources: sources.length, proposed: inserted, held, axis_pool: r.output.axis_pool ?? [], dropped_notes: r.output.dropped_notes ?? [], model: r.model, list_cost_usd: r.listCostUsd };
}
