import { test } from "node:test";
import assert from "node:assert/strict";
process.env.DATABASE_URL ??= "postgres://test";
const { isRatioViolation, l0Next, L0_FIX_MAX, v910Violations } = await import("./draft-two-stage.js");
const { parseScriptForTts } = await import("../tts/script.js");

// v9.10 (2026-10-14): 진행자의 추측을 해설이 맞장구 한마디로 받고 넘어가는 곳
const script = (body: string) =>
  `T000000-000 · 제목 · 경제 상식 · 해설: 이음 / 진행: 윤아 · full-v9.10\n\n## [인트로]\n\n[윤아] Y1 · 안녕하세요. 오늘의 주제는 테스트입니다.\n\n## [본문]\n\n### #1 구간\n\n${body}\n\n## [마무리]\n\n[윤아] Y90 · 네, 정리해 주세요.\n\n[이음] E90 · 정리예요.\n\n[윤아] Y91 · 네, 감사합니다.`;
const run = (md: string) => v910Violations(parseScriptForTts(md).turns);
const has = (v: string[], re: RegExp) => v.some((m) => re.test(m));

test("L0 v9.10 — 추측으로 끝난 진행 턴 뒤 해설이 맞장구 한마디로 시작하는 곳이 두 번이면 지목하고, 문체 규칙이라 한도 뒤엔 QA 로 넘긴다", () => {
  const v = run(script([
    "[이음] E1 · 공고가 줄었어요.",
    "[윤아] Y2 · 그러면 AI가 원인이라고 확정하긴 어렵겠네요.",
    "[이음] E2 · 맞아요. 다른 요인도 있거든요.",
    "[윤아] Y3 · 저라면 지원할 곳부터 줄어든 것 같아요.",
    "[이음] E3 · 정확한 구분이에요. 그다음은 임금이에요.",
  ].join("\n\n")));
  assert.ok(has(v, /진행자의 추측 뒤 해설 턴 2개가 맞장구 한마디로 시작함 \(E2, E3\)/), v.join("\n"));
  assert.ok(v.every(isRatioViolation));
  assert.deepEqual(l0Next(v, L0_FIX_MAX), { action: "pass", residual: v });
});

test("L0 v9.10 — 한 번은 두고, 추측을 내용으로 받은 해설과 추측이 아닌 질문 뒤 맞장구는 세지 않는다", () => {
  const ok = run(script([
    "[이음] E1 · 공고가 줄었어요.",
    "[윤아] Y2 · 그러면 AI가 원인이라고 확정하긴 어렵겠네요.",
    "[이음] E2 · 맞아요. 다른 요인도 있거든요.",
    "[윤아] Y3 · 저라면 지원할 곳부터 줄어든 것 같아요.",
    "[이음] E3 · 지원할 곳이 준 건 맞는데, 신입 자리부터였어요.",
    "[윤아] Y4 · 왜 신입부터예요?",
    "[이음] E4 · 맞아요. 그게 핵심이에요.",
  ].join("\n\n")));
  assert.ok(!has(ok, /맞장구 한마디/), ok.join("\n"));
});
