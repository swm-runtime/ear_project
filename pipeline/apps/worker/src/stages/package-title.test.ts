import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTitlePromptPartsEn, TITLE_SCHEMA_EN, titleCaseEn, titleViolationsEn } from "@ear/pipeline";

// 2026-10-23 — 글로벌 발행 제목은 주제("Why …")와 분리해 패키지 단계에서 짓는다. 프롬프트는 영어, 규칙 1·4·5·6 은 코드가 다시 센다
const HANGUL = /[가-힣]/;
const recent = ["Why Koreans Bow", "Why Korea Loves Chimaek: Chicken and Beer", "Why Koreans Share Stews and Side Dishes", "One Stew, Many Spoons"];

test("제목 프롬프트 — 영어, 주제 줄은 제목이 아니라고 밝히고, 최근 제목을 최신순 번호로 싣는다", () => {
  const p = buildTitlePromptPartsEn({ episodeId: "G1", topicTitle: "Why Koreans Say “Fighting!”", midTopic: "Language", oneLiner: "What a familiar English word does", scriptMd: "## [Intro]\n[Yuna] E1 · Hi", recentTitles: recent });
  assert.equal(HANGUL.test(p.system + p.user), false);
  assert.match(p.user, /Topic line \(planning question, not the title\): Why Koreans Say/);
  assert.match(p.user, /1\. Why Koreans Bow\n2\. Why Korea Loves Chimaek/);
  assert.match(p.system, /Eight words or fewer/);
  assert.equal(p.user.includes("previous title broke"), false);
  const retry = buildTitlePromptPartsEn({ episodeId: "G1", topicTitle: "t", midTopic: "m", oneLiner: null, scriptMd: "s", recentTitles: [], violations: ["9 words — eight or fewer"], previous: "A Very Long Title" });
  assert.match(retry.user, /previous title broke the rules[\s\S]*Previous: "A Very Long Title"[\s\S]*- 9 words/);
  assert.match(retry.user, /\(none yet\)/);
  assert.deepEqual([...TITLE_SCHEMA_EN.required], ["title", "form", "alternatives", "why"]);
});

test("규칙 검사 — 단어 수·부제·Why 반복·질문 반복·Korea 반복·클릭베이트", () => {
  assert.deepEqual(titleViolationsEn("A Bow for Every Occasion", recent), []);
  assert.deepEqual(titleViolationsEn("Why Koreans Say Fighting", recent), ['starts with "Why" like one of the last three titles', '"Korea/Korean/Seoul" appears in one of the last two titles already']);
  assert.ok(titleViolationsEn("Chimaek: Fried Chicken Meets Beer", []).includes("colon or dash subtitle"));
  assert.ok(titleViolationsEn("The Real Secret Behind Every Single Korean Dinner Table Ever", []).some((v) => /words/.test(v)));
  assert.ok(titleViolationsEn("The Secret of the Bow", []).includes("clickbait word"));
  assert.deepEqual(titleViolationsEn("Want Some Ramyeon?", ["One Stew, Many Spoons", "Why Share the Food?"]), ["a question like one of the last three titles"]);
  assert.deepEqual(titleViolationsEn("Want Some Ramyeon?", ["One Stew, Many Spoons", "A Bow for Every Occasion", "The Table Where Rank Stays Put", "Why Share the Food?"]), []);
  assert.deepEqual(titleViolationsEn("", []), ["empty title"]);
});

// v1.1 (2026-10-23) — 첫 12편에서 “Bap Meogeosseoyo”·“Before The Goodbye”(제목 전체 따옴표)·“Fighting” Means “You Can Do It”(따옴표 두 쌍)·And/The 대문자가 나왔다
test("v1.1 — 제목 전체 따옴표·따옴표 두 쌍은 위반, 바깥에 설명이 붙은 인용은 통과", () => {
  assert.ok(titleViolationsEn("“Bap Meogeosseoyo”", []).some((v) => /whole title/.test(v)));
  assert.ok(titleViolationsEn("“Fighting” Means “You Can Do It”", []).includes("more than one quoted phrase"));
  assert.deepEqual(titleViolationsEn("“Did You Eat?” as a Greeting", []), []);
  const p = buildTitlePromptPartsEn({ episodeId: "G1", topicTitle: "t", midTopic: "m", oneLiner: null, scriptMd: "s", recentTitles: [] });
  assert.match(p.system, /never put the whole title in quotation marks/);
  assert.match(p.system, /romanized Korean word never stands alone/);
});

test("v1.1 — Title Case 후처리: 관사·접속사·전치사는 첫·끝 단어와 여는 따옴표 뒤가 아니면 소문자", () => {
  assert.equal(titleCaseEn("Chicken And Beer Around The Big Screen"), "Chicken and Beer Around the Big Screen");
  assert.equal(titleCaseEn("Wishes On A Baby’s First Birthday Table"), "Wishes on a Baby’s First Birthday Table");
  assert.equal(titleCaseEn("The Suneung’s 35-Minute Flight Pause"), "The Suneung’s 35-Minute Flight Pause");
  assert.equal(titleCaseEn("What Makes The New Year’s Bow Different?"), "What Makes the New Year’s Bow Different?");
  assert.equal(titleCaseEn("“Did You Eat?” as “The” Greeting"), "“Did You Eat?” as “The” Greeting");
  assert.equal(titleCaseEn("Rank Comes to Company Dinner Too"), "Rank Comes to Company Dinner Too");
});
