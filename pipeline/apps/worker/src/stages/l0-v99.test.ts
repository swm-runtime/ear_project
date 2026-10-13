import { test } from "node:test";
import assert from "node:assert/strict";
process.env.DATABASE_URL ??= "postgres://test";
const { isRatioViolation, l0Next, L0_FIX_MAX, v99Violations } = await import("./draft-two-stage.js");
const { parseScriptForTts } = await import("../tts/script.js");

// v9.9 (2026-10-12, 자동화 18편 실측): 해설 다체 비율 · 명사절 감싸기
const script = (blocks: string[]) =>
  `T000000-000 · 제목 · 역사 · 해설: 윤아 / 진행: 이음 · full-v9.9\n\n## [인트로]\n\n[이음] Y1 · 안녕하세요. 오늘의 주제는 테스트입니다.\n\n## [본문]\n\n${blocks.map((b, i) => `### #${i + 1} 구간\n\n${b}`).join("\n\n")}\n\n## [마무리]\n\n[이음] Y90 · 네, 정리해 주세요.\n\n[윤아] E90 · 정리예요.\n\n[이음] Y91 · 네, 감사합니다.`;
const run = (md: string) => v99Violations(parseScriptForTts(md).turns);
const has = (v: string[], re: RegExp) => v.some((m) => re.test(m));
const turnsOf = (lines: string[]) => lines.map((l, i) => `[윤아] E${i + 1} · ${l}\n\n[이음] Y${i + 2} · 왜요?`).join("\n\n");

test("L0 v9.9 다체 비율 — 해설 문장의 30%를 넘으면 다체가 많은 턴부터 넘친 만큼 지목한다", () => {
  // 해설 문장 12개(마무리 포함) 중 다체 6개 — 상한 3, 세 문장을 바꿔야 하니 다체가 가장 많은 E1(3개)만 지목한다
  const v = run(script([turnsOf([
    "직지는 1377년에 찍혔습니다. 남은 것은 하권입니다. 그 책이 증거입니다.",
    "구텐베르크 성서는 1454년입니다. 유럽에서 크게 퍼졌습니다.",
    "둘은 세는 기준이 다릅니다. 그래서 답도 달라져요.",
    "남은 물건과 처음 쓴 순간은 달라요. 그게 오늘 질문이에요.",
    "기록은 있는데 물건은 없거든요. 그 차이가 커요.",
  ])]));
  assert.ok(has(v, /해설 문장 12개 중 6개\(50%\)가 다체.*바꾼다: E1\. 정리나/), v.join("\n"));
  const more = run(script([turnsOf([
    "직지는 1377년에 찍혔습니다. 남은 것은 하권입니다. 그 책이 증거입니다.",
    "구텐베르크 성서는 1454년입니다. 유럽에서 크게 퍼졌습니다.",
    "둘은 세는 기준이 다릅니다. 그래서 답도 달라집니다.",
    "남은 물건과 처음 쓴 순간은 달라요. 그게 오늘 질문이에요.",
  ])]));
  assert.ok(has(more, /해설 문장 10개 중 7개\(70%\)가 다체.*바꾼다: E1, E2\. 정리나/), more.join("\n")); // 상한 3 → 네 문장, E1(3)+E2(2)
  assert.ok(v.filter(isRatioViolation).length === 1, "비율 규칙이라 한도 뒤에는 QA 로 넘긴다");
  assert.deepEqual(l0Next(v.filter(isRatioViolation), L0_FIX_MAX), { action: "pass", residual: v.filter(isRatioViolation) });
});

test("L0 v9.9 다체 비율 — 30% 이하면 두고, 해설 문장이 열 개 미만이면 세지 않는다", () => {
  const ok = run(script([turnsOf([
    "직지는 1377년에 찍혔어요. 남은 건 하권이에요. 그 책이 증거입니다.",
    "구텐베르크 성서는 1454년이에요. 유럽에서 크게 퍼졌죠.",
    "둘은 세는 기준이 달라요. 그래서 답도 달라져요.",
    "남은 물건과 처음 쓴 순간은 다릅니다. 그게 오늘 질문이에요.",
  ])]));
  assert.ok(!has(ok, /다체/), ok.join("\n"));
  const few = run(script([turnsOf(["직지는 1377년에 찍혔습니다. 남은 것은 하권입니다."])]));
  assert.ok(!has(few, /다체/), few.join("\n"));
});

