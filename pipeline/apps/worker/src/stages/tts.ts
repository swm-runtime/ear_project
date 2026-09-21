import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { cfg, executedBy } from "../config.js";
import { getBacklog, getEpisode, insertRun, pool, setJobProgress, upsertEpisode, type Job } from "../db.js";
import { loadTtsDict, workerRev } from "../assets.js";
import { listPrefix, localPathOf, pullPrefix, pushPrefix, s3Key } from "../storage.js";
import { advanceChain } from "../chain.js";
import { log } from "../util.js";
import { parseScriptForTts, chunkTurns, describeCuts, type ScriptTurn, type Speaker } from "../tts/script.js";
import { normalizeForTts, residualIssues } from "../tts/normalize.js";
import { synthDialogue, synthDialogueWithTimestamps, locateTurnSpans } from "../tts/elevenlabs.js";
import { assemble, retimePieces, writeBuf, type Segment } from "../tts/audio.js";
import { chunkSegments, contextExcerpt, joinChunkSegments, naturalGapSec, validateSegments, type ScriptSegment } from "../tts/segments.js";

/**
 * TTS 단계 (spec/06) — 다중화자 1콜(Text to Dialogue, eleven_v3) 확정 (2026-09-02).
 * 사람이 웹에서 명시적으로 요청할 때만 (자동 연쇄 없음). 흐름:
 *   대본 파싱 → 플레이스홀더 검사(잔존 시 중단) → 음차·숫자 정규화 → 잔존 영문 검사(중단) →
 *   턴 경계 분할(요청당 ~1,800자) → 합성(seed 고정) → [화자별 배속: with-timestamps 정렬로 턴 경계를 잡아 atempo] →
 *   조립(앞뒤 2초 무음)·정규화 → master.wav + dist.mp3 → S3 audio/
 *   + 대본 세그먼트 script-segments.json (앱 자막, KAN-72 — 배속 정렬을 배포본 시각으로 옮긴 것. 정렬을 못 잡은 편은 싣지 않는다)
 * 콜드오픈은 2026-09-07 폐지 — 구 대본에 [콜드오픈] 구역이 남아 있어도 합성하지 않는다(파서가 분리해 둔 것을 버린다).
 * payload.sample_turns = N: 도입부 N턴만 audio/sample.mp3 로 (보이스·태그 청취 확인용 — 발행 경로 아님, 키 미기록)
 */
