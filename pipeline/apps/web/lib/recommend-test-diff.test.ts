import { test } from "node:test";
import assert from "node:assert/strict";
import { diffRanked, rankMark } from "./recommend-test-diff";

test("첫 스냅샷(직전 없음)은 전부 same 이고 빠진 것도 없다", () => {
  const d = diffRanked(null, ["a", "b"]);
  assert.deepEqual([...d.changes.values()], [{ kind: "same", delta: 0 }, { kind: "same", delta: 0 }]);
  assert.deepEqual(d.removed, []);
});

test("새로 들어온 것은 new, 순위가 오르면 up(양수), 내리면 down(음수), 빠진 것은 removed 에 직전 순서로", () => {
  const d = diffRanked(["a", "b", "c", "d"], ["c", "a", "x", "b"]);
  assert.deepEqual(d.changes.get("c"), { kind: "up", delta: 2 });
  assert.deepEqual(d.changes.get("a"), { kind: "down", delta: -1 });
  assert.deepEqual(d.changes.get("x"), { kind: "new", delta: 0 });
  assert.deepEqual(d.changes.get("b"), { kind: "down", delta: -2 });
  assert.deepEqual(d.removed, ["d"]);
});

test("같은 자리면 same 이고 표식은 빈 문자열이다", () => {
  const d = diffRanked(["a", "b"], ["a", "b"]);
  assert.deepEqual(d.changes.get("a"), { kind: "same", delta: 0 });
  assert.equal(rankMark(d.changes.get("a")), "");
  assert.equal(rankMark({ kind: "up", delta: 3 }), "▲3");
  assert.equal(rankMark({ kind: "down", delta: -2 }), "▼2");
  assert.equal(rankMark({ kind: "new", delta: 0 }), "NEW");
  assert.equal(rankMark(undefined), "");
});
