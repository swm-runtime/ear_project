import { test } from "node:test";
import assert from "node:assert/strict";
import { axisContributions, fmtCounts, fmtScore, fmtStars, fmtWeight, SIGNAL_ACTION_LABEL } from "./recommendation-inspector-format";

const WEIGHTS = { embedding: 0.3, signal: 0.35, meta: 0.35 };

test("axisContributions — 세 축이 다 있으면 상수 가중치 그대로, 기여분 합이 가중 평균(최종 점수)이다", () => {
  const rows = axisContributions({ embedding: 0.8, signal: 0.6, meta: 0.5 }, WEIGHTS);
  // 부동소수 합(0.3 + 0.35 + 0.35)으로 나누므로 근사 비교
  [0.3, 0.35, 0.35].forEach((w, i) => assert.ok(Math.abs(rows[i].effectiveWeight - w) < 1e-12));
  const total = rows.reduce((sum, r) => sum + r.contribution, 0);
  assert.ok(Math.abs(total - (0.8 * 0.3 + 0.6 * 0.35 + 0.5 * 0.35)) < 1e-12);
});

test("axisContributions — 빠진 축(null)은 0 이고 나머지 가중치로 다시 나눈다(서버 weightedMean 재정규화)", () => {
  const rows = axisContributions({ embedding: null, signal: 0.6, meta: 0.4 }, WEIGHTS);
  assert.equal(rows[0].effectiveWeight, 0);
  assert.equal(rows[0].contribution, 0);
  assert.ok(Math.abs(rows[1].effectiveWeight - 0.5) < 1e-12);
  assert.ok(Math.abs(rows.reduce((s, r) => s + r.contribution, 0) - 0.5) < 1e-12);
});

test("axisContributions — 축이 전부 없으면 실효 가중치는 모두 0", () => {
  const rows = axisContributions({ embedding: null, signal: null, meta: null }, WEIGHTS);
  assert.deepEqual(rows.map((r) => r.effectiveWeight), [0, 0, 0]);
});

test("fmtScore · fmtWeight — null 은 '-', 점수는 소수 셋째 자리", () => {
  assert.equal(fmtScore(null), "-");
  assert.equal(fmtScore(0.12345), "0.123");
  assert.equal(fmtWeight(0.35), "0.35");
  assert.equal(fmtWeight(1 / 3), "0.333");
});

test("fmtCounts — 많은 순, 0 은 빼고, 비면 '없음'", () => {
  assert.equal(fmtCounts({ play: 1, complete: 3, save: 0 }, SIGNAL_ACTION_LABEL), "완청 3 · 재생 1");
  assert.equal(fmtCounts({}), "없음");
});

test("fmtStars — 5점 만점 별, 없으면 '-'", () => {
  assert.equal(fmtStars(4), "★★★★☆");
  assert.equal(fmtStars(null), "-");
});
