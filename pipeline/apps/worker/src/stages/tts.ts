import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { cfg, executedBy } from "../config.js";
import { getBacklog, getEpisode, insertRun, pool, setJobProgress, upsertEpisode, type Job } from "../db.js";
import { loadTtsDict, workerRev } from "../assets.js";
import { listPrefix, localPathOf, pullPrefix, pushPrefix, s3Key, storage } from "../storage.js";
import { advanceChain } from "../chain.js";
import { ApiLimit, log, RetryLater } from "../util.js";
import { freeGb } from "../disk.js";
import { parseScriptForTts, chunkTurns, describeCuts, type ScriptTurn, type Speaker } from "../tts/script.js";
import { normalizeForTts, residualIssues } from "../tts/normalize.js";
import { synthDialogue, synthDialogueWithTimestamps, forcedAlignment, locateTurnSpans, resetFormat, resetUsage, usage, type TimestampedSynth, type TurnSpan } from "../tts/elevenlabs.js";
import { assemble, fadeOutPcm, findPauseCut, findTailCut, probeDurationSec, retimePieces, writeBuf, type Segment } from "../tts/audio.js";
import { alignmentGap, gapMid, pieceBounds } from "../tts/bounds.js";
import { chunkSegments, contextExcerpt, DEFAULT_GAP_SEC, joinChunkSegments, validateSegments, type ScriptSegment } from "../tts/segments.js";
import { buildSections } from "../tts/sections.js";
import { attachSummaries } from "../tts/section-summary.js";

/**
 * TTS 단계 (spec/06) — 다중화자 1콜(Text to Dialogue, eleven_v3) 확정 (2026-09-02).
 * 사람이 웹에서 명시적으로 요청할 때만 (자동 연쇄 없음). 흐름:
 *   대본 파싱 → 플레이스홀더 검사(잔존 시 중단) → 음차·숫자 정규화 → 잔존 영문 검사(중단) →
 *   턴 경계 분할(요청당 ~1,800자) → 합성(seed 고정) → [화자별 배속: 요청 오디오를 강제 정렬해 턴 경계를 잡아 atempo] →
 *   조립[징글 | 본편(2패스 linear 정규화) | 징글](스테레오)·징글 없는 쪽은 2초 무음 → master.wav + dist.m4a(AAC 192k) + lossless.flac → S3 audio/
 *   + 대본 세그먼트 script-segments.json (앱 자막, KAN-72 — 강제 정렬 시각을 배포본 시각으로 옮긴 것. 정렬을 못 잡은 편은 싣지 않는다)
 * 시각은 전부 요청마다 받은 강제 정렬에서 온다 (2026-10-01). dialogue 응답의 글자 시각은 요청 뒤로 갈수록 실제 오디오보다 최대 10초 앞서(T260929-003 실측)
 * 문맥 겹침 절단·배속 조각·자막·끝 꼬리가 어긋났다 — 그 시각은 디버그 기록에만 남긴다.
 * 콜드오픈은 2026-09-07 폐지 — 구 대본에 [콜드오픈] 구역이 남아 있어도 합성하지 않는다(파서가 분리해 둔 것을 버린다).
 * payload.sample_turns = N: 도입부 N턴만 audio/sample.mp3 로 (보이스·태그 청취 확인용 — 발행 경로 아님, 키 미기록)
 */
/** 화자 → ElevenLabs 보이스 ID (config). script.ts 에 두지 않는 이유: 파서·분할은 설정(env) 없이 테스트한다 */
const voiceOf = (speaker: Speaker): string => (speaker === "윤아" ? cfg.ttsVoiceYuna : cfg.ttsVoiceEum);

/**
 * 징글 파일 확보 (2026-10-01 박수헌): S3 assets/audio/ 의 인트로·아웃트로를 WORK_ROOT 로 받는다. 키가 비었거나 객체가 없으면 그 쪽은 없이 간다 —
 * 징글 하나 없다고 TTS 가 실패하지 않는다(로그만). 레포에는 mp3 가 없다(.dockerignore·rsync 제외) — 자산의 진실은 S3 다.
 */
