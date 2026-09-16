import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { cfg, executedBy } from "../config.js";
import { getBacklog, getEpisode, insertRun, pool, setJobProgress, upsertEpisode, type Job } from "../db.js";
import { loadTtsDict, workerRev } from "../assets.js";
import { listPrefix, localPathOf, pullPrefix, pushPrefix, s3Key } from "../storage.js";
import { advanceChain } from "../chain.js";
import { log } from "../util.js";
import { parseScriptForTts, chunkTurns, voiceOf, type ScriptTurn } from "../tts/script.js";
import { normalizeForTts, residualIssues } from "../tts/normalize.js";
import { synthDialogue, synthDialogueWithTimestamps, locateTurnStarts } from "../tts/elevenlabs.js";
import { assemble, retimePieces, writeBuf, type Segment } from "../tts/audio.js";

/**
 * TTS 단계 (spec/06) — 다중화자 1콜(Text to Dialogue, eleven_v3) 확정 (2026-09-02).
 * 사람이 웹에서 명시적으로 요청할 때만 (자동 연쇄 없음). 흐름:
 *   대본 파싱 → 플레이스홀더 검사(잔존 시 중단) → 음차·숫자 정규화 → 잔존 영문 검사(중단) →
 *   턴 경계 분할(요청당 ~1,800자) → 합성(seed 고정) → [화자별 배속: with-timestamps 정렬로 턴 경계를 잡아 atempo] →
 *   조립(앞뒤 2초 무음)·정규화 → master.wav + dist.mp3 → S3 audio/
 * 콜드오픈은 2026-09-07 폐지 — 구 대본에 [콜드오픈] 구역이 남아 있어도 합성하지 않는다(파서가 분리해 둔 것을 버린다).
 * payload.sample_turns = N: 도입부 N턴만 audio/sample.mp3 로 (보이스·태그 청취 확인용 — 발행 경로 아님, 키 미기록)
 */
