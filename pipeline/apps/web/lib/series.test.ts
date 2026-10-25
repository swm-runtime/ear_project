import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanPlan, cleanSeriesThumb, seriesEpisodeHint, type SeriesEpisode } from "./series";
import { publicationByName, publicationOf, publicationsFor, publicationStyle } from "@ear/pipeline/publication";

// 2026-10-17 KAN-136 — 시리즈 설계안 검증·편별 힌트 (spec/11 3·4장)
const ep = (title: string, scope: string, extra: Partial<SeriesEpisode> = {}): SeriesEpisode => ({ no: 0, title, scope, carries: "", only_here: "", minutes: 0, ...extra });

test("설계안 정리 — 빈 행을 빼고 번호를 1부터 다시 매기며, 1화의 '이어받음'은 비운다. 편수 상한은 없다", () => {
  const many = Array.from({ length: 30 }, (_, k) => ep(`편 ${k}`, "범위"));
  const { plan, problems } = cleanPlan([ep("", ""), ep(" 첫 편 ", "a, b", { carries: "x" }), ...many]);
  assert.equal(plan.length, 31);
  assert.deepEqual(plan.slice(0, 2).map((e) => [e.no, e.title, e.carries]), [[1, "첫 편", ""], [2, "편 0", ""]]);
  assert.deepEqual(problems, []);
});

test("설계안 문제 — 제목·범위 빈칸, 같은 제목, 편 없음을 알린다", () => {
  assert.deepEqual(cleanPlan([]).problems, ["편이 없다"]);
  const { problems } = cleanPlan([ep("같은", "a"), ep("같은", "b"), ep("", "c"), ep("d", "")]);
  assert.deepEqual(problems, ["3화 제목이 비어 있다", "4화 범위가 비어 있다", "1화와 2화 제목이 같다"]);
});

test("편별 힌트 — 이 편 범위와 형제 편 범위를 싣는다(한국판 한국어 · 글로벌판 영어)", () => {
  const s = { name: "CS 지식", intro_line: "한 줄", plan: cleanPlan([ep("설계", "UML", { only_here: "UML" }), ep("DB", "SQL", { carries: "모델링", only_here: "정규화" })]).plan };
  const ko = seriesEpisodeHint(s, 2, false);
  assert.match(ko, /2편 중 2화/);
  assert.match(ko, /이 편의 범위: SQL · 이 편에서만 자세히: 정규화 · 앞 편에서 이어받음: 모델링/);
  assert.match(ko, /중심으로 삼지 않을 것: 1\. 설계 \(UML\)/);
  assert.match(seriesEpisodeHint(s, 1, true), /^Series "CS 지식" episode 1 of 2\./);
  assert.throws(() => seriesEpisodeHint(s, 3, false), /3화가 없다/);
});

// 2026-10-26 KAN-247 — 간행물(발행 이름·썸네일 스타일)
test("간행물 목록은 판마다 — 키·이름·스타일 (KAN-247)", () => {
  assert.deepEqual(publicationsFor("ko").map((p) => p.name), ["키워드", "연대기"]);
  assert.deepEqual(publicationsFor("en").map((p) => p.name), ["Phrasebook"]);
  assert.equal(publicationOf("keyword")?.style, "keyword");
  assert.equal(publicationStyle("chronicle"), "scene", "연대기는 전용 디자인이 아직 없어 장면 썸네일");
  assert.equal(publicationStyle(null), "scene");
  assert.equal(publicationStyle("nope"), "scene");
  assert.equal(publicationByName(" 키워드 ", "ko")?.key, "keyword");
  assert.equal(publicationByName("키워드 시리즈", "ko"), null, "글자가 다르면 다른 간행물");
  assert.equal(publicationByName("키워드", "en"), null, "다른 판의 이름은 안 맞춘다");
});

test("간행물·글자 칸 검증 — keyword 디자인은 큰 단어 필수, 없음은 글자 칸 없이도 된다", () => {
  assert.deepEqual(cleanSeriesThumb({ publication: null, word: "", label: "", box: "" }, "ko").problems, []);
  assert.deepEqual(cleanSeriesThumb({ publication: "chronicle", word: "", label: "", box: "" }, "ko").problems, []);
  const k = cleanSeriesThumb({ publication: "keyword", word: "", label: "keyword series", box: "경제편" }, "ko");
  assert.equal(k.problems.length, 1);
  assert.match(k.problems[0], /큰 단어가 필요/);
  const ok = cleanSeriesThumb({ publication: "keyword", word: " Keyword ", label: "keyword series", box: "경제편" }, "ko");
  assert.deepEqual(ok.problems, []);
  assert.equal(ok.word, "keyword");
  assert.equal(ok.label, "KEYWORD SERIES");
  assert.match(cleanSeriesThumb({ publication: "phrasebook", word: "phrase", label: "", box: "" }, "ko").problems[0], /이 판의 목록에 없다/);
  assert.match(cleanSeriesThumb({ publication: "keyword", word: "한글", label: "", box: "" }, "ko").problems[0], /영문 2~16자/);
});
