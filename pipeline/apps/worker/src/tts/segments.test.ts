import { test } from "node:test";
import assert from "node:assert/strict";
import { chunkSegments, joinChunkSegments, retimedAt, validateSegments } from "./segments.js";
import type { TimestampedSynth } from "./elevenlabs.js";

/** 글자마다 0.1초씩 붙는 가짜 정렬 (공백은 0초) */
function fakeAlign(text: string): TimestampedSynth {
  const chars = [...text]; const startSec: number[] = []; const endSec: number[] = []; let t = 0;
  for (const c of chars) { startSec.push(t); if (c.trim()) t += 0.1; endSec.push(t); }
  return { audio: Buffer.alloc(0), format: "pcm_44100", chars, startSec, endSec };
}

test("배속 후 시각 — 조각별 tempo 로 나눈 누적", () => {
  // 턴 0: 0~10초 tempo 1.2 → 8.333초, 턴 1: 10~20초 tempo 1.0
  const starts = [0, 10], tempos = [1.2, 1.0];
  assert.equal(retimedAt(0, starts, tempos), 0);
  assert.ok(Math.abs(retimedAt(10, starts, tempos) - 8.3333) < 1e-3);
  assert.ok(Math.abs(retimedAt(15, starts, tempos) - 13.3333) < 1e-3);
});

test("턴 단위 세그먼트 — 턴 끝은 다음 턴 시작, 마지막은 요청 실측 길이", () => {
  const a = "안녕하세요 오늘은", b = "네 반갑습니다";
  const ts = fakeAlign(`${a} ${b}`);
  const starts = [0, 0.8]; // b 는 8글자 뒤 시작
  const segs = chunkSegments([
    { speaker: "윤아", text: a, ttsText: a, tempo: 1.2 },
    { speaker: "이음", text: b, ttsText: b, tempo: 1.0 },
  ], ts, starts, 2.0);
  assert.equal(segs.length, 2);
  assert.equal(segs[0].start_sec, 0);
  assert.ok(Math.abs(segs[0].end_sec - 0.8 / 1.2) < 1e-6);
  assert.equal(segs[1].start_sec, segs[0].end_sec);
  assert.equal(segs[1].end_sec, 2.0);
  assert.equal(segs[1].text, b);
});

test("긴 턴은 문장 경계에서 나눈다 — 원문 표기를 싣는다", () => {
  const sents = Array.from({ length: 6 }, (_, i) => `문장${i}입니다열글자를채웁니다.`); // 문장당 1.6초(16글자)
  const orig = sents.map((s, i) => s.replace("문장", `Sentence${i}`).replace(`Sentence${i}${i}`, `Sentence ${i}`)).map((s, i) => `문장 ${i}입니다열글자를채웁니다.`).join(" ");
  const ttsText = sents.join(" ");
  const ts = fakeAlign(ttsText);
  const segs = chunkSegments([{ speaker: "이음", text: orig, ttsText, tempo: 1.0 }], ts, [0], 9.6, 4);
  assert.ok(segs.length >= 2, `나뉘어야 한다: ${segs.length}`);
  assert.equal(segs[0].start_sec, 0);
  assert.equal(segs[segs.length - 1].end_sec, 9.6);
  for (let i = 1; i < segs.length; i++) assert.equal(segs[i].start_sec, segs[i - 1].end_sec);
  assert.ok(segs.every((s) => s.text.includes("문장 ")), "원문(공백 있는 표기)이 실려야 한다");
  assert.ok(segs.every((s) => s.end_sec - s.start_sec <= 4 + 1e-6));
});

test("요청 합치기 — 앞 무음 2초 + 요청 사이 0.35초 + 앞 요청 실측 길이", () => {
  const joined = joinChunkSegments([
    { segments: [{ start_sec: 0, end_sec: 3, speaker: "윤아", text: "a" }], durSec: 3.5 },
    { segments: [{ start_sec: 0, end_sec: 2, speaker: "이음", text: "b" }], durSec: 2 },
  ]);
  assert.deepEqual(joined.map((s) => [s.start_sec, s.end_sec]), [[2, 5], [5.85, 7.85]]);
  assert.equal(validateSegments(joined), null);
});

test("검증 — 겹침·역순을 잡는다", () => {
  assert.match(validateSegments([{ start_sec: 0, end_sec: 2, speaker: null, text: "a" }, { start_sec: 1, end_sec: 3, speaker: null, text: "b" }]) ?? "", /겹침/);
  assert.match(validateSegments([{ start_sec: 2, end_sec: 1, speaker: null, text: "a" }]) ?? "", /시각 오류/);
});
