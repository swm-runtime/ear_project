import { test } from "node:test";
import assert from "node:assert/strict";
import { agentGateBlockers } from "./agent-gate.js";

// 2026-10-16 글로벌 명세 6.10 — 콘솔을 거치지 않는 패키지(비평 뒤 자동 연쇄)도 에이전트 판정 조건을 지킨다
test("판정이 없으면 막는다", () => {
  assert.deepEqual(agentGateBlockers(null), ["에이전트 판정이 아직 없습니다"]);
  assert.deepEqual(agentGateBlockers({ flags: {} }), ["에이전트 판정이 아직 없습니다"]);
});

test("발행 가능이고 필수 수정이 전부 fixed 면 통과한다", () => {
  assert.deepEqual(agentGateBlockers({ agent: { publishable: true, must_fix: [{ id: "M1", status: "fixed" }] } }), []);
});

test("발행 불가와 반영 안 된 필수 수정을 모두 사유로 낸다", () => {
  const r = agentGateBlockers({ agent: { publishable: false, must_fix: [{ id: "M1", turn: "E3", status: "open" }] } });
  assert.equal(r.length, 2);
  assert.match(r[1], /M1 E3/);
});
