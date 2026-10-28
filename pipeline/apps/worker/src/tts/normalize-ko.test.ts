import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeForTts, residualIssues } from "./normalize.js";

// 2026-10-28 — 한국판 음차 사전은 숫자 바로 뒤의 영문 단위 표기에도 걸린다 ("100MB" — S261028-008 이 맵에 "MB" 를 두고도 잔존으로 멈췄다)
test("한국판 음차 사전 — 영문 표제어는 숫자 뒤에서도 치환하고, 숫자로 시작하는 표제어는 숫자 뒤를 막는다", () => {
  const dict = { MB: "메가바이트", G: "지", "3D": "쓰리디", API: "에이피아이" };
  assert.equal(normalizeForTts("파일이 100MB 를 넘으면", dict, "ko"), "파일이 백메가바이트 를 넘으면");
  assert.equal(normalizeForTts("5G 망과 API 호출", dict, "ko"), "오지 망과 에이피아이 호출");
  assert.equal(normalizeForTts("13D 는 그대로", dict, "ko"), "십삼D 는 그대로", "숫자로 시작하는 표제어는 더 긴 숫자 안에서 오치환하지 않는다");
  assert.equal(normalizeForTts("3D 영화", dict, "ko"), "쓰리디 영화");
  assert.deepEqual(residualIssues(normalizeForTts("용량은 100MB 다", dict, "ko"), "ko"), []);
});