/** 화자 → ElevenLabs 보이스 ID (config). script.ts 에 두지 않는 이유: 파서·분할은 설정(env) 없이 테스트한다 */
const voiceOf = (speaker: Speaker): string => (speaker === "윤아" ? cfg.ttsVoiceYuna : cfg.ttsVoiceEum);

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
  type TtsTurn = ScriptTurn & { orig: string }; // orig = 사람이 읽는 원문 (자막 세그먼트용) · text = 합성용 표기
  const turns: TtsTurn[] = (sampleTurns ? parsed.turns.filter((t) => !parsed.placeholders.some((p) => t.text.includes(p))).slice(0, sampleTurns) : parsed.turns)
    .map((t) => ({ ...t, orig: t.text, text: normalizeForTts(t.text, dict) }));
  const issues = turns.flatMap((t) => residualIssues(t.text).map((i) => `${t.id ?? t.section}: ${i}`));
  if (issues.length) {
    throw new Error(`정규화 후 잔존 — 에피소드 "발음" 탭(발음 맵) 또는 /assets 의 TTS 음차 사전에 추가 후 재시도 (spec/06 6장, 코드 배포 불필요): ${[...new Set(issues)].slice(0, 12).join(" / ").slice(0, 800)}`);
  }

  // seed: 에피소드 고정 — 부분 재합성 시 같은 결과를 시도 (보장은 없음, spec/06)
  const seed = crypto.createHash("sha256").update(episodeId).digest().readUInt32BE(0) % 4294967295;
  if (parsed.coldOpen) log(`  tts ${episodeId}: [콜드오픈] 구역 무시 (2026-09-07 폐지 — 인트로부터 합성)`);
  const chunks = chunkTurns(turns, 1700) as TtsTurn[][]; // 1,700 + 문맥 겹침 앞뒤 ≤140자 = ElevenLabs 권장 2,000자 안 (KAN-87)
  // 경계 종류 요약 (spec/06 3장): 단락 헤더 다음 > 서술 뒤 > 질문 뒤. "질문 뒤"가 있으면 청취 확인 때 그 지점을 듣는다
  const cuts = describeCuts(chunks);
  const cutSummary = (["단락", "문장", "질문 뒤"] as const).map((k) => [k, cuts.filter((c) => c === k).length] as const).filter(([, n]) => n).map(([k, n]) => `${k} ${n}`).join("·") || "없음";
  log(`  tts ${episodeId}: ${sampleTurns ? `샘플 ${turns.length}턴` : `${turns.length}턴`} · 분할 ${chunks.length}요청(경계 ${cutSummary}) · seed ${seed}`);

  // 화자별 배속 (spec/06 6장): 다중화자 API 에 속도 설정이 없어, 타임스탬프 정렬로 턴 경계를 잡고 화자 구간만 atempo 한다
  const speedOf = (sp: ScriptTurn["speaker"]) => (sp === "윤아" ? cfg.ttsSpeedYuna : cfg.ttsSpeedEum);
  const wantSpeed = Math.abs(cfg.ttsSpeedYuna - 1) > 0.001 || Math.abs(cfg.ttsSpeedEum - 1) > 0.001;
  let speedFallbacks = 0;
  const segments: Segment[] = [];
  // 자막 세그먼트 재료 (KAN-72): 요청마다 배속 후 로컬 시각 + 실측 길이. 한 요청이라도 정렬이 없으면 편 전체를 싣지 않는다 (틀린 자막보다 없는 편)
  const chunkSegs: { segments: ScriptSegment[]; durSec: number }[] = [];
  const pauses: number[] = []; // 같은 요청 안 턴 사이 쉼(배속 후) — 폴백 경계 무음 길이의 기준 (KAN-87)
  let segFail: string | null = wantSpeed ? null : "배속 없음 — 타임스탬프 정렬을 요청하지 않음";
  /**
   * 문맥 겹침 (2026-09-22 박수현 제안, KAN-87): 요청마다 앞 요청 마지막 턴의 끝 문장과 뒤 요청 첫 턴의 첫 문장을 함께 생성하고,
   * 양쪽 다 문맥 턴과의 **쉼 한가운데**에서 잘라 버린다. 요청 끝은 뒤에 말이 있는 상태로 자연히 감쇠하고, 요청 시작은 앞말에 이어지는
   * 억양으로 나온다. 이음새 무음은 넣지 않는다(앞 반쪽 쉼 + 뒤 반쪽 쉼이 오디오에 있다). 검증(X260919-001): 절단 제거·쉼 삽입만으로는
   * 경계가 여전히 구분됐고, 요청 안 화자 교대에 같은 처리를 넣은 가짜 경계와 종류가 달랐다 — 남은 단서는 생성 불연속.
   * 안전장치: 쉼 < CTX_MIN_PAUSE 이거나 경계를 못 찾거나 문맥 턴의 말 속도가 본 요청과 40% 넘게 다르면 그 요청만 문맥 없이 다시 합성한다.
   */
  const CTX_MAX = 140, CTX_MIN_PAUSE = 0.15;
  const useCtx = wantSpeed && !sampleTurns && chunks.length > 1;
  const ctxHead = new Array<boolean>(chunks.length).fill(false), ctxTail = new Array<boolean>(chunks.length).fill(false);
  const mainRate: number[][] = []; // [요청][턴] 글자/초 — 문맥 턴 검산용
  let ctxChars = 0;
  type Synth = { data: Buffer; durSec: number; segs: ScriptSegment[]; rates: number[] };
  const synthChunk = async (n: number, withCtx: boolean): Promise<Synth> => {
    const chunk = chunks[n];
    const before = withCtx && n > 0 ? [{ ...chunks[n - 1][chunks[n - 1].length - 1], text: contextExcerpt(chunks[n - 1][chunks[n - 1].length - 1].text, "tail", CTX_MAX) }] : [];
    const after = withCtx && n + 1 < chunks.length ? [{ ...chunks[n + 1][0], text: contextExcerpt(chunks[n + 1][0].text, "head", CTX_MAX) }] : [];
    const all = [...before, ...chunk, ...after];
    const ts = await synthDialogueWithTimestamps(all.map((t) => ({ text: t.text, voice_id: voiceOf(t.speaker) })), seed, { onRetry: progress });
    const spansAll = locateTurnSpans(ts, all.map((t) => t.text));
    if (!spansAll) throw new Error("턴 경계를 정렬에서 찾지 못함");
    const b = before.length, m = chunk.length;
    const spans = spansAll.slice(b, b + m);
    const rates = spans.map((sp, i) => chunk[i].text.replace(/\s/g, "").length / Math.max(0.2, sp.end - sp.start));
    let cutStart = 0, cutEnd: number | undefined;
    if (b) {
      const pause = spans[0].start - spansAll[0].end;
      if (pause < CTX_MIN_PAUSE) throw new Error(`앞 문맥과의 쉼 ${pause.toFixed(2)}초 — 자를 수 없음`);
      const ctxRate = before[0].text.replace(/\s/g, "").length / Math.max(0.2, spansAll[0].end - spansAll[0].start);
      const prevRate = mainRate[n - 1]?.[mainRate[n - 1].length - 1];
      if (prevRate && (ctxRate / prevRate < 0.6 || ctxRate / prevRate > 1.6)) throw new Error(`앞 문맥 턴 말 속도 ${ctxRate.toFixed(1)}자/초 vs 원 요청 ${prevRate.toFixed(1)} — 정렬 의심`);
      cutStart = (spansAll[0].end + spans[0].start) / 2;
    }
    if (after.length) {
      const pause = spansAll[b + m].start - spans[m - 1].end;
      if (pause < CTX_MIN_PAUSE) throw new Error(`뒤 문맥과의 쉼 ${pause.toFixed(2)}초 — 자를 수 없음`);
      cutEnd = (spans[m - 1].end + spansAll[b + m].start) / 2;
    }
    const starts = spans.map((sp) => sp.start);
    for (let i = 0; i + 1 < spans.length; i++) pauses.push((spans[i + 1].start - spans[i].end) / speedOf(chunk[i + 1].speaker)); // 쉼은 뒤 턴 조각에 속해 그 배속을 따른다
    const src = path.join(audioDir, ".tmp", `chunk-${n}.mp3`);
    await writeBuf(src, ts.audio);
    // 조각 = [이 턴 시작, 다음 턴 시작). 첫 조각은 앞 절단점(문맥 없으면 0)부터, 마지막은 뒤 절단점(문맥 없으면 끝)까지 — 턴 사이 쉼은 뒤 턴의 화자 배속을 따른다
    const pieces = chunk.map((t, i) => ({ start: i === 0 ? cutStart : starts[i], end: i < m - 1 ? starts[i + 1] : cutEnd, tempo: speedOf(t.speaker) }));
    const data = await retimePieces(src, pieces, path.join(audioDir, ".tmp"));
    await fs.rm(src, { force: true });
    const durSec = data.length / (44100 * 2); // s16le mono 44.1kHz — 배속 후 실측 길이
    // 자막 시각은 잘라낸 오디오의 0 기준 — 정렬 시각을 앞 절단점만큼 당긴다
    const tsRel = { ...ts, startSec: ts.startSec.map((x) => x - cutStart), endSec: ts.endSec.map((x) => x - cutStart) };
    const segs = chunkSegments(chunk.map((t) => ({ speaker: t.speaker, text: t.orig, ttsText: t.text, tempo: speedOf(t.speaker) })), tsRel, starts.map((x) => x - cutStart), durSec);
    if (withCtx) { ctxHead[n] = b > 0; ctxTail[n] = after.length > 0; ctxChars += before.reduce((a, t) => a + t.text.length, 0) + after.reduce((a, t) => a + t.text.length, 0); }
    return { data, durSec, segs, rates };
  };
  for (let n = 0; n < chunks.length; n++) {
    const chunk = chunks[n];
    const inputs = chunk.map((t) => ({ text: t.text, voice_id: voiceOf(t.speaker) }));
    await progress(`합성 ${n + 1}/${chunks.length} (${chunk.reduce((s, t) => s + t.text.length, 0)}자${useCtx ? "+문맥" : ""})`);
    if (!wantSpeed) { segments.push(await synthDialogue(inputs, seed, { onRetry: progress })); continue; }
    let out: Synth | null = null;
    if (useCtx) {
      try { out = await synthChunk(n, true); }
      catch (e: any) { log(`  tts ${episodeId}: 요청 ${n + 1} 문맥 겹침 실패(${String(e.message).slice(0, 120)}) — 문맥 없이 재합성`); await progress(`합성 ${n + 1}/${chunks.length} 문맥 없이 재시도`); }
    }
    if (!out) {
      try { out = await synthChunk(n, false); }
      catch (e: any) {
        // 배속 실패는 합성 실패가 아니다 — 이 요청만 원속으로 폴백하고 기록에 남긴다 (청취 확인에서 판단)
        speedFallbacks++;
        segFail ??= `요청 ${n + 1} 원속 폴백 — 턴 경계 없음`;
        log(`  tts ${episodeId}: 요청 ${n + 1} 화자별 배속 실패(${String(e.message).slice(0, 120)}) — 원속 폴백`);
        segments.push(await synthDialogue(inputs, seed, { onRetry: progress }));
        mainRate[n] = [];
        continue;
      }
    }
    segments.push({ data: out.data, format: "pcm_44100" });
    chunkSegs.push({ durSec: out.durSec, segments: out.segs });
    mainRate[n] = out.rates;
  }
  const ctxBoundaries = chunks.slice(1).map((_, k) => ctxTail[k] && ctxHead[k + 1]);
  const ctxOk = ctxBoundaries.filter(Boolean).length;

  await progress("조립·정규화 (ffmpeg)");
  const masterOut = path.join(audioDir, sampleTurns ? "sample-master.wav" : "master.wav");
  const distOut = path.join(audioDir, sampleTurns ? "sample.mp3" : "dist.mp3");
  const gapSec = naturalGapSec(pauses); // 폴백 경계의 이음새 쉼 = 이 편의 자연 쉼 중앙값 (정렬 없으면 기본값)
  const gaps = ctxBoundaries.map((ok) => (ok ? 0 : gapSec)); // 문맥 겹침 경계는 무음 없음 — 자막 오프셋과 같은 값을 쓴다
  const durationSec = await assemble({ segments, gapSec: gaps, workDir: audioDir, masterOut, distOut }); // 앞뒤 무음 2초는 assemble 기본값
  if (sampleTurns) await fs.rm(masterOut, { force: true }); // 샘플은 mp3 만 남긴다

  // 대본 세그먼트 → episodes/<id>/script-segments.json (spec/06 7장, admin-api 4.6 script_file). 샘플은 만들지 않는다
  const segFile = path.join(cfg.workRoot, rel, "script-segments.json");
  let segCount = 0;
  if (!sampleTurns) {
    const joined = segFail ? [] : joinChunkSegments(chunkSegs, 2, gaps); // assemble 과 같은 앞 무음 2초·경계별 이음새 쉼
    segFail ??= validateSegments(joined);
    if (segFail) { await fs.rm(segFile, { force: true }); log(`  tts ${episodeId}: 자막 세그먼트 없음 — ${segFail}`); }
    else { await fs.writeFile(segFile, JSON.stringify(joined, null, 1), "utf-8"); segCount = joined.length; }
  }

  await progress("S3 업로드");
  await pushPrefix(`${rel}/`);
  const totalChars = turns.reduce((s, t) => s + t.text.length, 0);
  const fmt = segments[0]?.format ?? "?";
  const min = Math.floor(durationSec / 60), sec = Math.round(durationSec % 60);

  if (!sampleTurns) {
    await upsertEpisode({ id: episodeId, backlog_id: backlogId, prompt_version: ep.prompt_version, audio_master_key: s3Key(`${rel}/audio/master.wav`), audio_dist_key: s3Key(`${rel}/audio/dist.mp3`) });
  }
  const artifacts = sampleTurns ? [s3Key(`${rel}/audio/sample.mp3`)] : [s3Key(`${rel}/audio/master.wav`), s3Key(`${rel}/audio/dist.mp3`), ...(segCount ? [s3Key(`${rel}/script-segments.json`)] : [])];
  const result = `${sampleTurns ? `TTS 샘플 ${turns.length}턴` : "TTS 완료"} — eleven_v3 다중화자 1콜 · 분할 ${chunks.length}요청(경계 ${cutSummary} · 세그먼트 포맷 ${fmt}) · ${totalChars}자 → ${min}분 ${sec}초 (앞뒤 무음 2초 포함) ${useCtx ? ` · 문맥 겹침 ${ctxOk}/${ctxBoundaries.length}경계(+${ctxChars}자)` : ""}${ctxOk < ctxBoundaries.length ? ` · 폴백 경계 무음 ${gapSec}초(자연 쉼 ${pauses.length}곳 중앙값)` : ""}${wantSpeed ? ` · 배속 윤아 ${cfg.ttsSpeedYuna}× 이음 ${cfg.ttsSpeedEum}×${speedFallbacks ? ` (원속 폴백 ${speedFallbacks}요청 — 청취 확인)` : ""}` : ""}${parsed.coldOpen ? " · 구 [콜드오픈] 구역 무시(폐지)" : ""}${sampleTurns ? "" : segCount ? ` · 자막 세그먼트 ${segCount}건(배포본 시각)` : ` · 자막 세그먼트 없음(${segFail})`} · 사전 ${dictVersion}${Object.keys(epMap).length ? `+발음 맵 ${Object.keys(epMap).length}건` : ""} · 보이스 윤아=${cfg.ttsVoiceYuna.slice(0, 6)}… 이음=${cfg.ttsVoiceEum.slice(0, 6)}… · 사람 청취 확인 대기 (spec/06 8장)`;
  // 계측: TTS 의 "토큰"은 글자수(ElevenLabs 과금 단위). 비용은 요율(cfg.ttsUsdPer1kChars)이 설정됐을 때만 환산(참고값), 아니면 비운다
  const ttsCost = cfg.ttsUsdPer1kChars != null ? ((totalChars + ctxChars) / 1000) * cfg.ttsUsdPer1kChars : undefined; // 문맥 글자도 과금
  await insertRun({ backlog_id: backlogId, phase: "tts", result, prompt_version: "tts-v1 (worker)", artifacts, executed_by: executedBy, model: cfg.ttsModel, cost_usd: ttsCost, tokens: { characters: totalChars, context_characters: ctxChars, chunks: chunks.length, duration_sec: Math.round(durationSec) }, worker_rev: workerRev() });
  // 샘플은 발행 경로가 아니다 — 연쇄를 잇지 않는다
  const next = sampleTurns ? null : await advanceChain(job);
  return { episode_id: episodeId, sample: !!sampleTurns, duration_sec: Math.round(durationSec), chunks: chunks.length, chars: totalChars, format: fmt, artifacts, script_segments: segCount, script_segments_skipped: segFail, next: next?.type ?? null };
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
export async function readEpisodePronunciations(file: string): Promise<Record<string, string>> {
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
