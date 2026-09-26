import { test } from "node:test";
import assert from "node:assert/strict";
import { chunkSegments, contextExcerpt, displayText, joinChunkSegments, retimedAt, validateSegments } from "./segments.js";
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

test("요청 합치기 — 앞 무음 2초 + 요청 사이 이음새 쉼 + 앞 요청 실측 길이", () => {
  const chunks = [
    { segments: [{ start_sec: 0, end_sec: 3, speaker: "윤아", text: "a" }], durSec: 3.5 },
    { segments: [{ start_sec: 0, end_sec: 2, speaker: "이음", text: "b" }], durSec: 2 },
  ];
  const joined = joinChunkSegments(chunks, 2, 0.35);
  assert.deepEqual(joined.map((s) => [s.start_sec, s.end_sec]), [[2, 5], [5.85, 7.85]]);
  assert.equal(validateSegments(joined), null);
  assert.deepEqual(joinChunkSegments(chunks, 2, 0.9).map((s) => s.start_sec), [2, 6.4]); // 쉼 길이는 assemble 과 같은 값을 넘긴다
  assert.deepEqual(joinChunkSegments(chunks, 2, [0]).map((s) => s.start_sec), [2, 5.5]); // 문맥 겹침 경계 — 무음 없음
});

test("문맥 발췌 — 끝 문장들(tail)·첫 문장들(head)을 상한 안에서, 원문의 연속 부분 문자열", () => {
  const t = "첫 문장이에요. 둘째 문장은 조금 더 길어요. 셋째는 질문인가요? 넷째로 끝나요.";
  assert.equal(contextExcerpt(t, "tail", 12), "넷째로 끝나요.");
  assert.equal(contextExcerpt(t, "tail", 30), "셋째는 질문인가요? 넷째로 끝나요.");
  assert.equal(contextExcerpt(t, "head", 20), "첫 문장이에요.");
  for (const side of ["head", "tail"] as const) assert.ok(t.includes(contextExcerpt(t, side, 30)));
  const long = "가나다 ".repeat(60).trim(); // 한 문장이 상한을 넘으면 어절 경계로 자른다
  assert.ok(contextExcerpt(long, "tail", 40).length <= 40 && long.endsWith(contextExcerpt(long, "tail", 40)));
  assert.ok(contextExcerpt(long, "head", 40).length <= 40 && long.startsWith(contextExcerpt(long, "head", 40)));
});

test("문맥 발췌 — 끝 문장들(tail)·첫 문장들(head)을 상한 안에서, 원문의 연속 부분 문자열", () => {
  const t = "첫 문장이에요. 둘째 문장은 조금 더 길어요. 셋째는 질문인가요? 넷째로 끝나요.";
  assert.equal(contextExcerpt(t, "tail", 12), "넷째로 끝나요.");
  assert.equal(contextExcerpt(t, "tail", 30), "셋째는 질문인가요? 넷째로 끝나요.");
  assert.equal(contextExcerpt(t, "head", 20), "첫 문장이에요.");
  for (const side of ["head", "tail"] as const) assert.ok(t.includes(contextExcerpt(t, side, 30)));
  const long = "가나다 ".repeat(60).trim(); // 한 문장이 상한을 넘으면 어절 경계로 자른다
  assert.ok(contextExcerpt(long, "tail", 40).length <= 40 && long.endsWith(contextExcerpt(long, "tail", 40)));
  assert.ok(contextExcerpt(long, "head", 40).length <= 40 && long.startsWith(contextExcerpt(long, "head", 40)));
});

test("검증 — 겹침·역순을 잡는다", () => {
  assert.match(validateSegments([{ start_sec: 0, end_sec: 2, speaker: null, text: "a" }, { start_sec: 1, end_sec: 3, speaker: null, text: "b" }]) ?? "", /겹침/);
  assert.match(validateSegments([{ start_sec: 2, end_sec: 1, speaker: null, text: "a" }]) ?? "", /시각 오류/);
});

test("화면용 원문 — TTS 감정 태그를 뺀다", () => {
  assert.equal(displayText("[surprised] 네? 이자가 나가는데요"), "네? 이자가 나가는데요");
  assert.equal(displayText("괄호 [한글] 은 남긴다"), "괄호 [한글] 은 남긴다");
});
