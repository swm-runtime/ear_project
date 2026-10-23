import { test } from "node:test";
import assert from "node:assert/strict";
import { applyFixes, blindNotes, blindScript, blindSources, buildVerdict, editorTotal, fixMeta, medianIndex, medianScores, mergePron, K, type Editor, type Korea, type RoundRec } from "./judge-loop.js";

const ed = (scores: number[], extra: Partial<Editor> = {}): Editor => ({ scores: Object.fromEntries(K.map((k, i) => [k, { score: scores[i] ?? 5, reason: `r${k}` }])), retell: "", findings: [], edits: [], publishable: false, publishable_reason: "", summary_ko: "요약", ...extra });
const kr = (findings: Korea["findings"] = [], publishable = true): Korea => ({ findings, edits: [], other_changes: [], publishable, publishable_reason: publishable ? "ok" : "범위 변형", summary_ko: "한국어 요약" });
const rounds: RoundRec[] = [{ t: 0, mode: "original", totals: [50, 52, 51], median: {}, total: 51, struct: 18, koreaPub: true, koreaMf: 2, repaired: [], l0: 0, words: 800, cost: 0.3 }];

test("눈가림 — 메타 줄은 제목·주제만, 노트는 QA 절·인용 블록 제거, 발췌는 Gist 줄 제거", () => {
  assert.equal(blindScript("G1 · Title · Topic · A/B · full-en-v0.21(gpt) · S1\n## [Intro]").split("\n")[0], "Title · Topic");
  const notes = blindNotes("# claims (v2)\n> 귀속 설명\n- C01 fact\n\n\n\n## QA attempt 1\n- removed");
  assert.equal(notes, "# Research notes\n- C01 fact\n");
  assert.equal(blindSources("> Excerpts are collected by…\n- S1 title\n- Gist: x\n- excerpt"), "- S1 title\n- excerpt\n");
});
test("턴 수리 — 라벨·번호는 두고 본문만 바꾼다, 모르는 턴은 무시", () => {
  const s = "[Yuna] E1 · old one\n[Owen] Y1 · host\n[Yuna] E2 · old two";
  assert.equal(applyFixes(s, [{ turn: "E2", after: "new\n two" }, { turn: "E9", after: "x" }]), "[Yuna] E1 · old one\n[Owen] Y1 · host\n[Yuna] E2 · new two");
});
test("중앙값 — 항목별 가운데 값과 합계가 가운데인 번(동률이면 앞 번)", () => {
  const eds = [ed(Array(12).fill(5)), ed(Array(12).fill(6)), ed(Array(12).fill(4))];
  assert.equal(medianScores(eds)["3.1"], 5); assert.equal(editorTotal(eds[1]), 72); assert.equal(medianIndex(eds), 0);
});
test("메타 줄 보정·발음 사전 병합", () => {
  assert.equal(fixMeta({ title: "New", script: "## [Intro]\n[Y] Y1 · hi" }, "G1 · Old · T · A/B · v · S1\nx").split("\n")[0], "G1 · New · T · A/B · v · S1");
  assert.equal(JSON.parse(mergePron("{\"a\":\"ㄱ\"}", [{ term: "b", reading: "ㄴ" }, { term: "a", reading: "x" }])).b, "ㄴ");
});
test("판정 — 중앙값 ≥ 기준 · 한국어 가 · must_fix 전부 수리면 발행 가능", () => {
  const eds = [ed(Array(12).fill(6)), ed(Array(12).fill(5)), ed(Array(12).fill(6))]; // 중앙 72
  const v = buildVerdict({ episodeId: "G1", rounds, bestRound: 1, eds, korea: kr([{ turn: "E3", quote: "q", problem: "p", kind: "must_fix" }]), repaired: ["E3"], threshold: 65, model: "gpt-6.1-sol", reportKey: "s3:episodes/G1/agent-verdict.md", cost: 1.2 });
  assert.equal(v.agent.publishable, true); assert.equal(v.agent.must_fix[0].status, "fixed"); assert.equal(v.judged_by, "agent:gpt-6.1-sol"); assert.equal(v.scores["3.1"].human, "6");
});
test("판정 — 기준 미달·한국어 불가·미수리 must_fix 는 발행 불가 사유로 남는다", () => {
  const eds = [ed(Array(12).fill(5)), ed(Array(12).fill(5)), ed(Array(12).fill(5))]; // 60
  const v = buildVerdict({ episodeId: "G1", rounds, bestRound: 0, eds, korea: kr([{ turn: "E3", quote: "q", problem: "p", kind: "must_fix" }], false), repaired: [], threshold: 65, model: "gpt", reportKey: "s3:x", cost: 0 });
  assert.equal(v.agent.publishable, false);
  assert.match(v.agent.publishable_reason, /60 < 기준 65/); assert.match(v.agent.publishable_reason, /발행 불가/); assert.match(v.agent.publishable_reason, /미수리/);
  assert.equal(v.agent.must_fix[0].status, "open");
});
