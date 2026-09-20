import fs from "node:fs/promises";
import path from "node:path";
import { cfg, executedBy } from "../config.js";
import { getEpisode, insertRun, setJobProgress, type Job } from "../db.js";
import { localPathOf, pullPrefix, pushPrefix, s3Key } from "../storage.js";
import { workerRev } from "../assets.js";
import { log } from "../util.js";
import { parseScriptForTts } from "../tts/script.js";
import { normalizeForTts } from "../tts/normalize.js";
import { loadTtsDict } from "../assets.js";
import { readEpisodePronunciations } from "./tts.js";
import { forcedAlignment, locateTurnStarts, type TimestampedSynth } from "../tts/elevenlabs.js";
import { probeDurationSec } from "../tts/audio.js";
import { chunkSegments, joinChunkSegments, validateSegments } from "../tts/segments.js";

/**
 * 자막 세그먼트 소급 (KAN-72 후속, spec/06 7장) — 발행본 dist.mp3 와 대본을 강제 정렬해 script-segments.json 을 만든다.
 *
 * - 오디오를 다시 합성하지 않는다. 정렬 시각이 곧 배포본 시각이라 배속·무음 오프셋 계산이 필요 없다.
 * - 정렬에 보내는 글은 합성 때와 같은 규칙으로 정규화한 표기(음차 사전 + 발음 맵)다 — 실제로 읽힌 소리와 맞춘다. 세그먼트의 text 는 원문.
 * - 턴 경계를 정렬에서 못 찾으면 실패시킨다 — 틀린 자막보다 없는 편(spec/06 7장).
 * - 산출물만 만든다. 제품 반영(script_file 단독 PATCH — 버전 무변경)은 콘솔이 브라우저 세션으로 (발행 목록 [반영]).
 * payload: { episode_id, content_id?, backlog_id? }
 */
export async function runScriptAlign(job: Job) {
  const episodeId = String(job.payload.episode_id ?? "");
  const contentId = job.payload.content_id ? String(job.payload.content_id) : null;
  if (!/^[A-Za-z0-9-]{1,64}$/.test(episodeId)) throw new Error("payload.episode_id 필요");
  const ep = await getEpisode(episodeId);
  if (!ep) throw new Error(`에피소드 없음: ${episodeId}`);
  if (!ep.audio_dist_key) throw new Error(`발행본 오디오가 없음: ${episodeId} — TTS 이후에`);
  if (!ep.script_key) throw new Error(`대본 키가 없음: ${episodeId}`);
  const rel = `episodes/${episodeId}`;
  const progress = (detail: string) => setJobProgress(job.id, { phase: "자막 정렬", detail, elapsedMs: 0, toolCounts: {}, turns: 0 }).catch(() => {});

  await progress("산출물 내려받기");
  await pullPrefix(`${rel}/`);
  const distFile = localPathOf(ep.audio_dist_key)!;
  const scriptFile = localPathOf(ep.script_key)!;
  const md = await fs.readFile(scriptFile, "utf-8");
  const parsed = parseScriptForTts(md);
  if (parsed.turns.length < 4) throw new Error(`턴이 ${parsed.turns.length}개 — 대본 파싱 실패 가능`);
  const { version: dictVersion, entries: globalDict } = await loadTtsDict();
  const epMap = await readEpisodePronunciations(path.join(cfg.workRoot, rel, "pronunciations.json"));
  const dict = { ...epMap, ...globalDict };
  const turns = parsed.turns.map((t) => ({ speaker: t.speaker as string, text: t.text, ttsText: normalizeForTts(t.text, dict), tempo: 1 }));

  await progress(`강제 정렬 요청 (ElevenLabs, ${turns.length}턴)`);
  const audio = await fs.readFile(distFile);
  const started = Date.now();
  const al = await forcedAlignment(audio, turns.map((t) => t.ttsText).join("\n"));
  const ts: TimestampedSynth = { audio: Buffer.alloc(0), format: "mp3_44100_128", chars: al.characters.map((c) => c.text), startSec: al.characters.map((c) => c.start), endSec: al.characters.map((c) => c.end) };
  if (!ts.chars.length) throw new Error("정렬 결과가 비어 있음");
  const starts = locateTurnStarts(ts, turns.map((t) => t.ttsText));
  if (!starts) throw new Error("턴 경계를 정렬에서 찾지 못함 — 세그먼트를 만들지 않는다 (틀린 자막보다 없는 편, spec/06 7장)");
  const durSec = await probeDurationSec(distFile);
  const segments = joinChunkSegments([{ segments: chunkSegments(turns, ts, starts, durSec), durSec }], 0, 0);
  const bad = validateSegments(segments);
  if (bad) throw new Error(`세그먼트 검증 실패: ${bad}`);

  const outFile = path.join(cfg.workRoot, rel, "script-segments.json");
  await fs.writeFile(outFile, JSON.stringify(segments, null, 1), "utf-8");
  await progress("S3 업로드");
  await pushPrefix(`${rel}/`);
  const key = s3Key(`${rel}/script-segments.json`);
  const sec = Math.round((Date.now() - started) / 1000);
  const result = `자막 정렬 완료 — 강제 정렬(ElevenLabs) ${turns.length}턴 → 세그먼트 ${segments.length}건 · 배포본 ${Math.round(durSec)}초 · 정렬 손실 ${al.loss.toFixed(3)} · ${sec}초 · 사전 ${dictVersion}${Object.keys(epMap).length ? `+발음 맵 ${Object.keys(epMap).length}건` : ""}${contentId ? ` · 콘텐츠 ${contentId.slice(0, 8)}… (반영은 콘솔 [반영])` : ""}`;
  log(`  script_align ${episodeId}: ${result}`);
  await insertRun({ backlog_id: ep.backlog_id, phase: "script_align", result, prompt_version: "align-v1 (worker)", artifacts: [key], executed_by: executedBy, model: "elevenlabs/forced-alignment", worker_rev: workerRev() });
  return { episode_id: episodeId, content_id: contentId, segments: segments.length, duration_sec: Math.round(durSec), loss: al.loss, key };
}
