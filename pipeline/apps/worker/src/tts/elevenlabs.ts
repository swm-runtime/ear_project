import { cfg } from "../config.js";
import { ApiLimit, log, sleep } from "../util.js";

/**
 * ElevenLabs 클라이언트 (spec/06) — 다중화자 1콜(Text to Dialogue, eleven_v3) 확정 (2026-09-02 박수헌).
 * 요청당 권장 총 2,000자 · 분할은 턴 경계(chunkTurns) · seed 고정으로 재현성을 시도한다.
 * 출력 포맷은 사다리로 시도한다: 무손실 44.1kHz(Pro+) → mp3 192k → mp3 128k(전 티어). 2026-10-06 Pro 전환(KAN-142) — 그 전 원본은 mp3 128k 였다.
 * 구독 제한을 만나면 한 단계 내려가 그 작업이 끝날 때까지 고정한다 — 한 에피소드 안에서 포맷을 섞지 않는다. 다음 작업은 resetFormat() 으로 맨 위부터 다시 시도한다.
 */
const BASE = "https://api.elevenlabs.io/v1";

/** 일반 합성 사다리 — 응답이 오디오 바이트 그대로라 무손실은 헤더 없는 pcm 으로 받는다 */
export const FORMATS = ["pcm_44100", "mp3_44100_192", "mp3_44100_128"] as const;
/** 타임스탬프 합성 사다리 — 응답이 base64 JSON 이고 파일로 써서 ffprobe·강제 정렬에 바로 넘기므로 무손실은 헤더 있는 wav 로 받는다. 같은 칸 = 같은 티어 */
export const TS_FORMATS = ["wav_44100", "mp3_44100_192", "mp3_44100_128"] as const;
export type AudioFormat = (typeof FORMATS)[number] | (typeof TS_FORMATS)[number];
let fmtIdx = 0;
/** TTS 작업 시작 시 호출 — 앞 작업의 강등을 끌고 오지 않는다(플랜을 올리면 워커 재시작 없이 다음 작업부터 반영) */
export function resetFormat(): void { fmtIdx = 0; }

export interface DialogueInput { text: string; voice_id: string }
export interface SynthResult { data: Buffer; format: AudioFormat }

/**
 * 사용량 계측 (2026-10-01 박수헌: "편당 실제 차감량을 측정 가능하게"): ElevenLabs 는 응답 헤더 `character-cost` 에 그 요청의 실제 차감 크레딧을 돌려준다.
 * 글자 수로 추정하던 값(659,868자 ↔ 실제 236,950크레딧, 약 0.36크레딧/자)과 다르고 재시도·폴백·정렬 호출까지 전부 과금되므로, 요청마다 헤더를 합산해 run 에 기록한다.
 * 워커는 TTS 작업을 한 번에 하나만 돌리므로 모듈 단위 카운터로 충분하다 — tts 단계가 시작할 때 resetUsage(), 끝날 때 usage() 로 읽는다.
 */
export interface UsageMeter { requests: number; credits: number; unmetered: number }
let meter: UsageMeter = { requests: 0, credits: 0, unmetered: 0 };
export function resetUsage(): void { meter = { requests: 0, credits: 0, unmetered: 0 }; }
export function usage(): UsageMeter { return { ...meter }; }
/** 응답 하나를 계측한다 — 헤더가 없거나 숫자가 아니면 unmetered 로 센다(실패 응답도 요청 수에는 든다) */
export function tally(headers: { get(name: string): string | null }): void {
  meter.requests++;
  const h = headers.get("character-cost");
  const n = h == null ? NaN : Number(h);
  if (Number.isFinite(n) && n >= 0) meter.credits += n; else meter.unmetered++;
}

function key(): string {
  if (!cfg.elevenLabsKey) throw new Error("ELEVENLABS_API_KEY 가 없습니다 (서버 deploy/env.prod → compose 가 워커에 주입)");
  return cfg.elevenLabsKey;
}

async function call(path: string, body: unknown, timeoutMs = 8 * 60_000): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: { "xi-api-key": key(), "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    tally(res.headers);
    return res;
  } finally { clearTimeout(t); }
}

