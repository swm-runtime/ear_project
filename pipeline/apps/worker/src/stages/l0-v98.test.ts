import { test } from "node:test";
import assert from "node:assert/strict";
import { v98Violations } from "./draft-two-stage.js";
import { parseScriptForTts } from "../tts/script.js";

// v9.8 (2026-10-02, v9.7 판정 3편): 소스 중계 연쇄 · 중첩 소개 · 20어절↑ 해설 문장 · 질문 말끝 쏠림 · 조건절 질문
const script = (blocks: string[]) =>
  `T000000-000 · 제목 · 경영 · 해설: 이음 / 진행: 윤아 · full-v9.8\n\n## [인트로]\n\n[윤아] Y1 · 안녕하세요. 오늘의 주제는 테스트입니다.\n\n## [본문]\n\n${blocks.map((b, i) => `### #${i + 1} 구간\n\n${b}`).join("\n\n")}\n\n## [마무리]\n\n[윤아] Y90 · 네, 정리해 주세요.\n\n[이음] E90 · 정리입니다.\n\n[윤아] Y91 · 네, 감사합니다.`;
const run = (md: string) => v98Violations(md, parseScriptForTts(md).turns);
const has = (v: string[], re: RegExp) => v.some((m) => re.test(m));

test("L0 v9.8 소스 중계 — 같은 블록의 세 번째부터 잡고, 두 번까지는 둔다 (사람이 고친 판도 두 턴을 남겼다)", () => {
  const relay = ["[이음] E1 · 세대를 나누는 데 신중해야 한다는 견해도 제시돼요.", "[윤아] Y2 · 왜요?", "[이음] E2 · 기회를 고르게 주라는 의견도 있습니다.", "[윤아] Y3 · 그렇군요.", "[이음] E3 · 근무 조건을 협의하라는 제안이 있습니다."].join("\n\n");
  const v = run(script([relay]));
  assert.ok(has(v, /세 번째 이상.*\(E3\)/), v.join("\n"));
  const two = run(script(["[이음] E1 · 신중해야 한다는 견해도 제시돼요.\n\n[윤아] Y2 · 왜요?\n\n[이음] E2 · 기회를 고르게 주라는 의견도 있습니다.", "[이음] E3 · 다른 블록에는 협의하라는 제안이 있습니다."]));
  assert.ok(!has(two, /세 번째 이상/), two.join("\n"));
});

test("L0 v9.8 중첩 소개 — 글 안에서 다른 사람의 주장을 다시 소개하면 잡는다", () => {
  const v = run(script(["[이음] E1 · 세대 협업을 다룬 또 다른 글에는 작가 Rebecca Robins의 주장이 소개됩니다."]));
  assert.ok(has(v, /글 안에서 다른 사람의 주장을 다시 소개/), v.join("\n"));
});

test("L0 v9.8 긴 해설 문장 — 20어절 이상이 셋 이상이면 전부 지목하고, 둘까지는 둔다", () => {
  const long = "현장 직원은 판매 목표가 비현실적이거나 사업의 가치가 사라지고 있다는 점을 알아도, 기존 계획에 의문을 제기하는 일이 안전하지 않다고 느끼면 입을 다물 수 있어요.";
  const three = run(script([`[이음] E1 · ${long}\n\n[윤아] Y2 · 왜요?\n\n[이음] E2 · ${long} ${long}`]));
  assert.ok(has(three, /해설 문장 3개가 20어절 이상 \(E1 23어절, E2 23어절, E2 23어절\)/), three.join("\n"));
  const two = run(script([`[이음] E1 · ${long}\n\n[윤아] Y2 · 왜요?\n\n[이음] E2 · ${long} 짧은 문장이에요.`]));
  assert.ok(!has(two, /20어절 이상/), two.join("\n"));
});

test("L0 v9.8 질문 말끝 — 한 갈래가 질문의 5분의 2를 넘으면 넘는 만큼 지목한다", () => {
  const turns: string[] = [];
  for (let i = 1; i <= 10; i++) turns.push(`[이음] E${i} · 설명 ${i}이에요.`, `[윤아] Y${i + 1} · ${i <= 7 ? `그건 왜 그렇게 되나요?` : `그럼 어떻게 해요?`}`);
  const v = run(script([turns.join("\n\n")]));
  assert.ok(has(v, /진행 질문 10개 중 7개가 같은 말끝\(~나요·~가요\).*다음 3개 턴/), v.join("\n"));
  const kka: string[] = [];
  for (let i = 1; i <= 10; i++) kka.push(`[이음] E${i} · 설명 ${i}이에요.`, `[윤아] Y${i + 1} · ${i <= 6 ? `그건 어디서 생길까요?` : i <= 8 ? `왜 그렇게 되나요?` : `그럼 어떻게 해요?`}`);
  const vk = run(script([kka.join("\n\n")]));
  assert.ok(has(vk, /같은 말끝\(~까요\)/), vk.join("\n"));
});

test("L0 v9.8 조건절 질문 — 편에 넷 이상이면 잡고 셋까지는 둔다", () => {
  const q = (i: number) => `[이음] E${i} · 설명 ${i}이에요.\n\n[윤아] Y${i + 1} · 말한 뒤의 여파가 두렵다면, 결정권자는 무엇을 바꿔야 하나요?`;
  const four = run(script([[1, 2, 3, 4].map(q).join("\n\n")]));
  assert.ok(has(four, /진행 질문 4개가 조건절로 시작해 물음/), four.join("\n"));
  const three = run(script([[1, 2, 3].map(q).join("\n\n")]));
  assert.ok(!has(three, /조건절로 시작/), three.join("\n"));
});
