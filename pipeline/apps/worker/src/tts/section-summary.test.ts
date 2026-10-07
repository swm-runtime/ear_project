import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
process.env.DATABASE_URL ??= "postgres://test";
const { summaryProblem, summaryCacheKey, buildSummaryPrompt, SUMMARY_MAX } = await import("./section-summary.js");
const { versionOf, SECTION_SUMMARY_PROMPT_KEY } = await import("../assets.js");

// 2026-10-07 KAN-152 — 구간 요약: 공백 포함 20자 이내 한 줄, 코드가 검사하고 어긋난 구간만 다시 받는다
test("summaryProblem — 20자(코드 포인트) 이내 한 줄만 통과", () => {
  assert.equal(SUMMARY_MAX, 20);
  assert.equal(summaryProblem("멍함은 정상적 수면 관성"), null);
  assert.equal(summaryProblem("가".repeat(20)), null);
  assert.match(summaryProblem("가".repeat(21)) ?? "", /21자/);
  assert.equal(summaryProblem("  "), "비어 있음");
  assert.equal(summaryProblem(null), "비어 있음");
  assert.equal(summaryProblem("한 줄\n두 줄"), "줄바꿈");
});

test("summaryProblem — 진행 서술(~를 다룬다·살폈다·마친다)은 내용이 아니다 (summary-v2)", () => {
  for (const bad of ["트랜잭션과 복구를 마친다", "요구사항과 프로젝트 관리를 살폈다", "격리 수준과 교착상태를 다룬다", "소프트웨어 설계 이야기", "핵심 개념을 정리했다."]) assert.match(summaryProblem(bad) ?? "", /진행 서술/, bad);
  for (const ok of ["로그와 백업으로 장애를 복구한다", "피곤은 어긋난 조건의 신호다", "왜 자도 피곤할까?", "격리 수준이 이상 현상을 막는다"]) assert.equal(summaryProblem(ok), null, ok);
});

test("summaryCacheKey — 같은 대사면 같은 키, 자산 판·대사가 바뀌면 다른 키", () => {
  const item = { kind: "body" as const, title: "깬 직후의 멍함", text: "[이음] 첫 문장이에요." };
  assert.equal(summaryCacheKey("summary-v1", item), summaryCacheKey("summary-v1", { ...item }));
  assert.notEqual(summaryCacheKey("summary-v1", item), summaryCacheKey("summary-v2", item));
  assert.notEqual(summaryCacheKey("summary-v1", item), summaryCacheKey("summary-v1", { ...item, text: "[이음] 다른 문장" }));
});

test("buildSummaryPrompt — 구간마다 번호·kind·제목·대사, 다시 쓸 때는 어긋난 구간만 짚는다", () => {
  const items = [{ kind: "intro" as const, title: "인트로", text: "[윤아] 안녕하세요." }, { kind: "body" as const, title: "술", text: "[이음] 술 이야기" }];
  const p = buildSummaryPrompt("잠", items);
  assert.match(p, /### 구간 0 · intro · 제목: 인트로\n\[윤아\] 안녕하세요\./);
  assert.match(p, /### 구간 1 · body · 제목: 술/);
  assert.doesNotMatch(p, /다시 쓸 구간/);
  const again = buildSummaryPrompt("잠", items, [{ index: 1, problem: "23자 (공백 포함 20자 이내)", summary: "너무 긴 요약" }]);
  assert.match(again, /\[다시 쓸 구간\]\n- 구간 1: "너무 긴 요약" — 23자/);
});

test("자산 — 구간 요약 규칙은 summary-v2 로 읽힌다", async () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const text = await fs.readFile(path.join(here, "../../../../../docs/ai", SECTION_SUMMARY_PROMPT_KEY), "utf8");
  assert.equal(versionOf(SECTION_SUMMARY_PROMPT_KEY, text), "summary-v2");
});