/**
 * 한도 (2026-09-26 차단기, T260926-019): ElevenLabs 는 크레딧 소진을 401 + code "quota_exceeded" 로, 분당 한도를 429 로 돌려준다.
 * 작업 실패로 끝내지 않고 ApiLimit(provider elevenlabs) 을 던진다 — 워커 루프가 작업을 큐로 되돌리고 TTS 집기만 멈춘다 (ai-pause.ts). 초안·QA·비평(OpenAI)은 계속 돈다.
 */
function throwIfLimit(status: number, body: string, retriesDone: boolean): void {
  if (/quota_exceeded|exceeds your (api key|subscription)|character limit|out of credits/i.test(body)) throw new ApiLimit("quota", `ElevenLabs 크레딧 소진 (HTTP ${status}): ${body.slice(0, 200)}`, 5 * 60_000, "elevenlabs");
  if (status === 429 && retriesDone) throw new ApiLimit("rate", `ElevenLabs 분당 한도 (HTTP 429): ${body.slice(0, 200)}`, 5 * 60_000, "elevenlabs");
}
const isTierError = (status: number, body: string) =>
  status === 402 || (status === 403 && /output_format|subscription|tier|upgrade/i.test(body));

/** 다중화자 합성 1요청. 429/5xx 재시도 · 티어 제한은 포맷 강등 */
export async function synthDialogue(inputs: DialogueInput[], seed: number, opts: { onRetry?: (msg: string) => void } = {}): Promise<SynthResult> {
  for (let retry = 0; ; ) {
    const format = FORMATS[fmtIdx];
    const res = await call(`/text-to-dialogue?output_format=${format}`, { model_id: cfg.ttsModel, inputs, seed, settings: { stability: 0.5 } });
    if (res.ok) return { data: Buffer.from(await res.arrayBuffer()), format };
    const body = (await res.text()).slice(0, 400);
    throwIfLimit(res.status, body, false); // 크레딧 소진은 재시도해도 같다 — 바로 멈춤
    if (isTierError(res.status, body) && fmtIdx < FORMATS.length - 1) {
      fmtIdx++;
      log(`  tts: ${format} 티어 제한(HTTP ${res.status}) — ${FORMATS[fmtIdx]} 로 강등`);
      continue;
    }
    if ((res.status === 429 || res.status >= 500) && retry < 4) {
      retry++;
      const wait = Math.min(60_000, 5_000 * 2 ** retry);
      opts.onRetry?.(`ElevenLabs HTTP ${res.status} — ${Math.round(wait / 1000)}초 후 재시도`);
      await sleep(wait);
      continue;
    }
    throwIfLimit(res.status, body, true);
    throw new Error(`ElevenLabs dialogue 실패: HTTP ${res.status} ${body}`);
  }
}

export interface TimestampedSynth { audio: Buffer; format: AudioFormat; chars: string[]; startSec: number[]; endSec: number[] }

/**
 * 단일 화자 합성 + 문자 타임스탬프. 콜드오픈 발췌 절단용이었으나 콜드오픈 폐지(2026-09-07)로 **현재 사용처 없음** —
 * 부분 재합성·구간 절단이 다시 필요할 때를 위해 남겨 둔다. 포맷은 TS_FORMATS 사다리.
 */
export async function synthTurnWithTimestamps(voiceId: string, text: string, seed: number): Promise<TimestampedSynth> {
  for (let retry = 0; ; ) {
    const format = TS_FORMATS[fmtIdx];
    const res = await call(`/text-to-speech/${voiceId}/with-timestamps?output_format=${format}`, { model_id: cfg.ttsModel, text, seed });
    if (res.ok) {
      const d = (await res.json()) as { audio_base64: string; alignment?: { characters: string[]; character_start_times_seconds: number[]; character_end_times_seconds: number[] } };
      const a = d.alignment;
      if (!a) throw new Error("with-timestamps 응답에 alignment 없음");
      return { audio: Buffer.from(d.audio_base64, "base64"), format, chars: a.characters, startSec: a.character_start_times_seconds, endSec: a.character_end_times_seconds };
    }
    const body = (await res.text()).slice(0, 400);
    throwIfLimit(res.status, body, false); // 크레딧 소진은 재시도해도 같다 — 바로 멈춤
    if (isTierError(res.status, body) && fmtIdx < TS_FORMATS.length - 1) {
      fmtIdx++;
      log(`  tts: ${format} 티어 제한(HTTP ${res.status}) — ${TS_FORMATS[fmtIdx]} 로 강등`);
      continue;
    }
    if ((res.status === 429 || res.status >= 500) && retry < 4) { retry++; await sleep(Math.min(60_000, 5_000 * 2 ** retry)); continue; }
    throwIfLimit(res.status, body, true);
    throw new Error(`ElevenLabs with-timestamps 실패: HTTP ${res.status} ${body}`);
  }
}