async function loadJingles(): Promise<{ introFile?: string; outroFile?: string; missing?: string }> {
  const out: { introFile?: string; outroFile?: string; missing?: string } = {};
  const want = [["introFile", cfg.ttsIntroKey], ["outroFile", cfg.ttsOutroKey]] as const;
  const miss: string[] = [];
  for (const [field, key] of want) {
    if (!key) continue;
    try {
      const local = path.join(cfg.workRoot, key);
      await fs.mkdir(path.dirname(local), { recursive: true });
      await fs.writeFile(local, await storage().get(key));
      out[field] = local;
    } catch (e: any) { miss.push(`${key} (${String(e?.name ?? e?.message ?? e).slice(0, 40)})`); log(`  tts: 징글 받기 실패 ${key} — 없이 조립 (${String(e?.message ?? e).slice(0, 120)})`); }
  }
  if (miss.length) out.missing = miss.join(", ");
  return out;
}

export async function runTts(job: Job) {
  resetUsage(); // 이 작업의 ElevenLabs 요청·차감 크레딧 계측 시작 (재시도·폴백·정렬 포함)
  resetFormat(); // 포맷 사다리를 맨 위(무손실)부터 — 앞 작업의 강등을 끌고 오지 않는다 (KAN-142)
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

  // 디스크 여유 확인 (2026-10-02): 합성은 과금이고 조립·쓰기는 그 뒤라, 디스크가 모자라면 크레딧만 쓰고 실패한다 — 합성 전에 큐로 되돌린다
  const free = await freeGb().catch(() => Infinity);
  if (free < cfg.ttsMinFreeGb) throw new RetryLater(`디스크 여유 ${free.toFixed(2)}GB < ${cfg.ttsMinFreeGb}GB — 합성하지 않고 큐로 되돌림 (서버 디스크 정리 필요)`, 10 * 60_000);
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
  const chunkChars = Number(job.payload.chunk_chars ?? 0) || 1700; // 디버그: 샘플을 여러 요청으로 쪼개 문맥 겹침 경계를 관찰할 때 작게 준다
  const debugAlign = !!job.payload.debug_alignment; // 디버그: 요청별 정렬 원본(글자·시각)을 audio/debug-align/ 에 남긴다 (점으로 시작하는 이름은 S3 동기화에서 빠진다)
  const chunks = chunkTurns(turns, chunkChars) as TtsTurn[][]; // 1,700 + 문맥 겹침 앞뒤 ≤140자 = ElevenLabs 권장 2,000자 안 (KAN-87)
  // 경계 종류 요약 (spec/06 3장): 단락 헤더 다음 > 서술 뒤 > 질문 뒤. "질문 뒤"가 있으면 청취 확인 때 그 지점을 듣는다
  const cuts = describeCuts(chunks);
  const cutSummary = (["단락", "문장", "질문 뒤"] as const).map((k) => [k, cuts.filter((c) => c === k).length] as const).filter(([, n]) => n).map(([k, n]) => `${k} ${n}`).join("·") || "없음";
  log(`  tts ${episodeId}: ${sampleTurns ? `샘플 ${turns.length}턴` : `${turns.length}턴`} · 분할 ${chunks.length}요청(경계 ${cutSummary}) · seed ${seed}`);

  // 화자별 배속 (spec/06 6장): 다중화자 API 에 속도 설정이 없어, 타임스탬프 정렬로 턴 경계를 잡고 화자 구간만 atempo 한다
  const speedOf = (sp: ScriptTurn["speaker"]) => (sp === "윤아" ? cfg.ttsSpeedYuna : cfg.ttsSpeedEum);
  const wantSpeed = Math.abs(cfg.ttsSpeedYuna - 1) > 0.001 || Math.abs(cfg.ttsSpeedEum - 1) > 0.001;
  let speedFallbacks = 0;
  const segments: Segment[] = [];
  // ElevenLabs 가 실제로 돌려준 원본 포맷 (KAN-142) — 배속 경로 세그먼트는 디코드 후 pcm 이라 그 포맷만 보면 원본(mp3 등)이 가려진다
  const srcFormats = new Set<string>();
  const plainSynth = async (inputs: Parameters<typeof synthDialogue>[0]) => { const s = await synthDialogue(inputs, seed, { onRetry: progress }); srcFormats.add(s.format); return s; };
  // 자막 세그먼트 재료 (KAN-72): 요청마다 배속 후 로컬 시각 + 실측 길이. 한 요청이라도 정렬이 없으면 편 전체를 싣지 않는다 (틀린 자막보다 없는 편)
  const chunkSegs: { segments: ScriptSegment[]; durSec: number }[] = [];
  let segFail: string | null = wantSpeed ? null : "배속 없음 — 타임스탬프 정렬을 요청하지 않음";
  /**
   * 문맥 겹침 (2026-09-22 박수현 제안, KAN-87): 요청마다 앞 요청 마지막 턴의 끝 문장과 뒤 요청 첫 턴의 첫 문장을 함께 생성하고,
   * 양쪽 다 문맥 턴과의 **쉼 한가운데**에서 잘라 버린다. 요청 끝은 뒤에 말이 있는 상태로 자연히 감쇠하고, 요청 시작은 앞말에 이어지는
   * 억양으로 나온다. 이음새 무음은 넣지 않는다(앞 반쪽 쉼 + 뒤 반쪽 쉼이 오디오에 있다). 검증(X260919-001): 절단 제거·쉼 삽입만으로는
   * 경계가 여전히 구분됐고, 요청 안 화자 교대에 같은 처리를 넣은 가짜 경계와 종류가 달랐다 — 남은 단서는 생성 불연속.
   * 절단점은 강제 정렬로 잡은 창 [앞 턴 마지막 글자 시작, 뒤 턴 첫 글자 끝]에서 가장 긴 쉼의 한가운데다(findPauseCut). 쉼이 어느 글자에 흡수되든
   * 이 창 안에 있다. 쉼이 안 잡히면 앞 턴 끝과 뒤 턴 시작의 가운데.
   * 2026-10-01 까지는 dialogue 정렬로 창을 잡아 79% 가 실패했다(정렬이 요청 끝에서 최대 10초 앞섬) — 실패하면 문맥 없이 다시 합성해 크레딧이 샜다.
   * 안전장치: 강제 정렬이 실패하거나 문맥 턴의 말 속도가 본 요청과 40% 넘게 다르면 그 요청만 문맥 없이 다시 합성한다.
   */
  const CTX_MAX = 140;
  const useCtx = (cfg.ttsContextOverlap || !!job.payload.context_overlap) && wantSpeed && (!sampleTurns || debugAlign) && chunks.length > 1;
  const ctxHead = new Array<boolean>(chunks.length).fill(false), ctxTail = new Array<boolean>(chunks.length).fill(false);
  const mainRate: number[][] = []; // [요청][턴] 글자/초 — 문맥 턴 검산용
  let ctxChars = 0;
  const ctxFails: string[] = []; // 폴백 사유 — 실행 기록에 남긴다 (서버 로그 없이 보이게)
  type Synth = { data: Buffer; durSec: number; segs: ScriptSegment[]; rates: number[]; unaligned?: string };
  /** 요청 오디오 강제 정렬 → 턴 구간. 정렬 호출 비용은 따로 센다(실행 기록에 표시) */
  let alignCalls = 0, alignFails = 0, alignCredits = 0;
  const alignAudio = async (synth: TimestampedSynth, texts: string[], audioSec: number): Promise<{ ts: TimestampedSynth; spans: TurnSpan[] } | { fail: string }> => {
    const c0 = usage().credits;
    alignCalls++;
    try {
      const al = await forcedAlignment(synth.audio, texts.join("\n"));
      const fts: TimestampedSynth = { audio: synth.audio, format: synth.format, chars: al.characters.map((c) => c.text), startSec: al.characters.map((c) => c.start), endSec: al.characters.map((c) => c.end) };
      const spans = locateTurnSpans(fts, texts);
      if (!spans) return { fail: "강제 정렬에서 턴 경계를 못 찾음" };
      const gap = alignmentGap(spans[spans.length - 1].end, audioSec);
      return gap ? { fail: gap } : { ts: fts, spans };
    } catch (e: any) {
      if (e instanceof ApiLimit) throw e;
      return { fail: String(e?.message ?? e).slice(0, 120) };
    } finally { alignCredits += usage().credits - c0; }
  };
  /**
   * 끝 꼬리 가드 (2026-10-01 박수헌 "진행자의 마지막 말이 끝나자마자 뚝 끊긴다"): 마지막 요청에는 뒤 요청이 없어 문맥 겹침이 안 걸리고, ElevenLabs 출력이
   * 마지막 음절 뒤 약 20ms 만에 끊긴다(T260929-003 실측: −24dB 에서 30ms 만에 0). 상대 화자의 짧은 덧말을 붙여 생성하고 그 앞 쉼에서 자른다 — 마지막 낱말이
   * 뒤에 말이 있는 상태로 자연히 감쇠한다. 덧말은 버린다(약 8자 과금). 창은 강제 정렬의 [마지막 턴 마지막 글자 시작, 덧말 첫 글자 끝]에서 첫 쉼.
   * 쉼을 못 찾으면 덧말 시작(강제 정렬) 직전에서 자르고 길게 페이드한다.
   * 첫 판(#1081)은 dialogue 정렬로 창을 잡아 마지막 턴을 4.7초 만에 잘랐다(정렬이 실제보다 6.6초 앞섬) — #1083 로 끈 뒤 이 방식으로 고쳤다.
   */
  const tailGuardOn = (cfg.ttsTailGuard || !!job.payload.tail_guard) && wantSpeed && !sampleTurns;
  const TAIL_GUARD = "네, 감사합니다.";
  let tailNote = "";
  const synthChunk = async (n: number, withCtx: boolean, guardOnly = false): Promise<Synth> => {
    const chunk = chunks[n];
    const isTail = tailGuardOn && n === chunks.length - 1 && (withCtx || guardOnly);
    const lastT = chunk[chunk.length - 1];
    const before = withCtx && n > 0 ? [{ ...chunks[n - 1][chunks[n - 1].length - 1], text: contextExcerpt(chunks[n - 1][chunks[n - 1].length - 1].text, "tail", CTX_MAX) }] : [];
    const after = withCtx && n + 1 < chunks.length ? [{ ...chunks[n + 1][0], text: contextExcerpt(chunks[n + 1][0].text, "head", CTX_MAX) }]
      : isTail ? [{ ...lastT, speaker: (lastT.speaker === "윤아" ? "이음" : "윤아") as Speaker, text: TAIL_GUARD, orig: TAIL_GUARD }] : [];
    const all = [...before, ...chunk, ...after];
    const texts = all.map((t) => t.text);
    const ts = await synthDialogueWithTimestamps(all.map((t) => ({ text: t.text, voice_id: voiceOf(t.speaker) })), seed, { onRetry: progress });
    srcFormats.add(ts.format);
    const ext = ts.format.startsWith("wav") ? "wav" : "mp3";
    const src = path.join(audioDir, ".tmp", `chunk-${n}${withCtx ? "-ctx" : ""}.${ext}`);
    await writeBuf(src, ts.audio);
    const audioSec = await probeDurationSec(src);
    const fa = await alignAudio(ts, texts, audioSec);
    if (debugAlign) {
      const f = path.join(audioDir, "debug-align", `align-${n}${withCtx ? "-ctx" : ""}${isTail ? "-tail" : ""}.json`);
      await fs.mkdir(path.dirname(f), { recursive: true });
      await fs.writeFile(f, JSON.stringify({ inputs: all.map((t) => ({ speaker: t.speaker, text: t.text })), audioSec, dialogue: { spans: locateTurnSpans(ts, texts), chars: ts.chars, start: ts.startSec, end: ts.endSec }, forced: "fail" in fa ? { fail: fa.fail } : { spans: fa.spans, chars: fa.ts.chars, start: fa.ts.startSec, end: fa.ts.endSec } }), "utf8");
      await fs.writeFile(f.replace(/\.json$/, `.${ext}`), ts.audio); // 요청 원본 — 절단점 탐색을 로컬에서 재현하기 위해
    }
    const b = before.length, m = chunk.length;
    if ("fail" in fa) {
      alignFails++;
      // 문맥·덧말이 붙은 요청은 그것을 잘라낼 시각이 없다 — 호출부가 문맥 없이 다시 합성한다
      if (b || after.length) { await fs.rm(src, { force: true }); throw new Error(`강제 정렬 실패 — ${fa.fail}`); }
      // 본문만 있는 요청은 다시 합성하지 않는다(크레딧 절약) — 원속 그대로 쓰고 자막은 싣지 않는다
      const data = await retimePieces(src, [{ start: 0, tempo: 1 }], path.join(audioDir, ".tmp"));
      await fs.rm(src, { force: true });
      return { data, durSec: data.length / (44100 * 2), segs: [], rates: [], unaligned: fa.fail };
    }
    const spansAll = fa.spans;
    const spans = spansAll.slice(b, b + m);
    const rates = spans.map((sp, i) => chunk[i].text.replace(/\s/g, "").length / Math.max(0.2, sp.end - sp.start));
    let cutStart = 0, cutEnd: number | undefined;
    if (b) {
      const ctx = spansAll[0], first = spans[0];
      const cut = (await findPauseCut(src, ctx.lastStart, first.firstEnd, Infinity)) ?? gapMid(ctx.end, first.start);
      if (cut == null) throw new Error(`앞 문맥과 본문이 겹침 (${ctx.end.toFixed(2)}→${first.start.toFixed(2)})`);
      const ctxRate = before[0].text.replace(/\s/g, "").length / Math.max(0.2, ctx.end - ctx.start);
      const prevRate = mainRate[n - 1]?.[mainRate[n - 1].length - 1];
      if (prevRate && (ctxRate / prevRate < 0.6 || ctxRate / prevRate > 1.6)) throw new Error(`앞 문맥 턴 말 속도 ${ctxRate.toFixed(1)}자/초 vs 원 요청 ${prevRate.toFixed(1)} — 정렬 의심`);
      cutStart = cut;
    }
    let fadeSec = 0;
    if (after.length) {
      const last = spans[m - 1], next = spansAll[b + m];
      if (isTail) {
        // 창 [마지막 턴 마지막 글자 시작, 덧말 첫 글자 끝] — 덧말 첫 낱말 뒤 쉼표 쉼은 창 밖이다
        const cut = await findTailCut(src, last.lastStart, next.firstEnd);
        if (cut != null) { cutEnd = cut; fadeSec = 0.03; tailNote = `끝 꼬리 자연 감쇠(덧말 앞 쉼에서 절단, 덧말 시작 ${(next.start - cut).toFixed(2)}초 앞)`; }
        else { cutEnd = Math.max(last.lastStart + 0.1, next.start - 0.02); fadeSec = 0.12; tailNote = "끝 꼬리 폴백(덧말 시작 직전 절단 + 페이드 0.12초)"; }
      } else {
        const cut = (await findPauseCut(src, last.lastStart, next.firstEnd, Infinity)) ?? gapMid(last.end, next.start);
        if (cut == null) throw new Error(`본문과 뒤 문맥이 겹침 (${last.end.toFixed(2)}→${next.start.toFixed(2)})`);
        cutEnd = cut;
      }
    }
    const bounds = pieceBounds(spans);
    // 조각 = [이 턴 경계, 다음 턴 경계). 경계는 두 턴 사이 쉼의 가운데. 첫 조각은 앞 절단점(문맥 없으면 0)부터, 마지막은 뒤 절단점(문맥 없으면 끝)까지
    const pieces = chunk.map((t, i) => ({ start: i === 0 ? cutStart : bounds[i], end: i < m - 1 ? bounds[i + 1] : cutEnd, tempo: speedOf(t.speaker) }));
    const retimed = await retimePieces(src, pieces, path.join(audioDir, ".tmp"));
    const data = fadeSec ? fadeOutPcm(retimed, fadeSec) : retimed;
    await fs.rm(src, { force: true });
    const durSec = data.length / (44100 * 2); // s16le mono 44.1kHz — 배속 후 실측 길이
    // 자막 시각은 잘라낸 오디오의 0 기준 — 강제 정렬 시각을 앞 절단점만큼 당긴다
    const tsRel = { ...fa.ts, startSec: fa.ts.startSec.map((x) => x - cutStart), endSec: fa.ts.endSec.map((x) => x - cutStart) };
    const segs = chunkSegments(chunk.map((t) => ({ speaker: t.speaker, text: t.orig, ttsText: t.text, tempo: speedOf(t.speaker) })), tsRel, bounds.map((x) => x - cutStart), durSec);
    if (withCtx) { ctxHead[n] = b > 0; ctxTail[n] = after.length > 0; ctxChars += before.reduce((a, t) => a + t.text.length, 0) + after.reduce((a, t) => a + t.text.length, 0); }
    else if (isTail) ctxChars += TAIL_GUARD.length; // 가드만 붙인 재생성도 과금된다
    return { data, durSec, segs, rates };
  };
  for (let n = 0; n < chunks.length; n++) {
    const chunk = chunks[n];
    const inputs = chunk.map((t) => ({ text: t.text, voice_id: voiceOf(t.speaker) }));
    await progress(`합성 ${n + 1}/${chunks.length} (${chunk.reduce((s, t) => s + t.text.length, 0)}자${useCtx ? "+문맥" : ""})`);
    if (!wantSpeed) { segments.push(await plainSynth(inputs)); continue; }
    let out: Synth | null = null;
    const isLastChunk = n === chunks.length - 1;
    if (useCtx) {
      try { out = await synthChunk(n, true); }
      catch (e: any) { if (e instanceof ApiLimit) throw e; /* 한도는 폴백이 아니라 멈춤 (ai-pause.ts) */ ctxFails.push(`요청 ${n + 1}: ${String(e.message).slice(0, 100)}`); log(`  tts ${episodeId}: 요청 ${n + 1} 문맥 겹침 실패(${String(e.message).slice(0, 120)}) — 문맥 없이 재합성`); await progress(`합성 ${n + 1}/${chunks.length} 문맥 없이 재시도`); }
    }
    if (!out) {
      try { out = await synthChunk(n, false, tailGuardOn && isLastChunk); } // 문맥 겹침이 실패해도 끝 꼬리 가드는 유지한다 — 가드 요청의 강제 정렬이 실패하면 아래 catch 로 원속 재합성
      catch (e: any) {
        if (e instanceof ApiLimit) throw e; // 한도는 원속 폴백 대상이 아니다 — 워커가 큐로 되돌리고 TTS 집기를 멈춘다
        // 배속 실패는 합성 실패가 아니다 — 이 요청만 원속으로 폴백하고 기록에 남긴다 (청취 확인에서 판단)
        speedFallbacks++;
        segFail ??= `요청 ${n + 1} 원속 폴백 — 턴 경계 없음`;
        log(`  tts ${episodeId}: 요청 ${n + 1} 화자별 배속 실패(${String(e.message).slice(0, 120)}) — 원속 폴백`);
        segments.push(await plainSynth(inputs));
        mainRate[n] = [];
        continue;
      }
    }
    segments.push({ data: out.data, format: "pcm_44100" });
    chunkSegs.push({ durSec: out.durSec, segments: out.segs });
    mainRate[n] = out.rates;
    if (out.unaligned) {
      speedFallbacks++;
      segFail ??= `요청 ${n + 1} 강제 정렬 실패(${out.unaligned}) — 원속`;
      log(`  tts ${episodeId}: 요청 ${n + 1} 강제 정렬 실패(${out.unaligned}) — 다시 합성하지 않고 원속으로`);
    }
  }
  const ctxBoundaries = chunks.slice(1).map((_, k) => ctxTail[k] && ctxHead[k + 1]);
  const ctxOk = ctxBoundaries.filter(Boolean).length;

  await progress("조립·정규화 (ffmpeg)");
  const masterOut = path.join(audioDir, sampleTurns ? "sample-master.wav" : "master.wav");
  const distOut = path.join(audioDir, sampleTurns ? "sample.mp3" : "dist.m4a"); // 2026-10-06 배포본 AAC 192k m4a(Light·Daily) + 무손실 FLAC(Pro) — KAN-141·142. 샘플은 청취 확인용이라 mp3 그대로
  const losslessOut = sampleTurns ? undefined : path.join(audioDir, "lossless.flac");
  const gaps = ctxBoundaries.map((ok) => (ok ? 0 : DEFAULT_GAP_SEC)); // 문맥 겹침 경계는 무음 없음, 폴백 경계는 기본 쉼 — 자막 오프셋과 같은 값을 쓴다
  // 폴백 경계의 배포본 시각 (KAN-87 완료 조건 3 — 끊김 의심 지점을 실행 기록에 표시). 요청마다 실측 길이가 있을 때만(원속 폴백 없음)
  const mmss = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`; // 폴백 경계 위치 — 인트로가 붙으면 그만큼 뒤로 밀린다(아래 jingleNote 에 인트로 길이를 적는다)
  const fallbackAt = chunkSegs.length === chunks.length ? ctxBoundaries.map((ok, k) => (ok ? null : mmss(2 + chunkSegs.slice(0, k + 1).reduce((a, c) => a + c.durSec, 0) + gaps.slice(0, k).reduce((a: number, g) => a + g, 0)))).filter((x): x is string => !!x) : [];
  // 징글 (2026-10-01): 샘플에는 붙이지 않는다. S3 에 없으면 없이 조립
  const jingle = sampleTurns ? {} : await loadJingles();
  const asm = await assemble({ segments, gapSec: gaps, workDir: audioDir, masterOut, distOut, losslessOut, introFile: jingle.introFile, outroFile: jingle.outroFile, outroPadSec: cfg.ttsOutroPadSec }); // 앞뒤 무음 2초는 assemble 기본값
  const durationSec = asm.durationSec;
  if (sampleTurns) await fs.rm(masterOut, { force: true }); // 샘플은 mp3 만 남긴다

  // 대본 세그먼트 → episodes/<id>/script-segments.json (spec/06 7장, admin-api 4.6 script_file). 샘플은 만들지 않는다
  const segFile = path.join(cfg.workRoot, rel, "script-segments.json");
  let segCount = 0;
  // 구간 제목 → episodes/<id>/script-sections.json (KAN-137 · 서버 계약 KAN-144). 자막 세그먼트가 있을 때만 — 시각을 거기서 가져온다
  const secFile = path.join(cfg.workRoot, rel, "script-sections.json");
  let secNote = "";
  let secCount = 0;
  if (!sampleTurns) {
    const joined = segFail ? [] : joinChunkSegments(chunkSegs, asm.introSec + asm.leadSec, gaps); // assemble 과 같은 본편 시작 오프셋(인트로 길이 + 앞 무음)·경계별 이음새 쉼
    segFail ??= validateSegments(joined);
    if (segFail) { await fs.rm(segFile, { force: true }); log(`  tts ${episodeId}: 자막 세그먼트 없음 — ${segFail}`); }
    else { await fs.writeFile(segFile, JSON.stringify(joined, null, 1), "utf-8"); segCount = joined.length; }
    const built = segCount ? buildSections(parsed.turns, joined) : { sections: [], reason: "자막 세그먼트 없음" };
    secCount = built.sections.length;
    // 구역(kind)은 buildSections 가, 요약(summary)은 텍스트 모델이 붙인다 (KAN-152) — 요약 실패는 구간 실패가 아니다
    if (secCount) await progress(`구간 요약 ${secCount}개`);
    const sum = await attachSummaries(path.join(cfg.workRoot, rel), cand.title, built.sections, (built as { texts?: string[] }).texts);
    // 못 만들면 지우지 않고 [] 로 덮는다 — pushPrefix 는 S3 객체를 지우지 않아 앞 렌더의 구간(옛 시각)이 남는다
    await fs.writeFile(secFile, JSON.stringify(sum.sections, null, 1), "utf-8");
    secNote = secCount ? ` · 구간 ${secCount}개${built.missingTurns ? ` (자막에서 빠진 턴 ${built.missingTurns.join("·")} — 다음 턴 시각으로)` : ""}${sum.note}` : ` · 구간 없음(${built.reason})`;
  }

  await progress("S3 업로드");
  await pushPrefix(`${rel}/`);
  const totalChars = turns.reduce((s, t) => s + t.text.length, 0);
  const fmt = segments[0]?.format ?? "?";
  const srcFmt = [...srcFormats].join("·") || "?"; // 둘 이상이면 작업 중 강등이 있었다는 뜻
  const min = Math.floor(durationSec / 60), sec = Math.round(durationSec % 60);

  if (!sampleTurns) {
    await upsertEpisode({ id: episodeId, backlog_id: backlogId, prompt_version: ep.prompt_version, audio_master_key: s3Key(`${rel}/audio/master.wav`), audio_dist_key: s3Key(`${rel}/audio/dist.m4a`) });
  }
  const artifacts = sampleTurns ? [s3Key(`${rel}/audio/sample.mp3`)] : [s3Key(`${rel}/audio/master.wav`), s3Key(`${rel}/audio/dist.m4a`), s3Key(`${rel}/audio/lossless.flac`), ...(segCount ? [s3Key(`${rel}/script-segments.json`)] : []), ...(secCount ? [s3Key(`${rel}/script-sections.json`)] : [])];
  const result = `${sampleTurns ? `TTS 샘플 ${turns.length}턴` : "TTS 완료"} — ${cfg.ttsModel} 다중화자 1콜(stability ${cfg.ttsStability} · similarity ${cfg.ttsSimilarity}) · 분할 ${chunks.length}요청(경계 ${cutSummary} · 세그먼트 포맷 ${fmt} · ElevenLabs 원본 ${srcFmt}${sampleTurns ? "" : " · 배포본 AAC 192k m4a + FLAC"}) · ${totalChars}자 → ${min}분 ${sec}초 (${jingle.introFile || jingle.outroFile ? "징글 포함" : "앞뒤 무음 2초 포함"}) ${useCtx ? ` · 문맥 겹침 ${ctxOk}/${ctxBoundaries.length}경계(+${ctxChars}자)` : chunks.length > 1 && wantSpeed ? " · 문맥 겹침 꺼짐(경계 무음 0.9초)" : ""}${ctxOk < ctxBoundaries.length ? ` · 폴백 경계 무음 ${DEFAULT_GAP_SEC}초${fallbackAt.length ? ` @${fallbackAt.join("·")}` : ""}${ctxFails.length ? ` (사유: ${ctxFails.join(" / ").slice(0, 300)})` : ""}` : ""}${wantSpeed ? ` · 배속 윤아 ${cfg.ttsSpeedYuna}× 이음 ${cfg.ttsSpeedEum}×${speedFallbacks ? ` (원속 폴백 ${speedFallbacks}요청 — 청취 확인)` : ""} · 강제 정렬 ${alignCalls - alignFails}/${alignCalls}요청` : ""}${parsed.coldOpen ? " · 구 [콜드오픈] 구역 무시(폐지)" : ""}${sampleTurns ? "" : segCount ? ` · 자막 세그먼트 ${segCount}건(배포본 시각)` : ` · 자막 세그먼트 없음(${segFail})`}${secNote} · 사전 ${dictVersion}${Object.keys(epMap).length ? `+발음 맵 ${Object.keys(epMap).length}건` : ""} · 보이스 윤아=${cfg.ttsVoiceYuna.slice(0, 6)}… 이음=${cfg.ttsVoiceEum.slice(0, 6)}… · 사람 청취 확인 대기 (spec/06 8장)`;
  // 계측 (2026-10-01): 실제 차감 크레딧은 응답 헤더 character-cost 의 합(재시도·폴백·정렬 호출 포함). 헤더가 있으면 그 값으로 비용을 환산하고, 없으면 글자 수 추정(참고값)
  const u = usage();
  const metered = u.credits > 0;
  const ttsCost = metered ? (u.credits / 1000) * cfg.ttsUsdPer1kCredits : cfg.ttsUsdPer1kChars != null ? ((totalChars + ctxChars) / 1000) * cfg.ttsUsdPer1kChars : undefined;
  const jingleNote = (jingle.introFile || jingle.outroFile ? ` · 징글 ${jingle.introFile ? `인트로 ${asm.introSec}초` : "인트로 없음"} / ${jingle.outroFile ? "아웃트로" : "아웃트로 없음"} (파일 앞뒤 무음 1초, 본편에 바로 붙임 · 스테레오 그대로)` : "") + ((jingle as { missing?: string }).missing ? ` · ⚠️ 징글 받기 실패: ${(jingle as { missing?: string }).missing}` : "");
  // 정규화 기록 (KAN-122): 본편만 2패스 linear. 피크 여유가 없어 목표를 낮췄거나 선형이 성립하지 않았으면 표시한다
  const ln = asm.loudness;
  const normNote = ` · 정규화 본편만 2패스 ${ln.type === "linear" ? "linear" : `⚠️ ${ln.type}`} ${ln.targetI} LUFS${ln.targetI < ln.requestedI ? `(피크 여유로 ${ln.requestedI}에서 낮춤)` : ""} — 측정 ${ln.measuredI}·TP ${ln.measuredTp} → 출력 ${ln.outputI}·TP ${ln.outputTp} · 스테레오`;
  const usageNote = `${tailNote ? ` · ${tailNote}` : tailGuardOn ? " · ⚠️ 끝 꼬리 가드 미적용(원속 폴백)" : ""}${jingleNote}${normNote} · 실제 차감 ${metered ? `${u.credits.toLocaleString()}크레딧` : "미계측"} (${u.requests}요청${u.unmetered ? `, 헤더 없음 ${u.unmetered}` : ""}${alignCalls ? ` · 그중 강제 정렬 ${alignCredits.toLocaleString()}크레딧` : ""})`;
  await insertRun({ backlog_id: backlogId, phase: "tts", result: result + usageNote, prompt_version: "tts-v1 (worker)", artifacts, executed_by: executedBy, model: cfg.ttsModel, cost_usd: ttsCost, tokens: { characters: totalChars, context_characters: ctxChars, chunks: chunks.length, duration_sec: Math.round(durationSec), credits: metered ? u.credits : null, requests: u.requests, unmetered: u.unmetered, align_calls: alignCalls, align_fails: alignFails, align_credits: alignCredits }, worker_rev: workerRev() });
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
