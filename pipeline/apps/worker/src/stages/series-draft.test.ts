import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

// 2026-10-17 KAN-136 4단계 — 시리즈 편 대본: 문구·연결 재료·L0 (spec/11 5·6장)
const ko = () => { delete process.env.PIPELINE_LOCALE; };
const P = await import("@ear/pipeline");
const { outlineAxisQuestions, applySeriesMaterial, seriesViolations, readSeriesLinks } = await import("./series-draft.js");

const ctx = (over: Partial<import("@ear/pipeline").SeriesDraftContext> = {}): import("@ear/pipeline").SeriesDraftContext => ({
  name: "키워드로 빠르게 배우는 CS 지식", introLine: "CS 핵심 키워드를 정리하는", no: 2, total: 3, scope: "SQL", onlyHere: "정규화", carries: "모델링",
  elsewhere: [{ no: 1, title: "설계", onlyHere: "UML" }, { no: 3, title: "트랜잭션", onlyHere: "복구" }],
  prev: { title: "설계", axis: "설계는 바꾸기 쉬운 구조를 고르는 일이다", questions: ["왜 설계가 먼저인가?"] }, nextTitle: "트랜잭션",
  introSentence: "CS 핵심 키워드를 정리하는 시리즈, 키워드로 빠르게 배우는 CS 지식의 두 번째 시간입니다.", closingSentence: "다음 시간에는 '트랜잭션'에 대해 이야기합니다.", recapClaimId: null, rules: "규칙", ...over,
});

test("한국어 서수 — 첫·두·열한·스무·스물한 번째, 100 이상은 숫자", () => {
  assert.deepEqual([1, 2, 7, 10, 11, 20, 21, 99, 100].map(P.koreanOrdinal), ["첫 번째", "두 번째", "일곱 번째", "열 번째", "열한 번째", "스무 번째", "스물한 번째", "아흔아홉 번째", "100번째"]);
});

test("시리즈 문구 — 기본 문구(CS 선례), 마지막 화는 맺음, 템플릿 칸이 있으면 그것", () => {
  const s = { name: "CS 지식", introLine: "키워드로 배우는.", no: 7, total: 16, nextTitle: "SQL" };
  assert.deepEqual(P.seriesSentences(null, s, false), { intro: "키워드로 배우는 시리즈, CS 지식의 일곱 번째 시간입니다.", closing: "다음 시간에는 'SQL'에 대해 이야기합니다." });
  assert.equal(P.seriesSentences(null, { ...s, no: 16, nextTitle: null }, false).closing, "CS 지식 시리즈는 여기까지입니다.");
  assert.deepEqual(P.seriesSentences(null, { ...s, introLine: "Ten words, one a day." }, true), { intro: "This is episode 7 of our series CS 지식. Ten words, one a day.", closing: "Next time, we'll talk about SQL." });
  assert.equal(P.seriesSentences({ series_next: "Next: {next_title} ({n}/{total})" }, s, true).closing, "Next: SQL (7/16)");
});

test("구성안에서 축·구간 질문을 읽는다 — 한국판·글로벌판, 축 유형 표지는 뗀다", () => {
  assert.deepEqual(outlineAxisQuestions("# 구성안\n\n축: [대립] A 이지만 B\n구간 #1 — x\n  질문: 왜 A 인가?\n구간 #2 — y\n  질문: B 는?"), { axis: "A 이지만 B", questions: ["왜 A 인가?", "B 는?"] });
  assert.deepEqual(outlineAxisQuestions("Axis: [contrast] A, yet B\nSection #1 — x\n  Question: Why A?"), { axis: "A, yet B", questions: ["Why A?"] });
});

