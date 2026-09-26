import { test } from "node:test";
import assert from "node:assert/strict";
import { autoApproveBlocker } from "../automation.js";

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
