import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
process.env.DATABASE_URL ??= "postgres://test";
const { buildScenePrompt } = await import("./thumbnail-scene.js");
const { versionOf, THUMBNAIL_PROMPT_KEY, THUMBNAIL_SCENE_PROMPT_KEY } = await import("../assets.js");

// KAN-138 thumb-v4 (2026-10-07) — 장면 쓰기 입력과 자산 판
const here = path.dirname(fileURLToPath(import.meta.url));
const asset = (k: string) => fs.readFile(path.join(here, "../../../../../docs/ai", k), "utf8");

test("buildScenePrompt — 최근 장면이 없으면 '없음', 있으면 사람 유무와 빛을 붙여 번호로", () => {
  const ep = { title: "금리는 이동이다", mid: "경제 상식", major: "돈·경제", oneLiner: "빌린 쪽에서 맡긴 쪽으로", script: "[윤아] E1 · 대본" };
  assert.match(buildScenePrompt(ep, []), /\[최근 장면\]\n없음/);
  const p = buildScenePrompt(ep, [{ scene: "은행 창구", domain_cue: "", action: "", light: "이른 아침", has_people: true }]);
  assert.match(p, /1\. \(사람 있음\) 은행 창구 · 빛: 이른 아침/);
  assert.match(p, /분야: 경제 상식 \(돈·경제\)/);
  assert.match(p, /\[대본\]\n\[윤아\] E1 · 대본/);
});

test("buildScenePrompt — 대본이 없으면 제목·요약으로 정하라고 적는다", () => {
  assert.match(buildScenePrompt({ title: "t", mid: "m", major: null, oneLiner: null, script: null }, []), /대본 없음/);
});

test("자산 — thumb-v4 는 장면 칸 다섯 개를 갖고, 장면 규칙은 scene-v1 으로 읽힌다", async () => {
  const prompt = await asset(THUMBNAIL_PROMPT_KEY);
  assert.equal(versionOf(THUMBNAIL_PROMPT_KEY, prompt), "thumb-v4");
  // 모델에 가는 본문 — thumbnail.ts promptBody 와 같은 규칙: 머리 `# `·`>`·빈 줄을 떼고 단독 `---` 앞까지
  const lines = prompt.split("\n"); let i = 0;
  while (i < lines.length && (lines[i].startsWith("# ") || lines[i].startsWith(">") || lines[i].trim() === "")) i++;
  const body = lines.slice(i).join("\n").split("\n---\n")[0];
  for (const slot of ["{제목}", "{분야}", "{띠 색}", "{장면}", "{빛}"]) assert.ok(body.includes(slot), slot);
  assert.ok(!body.includes("{핵심 개념}"));
  assert.equal(versionOf(THUMBNAIL_SCENE_PROMPT_KEY, await asset(THUMBNAIL_SCENE_PROMPT_KEY)), "scene-v1");
});
