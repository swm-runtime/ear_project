import { test } from "node:test";
import assert from "node:assert/strict";
import { longestQuietRun, speechIslands, guardCutFromIslands, trailingBlip, pcmTrailingBlip } from "./audio.js";

test("조용한 구간 — 창 최저값 + 12dB 아래로 가장 긴 연속 구간, 짧으면 null", () => {
  // 말(−20) 10칸 · 쉼(−60~−58) 30칸 · 말(−22) 10칸 → 쉼 0.6초(20ms 홉)
  const db = [...Array(10).fill(-20), ...Array(30).fill(0).map((_, i) => -60 + (i % 3)), ...Array(10).fill(-22)];
  assert.deepEqual(longestQuietRun(db, 0.02, 0.12), { start: 0.2, end: 0.8 });
  // 바닥이 −40 인 시끄러운 쉼도 상대 문턱(−28)으로 잡는다 — 단 상한 −35 가 있어 −30 짜리는 못 잡는다
  assert.deepEqual(longestQuietRun([-20, -20, -40, -40, -40, -40, -40, -40, -40, -20], 0.02, 0.12), { start: 0.04, end: 0.18 });
  assert.equal(longestQuietRun([-20, -20, -30, -30, -30, -30, -30, -30, -30, -20], 0.02, 0.12), null);
  // 너무 짧은 쉼은 null
  assert.equal(longestQuietRun([-20, -20, -60, -60, -20, -20], 0.02, 0.12), null);
  assert.equal(longestQuietRun([], 0.02, 0.12), null);
  // 디코더 프라이밍의 디지털 0 프레임은 바닥 계산에서 뺀다 (안 빼면 문턱 −108dB 로 아무것도 안 잡힌다)
  assert.deepEqual(longestQuietRun([-120, -20, -20, -60, -60, -60, -60, -60, -60, -60, -20], 0.02, 0.12), { start: 0.06, end: 0.2 });
  assert.equal(longestQuietRun([-120, -120], 0.02, 0.02), null);
  // maxStartSec 뒤에 시작하는 더 긴 쉼(뒤 턴 첫 낱말 뒤)은 버리고 그 앞의 짧은 쉼을 고른다
  const two = [-20, -60, -60, -60, -60, -60, -60, -60, -20, -20, -20, -60, -60, -60, -60, -60, -60, -60, -60, -20];
  assert.deepEqual(longestQuietRun(two, 0.02, 0.12), { start: 0.22, end: 0.38 }); // 제한 없으면 뒤 것(8칸)
  assert.deepEqual(longestQuietRun(two, 0.02, 0.12, { maxStartSec: 0.1 }), { start: 0.02, end: 0.16 });
});

// 끝 꼬리 (2026-10-01): 마지막 낱말 직후의 첫 쉼을 찾는다 — 가장 긴 쉼이 아니라 첫 쉼, 짧은 정지(폐쇄음)는 건너뛴다
test("firstQuietRun — 0.15초 미만 정지는 건너뛰고 첫 긴 쉼을 고른다", async () => {
  const { firstQuietRun } = await import("./audio.js");
  // 20ms 프레임: 말(-22) 10 · 짧은 정지(-70) 3 · 말 10 · 첫 쉼(-72) 20 · 덧말(-20) 10 · 긴 쉼(-75) 40
  const db = [...Array(10).fill(-22), ...Array(3).fill(-70), ...Array(10).fill(-22), ...Array(20).fill(-72), ...Array(10).fill(-20), ...Array(40).fill(-75)];
  const q = firstQuietRun(db, 0.02, 0.15);
  assert.ok(q && Math.abs(q.start - 0.46) < 1e-9 && Math.abs(q.end - 0.86) < 1e-9, JSON.stringify(q));
  assert.equal(firstQuietRun(Array(20).fill(-20), 0.02, 0.15), null);
});

