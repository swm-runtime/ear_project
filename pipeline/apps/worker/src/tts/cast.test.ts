import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { allSpeakerNames, castVoiceOf, explainerFor, GLOBAL_TEAMS, otherSpeaker, speakerNames, speakersForTopic, withSpeakers } from "@ear/pipeline";
import { parseScriptForTts } from "./script.js";

// 2026-10-17 글로벌판 출연진 — 해설자 남녀·진행자 남녀 4명, 남녀가 섞인 2인조 두 팀을 대표 주제로 배정 (글로벌 명세 6.7)
const saved = { locale: process.env.PIPELINE_LOCALE, speakers: process.env.PIPELINE_SPEAKERS };
afterEach(() => {
  if (saved.locale === undefined) delete process.env.PIPELINE_LOCALE; else process.env.PIPELINE_LOCALE = saved.locale;
  if (saved.speakers === undefined) delete process.env.PIPELINE_SPEAKERS; else process.env.PIPELINE_SPEAKERS = saved.speakers;
});
const en = () => { process.env.PIPELINE_LOCALE = "en"; delete process.env.PIPELINE_SPEAKERS; };

test("출연진 표 — 글로벌 주제 8개가 빠짐없이 한 팀에 한 번씩, 이름 4개가 모두 다르다", () => {
  const topics = GLOBAL_TEAMS.flatMap((t) => t.topics);
  assert.equal(topics.length, 8);
  assert.equal(new Set(topics).size, 8);
  const names = GLOBAL_TEAMS.flatMap((t) => [t.explainer.name, t.host.name]);
  assert.deepEqual(names, ["Yuna", "Owen", "E-um", "Grace"]);
});

test("대표 주제로 2인조를 정한다 — 해설·진행 순, 모르는 주제는 첫 팀, 한국판은 윤아·이음", () => {
  en();
  assert.deepEqual(speakersForTopic("Korean Language"), ["Yuna", "Owen"]);
  assert.deepEqual(speakersForTopic("K-Food"), ["E-um", "Grace"]);
  assert.deepEqual(speakersForTopic("Unknown"), ["Yuna", "Owen"]);
  delete process.env.PIPELINE_LOCALE;
  assert.deepEqual(speakersForTopic("K-Food"), ["윤아", "이음"]);
});

test("작업 하나 동안의 2인조 — speakerNames·explainerFor 가 그 값을 읽고, 밖에서는 기본값", async () => {
  en();
  await withSpeakers(speakersForTopic("K-Pop"), async () => {
    await new Promise((r) => setTimeout(r, 1)); // 비동기 경계를 넘어도 유지된다
    assert.deepEqual(speakerNames(), ["E-um", "Grace"]);
    assert.equal(explainerFor("K-Pop"), "E-um");
  });
  assert.deepEqual(speakerNames(), ["Yuna", "Owen"]);
});

test("파서는 출연진 네 이름을 다 받고, 같은 팀의 다른 한 명과 보이스를 찾는다", () => {
  en();
  assert.deepEqual(allSpeakerNames(), ["Yuna", "Owen", "E-um", "Grace"]);
  const p = parseScriptForTts(["## [Body]", "[E-um] E1 · Kimchi is older than chili.", "[Grace] Y1 · Wait, really?"].join("\n"));
  assert.deepEqual(p.turns.map((t) => [t.speaker, t.id]), [["E-um", "E1"], ["Grace", "Y1"]]);
  assert.equal(otherSpeaker("Grace"), "E-um");
  assert.equal(otherSpeaker("Yuna"), "Owen");
  assert.equal(castVoiceOf("Owen"), "gPPH6SLdL8XSX6GNJ40G");
  assert.equal(castVoiceOf("HostA"), null);
  process.env.PIPELINE_SPEAKERS = "HostA,HostB"; // 2026-10-17 이전 편의 임시 이름도 읽는다
  assert.ok(allSpeakerNames().includes("HostA"));
});

test("출연진 이름은 발음 사전에 있어도 한글로 바꾸지 않는다 — 보이스가 영어로 읽는다(2026-10-17)", async () => {
  en();
  const { mergeTtsDict, normalizeForTts } = await import("./normalize.js");
  const dict = mergeTtsDict({ "E-um": "이음", Yuna: "윤아", daebak: "대박" }, {});
  assert.deepEqual(Object.keys(dict), ["daebak"]);
  assert.equal(normalizeForTts("E-um says daebak to Yuna.", dict), "E-um says 대박 to Yuna.");
});
