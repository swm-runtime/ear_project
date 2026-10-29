import fs from "node:fs/promises";
import path from "node:path";
import { otherSpeaker, pipelineLocale, speakerNames } from "@ear/pipeline";
import { cfg, executedBy } from "../config.js";
import { enqueue, getBacklog, getEpisode, insertRun, majorOfMidTopic, pool, setBacklogStatus, type Job } from "../db.js";
import { workerRev } from "../assets.js";
import { probeDurationSec } from "../tts/audio.js";
import { exists, localPathOf, pullPrefix, pushPrefix, s3Key } from "../storage.js";
import { log } from "../util.js";
import { countWords, WORDS_PER_MIN_EN } from "../script-length.js";
import { parseScriptForTts } from "../tts/script.js";
import { agentGateBlockers } from "./agent-gate.js";
import { recentTitlesEn, writeTitleEn, type TitleResult } from "./package-title.js";

/** topics.explainer 가 비었을 때의 해설 — 한국판은 종전 그대로 이음, 글로벌판은 역할 고정이라 첫째 진행자(글로벌 명세 6.4) */
const defaultExplainer = (): string => (pipelineLocale() === "en" ? speakerNames()[0] : "이음");

/**
 * 패키지 단계 (spec/07 2장) — 발행 메타 upload-meta.json 산출 + 상태 packaged(사람 검수 대기) 전환.
 * 발행 준비 연쇄(tts → thumbnail → package)의 마지막 — 사람의 [발행 준비] 또는 비평 뒤 자동(automation.ts, 2026-09-23).
 * 제목·설명은 초안일 뿐 — 확정은 게이트 2 검수자가 한다. 글로벌판은 게이트 2 가 자동이라 제목을 여기서 짓는다(package-title.ts, 2026-10-23) — 주제("Why …")를 그대로 쓰지 않는다.
 * 추천 메타(enrich)는 여기서 자동으로 걸지 않는다(2026-09-23 개정) — 발행하지 않을 편까지 뽑는 낭비를 막기 위해 업로드 화면의 [추천 메타 뽑기]로 사람이 건다.
 * payload.enrich === true 일 때만 이어서 건다 (구 경로 호환).
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
    "select b.summary, b.status, e.one_liner, e.script_key, e.claims_key, e.sources_key, e.qa_report_key, e.critic_report_key, e.audio_master_key, e.audio_dist_key, e.thumbnail_key, e.critic_verdicts from public.backlog b join public.episodes e on e.backlog_id = b.id where b.id = $1 and e.id = $2",
    [backlogId, episodeId],
  );
  const r = row.rows[0];
  if (!r) throw new Error(`백로그-에피소드 조인 실패: ${backlogId}/${episodeId}`);
  if (!["qa_passed", "packaged", "review_required"].includes(r.status) && r.status !== "published") {
    throw new Error(`패키지는 qa_passed 이후에만 (현재: ${r.status}) — 불변 원칙 6`);
  }
  // 글로벌판(명세 6.10): 에이전트 판정이 발행 가능이고 필수 수정이 전부 반영된 편만 패키지를 만든다. 이미 발행된 편의 재패키지(재발행)는 막지 않는다. 한국판은 타지 않는다
  if (pipelineLocale() === "en" && r.status !== "published") {
    const blockers = agentGateBlockers(r.critic_verdicts);
    if (blockers.length) throw new Error(`패키지 중단 — ${blockers.join(" · ")} (글로벌 명세 6.10)`);
  }

  // 글로벌판(KAN-202, global-api 4.9 · 글로벌 명세 6.9): 주제 1~2개(대표 먼저)와 market·language 를 싣는다 — 콘솔이 발행 payload 로 옮긴다. 한국판은 키를 더하지 않는다
  const global = pipelineLocale() === "en"
    ? { market: "global" as const, language: "en" as const, topics: [cand.mid_topic, ...(await pool.query("select sub_topic from public.backlog where id = $1", [backlogId]).then((x) => (x.rows[0]?.sub_topic as string | null) ?? null).then((v) => (v && v !== cand.mid_topic ? [v] : [])))] }
    : null;
  // 시리즈 편(spec/11 7장 "패키지: upload-meta.json 에 시리즈 필드를 싣는다") — 파이프라인 시리즈 id·화 번호·편수·이름. 제품 series_id 는 [시리즈 발행]이 만들 때 정해져 여기에 없다
  const series = await pool.query("select b.series_no, s.id, s.name, s.total_episodes from public.backlog b join public.series s on s.id = b.series_id where b.id = $1", [backlogId])
    .then((x) => (x.rows[0] ? { id: x.rows[0].id as string, name: x.rows[0].name as string, no: x.rows[0].series_no as number, total: (x.rows[0].total_episodes as number | null) ?? null } : null));
  const [major, explainer] = await Promise.all([
    majorOfMidTopic(cand.mid_topic),
    pool.query("select explainer from public.topics where mid = $1", [cand.mid_topic]).then((x) => (x.rows[0]?.explainer as string) ?? defaultExplainer()),
  ]);

  // 분량: 오디오가 있으면 실측, 없으면 대본 글자수 환산 (341자/분 — eleven_v4 실측, spec/04)
  let durationMin: number | null = null;
  const distLocal = localPathOf(r.audio_dist_key);
  if (distLocal && (await exists(distLocal))) durationMin = Math.round((await probeDurationSec(distLocal)) / 60);
  else if (localPathOf(ep.script_key) && (await exists(localPathOf(ep.script_key)!))) {
    const md = await fs.readFile(localPathOf(ep.script_key)!, "utf-8");
    // 글로벌판: 발화 턴 단어 수 ÷ 150 (잠정 — 파일럿 3편 실측 후 확정, script-length.ts · KAN-203)
    durationMin = pipelineLocale() === "en"
      ? Math.round(parseScriptForTts(md).turns.reduce((n, t) => n + countWords(t.text), 0) / WORDS_PER_MIN_EN)
      : Math.round(md.replace(/[^가-힣A-Za-z0-9]/g, "").length / 341);
  }

  // 글로벌판 제목 — 확정 대본과 최근 제목 10개로 따로 짓는다(글로벌 명세 6.9, 2026-10-23). 한국판은 종전대로 주제 제목안(게이트 2 에서 사람이 확정)
  let titleEn: TitleResult | null = null;
  if (pipelineLocale() === "en") {
    const scriptLocal = localPathOf(ep.script_key);
    const scriptMd = scriptLocal && (await exists(scriptLocal)) ? await fs.readFile(scriptLocal, "utf-8") : null;
    if (!scriptMd) throw new Error(`대본이 없어 제목을 지을 수 없음 (${ep.script_key ?? "script_key 없음"})`);
    const recent = await recentTitlesEn(episodeId);
    titleEn = await writeTitleEn({ episodeId, topicTitle: cand.title, midTopic: cand.mid_topic, oneLiner: (r.one_liner as string | null) ?? null, scriptMd, recentTitles: recent });
    log(`  package ${episodeId}: 제목 "${titleEn.title}" (${titleEn.form}${titleEn.attempts > 1 ? ", 2차" : ""}${titleEn.violations.length ? `, 위반 남음: ${titleEn.violations.join("; ")}` : ""}) ← 주제 "${cand.title}"`);
    await fs.writeFile(path.join(cfg.workRoot, rel, "title.json"), JSON.stringify({ title: titleEn.title, form: titleEn.form, alternatives: titleEn.alternatives, why: titleEn.why, topic_title: cand.title, recent_titles: recent, violations: titleEn.violations, prompt_version: titleEn.promptVersion, model: titleEn.model, at: new Date().toISOString() }, null, 2) + "\n", "utf-8");
  }

  const meta = {
    episode_id: episodeId,
    backlog_id: backlogId,
    title: titleEn?.title ?? cand.title,     // 한국판: 초안 — 게이트 2 검수에서 확정 (클릭베이트 금지) · 글로벌판: 위에서 지은 제목
    // 설명 첫 줄은 한 줄 요약(KAN-50 3-1) — 축 해설(summary)은 백로그의 기획 언어라 청취자에게 그대로 보이기엔 딱딱하다.
    // 요약이 없는 구 에피소드는 종전대로 축 해설만 들어간다
    description: [r.one_liner, r.summary].filter((v) => typeof v === "string" && v.trim()).join("\n\n"),
    one_liner: (r.one_liner as string) ?? null,
    major_topic: major,
    mid_topic: cand.mid_topic,
    ...(global ?? {}),
    ...(series ? { series } : {}),
    explainer,
    host: otherSpeaker(explainer),
    duration_min_estimate: durationMin,
    // 0040 (KAN-296): 길이 프로필과 재제작 원본 — short 는 새 앱 배포 뒤 가입 코호트에만 나간다(BE 분리). 원본의 제품 content_id 를 함께 싣는다(BE 변형 연결용)
    length_profile: cand.length_profile ?? "standard",
    ...(cand.remake_of ? { remake_of: cand.remake_of, remake_of_content_ref: (await pool.query("select published_content_ref from public.backlog where id = $1", [cand.remake_of])).rows[0]?.published_content_ref ?? null } : {}),
    sources: cand.sources.map((s) => ({ publisher: s.publisher, title: s.title, url: s.url })), // 노출 표기 규격은 미결 #16
    // 업로드 화면이 썸네일을 미리 채울 때 쓴다(KAN-50 4번). 실제 바이트는 /api/publish 가 S3 에서 중계한다
    thumbnail_key: r.thumbnail_key ?? null,
    artifacts: {
      script: r.script_key, claims: r.claims_key, sources: r.sources_key,
      qa_report: r.qa_report_key, critic_report: r.critic_report_key,
      audio_master: r.audio_master_key, audio_dist: r.audio_dist_key,
      thumbnail: r.thumbnail_key ?? null,
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
    result: `패키지 완료 — ${titleEn ? `제목 "${titleEn.title}"(${titleEn.form}${titleEn.violations.length ? `, 규칙 위반 남음: ${titleEn.violations.join("; ")}` : ""}) · ` : "제목·설명 초안, "}소스 ${meta.sources.length}건, 분량 ${durationMin ?? "?"}분, 오디오 ${r.audio_dist_key ? "있음" : "없음(TTS 전)"}, 썸네일 ${r.thumbnail_key ? "있음" : "없음"} · 게이트 2 검수 대기`,
    prompt_version: titleEn ? `package-v2 (worker) · ${titleEn.promptVersion}` : "package-v1 (worker)", artifacts: [metaKey, ...(titleEn ? [s3Key(`${rel}/title.json`)] : [])], executed_by: executedBy, worker_rev: workerRev(),
    model: titleEn?.model ?? null, cost_usd: titleEn ? titleEn.costUsd : null,
  });
  // 추천 메타는 요청이 있을 때만 (2026-09-23 개정 — 기본은 업로드 화면에서 사람이 건다, metadata-pipeline 2장)
  const enrichJobId = job.payload.enrich !== true ? null : await enqueue({ type: "enrich", requires_ai: true, payload: { episode_id: episodeId, backlog_id: backlogId }, parent_job_id: job.id }).catch((e) => { log(`  package ${episodeId}: enrich 작업 생성 실패 (${String(e?.message ?? e).slice(0, 80)})`); return null; });
  // 검수 대기 알림은 편마다 보내지 않는다 — 큐가 비면 요약 알림(digest.ts)에 묶여 나간다
  return { episode_id: episodeId, meta_key: metaKey, duration_min: durationMin, status_after: r.status === "qa_passed" ? "packaged" : r.status, enrich_job_id: enrichJobId };
}