export async function runTts(job: Job) {
  const episodeId = String(job.payload.episode_id ?? "");
  const backlogId = String(job.payload.backlog_id ?? "");
  const sampleTurns = Number(job.payload.sample_turns ?? 0);
  const ep = await getEpisode(episodeId);
  const cand = await getBacklog(backlogId);
  if (!ep || !cand) throw new Error(`에피소드/백로그 없음: ${episodeId}/${backlogId}`);

  const st = (await pool.query("select status from public.backlog where id = $1", [backlogId])).rows[0]?.status as string;
  if (!sampleTurns && !["qa_passed", "packaged", "published"].includes(st)) throw new Error(`TTS 는 qa_passed 이후에만 (현재: ${st}) — spec/06 9장`);

  const rel = `episodes/${episodeId}`;

  /**
   * 연쇄에서의 건너뛰기 (KAN-50 3번) — **실제 과금 단계라 중복 합성을 막는다.**
   * 음원이 있고 그 뒤로 대본이 바뀌지 않았으면 건너뛴다. 대본을 고쳤으면 다시 합성한다.
   * 사람이 [음원 다시 변환]을 누른 경우(`force`)와 샘플은 이 규칙을 적용하지 않는다.
   */
  if (!sampleTurns && !job.payload.force && ep.audio_dist_key && (await audioIsFresh(rel, ep.script_key))) {
    log(`  tts ${episodeId}: 음원이 대본보다 새로움 — 건너뜀`);
    const skipNext = await advanceChain(job);
    return { episode_id: episodeId, skipped: true, next: skipNext?.type ?? null };
  }

  const audioDir = path.join(cfg.workRoot, rel, "audio");
  await fs.mkdir(audioDir, { recursive: true });
  await pullPrefix(`${rel}/`);
  const scriptFile = localPathOf(ep.script_key);
  if (!scriptFile) throw new Error(`대본 키가 없습니다: ${episodeId}`);
  const md = await fs.readFile(scriptFile, "utf-8");
  const parsed = parseScriptForTts(md);
  if (parsed.turns.length < 4) throw new Error(`합성할 턴이 ${parsed.turns.length}개 — 대본 파싱 실패 가능 (${ep.script_key})`);

  const progress = (detail: string) => setJobProgress(job.id, { phase: sampleTurns ? `TTS 샘플 (${sampleTurns}턴)` : "TTS 합성", detail, elapsedMs: 0, toolCounts: {}, turns: 0 }).catch(() => {});

  // ── 검증 (spec/06 4장) ──
  if (!sampleTurns && parsed.placeholders.length) {
    throw new Error(`플레이스홀더 잔존 — 합성 중단 (spec/06 4장). 웹의 턴 수정으로 실제 문구를 채운 뒤 다시 요청: ${[...new Set(parsed.placeholders)].join(" · ").slice(0, 300)}`);
  }
  // 병합 음차 사전 (spec/06 6장): 전역(DB active — 에피소드 고정 없음) + 에피소드 발음 맵. 겹치면 전역이 이긴다
  const { version: dictVersion, entries: globalDict } = await loadTtsDict();
  const epMap = await readEpisodePronunciations(path.join(cfg.workRoot, rel, "pronunciations.json"));
  const dict = { ...epMap, ...globalDict };
  const turns: ScriptTurn[] = (sampleTurns ? parsed.turns.filter((t) => !parsed.placeholders.some((p) => t.text.includes(p))).slice(0, sampleTurns) : parsed.turns)
    .map((t) => ({ ...t, text: normalizeForTts(t.text, dict) }));
  const issues = turns.flatMap((t) => residualIssues(t.text).map((i) => `${t.id ?? t.section}: ${i}`));
  if (issues.length) {
    throw new Error(`정규화 후 잔존 — 에피소드 "발음" 탭(발음 맵) 또는 /assets 의 TTS 음차 사전에 추가 후 재시도 (spec/06 6장, 코드 배포 불필요): ${[...new Set(issues)].slice(0, 12).join(" / ").slice(0, 800)}`);
  }

  // seed: 에피소드 고정 — 부분 재합성 시 같은 결과를 시도 (보장은 없음, spec/06)
  const seed = crypto.createHash("sha256").update(episodeId).digest().readUInt32BE(0) % 4294967295;
  if (parsed.coldOpen) log(`  tts ${episodeId}: [콜드오픈] 구역 무시 (2026-09-07 폐지 — 인트로부터 합성)`);
  const chunks = chunkTurns(turns, 1800);
  log(`  tts ${episodeId}: ${sampleTurns ? `샘플 ${turns.length}턴` : `${turns.length}턴`} · 분할 ${chunks.length}요청 · seed ${seed}`);

  // 화자별 배속 (spec/06 6장): 다중화자 API 에 속도 설정이 없어, 타임스탬프 정렬로 턴 경계를 잡고 화자 구간만 atempo 한다
  const speedOf = (sp: ScriptTurn["speaker"]) => (sp === "윤아" ? cfg.ttsSpeedYuna : cfg.ttsSpeedEum);
  const wantSpeed = Math.abs(cfg.ttsSpeedYuna - 1) > 0.001 || Math.abs(cfg.ttsSpeedEum - 1) > 0.001;
  let speedFallbacks = 0;
  const segments: Segment[] = [];
  for (let n = 0; n < chunks.length; n++) {
    const chunk = chunks[n];
    const inputs = chunk.map((t) => ({ text: t.text, voice_id: voiceOf(t.speaker) }));
    await progress(`합성 ${n + 1}/${chunks.length} (${chunk.reduce((s, t) => s + t.text.length, 0)}자)`);
    if (!wantSpeed) { segments.push(await synthDialogue(inputs, seed, { onRetry: progress })); continue; }
    try {
      const ts = await synthDialogueWithTimestamps(inputs, seed, { onRetry: progress });
      const starts = locateTurnStarts(ts, chunk.map((t) => t.text));
      if (!starts) throw new Error("턴 경계를 정렬에서 찾지 못함");
      const src = path.join(audioDir, ".tmp", `chunk-${n}.mp3`);
      await writeBuf(src, ts.audio);
      // 조각 = [이 턴 시작, 다음 턴 시작). 첫 조각은 0 부터, 마지막은 끝까지 — 턴 사이 쉼은 뒤 턴의 화자 배속을 따른다
      const pieces = chunk.map((t, i) => ({ start: i === 0 ? 0 : starts[i], end: i < chunk.length - 1 ? starts[i + 1] : undefined, tempo: speedOf(t.speaker) }));
      segments.push({ data: await retimePieces(src, pieces, path.join(audioDir, ".tmp")), format: "pcm_44100" });
      await fs.rm(src, { force: true });
    } catch (e: any) {
      // 배속 실패는 합성 실패가 아니다 — 이 요청만 원속으로 폴백하고 기록에 남긴다 (청취 확인에서 판단)
      speedFallbacks++;
      log(`  tts ${episodeId}: 요청 ${n + 1} 화자별 배속 실패(${String(e.message).slice(0, 120)}) — 원속 폴백`);
      segments.push(await synthDialogue(inputs, seed, { onRetry: progress }));
    }
  }

  await progress("조립·정규화 (ffmpeg)");
  const masterOut = path.join(audioDir, sampleTurns ? "sample-master.wav" : "master.wav");
  const distOut = path.join(audioDir, sampleTurns ? "sample.mp3" : "dist.mp3");
  const durationSec = await assemble({ segments, workDir: audioDir, masterOut, distOut }); // 앞뒤 무음 2초는 assemble 기본값
  if (sampleTurns) await fs.rm(masterOut, { force: true }); // 샘플은 mp3 만 남긴다

  await progress("S3 업로드");
  await pushPrefix(`${rel}/`);
  const totalChars = turns.reduce((s, t) => s + t.text.length, 0);
  const fmt = segments[0]?.format ?? "?";
  const min = Math.floor(durationSec / 60), sec = Math.round(durationSec % 60);

  if (!sampleTurns) {
    await upsertEpisode({ id: episodeId, backlog_id: backlogId, prompt_version: ep.prompt_version, audio_master_key: s3Key(`${rel}/audio/master.wav`), audio_dist_key: s3Key(`${rel}/audio/dist.mp3`) });
  }
  const artifacts = sampleTurns ? [s3Key(`${rel}/audio/sample.mp3`)] : [s3Key(`${rel}/audio/master.wav`), s3Key(`${rel}/audio/dist.mp3`)];
  const result = `${sampleTurns ? `TTS 샘플 ${turns.length}턴` : "TTS 완료"} — eleven_v3 다중화자 1콜 · 분할 ${chunks.length}요청(세그먼트 포맷 ${fmt}) · ${totalChars}자 → ${min}분 ${sec}초 (앞뒤 무음 2초 포함)${wantSpeed ? ` · 배속 윤아 ${cfg.ttsSpeedYuna}× 이음 ${cfg.ttsSpeedEum}×${speedFallbacks ? ` (원속 폴백 ${speedFallbacks}요청 — 청취 확인)` : ""}` : ""}${parsed.coldOpen ? " · 구 [콜드오픈] 구역 무시(폐지)" : ""} · 사전 ${dictVersion}${Object.keys(epMap).length ? `+발음 맵 ${Object.keys(epMap).length}건` : ""} · 보이스 윤아=${cfg.ttsVoiceYuna.slice(0, 6)}… 이음=${cfg.ttsVoiceEum.slice(0, 6)}… · 사람 청취 확인 대기 (spec/06 8장)`;
  // 계측: TTS 의 "토큰"은 글자수(ElevenLabs 과금 단위). 비용은 요율(cfg.ttsUsdPer1kChars)이 설정됐을 때만 환산(참고값), 아니면 비운다
  const ttsCost = cfg.ttsUsdPer1kChars != null ? (totalChars / 1000) * cfg.ttsUsdPer1kChars : undefined;
  await insertRun({ backlog_id: backlogId, phase: "tts", result, prompt_version: "tts-v1 (worker)", artifacts, executed_by: executedBy, model: cfg.ttsModel, cost_usd: ttsCost, tokens: { characters: totalChars, chunks: chunks.length, duration_sec: Math.round(durationSec) }, worker_rev: workerRev() });
  // 샘플은 발행 경로가 아니다 — 연쇄를 잇지 않는다
  const next = sampleTurns ? null : await advanceChain(job);
  return { episode_id: episodeId, sample: !!sampleTurns, duration_sec: Math.round(durationSec), chunks: chunks.length, chars: totalChars, format: fmt, artifacts, next: next?.type ?? null };
}