test("fadeOutPcm — 끝 n 샘플을 선형으로 0 까지 줄이고 앞은 그대로 둔다", async () => {
  const { fadeOutPcm } = await import("./audio.js");
  const buf = Buffer.alloc(2 * 100); for (let i = 0; i < 100; i++) buf.writeInt16LE(10000, i * 2);
  const out = fadeOutPcm(buf, 10 / 44100);
  assert.equal(out.readInt16LE(0), 10000);
  assert.equal(out.readInt16LE(89 * 2), 10000);
  assert.equal(out.readInt16LE(99 * 2), 0);
  assert.ok(out.readInt16LE(94 * 2) > 0 && out.readInt16LE(94 * 2) < 10000);
  assert.equal(buf.readInt16LE(99 * 2), 10000); // 원본은 건드리지 않는다
});

// 끝 꼬리 v2·덧말 검수 (2026-10-08 박수헌 "마지막 인사 뒤 대본에 없는 '네~'") — 시각은 10-08 56편 실측 패턴(배포본 끝, 20ms 프레임)
const isl = (...xs: [number, number][]) => xs.map(([start, end]) => ({ start, end, peak: -12 }));

test("말소리 덩어리 — 최고값 −30dB 문턱, 0.1초 이하 틈(폐쇄음 정지)은 잇고 그보다 긴 쉼은 가른다", () => {
  const db = [...Array(30).fill(-10), ...Array(4).fill(-60), ...Array(20).fill(-12), ...Array(12).fill(-60), ...Array(8).fill(-15)];
  const r = speechIslands(db, 0.02);
  assert.equal(r.length, 2);
  assert.ok(Math.abs(r[0].end - 1.08) < 1e-9 && Math.abs(r[1].start - 1.32) < 1e-9);
});

test("덧말 절단 — 마지막 덩어리가 덧말, 그 앞 덩어리 끝 + min(0.1, 쉼/2)에서 자른다", () => {
  const r = guardCutFromIslands(isl([0, 0.62], [0.82, 1.1]), 0.4);
  assert.ok(!("fail" in r));
  if (!("fail" in r)) { assert.ok(Math.abs(r.cut - 0.72) < 1e-9); assert.ok(Math.abs(r.gap - 0.2) < 1e-9); }
});

test("덧말 절단 — 판정 불능은 사유를 돌려준다(붙음·안 들림·너무 김)", () => {
  assert.ok("fail" in guardCutFromIslands(isl([0, 1.4]), 0.4));                    // 마지막 음절과 덧말이 한 덩어리
  assert.ok("fail" in guardCutFromIslands(isl([0, 0.3], [0.4, 0.62]), 0.45));       // 마지막 덩어리가 마지막 글자 — 덧말이 안 들림
  assert.ok("fail" in guardCutFromIslands(isl([0, 0.5], [0.7, 1.75]), 0.3));        // 1.05초 — 덧말이 아니다
});

test("덧말 검수 — 남은 \"네\" 앞부분(T260923-014: 쉼 0.26초 뒤 0.18초)을 잡는다", () => {
  const b = trailingBlip(isl([0, 1.06], [1.32, 1.5]), 1.5);
  assert.ok(b && Math.abs(b.gap - 0.26) < 1e-9);
});

test("덧말 검수 — 깨끗한 끝(T260923-007: 마지막 음절이 0.1초 틈 뒤, 끝 0.1초 전에 끝남)은 통과", () => {
  assert.equal(trailingBlip(isl([0, 0.78], [0.88, 1.4]), 1.5), null);
});

test("덧말 검수 — PCM 끝 1.5초에 바로 적용한다", () => {
  const rate = 44100, tone = (sec: number) => Buffer.from(Int16Array.from({ length: Math.round(sec * rate) }, (_, i) => Math.round(8000 * Math.sin(i / 7))).buffer);
  const silence = (sec: number) => Buffer.alloc(Math.round(sec * rate) * 2);
  assert.ok(pcmTrailingBlip(Buffer.concat([tone(1.2), silence(0.25), tone(0.15)])));
  assert.equal(pcmTrailingBlip(Buffer.concat([tone(1.2), silence(0.25)])), null);
});
