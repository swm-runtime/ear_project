import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { cfg, executedBy } from "../config.js";
import { getBacklog, getEpisode, insertRun, pool, setJobProgress, upsertEpisode, type Job } from "../db.js";
import { workerRev } from "../assets.js";
import { localPathOf, pullPrefix, pushPrefix, s3Key } from "../storage.js";
import { log } from "../util.js";
import { parseScriptForTts, chunkTurns, voiceOf, type ScriptTurn } from "../tts/script.js";
import { normalizeForTts, residualIssues } from "../tts/normalize.js";
import { synthDialogue, synthTurnWithTimestamps, locateExcerpt, type TimestampedSynth } from "../tts/elevenlabs.js";
import { assemble, cutSegment, segmentToWav, writeBuf, type Segment } from "../tts/audio.js";

/**
 * TTS 단계 (spec/06) — 다중화자 1콜(Text to Dialogue, eleven_v3) 확정 (2026-09-02).
 * 사람이 웹에서 명시적으로 요청할 때만 (자동 연쇄 없음). 흐름:
 *   대본 파싱 → 플레이스홀더 검사(잔존 시 중단) → 음차·숫자 정규화 → 잔존 영문 검사(중단) →
 *   턴 경계 분할(요청당 ~1,800자, 콜드오픈 원본 턴은 단독) → 합성(seed 고정) →
 *   콜드오픈 = 원본 턴 오디오에서 타임스탬프로 절단(재합성 금지) → 조립·정규화 → master.wav + dist.mp3 → S3 audio/
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
  const turns: ScriptTurn[] = (sampleTurns ? parsed.turns.filter((t) => !parsed.placeholders.some((p) => t.text.includes(p))).slice(0, sampleTurns) : parsed.turns)
    .map((t) => ({ ...t, text: normalizeForTts(t.text) }));
  const issues = turns.flatMap((t) => residualIssues(t.text).map((i) => `${t.id ?? t.section}: ${i}`));
  if (issues.length) {
    throw new Error(`정규화 후 잔존 — 음차 사전(apps/worker/src/tts/normalize.ts)에 추가 후 재시도 (spec/06 6장): ${[...new Set(issues)].slice(0, 12).join(" / ").slice(0, 800)}`);
  }

  // seed: 에피소드 고정 — 부분 재합성 시 같은 결과를 시도 (보장은 없음, spec/06)
  const seed = crypto.createHash("sha256").update(episodeId).digest().readUInt32BE(0) % 4294967295;
  const coldSource = !sampleTurns && parsed.coldOpen?.sourceTurn ? parsed.coldOpen.sourceTurn : null;
  const chunks = chunkTurns(turns, 1800, new Set(coldSource ? [coldSource] : []));
  log(`  tts ${episodeId}: ${sampleTurns ? `샘플 ${turns.length}턴` : `${turns.length}턴`} · 분할 ${chunks.length}요청 · seed ${seed}${coldSource ? ` · 콜드오픈 원본 ${coldSource} 단독` : ""}`);

  const segments: Segment[] = [];
  let coldOpenWav: string | undefined;
  let coldNote = "";
  for (let n = 0; n < chunks.length; n++) {
    const chunk = chunks[n];
    await progress(`합성 ${n + 1}/${chunks.length} (${chunk.reduce((s, t) => s + t.text.length, 0)}자)`);
    if (coldSource && chunk.length === 1 && chunk[0].id === coldSource) {
      // 콜드오픈 발췌 원본 턴 — 타임스탬프 합성으로 본편·콜드오픈에 같은 오디오를 쓴다 (spec/06 7장: 별도 합성 금지)
      const t = chunk[0];
      let ts: TimestampedSynth;
      try { ts = await synthTurnWithTimestamps(voiceOf(t.speaker), t.text, seed); }
      catch (e: any) {
        // with-timestamps 미지원 시: 단독 dialogue 요청으로 대체하고 콜드오픈은 턴 전체를 쓴다 (사유 기록 — 청취 확인에서 판단)
        log(`  tts: with-timestamps 실패(${String(e.message).slice(0, 120)}) — 턴 전체를 콜드오픈으로 사용`);
        const r = await synthDialogue([{ text: t.text, voice_id: voiceOf(t.speaker) }], seed, { onRetry: progress });
        segments.push(r);
        coldOpenWav = await segmentToWav(r, path.join(audioDir, "cold-open.wav"), path.join(audioDir, ".tmp"));
        coldNote = "콜드오픈=턴 전체(타임스탬프 미지원 폴백)";
        continue;
      }
      segments.push({ data: ts.audio, format: ts.format });
      const srcFile = path.join(audioDir, ".tmp-cold-src.mp3");
      await writeBuf(srcFile, ts.audio);
      const range = parsed.coldOpen ? locateExcerpt(ts, t.text, normalizeForTts(parsed.coldOpen.text)) : null;
      coldOpenWav = path.join(audioDir, "cold-open.wav");
      if (range) { await cutSegment(srcFile, Math.max(0, range.start - 0.05), range.end + 0.15, coldOpenWav); coldNote = `콜드오픈 절단 ${range.start.toFixed(1)}~${range.end.toFixed(1)}s`; }
      else { await cutSegment(srcFile, 0, 10_000, coldOpenWav); coldNote = "콜드오픈=턴 전체(발췌 위치 대조 실패 — 청취 확인 필요)"; }
      await fs.rm(srcFile, { force: true });
    } else {
      segments.push(await synthDialogue(chunk.map((t) => ({ text: t.text, voice_id: voiceOf(t.speaker) })), seed, { onRetry: progress }));
    }
  }

  await progress("조립·정규화 (ffmpeg)");
  const masterOut = path.join(audioDir, sampleTurns ? "sample-master.wav" : "master.wav");
  const distOut = path.join(audioDir, sampleTurns ? "sample.mp3" : "dist.mp3");
  const durationSec = await assemble({ coldOpenWav, segments, workDir: audioDir, masterOut, distOut });
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
  const result = `${sampleTurns ? `TTS 샘플 ${turns.length}턴` : "TTS 완료"} — eleven_v3 다중화자 1콜 · 분할 ${chunks.length}요청(세그먼트 포맷 ${fmt}) · ${totalChars}자 → ${min}분 ${sec}초${coldNote ? ` · ${coldNote}` : ""} · 보이스 윤아=${cfg.ttsVoiceYuna.slice(0, 6)}… 이음=${cfg.ttsVoiceEum.slice(0, 6)}… · 사람 청취 확인 대기 (spec/06 8장)`;
  await insertRun({ backlog_id: backlogId, phase: "tts", result, prompt_version: "tts-v1 (worker)", artifacts, executed_by: executedBy, worker_rev: workerRev() });
  return { episode_id: episodeId, sample: !!sampleTurns, duration_sec: Math.round(durationSec), chunks: chunks.length, chars: totalChars, format: fmt, cold_open: coldNote || null, artifacts };
}