/**
 * 음원이 대본보다 새로운가 — S3 의 LastModified 로 판정한다.
 *
 * WORK_ROOT 는 캐시라 로컬 파일 시각을 믿을 수 없다(다른 워커가 만든 산출물은 내려받은 시각이 찍힌다).
 * 대본을 못 찾으면 **음원이 있는 것만으로 건너뛴다** — 대본 없이 합성됐을 리 없으므로 조회 실패로 본다.
 */
async function audioIsFresh(rel: string, scriptKey: string | null): Promise<boolean> {
  const objs = await listPrefix(`${rel}/`, 1000);
  const at = (key: string) => objs.find((o) => o.key === key)?.lastModified?.getTime();
  const audioAt = at(`${rel}/audio/master.wav`);
  if (audioAt === undefined) return false;
  const scriptAt = at(String(scriptKey ?? "").replace(/^s3:/, ""));
  return scriptAt === undefined || scriptAt <= audioAt;
}

/** 에피소드 발음 맵 (spec/04 8장) — 없으면 빈 맵 (구 에피소드 호환). 깨진 JSON 은 조용히 넘기지 않는다 — 웹 "발음" 탭에서 고친다 */
async function readEpisodePronunciations(file: string): Promise<Record<string, string>> {
  const raw = await fs.readFile(file, "utf-8").catch(() => null);
  if (raw == null || !raw.trim()) return {};
  let parsed: unknown;
  try { parsed = JSON.parse(raw); }
  catch { throw new Error(`pronunciations.json 이 JSON 이 아니다 — 에피소드 "발음" 탭에서 {"표기": "발음"} 객체로 고친 뒤 재시도`); }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error(`pronunciations.json 은 {"표기": "발음"} 객체여야 한다 — 에피소드 "발음" 탭에서 수정`);
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(parsed)) {
    if (!k.trim() || typeof v !== "string" || !v.trim()) throw new Error(`pronunciations.json 항목이 잘못됐다 ("${k}": ${JSON.stringify(v)}) — 값은 비어 있지 않은 문자열`);
    out[k] = v;
  }
  return out;
}
