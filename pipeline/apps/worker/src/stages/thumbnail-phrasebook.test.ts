import { test } from "node:test";
import assert from "node:assert/strict";
process.env.DATABASE_URL ??= "postgres://test";
const { expressionLines, titleLines, composePhrasebookThumb, buildPhrasebookTextPrompt } = await import("./thumbnail-phrasebook.js");

test("편 제목 → 로마자 줄: 쉼표·and 로 나누고 부제는 뗀다, 최대 3줄 (KAN-247 회화집)", () => {
  assert.deepEqual(expressionLines("Daebak, Jjang, Heol: Three Reactions to Anything Big"), ["Daebak", "Jjang", "Heol"]);
  assert.deepEqual(expressionLines("Gomawo and Mianhae"), ["Gomawo", "Mianhae"]);
  assert.deepEqual(expressionLines("Ssi, Nim, A and Ya"), ["Ssi", "Nim", "A and Ya"]);
  assert.deepEqual(expressionLines("Bap Han Beon Meokja, Yeollak Halge"), ["Bap Han Beon Meokja", "Yeollak Halge"]);
  assert.deepEqual(expressionLines("A, B, C, D"), ["A", "B", "C, D"]);
  assert.deepEqual(expressionLines("Aegyo"), ["Aegyo"]);
});

test("시리즈 이름 → 표지 줄: 단어를 최대 3줄로 고르게", () => {
  assert.deepEqual(titleLines("Korean Expressions You Hear in K-Dramas"), ["Korean Expressions", "You Hear", "in K-Dramas"]);
  assert.deepEqual(titleLines("Phrasebook"), ["Phrasebook"]);
});

test("회화집 썸네일 합성 — 편·표지 PNG 가 나온다 (이미지 모델 없음)", async () => {
  const ep = await composePhrasebookThumb({ lines: ["Daebak", "Jjang", "Heol"], hangul: "대박 · 짱 · 헐", subtitle: "Three reactions to anything big", head: "K-Drama Korean", label: "PHRASEBOOK SERIES", no: 1 }, 512);
  const cover = await composePhrasebookThumb({ lines: titleLines("Korean Expressions You Hear in K-Dramas"), hangul: "", subtitle: "", head: "26 EPISODES", label: "PHRASEBOOK SERIES", no: null, handword: "phrasebook" }, 512);
  for (const b of [ep, cover]) assert.equal(b.subarray(1, 4).toString(), "PNG");
  assert.notDeepEqual(ep, cover);
  if (process.env.PHRASEBOOK_SAMPLE_DIR) { const fs = await import("node:fs/promises"); await fs.writeFile(`${process.env.PHRASEBOOK_SAMPLE_DIR}/pb-ep.png`, ep); await fs.writeFile(`${process.env.PHRASEBOOK_SAMPLE_DIR}/pb-cover.png`, cover); }
});

test("한글 표기 프롬프트는 제목·요약·시리즈 이름을 싣는다", () => {
  const p = buildPhrasebookTextPrompt({ title: "Daebak, Jjang, Heol", oneLiner: "Three reactions", seriesName: "S" });
  assert.match(p, /Daebak, Jjang, Heol/); assert.match(p, /Three reactions/); assert.match(p, /Hangul/);
});
