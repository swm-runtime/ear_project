import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { episodeIdLetter, explainerFor, otherSpeaker, pipelineLocale, speakerNames } from "@ear/pipeline";
import { parseScriptForTts } from "./script.js";

// 2026-10-14 KAN-201 — 코드 하나·인스턴스 둘. PIPELINE_LOCALE 미설정은 한국판 그대로, en 은 진행자 이름·ID 머리글자·해설 고정이 바뀐다
const saved = { locale: process.env.PIPELINE_LOCALE, speakers: process.env.PIPELINE_SPEAKERS };
afterEach(() => {
  if (saved.locale === undefined) delete process.env.PIPELINE_LOCALE; else process.env.PIPELINE_LOCALE = saved.locale;
  if (saved.speakers === undefined) delete process.env.PIPELINE_SPEAKERS; else process.env.PIPELINE_SPEAKERS = saved.speakers;
});
const en = (speakers = "Mina,Alex") => { process.env.PIPELINE_LOCALE = "en"; process.env.PIPELINE_SPEAKERS = speakers; };

test("PIPELINE_LOCALE 이 없으면 한국판 — 윤아·이음, ID 머리글자 T, 중분류 관할 해설", () => {
  delete process.env.PIPELINE_LOCALE;
  assert.equal(pipelineLocale(), "ko");
  assert.deepEqual(speakerNames(), ["윤아", "이음"]);
  assert.equal(episodeIdLetter(), "T");
  assert.equal(explainerFor("심리학"), "윤아");
  assert.equal(explainerFor("경제"), "이음");
  assert.equal(otherSpeaker("윤아"), "이음");
});

test("en 이면 PIPELINE_SPEAKERS 순서대로 — 첫째가 항상 해설, ID 머리글자 G", () => {
  en();
  assert.deepEqual(speakerNames(), ["Mina", "Alex"]);
  assert.equal(episodeIdLetter(), "G");
  assert.equal(explainerFor("K-Food"), "Mina");
  assert.equal(explainerFor("심리학"), "Mina"); // 한국판 관할 규칙을 타지 않는다
  assert.equal(otherSpeaker("Mina"), "Alex");
});

test("en 인데 진행자 이름이 두 개가 아니거나 같으면 멈춘다 — 이름 없이 대본·TTS 를 돌리지 않는다", () => {
  en("");
  assert.throws(() => speakerNames(), /PIPELINE_SPEAKERS/);
  en("Mina,Mina");
  assert.throws(() => speakerNames(), /PIPELINE_SPEAKERS/);
  en("Mi[na],Alex");
  assert.throws(() => speakerNames(), /쓸 수 없다/);
});

test("모르는 로케일 값은 거부한다", () => {
  process.env.PIPELINE_LOCALE = "jp";
  assert.throws(() => pipelineLocale(), /ko 또는 en/);
});

test("en 대본은 그 인스턴스 진행자 이름으로 파싱하고, 한국판 이름 줄은 발화로 보지 않는다", () => {
  en();
  const p = parseScriptForTts(["## [Body]", "[Mina] E1 · Kimchi is older than chili.", "[Alex] Y1 · Wait, really?", "[윤아] E2 · 한국판 줄"].join("\n"));
  assert.deepEqual(p.turns.map((t) => [t.speaker, t.id]), [["Mina", "E1"], ["Alex", "Y1"]]);
});
