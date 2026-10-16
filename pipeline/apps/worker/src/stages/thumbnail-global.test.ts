import { test } from "node:test";
import assert from "node:assert/strict";
process.env.DATABASE_URL ??= "postgres://test";
const { fillSlots } = await import("./thumbnail.js");
const { buildScenePromptEn, buildScenePrompt } = await import("./thumbnail-scene.js");

// 2026-10-16 글로벌판 썸네일 — 영어 칸 이름(thumb-en)과 영어 장면 입력(scene-en)
test("fillSlots — 영어 칸 이름을 채우고, 남은 칸이 있으면 이미지 생성 전에 멈춘다", () => {
  assert.equal(fillSlots("T {title} · {topic} · {band color} · {scene} · {light}", { "{title}": "a", "{topic}": "K-Food", "{band color}": "orange (#D9772B)", "{scene}": "s", "{light}": "l" }), "T a · K-Food · orange (#D9772B) · s · l");
  assert.throws(() => fillSlots("T {title} {scene}", { "{title}": "a" }), /\{scene\}/);
  assert.throws(() => fillSlots("T {제목} {장면}", { "{제목}": "a" }), /\{장면\}/); // 한국판 검사는 그대로
});

test("buildScenePromptEn — 영어 라벨, 최근 장면의 사람 유무·빛, 대본이 없으면 그렇게 적는다", () => {
  const p = buildScenePromptEn({ title: "Why Kimjang", topic: "K-Food", oneLiner: null, script: null }, [{ scene: "a market", domain_cue: "", action: "", light: "dusk", has_people: true }]);
  assert.match(p, /^\[Episode\]\nTitle: Why Kimjang\nTopic: K-Food\nOne-line summary: none/);
  assert.match(p, /\[Recent scenes\]\n1\. \(people\) a market · light: dusk/);
  assert.match(p, /\[Script\]\n\(no script/);
  assert.doesNotMatch(p, /[가-힣]/);
  assert.match(buildScenePrompt({ title: "t", mid: "m", major: null, oneLiner: null, script: null }, []), /^\[에피소드\]/); // 한국판 그대로
});