/**
 * 다중화자 합성 1요청 + 문자 타임스탬프 (`/text-to-dialogue/with-timestamps`) — 화자별 배속(spec/06 6장)의 턴 경계 재료.
 * 포맷은 TS_FORMATS 사다리(무손실은 wav_44100 — 2026-10-06 KAN-142, 그 전엔 mp3 만 받았다). 티어 강등·재시도 규칙은 synthDialogue 와 같다.
 */
export async function synthDialogueWithTimestamps(inputs: DialogueInput[], seed: number, opts: { onRetry?: (msg: string) => void } = {}): Promise<TimestampedSynth> {
  for (let retry = 0; ; ) {
    const format = TS_FORMATS[fmtIdx];
    const res = await call(`/text-to-dialogue/with-timestamps?output_format=${format}`, { model_id: cfg.ttsModel, inputs, seed, settings: { stability: 0.5 } });
    if (res.ok) {
      const d = (await res.json()) as { audio_base64: string; alignment?: { characters: string[]; character_start_times_seconds: number[]; character_end_times_seconds: number[] } };
      const a = d.alignment;
      if (!a) throw new Error("dialogue with-timestamps 응답에 alignment 없음");
      return { audio: Buffer.from(d.audio_base64, "base64"), format, chars: a.characters, startSec: a.character_start_times_seconds, endSec: a.character_end_times_seconds };
    }
    const body = (await res.text()).slice(0, 400);
    throwIfLimit(res.status, body, false); // 크레딧 소진은 재시도해도 같다 — 바로 멈춤
    if (isTierError(res.status, body) && fmtIdx < TS_FORMATS.length - 1) {
      fmtIdx++;
      log(`  tts: ${format} 티어 제한(HTTP ${res.status}) — ${TS_FORMATS[fmtIdx]} 로 강등`);
      continue;
    }
    if ((res.status === 429 || res.status >= 500) && retry < 4) {
      retry++;
      const wait = Math.min(60_000, 5_000 * 2 ** retry);
      opts.onRetry?.(`ElevenLabs HTTP ${res.status} — ${Math.round(wait / 1000)}초 후 재시도`);
      await sleep(wait);
      continue;
    }
    throwIfLimit(res.status, body, true);
    throw new Error(`ElevenLabs dialogue with-timestamps 실패: HTTP ${res.status} ${body}`);
  }
}

/** 강제 정렬 업로드의 형식 표시 — 헤더로 알아본다: RIFF = 무손실 원본(wav_44100) · ftyp = 배포본 dist.m4a(2026-10-06~) · 그 밖(합성 mp3·구 배포본 dist.mp3)은 mp3 */
export function alignmentUpload(audio: Buffer): { type: string; name: string } {
  if (audio.subarray(0, 4).toString("latin1") === "RIFF") return { type: "audio/wav", name: "audio.wav" };
  if (audio.subarray(4, 8).toString("latin1") === "ftyp") return { type: "audio/mp4", name: "dist.m4a" };
  return { type: "audio/mpeg", name: "dist.mp3" };
}

/**
 * 강제 정렬 (2026-09-20, KAN-72 소급 — spec/06 7장): 완성된 오디오와 그 대본 텍스트를 주면 글자·단어 단위 시각을 돌려준다.
 * `POST /v1/forced-alignment` multipart(file, text) — 시각은 그 오디오 기준이라 배속·무음 계산이 필요 없다. 1GB 이하.
 */
