import { test } from "node:test";
import assert from "node:assert/strict";
import { applyFixes, applyPronChanges, blindNotes, blindScript, blindSources, buildVerdict, checkpointUsable, editorTotal, fixMeta, inputHash, JUDGE_LOOP_VERSION, medianIndex, medianScores, mergePron, roundPublishable, K, type Editor, type Korea, type RoundRec } from "./judge-loop.js";

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


// v1.5 (2026-10-23) — 회차 체크포인트: 같은 루프 버전·같은 입력·끝나지 않음·12시간 안일 때만 잇는다
test("체크포인트 — 버전·입력 해시·done·나이로 이어 돌 수 있는지 가른다", () => {
  const h = inputHash("script", "{}");
  const now = Date.parse("2026-10-23T06:00:00Z");
  const ck = { version: JUDGE_LOOP_VERSION, script_hash: h, t: 1, stopped: false, at: "2026-10-23T05:00:00Z", rounds, base: {}, best: {}, mode: "structure" as const, cost: 1, model: "gpt" };
  assert.equal(checkpointUsable(ck, h, now), true);
  assert.equal(checkpointUsable({ ...ck, done: true }, h, now), false);
  assert.equal(checkpointUsable({ ...ck, version: "judge-loop-v0.9" }, h, now), false);
  assert.equal(checkpointUsable(ck, inputHash("script", "{\"a\":\"b\"}"), now), false);
  assert.equal(checkpointUsable({ ...ck, at: "2026-10-22T05:00:00Z" }, h, now), false);
  assert.equal(checkpointUsable(null, h, now), false);
  assert.notEqual(inputHash("a", "{}"), inputHash("b", "{}"));
});


// v1.7 (2026-10-23) — 발음 사전 쪽 must_fix 는 검토자의 other_changes(pronunciations.json) 로 고치고, 그 변경이 가리키는 턴을 수리된 것으로 센다
test("발음 사전 변경 적용 — after 쌍 덮어쓰기, before 에만 있는 키 삭제, fixes 순번의 must_fix 턴 수리", () => {
  const pron = JSON.stringify({ "saram naemsae": "사람 냄새", "Saram Naemsae": "사람 냄새", gimbap: "" });
  const findings = [{ turn: "E3", kind: "must_fix", problem: "발음 파일 중복 표기" }, { turn: "E5", kind: "should_fix", problem: "x" }] as any;
  const other = [{ file: "pronunciations.json", before: '"saram naemsae": "사람 냄새", "Saram Naemsae": "사람 냄새"', after: '"saram naemsae": "사람 냄새"', fixes: [0, 1], reason: "중복" }];
  const r = applyPronChanges(pron, other, findings);
  const cur = JSON.parse(r.pron);
  assert.equal(cur["saram naemsae"], "사람 냄새"); assert.equal("Saram Naemsae" in cur, false); assert.equal(cur.gimbap, "");
  assert.deepEqual(r.resolved, ["E3"]);
  assert.deepEqual(applyPronChanges(pron, [{ file: "script.md", before: "a", after: "b", fixes: [0], reason: "" }], findings).resolved, []);
  assert.deepEqual(applyPronChanges(pron, undefined, findings).resolved, []);
});

test("0회차 재작성 생략 조건 — 기준 이상·한국어 가·must_fix 0 일 때만", () => {
  assert.equal(roundPublishable({ total: 60, koreaPub: true, openMustFix: 0 }, 60), true);
  assert.equal(roundPublishable({ total: 59, koreaPub: true, openMustFix: 0 }, 60), false);
  assert.equal(roundPublishable({ total: 62, koreaPub: false, openMustFix: 0 }, 60), false);
  assert.equal(roundPublishable({ total: 62, koreaPub: true, openMustFix: 1 }, 60), false);
});
