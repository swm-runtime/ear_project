import fs from "node:fs/promises";
import path from "node:path";
import { cfg, executedBy } from "../config.js";
import { getBacklog, getEpisode, insertRun, majorOfMidTopic, pool, setBacklogStatus, type Job } from "../db.js";
import { workerRev } from "../assets.js";
import { probeDurationSec } from "../tts/audio.js";
import { exists, localPathOf, pullPrefix, pushPrefix, s3Key } from "../storage.js";
import { log } from "../util.js";

/**
 * 패키지 단계 (spec/07 2장) — 발행 메타 upload-meta.json 산출 + 상태 packaged(사람 검수 대기) 전환.
 * 사람이 웹에서 명시적으로 요청 (자동 연쇄 없음). 제목·설명은 초안일 뿐 — 확정은 게이트 2 검수자가 한다.
 */
export async function runPackage(job: Job) {
  const episodeId = String(job.payload.episode_id ?? "");
  const backlogId = String(job.payload.backlog_id ?? "");
  const ep = await getEpisode(episodeId);
  const cand = await getBacklog(backlogId);
  if (!ep || !cand) throw new Error(`에피소드/백로그 없음: ${episodeId}/${backlogId}`);

  const rel = `episodes/${episodeId}`;
  await pullPrefix(`${rel}/`);
  const row = await pool.query(
    "select b.summary, b.status, e.script_key, e.claims_key, e.sources_key, e.qa_report_key, e.critic_report_key, e.audio_master_key, e.audio_dist_key from public.backlog b join public.episodes e on e.backlog_id = b.id where b.id = $1 and e.id = $2",
    [backlogId, episodeId],
  );
  const r = row.rows[0];
  if (!r) throw new Error(`백로그-에피소드 조인 실패: ${backlogId}/${episodeId}`);
  if (!["qa_passed", "packaged", "review_required"].includes(r.status) && r.status !== "published") {
    throw new Error(`패키지는 qa_passed 이후에만 (현재: ${r.status}) — 불변 원칙 6`);
  }

  const [major, explainer] = await Promise.all([
    majorOfMidTopic(cand.mid_topic),
    pool.query("select explainer from public.topics where mid = $1", [cand.mid_topic]).then((x) => (x.rows[0]?.explainer as string) ?? "이음"),
  ]);

  // 분량: 오디오가 있으면 실측, 없으면 대본 글자수 환산 (350자/분 — spec/04 잠정값)
  let durationMin: number | null = null;
  const distLocal = localPathOf(r.audio_dist_key);
  if (distLocal && (await exists(distLocal))) durationMin = Math.round((await probeDurationSec(distLocal)) / 60);
  else if (localPathOf(ep.script_key) && (await exists(localPathOf(ep.script_key)!))) {
    const md = await fs.readFile(localPathOf(ep.script_key)!, "utf-8");
    durationMin = Math.round(md.replace(/[^가-힣A-Za-z0-9]/g, "").length / 350);
  }

  const meta = {
    episode_id: episodeId,
    backlog_id: backlogId,
    title: cand.title,                       // 초안 — 게이트 2 검수에서 확정 (클릭베이트 금지)
    description: (r.summary as string) ?? "",
    major_topic: major,
    mid_topic: cand.mid_topic,
    explainer,
    host: explainer === "윤아" ? "이음" : "윤아",
    duration_min_estimate: durationMin,
    sources: cand.sources.map((s) => ({ publisher: s.publisher, title: s.title, url: s.url })), // 노출 표기 규격은 미결 #16
    artifacts: {
      script: r.script_key, claims: r.claims_key, sources: r.sources_key,
      qa_report: r.qa_report_key, critic_report: r.critic_report_key,
      audio_master: r.audio_master_key, audio_dist: r.audio_dist_key,
    },
    prompt_version: ep.prompt_version,
    asset_versions: ep.asset_versions ?? null,
    packaged_at: new Date().toISOString(),
    packaged_by: executedBy,
  };
  const metaPath = path.join(cfg.workRoot, rel, "upload-meta.json");
  await fs.writeFile(metaPath, JSON.stringify(meta, null, 2), "utf-8");
  await pushPrefix(`${rel}/`);

  if (r.status === "qa_passed") await setBacklogStatus(backlogId, "packaged");
  const metaKey = s3Key(`${rel}/upload-meta.json`);
  log(`  package ${episodeId}: upload-meta.json → ${metaKey}${r.status === "qa_passed" ? " · 상태 packaged(게이트 2 대기)" : ""}`);
  await insertRun({
    backlog_id: backlogId, phase: "package",
    result: `패키지 완료 — 제목·설명 초안, 소스 ${meta.sources.length}건, 분량 ${durationMin ?? "?"}분, 오디오 ${r.audio_dist_key ? "있음" : "없음(TTS 전)"} · 게이트 2 검수 대기`,
    prompt_version: "package-v1 (worker)", artifacts: [metaKey], executed_by: executedBy, worker_rev: workerRev(),
  });
  return { episode_id: episodeId, meta_key: metaKey, duration_min: durationMin, status_after: r.status === "qa_passed" ? "packaged" : r.status };
}
