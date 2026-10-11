import { test } from "node:test";
import assert from "node:assert/strict";
process.env.DATABASE_URL ??= "postgres://test";
const { unintroducedNames } = await import("./draft-two-stage.js");

// 2026-10-07 — 목록에 없던 직함을 오탐해 T261007-002·003 이 L0 수정 한도에서 멈췄다
const E = (n: number, text: string) => ({ id: `E${n}`, text });

test("unintroducedNames — 이름 앞 직함 꼴(해독가·기술자)은 역할 소개다 (T261007-002·003 실제 문장)", () => {
  const turns = [
    E(5, "블레츨리 파크에서 에니그마 해독을 맡은 암호 해독가 Alan Turing은 완벽해 보이는 기계의 틈을 살폈습니다."),
    E(3, "통상적인 인쇄 역사에서는 유럽의 인쇄 기술자 Johannes Gutenberg가 1454년에 찍은 구텐베르크 성서를 출발점처럼 다룹니다."),
  ];
  assert.deepEqual(unintroducedNames(turns, ""), []);
});

test("unintroducedNames — 목록에 새로 넣은 직함도 소개로 본다", () => {
  assert.deepEqual(unintroducedNames([E(1, "소프트웨어 엔지니어 Grace Hopper는 컴파일러를 만들었습니다.")], ""), []);
});

test("unintroducedNames — 역할 없이 이름만 부르면 잡는다", () => {
  assert.deepEqual(unintroducedNames([E(2, "그날 Alan Turing은 기계의 틈을 살폈습니다.")], ""), ["Alan Turing@E2"]);
});

test("unintroducedNames — 2자 대명사(그가)는 직함으로 치지 않는다", () => {
  assert.deepEqual(unintroducedNames([E(4, "그 편지를 받은 그가 Alan Turing에게 답했습니다.")], ""), ["Alan Turing@E4"]);
});

test("unintroducedNames — 기존 목록의 역할이 바로 앞 문장에 있어도 소개로 본다", () => {
  assert.deepEqual(unintroducedNames([E(6, "한 경제학자가 반론을 냈습니다. Paul Krugman은 시장이 다르게 움직인다고 봤습니다.")], ""), []);
});
