import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSeriesPlanPrompt, buildSeriesPlanPromptEn, normalizeSeriesPlan } from "@ear/pipeline";

// 2026-10-17 KAN-136 — 시리즈 설계안 프롬프트·정리 (spec/11 3장 · 글로벌 명세 6.11)
test("설계안 프롬프트 — 편수를 주면 그 수를 지키고, 없으면 상한 없이 범위에서 정한다. 분량 하한은 판마다(13분·5분)", () => {
  const i = { midTopic: "IT", name: "CS 지식", scopeNote: "소프트웨어 공학" };
  assert.match(buildSeriesPlanPrompt({ ...i, episodes: 16 }), /16편 — 관리자가 정했다/);
  assert.match(buildSeriesPlanPrompt(i), /상한은 없다/);
  assert.match(buildSeriesPlanPrompt(i), /13분 이상/);
  const en = buildSeriesPlanPromptEn({ ...i, episodes: null });
  assert.match(en, /There is no upper limit/);
  assert.match(en, /at least 5 minutes/);
});

test("설계안 정리 — 빈 제목을 빼고 번호를 다시 매기며 1화의 이어받음은 비운다", () => {
  const out = normalizeSeriesPlan([
    { no: 3, title: " A ", scope: "s", carries: "x", only_here: "o", minutes: 14.6 },
    { no: 9, title: "", scope: "", carries: "", only_here: "", minutes: 0 },
    { no: 1, title: "B", scope: "t", carries: "A", only_here: "", minutes: -2 },
  ]);
  assert.deepEqual(out, [
    { no: 1, title: "A", scope: "s", carries: "", only_here: "o", minutes: 15 },
    { no: 2, title: "B", scope: "t", carries: "A", only_here: "", minutes: 0 },
  ]);
});
