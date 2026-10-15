import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { mergeTtsDict, missingPronunciations, normalizeForTts, residualIssues } from "./normalize.js";
process.env.DATABASE_URL ??= "postgres://test";
const { readEpisodePronunciations } = await import("../stages/tts.js");

// 2026-10-15 KAN-203 — 글로벌판 TTS 입력: 사전은 "로마자 한국어 → 영어 TTS 철자", 숫자는 ElevenLabs 가 읽게 두고, 영문 잔존 대신 발음 누락으로 멈춘다
const DICT = { tteokbokki: "tuck-bo-kee", Gyeongbokgung: "gyuhng-bok-goong", jeong: "jung" };

test("발음 사전은 대소문자를 무시하고 소유격·문장 머리에도 맞는다. 단어 안쪽은 건드리지 않는다", () => {
  assert.equal(normalizeForTts("Tteokbokki is spicy. Gyeongbokgung's gate opens at nine.", DICT, "en"), "tuck-bo-kee is spicy. gyuhng-bok-goong's gate opens at nine.");
  assert.equal(normalizeForTts("Jeongseon is a county; jeong is a feeling.", DICT, "en"), "Jeongseon is a county; jung is a feeling.");
});

test("치환한 철자가 다른 표제어에 다시 걸리지 않는다 — 한 번에 치환", () => {
  assert.equal(normalizeForTts("Say jeong.", { jeong: "jung", jung: "WRONG" }, "en"), "Say jung.");
});

test("숫자·연도·퍼센트는 그대로 두고, 원화만 won 으로 읽힌다. 오디오 태그는 보존한다", () => {
  assert.equal(normalizeForTts("In 1988, about 70% of homes made it. [chuckles] A jar cost KRW 15,000, now ₩2 million.", {}, "en"), "In 1988, about 70% of homes made it. [chuckles] A jar cost 15,000 won, now 2 million won.");
  assert.equal(normalizeForTts("Prices are listed in KRW.", {}, "en"), "Prices are listed in Korean won.");
});

test("잔존 검사 — 영어 본문은 잔존이 아니다. URL·표만 멈춘다", () => {
  assert.deepEqual(residualIssues("Kimchi is older than chili.", "en"), []);
  assert.deepEqual(residualIssues("See https://korea.net/kimjang | a | b |", "en"), ["URL 잔존: https://korea.net/kimjang", "표 형태 잔존"]);
  assert.match(residualIssues("Kimchi", "ko").join(), /영문 잔존/); // 한국판은 종전 그대로
});

test("발음 누락 — 에피소드 맵에서 값이 빈 단어 중 전역 사전에도 힌트가 없는 것만 (대소문자 무시)", () => {
  const ep = { tteokbokki: "tuck-bo-kee", Hanbok: "", jeong: "", Nunchi: " " };
  assert.deepEqual(missingPronunciations(ep, { hanbok: "hahn-bok" }), ["jeong", "Nunchi"]);
  assert.deepEqual(missingPronunciations({ Hanbok: "" }, { HANBOK: "hahn-bok" }), []);
});

test("병합 사전 — 글로벌판은 대소문자가 달라도 전역이 이기고 빈 힌트는 뺀다. 한국판은 종전 그대로", () => {
  assert.deepEqual(mergeTtsDict({ Hanbok: "HAN-bok", jeong: "" }, { hanbok: "hahn-bok" }, "en"), { hanbok: "hahn-bok" });
  assert.deepEqual(mergeTtsDict({ AI: "에이아이", GPT: "지피티" }, { AI: "에이 아이" }, "ko"), { AI: "에이 아이", GPT: "지피티" });
});

test("에피소드 발음 맵 읽기 — 글로벌판은 빈 값을 형식 오류로 보지 않는다(누락 검사가 따로 멈춘다). 한국판은 종전대로 멈춘다", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "pron-"));
  const file = path.join(dir, "pronunciations.json");
  await fs.writeFile(file, JSON.stringify({ jeong: "", tteokbokki: "tuck-bo-kee" }));
  assert.deepEqual(await readEpisodePronunciations(file, true), { jeong: "", tteokbokki: "tuck-bo-kee" });
  await assert.rejects(readEpisodePronunciations(file, false), /값은 비어 있지 않은 문자열/);
  await fs.writeFile(file, JSON.stringify({ jeong: 3 }));
  await assert.rejects(readEpisodePronunciations(file, true), /항목이 잘못됐다/);
  await fs.rm(dir, { recursive: true, force: true });
});
