import { test } from "node:test";
import assert from "node:assert/strict";
import { addDaysLabel, breakdownLabel, changesInWeek, fmtDelta, fmtGap } from "./insights-v2";

test("changesInWeek — 월요일부터 7일 안의 변경만, 다음 월요일은 다음 주다", () => {
  const log = [
    { date: "2026-10-19", label: "a" },
    { date: "2026-10-25", label: "b" },
    { date: "2026-10-26", label: "c" },
  ];
  assert.deepEqual(changesInWeek("2026-10-19", log).map((c) => c.label), ["a", "b"]);
  assert.deepEqual(changesInWeek("2026-10-26", log).map((c) => c.label), ["c"]);
  assert.deepEqual(changesInWeek("2026-10-12", log), []);
});

test("addDaysLabel — 달·해를 넘긴다", () => {
  assert.equal(addDaysLabel("2026-10-26", 7), "2026-11-02");
  assert.equal(addDaysLabel("2026-12-28", 7), "2027-01-04");
});

test("fmtGap · fmtDelta · breakdownLabel", () => {
  assert.equal(fmtGap(0.2), "+20%p");
  assert.equal(fmtGap(-0.153), "-15%p");
  assert.equal(fmtGap(null), "-");
  assert.equal(fmtDelta(5), "+5명");
  assert.equal(fmtDelta(-3), "-3명");
  assert.equal(fmtDelta(0), "±0명");
  assert.equal(breakdownLabel("push", "no"), "알림 못 받음");
  assert.equal(breakdownLabel("provider", "line"), "line");
});
