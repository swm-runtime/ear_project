import { test } from "node:test";
import assert from "node:assert/strict";
import { excerptLang } from "./design-single.js";

// 2026-10-16 G261015-001 — 한국어 예문이 섞인 영어 발췌는 en, 한국어 문단은 ko
test("한글이 몇 글자 섞인 영어 발췌는 en 이다", () => {
  assert.equal(excerptLang(["1. It is 반말, not 존댓말. The polite -요 ending is simply gone."]), "en");
  assert.equal(excerptLang(["어떡해 is a contraction of 어떻게 해 — literally “how do I do.”"]), "en");
});

test("한국어 문단이 하나라도 있으면 ko 다", () => {
  assert.equal(excerptLang(["The report lists three meanings.", "김장은 겨울 김치를 한 번에 담그는 일이다."]), "ko");
  assert.equal(excerptLang(["대박 (figurative) 큰 성공을 거두는 일."]), "ko");
});

test("빈 발췌·영어만은 en 이다", () => {
  assert.equal(excerptLang([""]), "en");
  assert.equal(excerptLang(["Oppa, a term for a girl's elder brother."]), "en");
});