test("L0 v9.9 명사절 감싸기 — '~다는 것이·~다는 점에서'가 다섯 곳부터 해당 턴을 전부 지목하고, 넷까지는 둔다", () => {
  const wrap = [
    "먼저 남은 증거와 출발점으로 기억된 대상이 다른 자리에 있다는 것이 이 역사의 답이에요.",
    "세계사에도 영향을 미쳤다는 설명이 함께 붙어요.",
    "책임을 내려놓을 수 있다는 가능성을 비춰 보는 틀이에요.",
    "기록이 남지 않았다는 점에서 단정하긴 어려워요.",
    "처음이 아니라는 사실이 중요해요.",
  ];
  const v = run(script([turnsOf(wrap)]));
  assert.ok(has(v, /명사절로 감싸여 있음 5곳.*\(E1, E2, E3, E4, E5\)/), v.join("\n"));
  // v9.9.1: 문체 규칙이라 한도 뒤엔 QA 로 넘긴다
  assert.deepEqual(l0Next(v, L0_FIX_MAX), { action: "pass", residual: v });
  const four = run(script([turnsOf(wrap.slice(0, 4))]));
  assert.ok(!has(four, /명사절/), four.join("\n"));
});

test("L0 v9.9.1 명사절 감싸기 — 분열문 '핵심은·답은 ~입니다'와 '~다는 것입니다' 결말도 같은 계열로 센다", () => {
  const v = run(script([turnsOf([
    "기록이 남지 않았다는 점에서 단정하긴 어려워요.",
    "처음이 아니라는 사실이 중요해요.",
    "이 역사의 답은 먼저 남은 증거와 기억된 출발점이 다르다는 거예요.",
    "결국 둘 다 맞았다는 것입니다.",
    "핵심은 기계를 누구나 살 수 있었다는 점입니다.",
  ])]));
  assert.ok(has(v, /명사절로 감싸여 있음 5곳/), v.join("\n"));
});

test("L0 v9.9.1 '~적인·~적으로' — 여덟 번부터 많은 턴부터 넘친 만큼 지목하고, 일곱 번까지는 둔다", () => {
  const v = run(script([turnsOf([
    "구조적인 문제와 실질적인 비용과 사회적인 압력이 겹쳐요.",
    "경제적으로 보면 일시적인 변화예요.",
    "기술적인 이유도 있고 역사적인 배경도 있어요.",
    "정치적인 이유도 있어요.",
  ])]));
  assert.ok(has(v, /"~적인·~적으로" 8회.*풀어 쓴다.*: E1\. 뜻은/), v.join("\n")); // 넘친 1회 — 가장 많은 E1(3회)만
  assert.ok(v.every(isRatioViolation), "문체 규칙이라 한도 뒤엔 QA 로 넘긴다");
  const seven = run(script([turnsOf(["구조적인 문제와 실질적인 비용과 사회적인 압력이 겹쳐요.", "경제적으로 보면 일시적인 변화예요.", "기술적인 이유도 있어요."])]));
  assert.ok(!has(seven, /적인·~적으로/), seven.join("\n"));
});

test("L0 v9.9 명사절 감싸기 — 주어와 동사로 먼저 말한 문장은 세지 않는다", () => {
  const plain = run(script([turnsOf([
    "가장 먼저 남은 건 직지예요. 그런데 유럽이 기억하는 출발점은 구텐베르크죠.",
    "인쇄된 성서가 유럽사를 바꿨어요. 그 영향이 세계사까지 갔다고 보기도 해요.",
    "그 사람들도 책임을 내려놓을 수 있었어요. 이 틀은 그 가능성을 보여 줘요.",
    "기록이 남지 않았어요. 그래서 단정하긴 어려워요.",
    "처음이 아니에요. 그게 중요해요.",
  ])]));
  assert.ok(!has(plain, /명사절/), plain.join("\n"));
});
