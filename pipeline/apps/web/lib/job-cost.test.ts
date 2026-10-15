import { test } from "node:test";
import assert from "node:assert/strict";
import { jobRun, runKey, type RunInfo } from "./job-cost";

// 2026-10-15 — 작업 기록의 비용 칸: 주제 기획(후보 ID 가 결과에만)·보강(실행 기록 회차 빈 값)도 비용이 보인다
const runs = new Map<string, RunInfo>([
  [runKey("C2", "sweep", null), { cost_usd: 0.104, tokens: { in: 1 }, model: "gpt-6.1-sol" }],
  [runKey("T1", "draft", 2), { cost_usd: 1.5, tokens: null, model: "claude" }],
]);

test("작업 결과의 비용(list_cost_usd)이 있으면 그 값, 모델·토큰은 실행 기록에서", () => {
  assert.deepEqual(jobRun({ type: "sweep", attempt: 1, payload: { }, result: { backlog_id: "C2", list_cost_usd: 0.12 } }, runs), { cost_usd: 0.12, tokens: { in: 1 }, model: "gpt-6.1-sol" });
});
test("결과에 비용이 없으면 회차까지 같은 실행 기록, 없으면 회차가 빈 실행 기록", () => {
  assert.equal(jobRun({ type: "draft", attempt: 2, payload: { backlog_id: "T1" } }, runs)?.cost_usd, 1.5);
  assert.equal(jobRun({ type: "sweep", attempt: 1, payload: { backlog_id: "C2" } }, runs)?.cost_usd, 0.104);
  assert.equal(jobRun({ type: "draft", attempt: 1, payload: { backlog_id: "T9" } }, runs), undefined);
});
