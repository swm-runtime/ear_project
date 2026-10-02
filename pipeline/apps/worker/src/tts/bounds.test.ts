import { test } from "node:test";
import assert from "node:assert/strict";
import { alignmentGap, gapMid, pieceBounds } from "./bounds.js";

test("정렬 범위 — 마지막 글자 끝이 오디오 끝 가까이면 정상, 2초 넘게 앞서거나 0.3초 넘게 넘으면 실패", () => {
  assert.equal(alignmentGap(271.4, 271.7), null);
  assert.equal(alignmentGap(261.4, 271.7), "정렬이 오디오 끝 10.3초 앞에서 끝남"); // dialogue 정렬의 누적 오차(디버그 실측)
  assert.match(alignmentGap(272.5, 271.7) ?? "", /넘음/);
  assert.equal(alignmentGap(0, 10), "정렬 시각 없음");
});

test("쉼 한가운데 — 겹치면 null", () => {
  assert.equal(gapMid(10, 10.5), 10.25);
  assert.equal(gapMid(10, 10), 10);
  assert.equal(gapMid(10.2, 10), null);
});

test("배속 조각 경계 — 첫 턴은 시작, 나머지는 앞 턴 끝과의 쉼 가운데", () => {
  assert.deepEqual(pieceBounds([{ start: 0.1, end: 3 }, { start: 3.6, end: 8 }, { start: 8, end: 9 }]), [0.1, 3.3, 8]);
});
