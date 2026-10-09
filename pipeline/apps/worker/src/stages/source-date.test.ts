import { test } from "node:test";
import assert from "node:assert/strict";
import { toPgDate } from "../db.js";

// 2026-10-09 — 보강 검색이 발행일을 "2026"으로 줘 날짜 칸 삽입이 실패했다(C267). 넣기 전에 날짜로 정리한다
test("연도만·연월만 오면 그 해·그 달 첫날로 바꾼다", () => {
  assert.equal(toPgDate("2026"), "2026-01-01");
  assert.equal(toPgDate("2026-05"), "2026-05-01");
  assert.equal(toPgDate("2026.5"), "2026-05-01");
});

test("날짜·시각은 날짜만 남긴다", () => {
  assert.equal(toPgDate("2026-09-26"), "2026-09-26");
  assert.equal(toPgDate("2026-09-26T08:41:00Z"), "2026-09-26");
});

test("읽을 수 없거나 없는 날짜는 비운다", () => {
  assert.equal(toPgDate(null), null);
  assert.equal(toPgDate(""), null);
  assert.equal(toPgDate("unknown"), null);
  assert.equal(toPgDate("2026-02-30"), null);
  assert.equal(toPgDate("Sep 2026"), null);
});