export async function forcedAlignment(audio: Buffer, text: string, timeoutMs = 10 * 60_000): Promise<{ characters: { text: string; start: number; end: number }[]; words: { text: string; start: number; end: number; loss: number }[]; loss: number }> {
  const form = new FormData();
  const up = alignmentUpload(audio);
  form.append("file", new Blob([new Uint8Array(audio)], { type: up.type }), up.name);
  form.append("text", text);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE}/forced-alignment`, { method: "POST", headers: { "xi-api-key": key() }, body: form, signal: ctrl.signal });
    tally(res.headers);
    const body = await res.text();
    if (!res.ok) { throwIfLimit(res.status, body, true); throw new Error(`ElevenLabs forced-alignment 실패: HTTP ${res.status} ${body.slice(0, 300)}`); }
    const data = JSON.parse(body);
    return { characters: data.characters ?? [], words: data.words ?? [], loss: Number(data.loss ?? 0) };
  } finally { clearTimeout(t); }
}

/**
 * 턴 목록의 시작 시각을 문자 정렬에서 순서대로 찾는다 (공백 무시 대조, 앞 턴 뒤에서만 검색).
 * 하나라도 못 찾으면 null — 호출부가 배속 없이 폴백한다.
 */
export function locateTurnStarts(t: TimestampedSynth, texts: string[]): number[] | null {
  return locateTurnSpans(t, texts)?.map((s) => s.start) ?? null;
}

/**
 * 턴별 [첫 글자 시작, 마지막 글자 끝] + 첫 글자 끝(firstEnd)·마지막 글자 시작(lastStart) (2026-09-22 KAN-87).
 * ElevenLabs 정렬은 글자가 빈틈없이 이어진다 — 턴 사이 쉼은 앞 턴 마침표나 뒤 턴 첫 글자의 길이에 흡수된다(실측: "."@61.76–62.48, "그"@24.72–26.16).
 * 그래서 `다음 start − 이 end` 는 항상 0 이고, 쉼의 실제 위치는 [lastStart, 다음 firstEnd] 창 안에서 오디오로 찾아야 한다(audio.findPauseCut).
 */
export interface TurnSpan { start: number; end: number; firstEnd: number; lastStart: number }
export function locateTurnSpans(t: TimestampedSynth, texts: string[]): TurnSpan[] | null {
  const strip = (s: string) => s.replace(/\s+/g, "");
  const map: number[] = [];                       // 공백 제외 인덱스 → 정렬 배열 인덱스
  const hayChars: string[] = [];
  t.chars.forEach((c, i) => { if (c.trim()) { map.push(i); hayChars.push(c); } });
  const hay = hayChars.join("");
  const spans: TurnSpan[] = [];
  let cursor = 0;
  for (const text of texts) {
    const needle = strip(text);
    if (!needle) return null;
    const at = hay.indexOf(needle, cursor);
    if (at < 0) return null;
    const i0 = map[at], i1 = map[at + needle.length - 1];
    spans.push({ start: t.startSec[i0], end: t.endSec[i1], firstEnd: t.endSec[i0], lastStart: t.startSec[i1] });
    cursor = at + needle.length;
  }
  return spans;
}

/** 발췌(부분 문자열)의 시작·끝 시각을 문자 정렬에서 찾는다. 공백 차이는 무시하고 대조한다 */
export function locateExcerpt(t: TimestampedSynth, turnText: string, excerpt: string): { start: number; end: number } | null {
  const strip = (s: string) => s.replace(/\s+/g, "");
  const hay = strip(turnText);
  const needle = strip(excerpt);
  const at = hay.indexOf(needle);
  if (at < 0) return null;
  // 정렬 문자열에서 공백 제외 인덱스 → 정렬 배열 인덱스 매핑
  const map: number[] = [];
  t.chars.forEach((c, i) => { if (c.trim()) map.push(i); });
  const si = map[at];
  const ei = map[Math.min(at + needle.length - 1, map.length - 1)];
  if (si == null || ei == null) return null;
  return { start: t.startSec[si], end: t.endSec[ei] };
}
