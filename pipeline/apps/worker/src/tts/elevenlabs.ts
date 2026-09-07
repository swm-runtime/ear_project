import { cfg } from "../config.js";
import { log, sleep } from "../util.js";

/**
 * ElevenLabs 클라이언트 (spec/06) — 다중화자 1콜(Text to Dialogue, eleven_v3) 확정 (2026-09-02 박수헌).
 * 요청당 권장 총 2,000자 · 분할은 턴 경계(chunkTurns) · seed 고정으로 재현성을 시도한다.
 * 출력 포맷은 사다리로 시도한다: pcm(무손실, Pro+) → mp3 192k(Creator+) → mp3 128k(전 티어).
 * 구독 제한을 만나면 한 단계 내려가 이후 요청도 고정한다 — 한 에피소드 안에서 포맷을 섞지 않는다.
 */
const BASE = "https://api.elevenlabs.io/v1";

export const FORMATS = ["pcm_44100", "mp3_44100_192", "mp3_44100_128"] as const;
export type AudioFormat = (typeof FORMATS)[number];
let fmtIdx = 0;

export interface DialogueInput { text: string; voice_id: string }
export interface SynthResult { data: Buffer; format: AudioFormat }

function key(): string {
  if (!cfg.elevenLabsKey) throw new Error("ELEVENLABS_API_KEY 가 없습니다 (서버 deploy/env.prod → compose 가 워커에 주입)");
  return cfg.elevenLabsKey;
}

async function call(path: string, body: unknown, timeoutMs = 8 * 60_000): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: { "xi-api-key": key(), "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } finally { clearTimeout(t); }
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
    throw new Error(`ElevenLabs dialogue 실패: HTTP ${res.status} ${body}`);
  }
}

export interface TimestampedSynth { audio: Buffer; format: AudioFormat; chars: string[]; startSec: number[]; endSec: number[] }

/**
 * 단일 화자 합성 + 문자 타임스탬프. 콜드오픈 발췌 절단용이었으나 콜드오픈 폐지(2026-09-07)로 **현재 사용처 없음** —
 * 부분 재합성·구간 절단이 다시 필요할 때를 위해 남겨 둔다.
 * 타임스탬프 응답은 base64 라 포맷은 mp3 계열만 쓴다 (pcm 자리는 192k 로 대체).
 */
export async function synthTurnWithTimestamps(voiceId: string, text: string, seed: number): Promise<TimestampedSynth> {
  for (let retry = 0; ; ) {
    const format = FORMATS[Math.max(fmtIdx, 1)];
    const res = await call(`/text-to-speech/${voiceId}/with-timestamps?output_format=${format}`, { model_id: cfg.ttsModel, text, seed });
    if (res.ok) {
      const d = (await res.json()) as { audio_base64: string; alignment?: { characters: string[]; character_start_times_seconds: number[]; character_end_times_seconds: number[] } };
      const a = d.alignment;
      if (!a) throw new Error("with-timestamps 응답에 alignment 없음");
      return { audio: Buffer.from(d.audio_base64, "base64"), format, chars: a.characters, startSec: a.character_start_times_seconds, endSec: a.character_end_times_seconds };
    }
    const body = (await res.text()).slice(0, 400);
    if (isTierError(res.status, body) && fmtIdx < FORMATS.length - 1) {
      fmtIdx = Math.max(fmtIdx, 1) + 1;
      log(`  tts: ${format} 티어 제한(HTTP ${res.status}) — ${FORMATS[Math.max(fmtIdx, 1)]} 로 강등`);
      continue;
    }
    if ((res.status === 429 || res.status >= 500) && retry < 4) { retry++; await sleep(Math.min(60_000, 5_000 * 2 ** retry)); continue; }
    throw new Error(`ElevenLabs with-timestamps 실패: HTTP ${res.status} ${body}`);
  }
}

/**
 * 다중화자 합성 1요청 + 문자 타임스탬프 (`/text-to-dialogue/with-timestamps`) — 화자별 배속(spec/06 6장)의 턴 경계 재료.
 * 응답이 base64 JSON 이라 포맷은 mp3 계열만 쓴다. 티어 강등·재시도 규칙은 synthDialogue 와 같다.
 */
export async function synthDialogueWithTimestamps(inputs: DialogueInput[], seed: number, opts: { onRetry?: (msg: string) => void } = {}): Promise<TimestampedSynth> {
  for (let retry = 0; ; ) {
    const format = FORMATS[Math.max(fmtIdx, 1)];
    const res = await call(`/text-to-dialogue/with-timestamps?output_format=${format}`, { model_id: cfg.ttsModel, inputs, seed, settings: { stability: 0.5 } });
    if (res.ok) {
      const d = (await res.json()) as { audio_base64: string; alignment?: { characters: string[]; character_start_times_seconds: number[]; character_end_times_seconds: number[] } };
      const a = d.alignment;
      if (!a) throw new Error("dialogue with-timestamps 응답에 alignment 없음");
      return { audio: Buffer.from(d.audio_base64, "base64"), format, chars: a.characters, startSec: a.character_start_times_seconds, endSec: a.character_end_times_seconds };
    }
    const body = (await res.text()).slice(0, 400);
    if (isTierError(res.status, body) && fmtIdx < FORMATS.length - 1) {
      fmtIdx = Math.max(fmtIdx, 1) + 1;
      log(`  tts: ${format} 티어 제한(HTTP ${res.status}) — ${FORMATS[Math.max(fmtIdx, 1)]} 로 강등`);
      continue;
    }
    if ((res.status === 429 || res.status >= 500) && retry < 4) {
      retry++;
      const wait = Math.min(60_000, 5_000 * 2 ** retry);
      opts.onRetry?.(`ElevenLabs HTTP ${res.status} — ${Math.round(wait / 1000)}초 후 재시도`);
      await sleep(wait);
      continue;
    }
    throw new Error(`ElevenLabs dialogue with-timestamps 실패: HTTP ${res.status} ${body}`);
  }
}

/**
 * 턴 목록의 시작 시각을 문자 정렬에서 순서대로 찾는다 (공백 무시 대조, 앞 턴 뒤에서만 검색).
 * 하나라도 못 찾으면 null — 호출부가 배속 없이 폴백한다.
 */
export function locateTurnStarts(t: TimestampedSynth, texts: string[]): number[] | null {
  const strip = (s: string) => s.replace(/\s+/g, "");
  const map: number[] = [];                       // 공백 제외 인덱스 → 정렬 배열 인덱스
  const hayChars: string[] = [];
  t.chars.forEach((c, i) => { if (c.trim()) { map.push(i); hayChars.push(c); } });
  const hay = hayChars.join("");
  const starts: number[] = [];
  let cursor = 0;
  for (const text of texts) {
    const needle = strip(text);
    if (!needle) return null;
    const at = hay.indexOf(needle, cursor);
    if (at < 0) return null;
    starts.push(t.startSec[map[at]]);
    cursor = at + needle.length;
  }
  return starts;
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
