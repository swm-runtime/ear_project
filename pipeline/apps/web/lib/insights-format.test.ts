import { test } from "node:test";
import assert from "node:assert/strict";
import { fmtListenSec, fmtPct, isSmall, labelOf, maxOf, REASON_LABEL, shortDate, shortId } from "./insights-format";

test("fmtListenSec — 초·분·시간 단위로 바꾸고 100시간부터는 분을 버린다", () => {
  assert.equal(fmtListenSec(42), "42초");
  assert.equal(fmtListenSec(59.6), "1분"); // 반올림 60초 = 1분
  assert.equal(fmtListenSec(720), "12분");
  assert.equal(fmtListenSec(3600), "1시간");
  assert.equal(fmtListenSec(11_100), "3시간 5분");
  assert.equal(fmtListenSec(122_642), "34시간 4분");
  assert.equal(fmtListenSec(4_500_000), "1,250시간");
  assert.equal(fmtListenSec(null), "-");
});

test("fmtPct — 분모 0(null)은 '-', 아니면 소수 한 자리 퍼센트", () => {
  assert.equal(fmtPct(null), "-");
  assert.equal(fmtPct(0), "0.0%");
  assert.equal(fmtPct(34 / 259), "13.1%");
  assert.equal(fmtPct(0.5, 0), "50%");
});

test("라벨 — 알려진 코드는 한국어, 모르는 코드는 원문, null 은 미선택", () => {
  assert.equal(labelOf(REASON_LABEL, "content_quailty"), "콘텐츠 품질");
  assert.equal(labelOf(REASON_LABEL, "something_new"), "something_new");
  assert.equal(labelOf(REASON_LABEL, null), "미선택");
});

test("보조 함수 — shortDate·shortId·maxOf·isSmall", () => {
  assert.equal(shortDate("2026-10-08"), "10-08");
  assert.equal(shortId("0a1b2c3d-4e5f-6071-8293-a4b5c6d7e8f9"), "0a1b2c3d");
  assert.equal(maxOf([{ v: 3 }, { v: 9 }], (r) => r.v), 9);
  assert.equal(maxOf([], () => 0), 1);
  assert.equal(isSmall(0), false);
  assert.equal(isSmall(12), true);
  assert.equal(isSmall(30), false);
});
