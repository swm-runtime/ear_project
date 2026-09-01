import { cfg, executedBy } from "../config.js";
import { domainTierByHost, existingBacklogTitles, insertBacklog, insertRun, nextBacklogNumber, recentSourcesForTopic, setJobProgress, type Job } from "../db.js";
import type { Executor } from "../executors/index.js";
import { buildClusterPrompt, CLUSTER_SCHEMA } from "@ear/pipeline";
import { hostOf, log } from "../util.js";
import { prepareAssets, workerRev } from "../assets.js";

interface ClusterOut {
  candidates: { id: string; mid_topic: string; title: string; summary: string; target_fit: string; angle: string; sources: { url: string; title: string; publisher: string; backbone: boolean }[]; dedup_note: string }[];
  reserve_notes: string[];
  dropped_notes: string[];
}

/** 군집화 (spec/03): 최근 스윕 메타데이터 → 주제 축 후보. 원문 접속 없음 (WebFetch 미허용). */
export async function runCluster(job: Job, ex: Executor) {
  const midTopic = String(job.payload.mid_topic ?? "");
  if (!midTopic) throw new Error("payload.mid_topic 필요");
  const sources = await recentSourcesForTopic(midTopic, Number(job.payload.days ?? 45), 400);
  if (sources.length < 3) throw new Error(`중분류 '${midTopic}' 최근 소스가 ${sources.length}건 — 군집화 불가`);
  const existing = await existingBacklogTitles();
  const nextN = await nextBacklogNumber();

  const { assetRoot } = await prepareAssets(null); // spec/03 반입 — 스냅샷 경로로 (spec/10 3.2)
  const prompt = buildClusterPrompt({ assetRoot, midTopic, nextIdNumber: nextN, sources, existingTitles: existing });
  log(`  cluster ${midTopic}: 소스 ${sources.length}건, 다음 ID C${nextN}`);
  const r = await ex.run<ClusterOut>({ prompt, schema: CLUSTER_SCHEMA, allowedTools: ["Read"], addDirs: [assetRoot], cwd: cfg.workRoot, timeoutMs: 25 * 60_000, model: cfg.claudeModel,
    onProgress: (pr) => setJobProgress(job.id, { ...pr, phase: `군집화 (소스 ${sources.length}건)` }).catch(() => {}),
    describe: (tool) => (tool === "Read" ? "군집화 기준 확인 중" : null),
  });

  const tiers = await domainTierByHost();
  const byUrl = new Map(sources.map((s) => [s.url, s]));
  const inserted: string[] = [];
  let n = nextN;
  for (const c of r.output.candidates) {
    const srcs = c.sources.filter((s) => byUrl.has(s.url)); // 메타데이터에 없는 URL(환각)은 버린다
    if (srcs.length < 3) { log(`  후보 '${c.title}' 유효 소스 ${srcs.length}건 — 제외`); continue; }
    const id = `C${n++}`;
    await insertBacklog({
      id, mid_topic: c.mid_topic || midTopic, title: c.title, summary: c.summary, target_fit: c.target_fit, angle: c.angle,
      sources: srcs.map((s) => { const meta = byUrl.get(s.url)!; return { url: s.url, tier: tiers.get(hostOf(s.url)) ?? tiers.get(meta.domain) ?? "candidate", title: meta.title, backbone: !!s.backbone, published: meta.published, publisher: meta.domain }; }),
      dedup_note: `${c.dedup_note} · 워커 군집화 ${job.id.slice(0, 8)} (${r.model ?? ex.kind})${cfg.pilotSweepCandidates ? " · 테스트: 계층 판정 전 — 뼈대 1군 요건 판정 후 확정" : ""}`,
    });
    inserted.push(`${id} ${c.title} (소스 ${srcs.length})`);
  }

  await insertRun({
    phase: "cluster",
    result: `중분류 ${midTopic} · 입력 ${sources.length}건 → 후보 ${inserted.length}건 proposed: ${inserted.join(" / ").slice(0, 900)}${r.output.reserve_notes.length ? ` · 예비: ${r.output.reserve_notes.join(" | ").slice(0, 400)}` : ""}${r.output.dropped_notes.length ? ` · 탈락: ${r.output.dropped_notes.join(" | ").slice(0, 400)}` : ""}`,
    prompt_version: "cluster-worker-v1 (주제 축 + 소스 5+ 표준)",
    executed_by: executedBy,
    model: r.model,
    cost_usd: r.listCostUsd, tokens: (r.raw as { usage?: unknown } | undefined)?.usage, worker_rev: workerRev(),
  });
  return { mid_topic: midTopic, input_sources: sources.length, candidates: inserted, reserve_notes: r.output.reserve_notes, dropped_notes: r.output.dropped_notes, model: r.model, list_cost_usd: r.listCostUsd };
}
