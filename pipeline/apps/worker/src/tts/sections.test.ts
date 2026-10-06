import { test } from "node:test";
import assert from "node:assert/strict";
import { parseScriptForTts } from "./script.js";
import { buildSections, SECTION_TITLE_MAX } from "./sections.js";
import type { ScriptSegment } from "./segments.js";

// 2026-10-06 KAN-137: 구간 = 단락 제목 그대로, 앞뒤 구역은 이름 그대로, 시각은 자막 세그먼트에서
const MD = [
  "T999 · 메타 줄",
  "## [인트로]",
  "[윤아] Y1 · 안녕하세요.",
  "## [도입]",
  "[이음] E1 · 오늘은 잠 이야기예요.",
  "[윤아] Y2 · 좋아요.",
  "## [본문]",
  "### #1 깬 직후의 멍함",
  "[이음] E2 · 첫 문장이에요. 둘째 문장이에요.",
  "[윤아] Y3 · 그렇군요.",
  "### #2 술이 밤의 후반을 무너뜨린다",
  "[이음] E3 · 술 이야기예요.",
  "## [마무리]",
  "[윤아] Y4 · 감사합니다.",
].join("\n");

const seg = (start: number, end: number, speaker: string, text: string): ScriptSegment => ({ start_sec: start, end_sec: end, speaker, text });
const SEGS: ScriptSegment[] = [
  seg(7, 9, "윤아", "안녕하세요."),
  seg(9, 12, "이음", "오늘은 잠 이야기예요."),
  seg(12, 13, "윤아", "좋아요."),
  seg(13, 20, "이음", "첫 문장이에요."), // 긴 턴이 문장 묶음으로 쪼개진 경우(segments.ts splitLong)
  seg(20, 26, "이음", "둘째 문장이에요."),
  seg(26, 28, "윤아", "그렇군요."),
  seg(28, 35, "이음", "술 이야기예요."),
  seg(35, 37, "윤아", "감사합니다."),
];

test("파서 — 단락 제목을 턴에 남기고, 구역이 바뀌면 지운다", () => {
  const { turns } = parseScriptForTts(MD);
  assert.deepEqual(turns.map((t) => [t.id, t.section, t.topic ?? null]), [
    ["Y1", "인트로", null], ["E1", "도입", null], ["Y2", "도입", null],
    ["E2", "본문", "깬 직후의 멍함"], ["Y3", "본문", "깬 직후의 멍함"], ["E3", "본문", "술이 밤의 후반을 무너뜨린다"], ["Y4", "마무리", null],
  ]);
});

test("구간 — 첫 구간은 0초, 나머지는 그 구간 첫 턴의 세그먼트 시각 (쪼개진 긴 턴도 이어서 대조)", () => {
  const { sections, reason } = buildSections(parseScriptForTts(MD).turns, SEGS);
  assert.equal(reason, undefined);
  assert.deepEqual(sections, [
    { start_sec: 0, title: "인트로" },
    { start_sec: 9, title: "도입" },
    { start_sec: 13, title: "깬 직후의 멍함" },
    { start_sec: 28, title: "술이 밤의 후반을 무너뜨린다" },
    { start_sec: 35, title: "마무리" },
  ]);
});

test("구간 — 대조가 어긋나거나 세그먼트가 남으면 내지 않는다 (틀린 시각보다 없는 편)", () => {
  const turns = parseScriptForTts(MD).turns;
  const wrongText = SEGS.map((s, i) => (i === 2 ? { ...s, text: "다른 말이에요." } : s));
  assert.equal(buildSections(turns, wrongText).sections.length, 0);
  assert.match(buildSections(turns, wrongText).reason ?? "", /Y2/);
  assert.equal(buildSections(turns, [...SEGS, seg(37, 38, "이음", "남는 세그먼트")]).sections.length, 0);
  assert.equal(buildSections(turns, SEGS.slice(0, -1)).sections.length, 0);
  assert.equal(buildSections(turns, []).sections.length, 0);
});

test("구간 — 자막에서 빠진 턴(길이 0 으로 버려짐)은 다음 턴 시각으로 보고 견딘다", () => {
  const turns = parseScriptForTts(MD).turns;
  const dropped = SEGS.filter((_, i) => i !== 2); // Y2 "좋아요." 가 joinChunkSegments 에서 버려진 경우 (S261003-002 Y6 실측)
  const r = buildSections(turns, dropped);
  assert.deepEqual(r.missingTurns, ["Y2"]);
  assert.deepEqual(r.sections.map((s) => [s.start_sec, s.title]), [[0, "인트로"], [9, "도입"], [13, "깬 직후의 멍함"], [28, "술이 밤의 후반을 무너뜨린다"], [35, "마무리"]]);
  // 빠진 턴이 구간의 첫 턴이면 그 구간은 다음 턴 시각에서 시작한다
  const firstDropped = SEGS.filter((_, i) => i !== 1); // E1(도입 첫 턴) 이 빠짐
  assert.equal(buildSections(turns, firstDropped).sections[1].start_sec, 12);
});

test("구간 — 제목이 상한을 넘으면 말줄임으로 자른다", () => {
  const long = "가".repeat(SECTION_TITLE_MAX + 10);
  const md = MD.replace("### #2 술이 밤의 후반을 무너뜨린다", `### #2 ${long}`);
  const { sections } = buildSections(parseScriptForTts(md).turns, SEGS);
  assert.equal(sections[3].title.length, SECTION_TITLE_MAX);
  assert.ok(sections[3].title.endsWith("…"));
});
