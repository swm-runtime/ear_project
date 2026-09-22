import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyLimit } from "../executors/openai-api.js";

test("429 분류: insufficient_quota 는 quota (사람이 충전할 때까지 멈춤)", () => {
  const e = classifyLimit(JSON.stringify({ error: { type: "insufficient_quota", code: "insufficient_quota", message: "You exceeded your current quota, please check your plan and billing details." } }));
  assert.equal(e.kind, "quota"); assert.match(e.message, /잔액·예산/);
});
test("429 분류: rate_limit_exceeded 는 rate (5분 뒤 자동 재개)", () => {
  const e = classifyLimit(JSON.stringify({ error: { type: "requests", code: "rate_limit_exceeded", message: "Rate limit reached for gpt-5 on tokens per min (TPM): Limit 30000, Used 29000" } }));
  assert.equal(e.kind, "rate"); assert.equal(e.retryAfterMs, 5 * 60_000);
});
test("429 분류: 프로젝트 예산(budget) 문구도 quota 로 본다", () => {
  assert.equal(classifyLimit(JSON.stringify({ error: { type: "invalid_request_error", code: null, message: "Your project has exceeded its monthly budget." } })).kind, "quota");
});
test("429 분류: JSON 이 아니거나 알 수 없는 본문은 rate 로 본다 (5분 뒤 다시 확인)", () => {
  assert.equal(classifyLimit("<html>429 Too Many Requests</html>").kind, "rate");
});
