import { test } from "node:test";
import assert from "node:assert/strict";
process.env.DATABASE_URL ??= "postgres://test";
const { qaCarry } = await import("./draft.js");

test("qaCarry — L0 실패는 QA 이전 회차로 넘기지 않는다", () => {
  const l0 = { location: "대본 전체", item: "L0 형식 계약 (spec/04 4장 줄 문법)", reason: "정리형" };
  const qa = { location: "Y11", item: "8", reason: "없는 전제" };
  assert.deepEqual(qaCarry(1, [qa], [{ turn: "Y11" }]), {});
  assert.deepEqual(qaCarry(3, [l0], [{ turn: "Y10" }]), {});
  assert.deepEqual(qaCarry(4, [qa, l0], [{ turn: "Y11" }]), { prior_failures: [qa], fixes: [{ turn: "Y11" }] });
});
