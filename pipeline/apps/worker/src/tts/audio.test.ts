import { test } from "node:test";
import assert from "node:assert/strict";
import { longestQuietRun } from "./audio.js";

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
});
