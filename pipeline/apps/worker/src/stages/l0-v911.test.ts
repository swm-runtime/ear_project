import { test } from "node:test";
import assert from "node:assert/strict";
process.env.DATABASE_URL ??= "postgres://test";
const { isRatioViolation, l0Next, L0_FIX_MAX, v911Violations } = await import("./draft-two-stage.js");
const { parseScriptForTts } = await import("../tts/script.js");

// v9.11 (2026-10-27, KAN-269): PodBench 기준선의 리듬 칸 — 운영 대본 408편으로 맞춘 문형 검사
const script = (body: string, lead = "[윤아] Y2 · 오늘은 이게 궁금했어요.") =>
  `T000000-000 · 제목 · 경제 상식 · 해설: 이음 / 진행: 윤아 · full-v9.11\n\n## [인트로]\n\n[윤아] Y1 · 안녕하세요. 오늘의 주제는 테스트입니다.\n\n## [도입]\n\n${lead}\n\n## [본문]\n\n### #1 구간\n\n${body}\n\n## [마무리]\n\n[윤아] Y90 · 네, 정리해 주세요.\n\n[이음] E90 · 정리예요.\n\n[윤아] Y91 · 네, 감사합니다.`;
const run = (md: string) => v911Violations(parseScriptForTts(md).turns);
const has = (v: string[], re: RegExp) => v.some((m) => re.test(m));
const e = (n: number, k: number) => `[이음] E${n} · ${Array.from({ length: k }, (_, i) => `문장 ${i + 1}이에요.`).join(" ")}`;
const y = (n: number) => `[윤아] Y${n} · 그건 왜 그래요?`;

test("L0 v9.11 — 같은 화자 해설 턴이 진행 턴 없이 이어지면 지목하고, 형식 결함이라 한도 뒤엔 실패한다", () => {
  const v = run(script([e(1, 3), y(3), e(2, 3), e(3, 2), y(4), e(4, 4)].join("\n\n")));
  assert.ok(has(v, /해설 턴이 진행 턴 없이 같은 화자로 이어짐 \(E3\)/), v.join("\n"));
  const next = l0Next(v, L0_FIX_MAX);
  assert.equal(next?.action, "fail");
});

test("L0 v9.11 — 구간 머리의 해설 턴은 앞 구간 해설 뒤에 와도 세지 않는다(규칙 1)", () => {
  const md = script([e(1, 3), y(3), e(2, 3), "### #2 다음 구간", e(3, 2), y(4), e(4, 4)].join("\n\n"));
  assert.ok(!has(run(md), /같은 화자로 이어짐/), run(md).join("\n"));
});

test("L0 v9.11 — 본문 해설 턴 문장 수가 같은 값으로 여섯 턴 이상 이어지면 지목하고, 다섯 턴까지는 둔다", () => {
  const six = [1, 2, 3, 4, 5, 6].flatMap((n) => [e(n, 4), y(n + 2)]).join("\n\n");
  const v = run(script(six));
  assert.ok(has(v, /여섯 턴 이상 이어짐 \(E1부터\)/), v.join("\n"));
  assert.ok(v.every(isRatioViolation));
  const five = [1, 2, 3, 4, 5].flatMap((n) => [e(n, 4), y(n + 2)]).concat([e(6, 2), y(9)]).join("\n\n");
  assert.ok(!has(run(script(five)), /여섯 턴 이상/), run(script(five)).join("\n"));
});

test("L0 v9.11 — 진행자의 \"것 같아요\" 대입이 여섯 번이면 지목하고 다섯 번까지는 둔다", () => {
  const guess = (n: number) => `[윤아] Y${n} · 저라면 망설일 것 같아요.`;
  const lens = [3, 2, 4, 1, 3, 2, 4];
  const body = (k: number) => lens.flatMap((len, i) => [e(i + 1, len), i < k ? guess(i + 3) : y(i + 3)]).join("\n\n");
  const v = run(script(body(6)));
  assert.ok(has(v, /진행 턴 6개가 "것 같아요"/), v.join("\n"));
  assert.ok(v.every(isRatioViolation));
  assert.ok(!has(run(script(body(5))), /것 같아요/));
});

test("L0 v9.11 — 도입에서 \"나눠 보자\"로 답의 틀을 예고하면 지목한다", () => {
  const body = [e(1, 3), y(3), e(2, 2)].join("\n\n");
  const v = run(script(body, "[윤아] Y2 · 오늘은 이게 궁금했어요.\n\n[이음] E0 · 그래서 오늘은 둘을 나눠 보려는 거예요."));
  assert.ok(has(v, /도입 턴 1개가 답의 틀을 미리 말함/), v.join("\n"));
  assert.ok(!has(run(script(body)), /답의 틀/));
});