test("설계·작성 블록 — 일반 편은 빈 문자열, 시리즈 편은 범위·형제 편·회상 행·고정 문장", () => {
  assert.equal(P.seriesDesignBlock(undefined, false), "");
  assert.equal(P.seriesWriteBlock(undefined, true), "");
  const d = P.seriesDesignBlock(ctx(), false);
  assert.match(d, /3편 중 2화/); assert.match(d, /1\. 설계 — UML/); assert.match(d, /이 편에서만 자세히 다룰 것: 정규화/);
  const w = P.seriesWriteBlock(ctx({ recapClaimId: "C21" }), false);
  assert.match(w, /\{대주제 한 줄\} 자리는 정확히 이 문장이다: "CS 핵심 키워드를 정리하는 시리즈/);
  assert.match(w, /재료는 claims C21 하나뿐이다/);
  assert.match(w, /첫 \{슬롯\}은 이 문장으로 시작한다: "다음 시간에는 '트랜잭션'에 대해 이야기합니다\."/);
  assert.doesNotMatch(P.seriesWriteBlock(ctx({ no: 1, prev: null }), false), /회상/);
});

test("연결 재료 — 회상 행을 claims 표 끝에 이어 번호로 넣고 sources 절을 붙인다. 두 번 돌려도 하나", async () => {
  ko();
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "series-"));
  await fs.writeFile(path.join(dir, "claims.md"), "# claims\n| ID | 주장 | 발췌 ID | 유형 | 구간 | 저명 | 의견 | 귀속 |\n|---|---|---|---|---|---|---|---|\n| C01 | a | S1-01 | 수치 | #1 |  |  | 없음 |\n| C19 | b | S2-01 | 사례 | #2 |  |  | 없음 |\n\n## QA attempt 2 반영\n- 메모\n");
  await fs.writeFile(path.join(dir, "sources.md"), "# sources\n- S1-01: 본문\n");
  const out = await applySeriesMaterial(dir, "sid", ctx());
  assert.equal(out.recapClaimId, "C20");
  const claims = await fs.readFile(path.join(dir, "claims.md"), "utf8");
  assert.match(claims, /\| C19 \| b .*\n\| C20 \| 시리즈 1화 "설계"는 이것을 다뤘다: 설계는 바꾸기 쉬운 구조를 고르는 일이다 \| 시리즈 \| 시리즈 \| 도입 \|/);
  assert.match(await fs.readFile(path.join(dir, "sources.md"), "utf8"), /## 시리즈 연결 재료 — 1화[\s\S]*- 구간 질문:\n- 왜 설계가 먼저인가\?/);
  assert.equal((await applySeriesMaterial(dir, "sid", ctx())).recapClaimId, "C20");
  assert.equal((await fs.readFile(path.join(dir, "claims.md"), "utf8")).match(/\| 시리즈 \| 시리즈 \|/g)?.length, 1);
  assert.equal((await readSeriesLinks(dir))?.recap_claim_id, "C20");
  const first = await fs.mkdtemp(path.join(os.tmpdir(), "series-"));
  await fs.writeFile(path.join(first, "claims.md"), "| C01 | a | S1-01 | 수치 | #1 |  |  | 없음 |\n"); await fs.writeFile(path.join(first, "sources.md"), "");
  assert.equal((await applySeriesMaterial(first, "sid", ctx({ no: 1, prev: null }))).recapClaimId, null);
});

test("L0 시리즈 검사 — 인트로 시리즈 줄 · 클로징 문장 · 도입 첫 해설 턴의 회상 행", () => {
  ko();
  const links = { series_id: "s", no: 2, total: 3, intro_sentence: "CS 시리즈, CS 지식의 두 번째 시간입니다.", closing_sentence: "다음 시간에는 '트랜잭션'에 대해 이야기합니다.", recap_claim_id: "C20", prev: null, next_title: "트랜잭션" };
  const md = (intro: string, last: string) => ["## [인트로]", `[윤아] Y1 · 안녕하세요, 이어 청취자 여러분. ${intro} 오늘의 주제는 SQL입니다.`, "## [도입]", "[윤아] Y2 · 질문?", "[이음] E1 · 지난 시간엔 설계를 봤어요. 오늘은 SQL이에요.", "## [본문]", "### #1 x", "[이음] E2 · 설명.", "## [마무리]", `[윤아] Y3 · 네, 감사합니다. ${last} 다음에 만나요.`].join("\n");
  const notesOk = "| 턴 | claims |\n|---|---|\n| E1 | C20 |\n| E2 | C01 |";
  assert.deepEqual(seriesViolations(md(links.intro_sentence, links.closing_sentence), notesOk, links), []);
  const bad = seriesViolations(md("다른 줄", "다음에 봬요."), "| E1 | C01 |", links).join("\n");
  assert.match(bad, /인트로 턴 Y1에 시리즈 줄이 없다/);
  assert.match(bad, /클로징 인사 턴 Y3에 시리즈 문장이 없다/);
  assert.match(bad, /1화 회상이 없다 — 도입의 첫 해설 턴\(E1\)/);
  assert.deepEqual(seriesViolations(md("x", "y"), undefined, null), []);
});
