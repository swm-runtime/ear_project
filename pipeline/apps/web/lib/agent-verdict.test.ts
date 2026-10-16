import { test } from "node:test";
import assert from "node:assert/strict";
import { agentGate } from "./agent-verdict";

// 2026-10-16 글로벌 명세 6.10 — 에이전트 판정이 발행 가능이고 필수 수정이 전부 반영된 편만 발행 준비·패키지가 열린다
const v = (agent: unknown) => ({ flags: {}, stars: {}, judged_by: "agent:claude-opus-5-5", agent });

test("판정이 없으면 막힌다", () => {
  assert.equal(agentGate(null).ok, false);
  assert.equal(agentGate({ flags: {}, judged_by: "someone@example.com" }).ok, false);
});

test("발행 가능이고 필수 수정이 전부 fixed 면 열린다", () => {
  assert.deepEqual(agentGate(v({ publishable: true, must_fix: [{ id: "M1", turn: "E14", status: "fixed" }] })), { ok: true, blockers: [], openFixes: [] });
  assert.equal(agentGate(v({ publishable: true, must_fix: [] })).ok, true);
});

test("발행 불가면 사유와 함께 막힌다", () => {
  const r = agentGate(v({ publishable: false, publishable_reason: "총점 52", must_fix: [] }));
  assert.equal(r.ok, false);
  assert.match(r.blockers[0], /발행 불가.*총점 52/);
});

test("반영되지 않은 필수 수정이 있으면 막히고 그 목록을 돌려준다", () => {
  const r = agentGate(v({ publishable: true, must_fix: [{ id: "M1", turn: "E14", status: "fixed" }, { id: "M2", turn: "E17", status: "open" }, { id: "M3" }] }));
  assert.equal(r.ok, false);
  assert.deepEqual(r.openFixes.map((m) => m.id), ["M2", "M3"]);
  assert.match(r.blockers[0], /필수 수정 2건.*M2 E17, M3/);
});

test("publishable 이 문자열 true 처럼 참이 아닌 값이면 막힌다", () => {
  assert.equal(agentGate(v({ publishable: "true", must_fix: [] })).ok, false);
});
