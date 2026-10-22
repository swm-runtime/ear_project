import { test } from "node:test";
import assert from "node:assert/strict";
import { autoApproveBlocker, globalPrepBlockers } from "../automation.js";

const ok = { id: "C1", cluster_version: "v2", gaps: [] as string[], dedup_note: null };

test("자동 승인 규칙 v1: 군집화 v2 · 빈 역할 없음 · 소스 겹침 없음이면 승인한다", () => {
  assert.equal(autoApproveBlocker(ok), null);
  assert.equal(autoApproveBlocker({ ...ok, dedup_note: "중복 없음 (DB 대조 12건)" }), null);
});
test("자동 승인 규칙 v1: 군집화 v1(또는 버전 없음) 후보는 자동 승인하지 않는다", () => {
  assert.match(autoApproveBlocker({ ...ok, cluster_version: "v1" })!, /v2 만/);
  assert.match(autoApproveBlocker({ ...ok, cluster_version: null })!, /버전 없음/);
});
test("자동 승인 규칙 v1: 빈 역할이 하나라도 있으면 사람 검토로 남긴다", () => {
  assert.match(autoApproveBlocker({ ...ok, gaps: ["반론"] })!, /빈 역할 1개/);
});
test("자동 승인 규칙 v1: 소스 겹침 경고가 붙은 후보는 사람 검토로 남긴다", () => {
  assert.match(autoApproveBlocker({ ...ok, dedup_note: "⚠️ 소스 겹침: C81 과 2건 공유" })!, /소스 겹침/);
});
test("자동 승인 규칙 v1: 초안 실패·삭제 후 proposed 로 복귀한 후보는 다시 자동 승인하지 않는다", () => {
  assert.match(autoApproveBlocker({ ...ok, dedup_note: "⚠️ 초안 실패 (2026-09-23 10:00, attempt 1): 설계 실패 | 중복 없음" })!, /초안 실패/);
  assert.match(autoApproveBlocker({ ...ok, dedup_note: "🗑 사람이 삭제 — 다시 승인 대기 | 중복 없음" })!, /초안 실패/);
});

// 2026-10-17 KAN-136 4단계 — 시리즈 편도 자동 승인 규칙 v1 을 그대로 따른다(집기 순서는 승인이 아니라 초안 작업 등록에서 지킨다)
test("시리즈 편은 시리즈라는 이유로 막지 않는다", () => {
  assert.equal(autoApproveBlocker({ id: "C1", cluster_version: "v2", gaps: [], dedup_note: "", series_id: "00000000-0000-0000-0000-000000000001" }), null);
});

// 2026-10-22 글로벌 자동화 — 발행 준비 자동은 비평이 아니라 에이전트 판정 통과(발행 가능 · must_fix 전부 fixed) 시점에 건다(명세 6.10, 패키지 관문과 같은 규칙)
test("글로벌 발행 준비 자동: 판정이 발행 가능이고 필수 수정이 전부 fixed 면 건다", () => {
  assert.deepEqual(globalPrepBlockers({ agent: { publishable: true, must_fix: [{ id: "M1", status: "fixed" }] } }), []);
});
test("글로벌 발행 준비 자동: 판정 없음·발행 불가·미반영 필수 수정이면 걸지 않는다", () => {
  assert.ok(globalPrepBlockers(null).length);
  assert.ok(globalPrepBlockers({ agent: { publishable: false, must_fix: [] } }).length);
  assert.ok(globalPrepBlockers({ agent: { publishable: true, must_fix: [{ id: "M1", status: "open" }] } }).length);
});
