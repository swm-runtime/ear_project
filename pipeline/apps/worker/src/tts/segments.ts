/**
 * 대본 세그먼트 (앱 자막 — KAN-72, spec/06 7장) — 턴마다 배포본(dist.mp3) 기준 시작·끝 시각을 붙인다.
 *
 * 재료는 화자별 배속(spec/06 6장)이 이미 받아 두는 문자 정렬(`/text-to-dialogue/with-timestamps`)이다. 정렬 시각은
 * 배속 전 요청 오디오 기준이라, 여기서 (1) 조각별 atempo 비율로 배속 후 시각으로 옮기고 (2) 요청 앞의 누적 오프셋
 * (앞 무음 + 앞 요청들의 실제 길이 + 요청 사이 무음)을 더한다. 조각 = [턴 시작, 다음 턴 시작) 이라 요청 끝의 여백 길이는
 * 몰라도 되고, 요청의 실제 길이는 배속 결과 PCM 길이로 잰다(예측치가 아니라 실측).
 *
 * 긴 턴(기본 25초 초과)은 문장 경계에서 나눈다 — 원문과 합성용 표기의 문장 수가 같을 때만(다르면 턴 통째로).
 * `text` 는 사람이 읽는 원문(TTS 표기 아님), `speaker` 는 화면에 그대로 찍힌다.
 */
import type { TimestampedSynth } from "./elevenlabs.js";

export interface ScriptSegment { start_sec: number; end_sec: number; speaker: string | null; text: string }

/** 화면용 원문 — 대본에 남은 TTS 감정 태그("[surprised]" 류, v3 시절 구 대본)는 읽을 글이 아니라 뺀다 */
export const displayText = (s: string) => s.replace(/\[[a-z][a-z _-]{1,24}\]/g, "").replace(/\s{2,}/g, " ").trim();

export interface ChunkTurn { speaker: string; text: string; ttsText: string; tempo: number }

/**
 * 문맥 겹침(2026-09-22 KAN-87)용 발췌 — 앞 요청 마지막 턴의 **끝 문장들**(tail) 또는 뒤 요청 첫 턴의 **첫 문장들**(head)을 maxChars 안에서.
 * 한 문장이 maxChars 를 넘으면 그 문장의 끝/앞 maxChars 자(어절 경계). 결과는 원문의 연속 부분 문자열이라 정렬 대조(locateTurnSpans)가 그대로 된다.
 */
export function contextExcerpt(text: string, side: "head" | "tail", maxChars = 140): string {
  const sents = text.split(/(?<=[.!?…。])\s+/).filter((x) => x.trim());
  const pick: string[] = [];
  let len = 0;
  for (const sent of side === "tail" ? [...sents].reverse() : sents) {
    if (pick.length && len + sent.length + 1 > maxChars) break;
    pick.push(sent); len += sent.length + 1;
  }
  let out = (side === "tail" ? pick.reverse() : pick).join(" ");
  if (out.length > maxChars) {
    if (side === "tail") { const cut = out.length - maxChars; const sp = out.indexOf(" ", cut); out = out.slice(sp > 0 ? sp + 1 : cut); }
    else { const sp = out.lastIndexOf(" ", maxChars); out = out.slice(0, sp > 0 ? sp : maxChars); }
  }
  return out.trim();
}

/** 배속 전 요청 시각 → 배속 후 시각. 경계 b[i]=턴 i 시작(b[0]=0), 조각 i 의 배속 tempo[i] */
export function retimedAt(t: number, starts: number[], tempos: number[]): number {
  let acc = 0;
  for (let i = 0; i < starts.length; i++) {
    const b0 = i === 0 ? 0 : starts[i];
    const b1 = i + 1 < starts.length ? starts[i + 1] : Infinity;
    if (t < b1) return acc + Math.max(0, t - b0) / tempos[i];
    acc += (b1 - b0) / tempos[i];
  }
  return acc;
}

const SENTENCE_SPLIT = /(?<=[.!?…。])\s+/;
const stripWs = (s: string) => s.replace(/\s+/g, "");

/**
 * 한 요청(청크)의 세그먼트 — 요청 안 로컬 시각(0 = 배속 후 요청 시작). 호출부가 오프셋을 더한다.
 * @param starts  locateTurnStarts 결과 (배속 전, 턴 i 시작 시각)
 * @param chunkDurSec 배속 후 요청의 실제 길이 (PCM 길이로 실측)
 */
export function chunkSegments(turns: ChunkTurn[], ts: TimestampedSynth, starts: number[], chunkDurSec: number, maxTurnSec = 25): ScriptSegment[] {
  const tempos = turns.map((t) => t.tempo);
  const map: number[] = []; const hayChars: string[] = [];
  ts.chars.forEach((c, i) => { if (c.trim()) { map.push(i); hayChars.push(c); } });
  const hay = hayChars.join("");
  const out: ScriptSegment[] = [];
  let cursor = 0;
  for (let i = 0; i < turns.length; i++) {
    const t = turns[i];
    const turnStart = i === 0 ? 0 : retimedAt(starts[i], starts, tempos);
    const turnEnd = i + 1 < turns.length ? retimedAt(starts[i + 1], starts, tempos) : chunkDurSec;
    const needle = stripWs(t.ttsText);
    const at = hay.indexOf(needle, cursor);
    if (at >= 0) cursor = at + needle.length;
    const pieces = at >= 0 && turnEnd - turnStart > maxTurnSec ? splitLong(t, ts, map, hay, at, starts, tempos, turnStart, turnEnd, maxTurnSec) : null;
    if (pieces) out.push(...pieces);
    else out.push({ start_sec: turnStart, end_sec: turnEnd, speaker: t.speaker, text: displayText(t.text) });
  }
  return out;
}

