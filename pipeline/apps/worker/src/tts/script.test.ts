import { test } from "node:test";
import assert from "node:assert/strict";
import { chunkTurns, cutKind, describeCuts, parseScriptForTts, type ScriptTurn } from "./script.js";

const T = (text: string, blockStart = false, speaker: "윤아" | "이음" = "윤아"): ScriptTurn => ({ speaker, id: null, text, section: "본문", ...(blockStart ? { blockStart } : {}) });
const total = (c: ScriptTurn[]) => c.reduce((s, t) => s + t.text.length, 0);

test("파서 — 구역·단락 헤더 다음 턴에 blockStart 가 붙는다", () => {
  const md = ["# 제목", "메타 한 줄", "## [인트로]", "[윤아] E1 · 안녕하세요.", "[이음] Y1 · 반가워요.", "## [본문]", "### #1 첫 단락", "[윤아] E2 · 본문 시작.", "[이음] Y2 · 질문이요?", "### #2 둘째 단락", "[윤아] E3 · 둘째 시작.", ""].join("\n");
  const { turns } = parseScriptForTts(md);
  assert.deepEqual(turns.map((t) => [t.id, !!t.blockStart]), [["E1", true], ["Y1", false], ["E2", true], ["Y2", false], ["E3", true]]);
  assert.equal(turns[2].section, "본문"); // `### #1` 은 구역을 바꾸지 않는다
});

test("경계 종류 — 단락 > 서술 뒤 > 질문 뒤", () => {
  assert.equal(cutKind(T("질문인가요?"), T("네.", true)), "단락");
  assert.equal(cutKind(T("서술이에요."), T("네.")), "문장");
  assert.equal(cutKind(T("질문인가요?"), T("네.")), "질문 뒤");
  assert.equal(cutKind(T("그렇죠?\""), T("네.")), "질문 뒤");
});

test("자르는 자리 — 글자가 찰 때가 아니라 단락 헤더 다음을 고른다 (요청 수는 같게)", () => {
  // 400자 턴 × 6 = 2,400자 → maxChars 1800 이면 종전(탐욕)은 [4,2] (1600|800, 서술 뒤). 단락 시작이 턴 2에 있으면 [2,4] (800|1600) 로 자른다
  const turns = [T("가".repeat(400)), T("나".repeat(400)), T("다".repeat(400), true), T("라".repeat(400)), T("마".repeat(400)), T("바".repeat(400))];
  const chunks = chunkTurns(turns, 1800);
  assert.equal(chunks.length, 2);
  assert.deepEqual(chunks.map((c) => c.length), [2, 4]);
  assert.deepEqual(describeCuts(chunks), ["단락"]);
  for (const c of chunks) assert.ok(total(c) <= 1800);
});

test("질문·대답 사이는 피한다 — 서술 뒤로 옮긴다", () => {
  const turns = [T("가".repeat(699)), T("나".repeat(500) + "?"), T("다".repeat(600)), T("라".repeat(700)), T("마".repeat(500))];
  const chunks = chunkTurns(turns, 1800);
  assert.equal(chunks.length, 2);
  assert.deepEqual(describeCuts(chunks), ["문장"]); // [가,나,다]=1800 뒤가 아니라... 어디든 "?" 뒤가 아니어야 한다
  assert.ok(!chunks[0][chunks[0].length - 1].text.endsWith("?"));
});

test("질문 뒤밖에 없으면 요청을 하나 늘여서라도 피한다", () => {
  // 900자 턴 4개, 첫 셋은 질문으로 끝남 → 2요청이면 경계가 반드시 "질문 뒤" (비용 4+4+5=13) · 3요청 [가][나][다,라]? 경계 질문·질문… 계산상 최소를 고른다
  const turns = [T("가".repeat(900) + "?"), T("나".repeat(900) + "?"), T("다".repeat(400)), T("라".repeat(900)), T("마".repeat(500))];
  const chunks = chunkTurns(turns, 1800);
  for (const c of chunks) assert.ok(total(c) <= 1800);
  assert.deepEqual(describeCuts(chunks).filter((k) => k === "질문 뒤"), ["질문 뒤"]); // 하나는 불가피(가?|나? 사이 또는 나?|다) — 둘은 만들지 않는다
});

test("maxChars 를 넘는 턴은 단독 요청 · isolate 는 단독", () => {
  const turns = [T("가".repeat(100)), { ...T("나".repeat(2000)), id: "E2" }, T("다".repeat(100)), { ...T("라".repeat(50)), id: "E4" }, T("마".repeat(50))];
  const chunks = chunkTurns(turns, 1800, new Set(["E4"]));
  assert.deepEqual(chunks.map((c) => c.map((t) => t.text[0]).join("")), ["가", "나", "다", "라", "마"]);
});
