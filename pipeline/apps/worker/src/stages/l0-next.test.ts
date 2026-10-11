import { test } from "node:test";
import assert from "node:assert/strict";
process.env.DATABASE_URL ??= "postgres://test";
const { l0Next, isRatioViolation, L0_FIX_MAX, v94Violations } = await import("./draft-two-stage.js");

// 2026-10-07 — L0 수정 한도 3회(QA 회차와 따로), 한도 뒤 비율 위반만 남으면 QA 로 넘긴다
const Y = (n: number, text: string) => ({ speaker: "진행" as any, id: `Y${n}`, text, section: "본문" });

/** 본문 진행 턴 12개 중 6개가 정리형("~네요")으로 끝나는 대본 — 실제 v94 메시지를 만든다 */
function summaryHeavyTurns() {
  return Array.from({ length: 12 }, (_, i) => Y(i + 1, i % 2 === 0 ? "그 말이 꽤 와닿네요." : "그건 어떻게 확인했나요?"));
}

test("l0Next — 위반이 없으면 null", () => {
  assert.equal(l0Next([], 0), null);
  assert.equal(l0Next([], L0_FIX_MAX), null);
});

test("l0Next — 한도는 3회, 그 전에는 무엇이든 수정 재생성", () => {
  assert.equal(L0_FIX_MAX, 3);
  for (const n of [0, 1, 2]) assert.deepEqual(l0Next(["아무 위반"], n), { action: "fix" });
});

test("isRatioViolation — 실제 정리형 비율 메시지를 비율로 판별한다", () => {
  const msgs = v94Violations(summaryHeavyTurns() as any);
  const ratio = msgs.filter(isRatioViolation);
  assert.equal(ratio.length, 1, msgs.join("\n"));
  assert.match(ratio[0], /정리형/);
});

test("l0Next — 한도 뒤 비율 위반만 남으면 QA 로 넘긴다", () => {
  const ratio = v94Violations(summaryHeavyTurns() as any).filter(isRatioViolation);
  assert.deepEqual(l0Next(ratio, 3), { action: "pass", residual: ratio });
});

test("l0Next — 한도 뒤 비율 밖 위반이 섞여 있으면 그것만 들고 실패", () => {
  const ratio = v94Violations(summaryHeavyTurns() as any).filter(isRatioViolation);
  const hard = "이름 1개가 첫 등장 문장에 역할 소개 없이 불림 (Alan Turing@E5)";
  assert.deepEqual(l0Next([...ratio, hard], 3), { action: "fail", hard: [hard] });
});

test("isRatioViolation — 횟수 상한(편 전체 N회 이하)은 비율이 아니다", () => {
  assert.equal(isRatioViolation('해설에 "~가 아니라 ~다" 대조 문장이 8회 (E1, E2) — 블록당 한 번, 편 전체 여섯 번 이하다.'), false);
  assert.equal(isRatioViolation("진행 질문 5개가 조건절로 시작해 물음 (Y1) — 편에 세 번 이하다."), false);
});