/** 긴 턴을 문장 묶음으로 — 문장 시작 글자의 정렬 시각을 배속 후로 옮겨 경계로 쓴다. 원문·TTS 표기의 문장 수가 다르면 null */
function splitLong(t: ChunkTurn, ts: TimestampedSynth, map: number[], hay: string, at: number, starts: number[], tempos: number[], turnStart: number, turnEnd: number, maxSec: number): ScriptSegment[] | null {
  const orig = t.text.split(SENTENCE_SPLIT).filter((s) => s.trim());
  const tts = t.ttsText.split(SENTENCE_SPLIT).filter((s) => s.trim());
  if (orig.length < 2 || orig.length !== tts.length) return null;
  // 문장별 시작 시각 (배속 후)
  const sentStart: number[] = [];
  let pos = at;
  for (let k = 0; k < tts.length; k++) {
    const needle = stripWs(tts[k]);
    const idx = hay.indexOf(needle, pos);
    if (idx < 0) return null;
    const alignIdx = map[idx];
    sentStart.push(k === 0 ? turnStart : retimedAt(ts.startSec[alignIdx], starts, tempos));
    pos = idx + needle.length;
  }
  // 탐욕 묶기: maxSec 안에서 문장을 이어 붙인다
  const out: ScriptSegment[] = [];
  let gStart = 0;
  for (let k = 0; k < orig.length; k++) {
    const endOfK = k + 1 < orig.length ? sentStart[k + 1] : turnEnd;
    const nextEnd = k + 2 <= orig.length ? (k + 2 < orig.length ? sentStart[k + 2] : turnEnd) : turnEnd;
    const closeHere = k + 1 === orig.length || nextEnd - sentStart[gStart] > maxSec;
    if (closeHere) {
      out.push({ start_sec: sentStart[gStart], end_sec: endOfK, speaker: t.speaker, text: displayText(orig.slice(gStart, k + 1).join(" ")) });
      gStart = k + 1;
    }
  }
  return out;
}

/** 폴백(문맥 겹침 실패) 경계의 무음 길이 — 같은 요청 안 턴 사이 쉼의 실측(약 0.9~1.1초, X260919-001 무음 검출)에 맞춘 값 (KAN-87) */
export const DEFAULT_GAP_SEC = 0.9;

/** 요청별 세그먼트를 배포본 시각으로 합친다 — 앞 무음 + 요청 사이 무음 + 앞 요청들의 실측 길이 (gapSec 은 assemble 과 같은 값이어야 한다) */
export function joinChunkSegments(chunks: { segments: ScriptSegment[]; durSec: number }[], leadSec = 2, gapSec: number | number[] = DEFAULT_GAP_SEC): ScriptSegment[] {
  const out: ScriptSegment[] = [];
  let offset = leadSec;
  chunks.forEach((c, n) => {
    if (n > 0) offset += Array.isArray(gapSec) ? gapSec[n - 1] ?? 0 : gapSec; // 배열이면 경계별 (문맥 겹침 경계는 0)
    for (const s of c.segments) out.push({ ...s, start_sec: round3(offset + s.start_sec), end_sec: round3(offset + s.end_sec) });
    offset += c.durSec;
  });
  // 서버 검증(admin-api 4.6): 오름차순·겹침 없음·end > start — 이웃 끝을 다음 시작에 맞춰 수치 오차를 없앤다
  for (let i = 0; i + 1 < out.length; i++) if (out[i].end_sec > out[i + 1].start_sec) out[i].end_sec = out[i + 1].start_sec;
  return out.filter((s) => s.end_sec > s.start_sec);
}

/** 서버가 거부할 조건을 미리 잰다 (admin-api 4.6 script_file) — 어긋나면 사유, 통과면 null */
export function validateSegments(segs: ScriptSegment[]): string | null {
  if (segs.length < 1) return "세그먼트 0개";
  if (segs.length > 2000) return `세그먼트 ${segs.length}개 — 상한 2000`;
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    if (!(s.start_sec >= 0) || !(s.end_sec > s.start_sec)) return `#${i + 1} 시각 오류 (${s.start_sec}~${s.end_sec})`;
    if (i > 0 && s.start_sec + 0.05 < segs[i - 1].end_sec) return `#${i + 1} 앞 세그먼트와 겹침`;
    if (s.text.length > 2000) return `#${i + 1} 본문 ${s.text.length}자 — 상한 2000`;
    if (s.speaker != null && s.speaker.length > 50) return `#${i + 1} 화자명 상한 50`;
  }
  return null;
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;
