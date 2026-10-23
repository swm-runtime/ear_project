import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTitlePromptPartsEn, TITLE_SCHEMA_EN, titleViolationsEn } from "@ear/pipeline";

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
