import { test } from "node:test";
import assert from "node:assert/strict";
import { seriesContentTitle, seriesPublishBlockers, seriesUploadQueue, type SeriesPublishEpisode } from "./series";

const ep = (no: number, status: string, extra: Partial<SeriesPublishEpisode> = {}): SeriesPublishEpisode => ({ no, backlog_id: `C${no}`, status, episode_id: `S1-00${no}`, content_id: null, ...extra });
const ok = { reviewed: true, enrichment: true };

test("콘텐츠 제목은 '{시리즈 이름} {N} - {편 제목}', 이미 그 머리면 두 번 붙이지 않는다", () => {
  assert.equal(seriesContentTitle("키워드로 빠르게 배우는 CS 지식", 3, "운영체제"), "키워드로 빠르게 배우는 CS 지식 3 - 운영체제");
  assert.equal(seriesContentTitle("CS", 3, "CS 3 - 운영체제"), "CS 3 - 운영체제");
});

test("[시리즈 발행] — 전 편 packaged·검수·추천 메타가 갖춰져야 열린다", () => {
  const s = { status: "approved" as const, total_episodes: 3 };
  assert.deepEqual(seriesPublishBlockers(s, [ep(1, "packaged"), ep(2, "packaged"), ep(3, "packaged")], { C1: ok, C2: ok, C3: ok }), []);
  const v = seriesPublishBlockers(s, [ep(1, "packaged"), ep(2, "qa_passed"), ep(3, "packaged")], { C1: ok, C3: { reviewed: false, enrichment: false } });
  assert.match(v.join("\n"), /2화 C2 가 아직 qa_passed/);
  assert.match(v.join("\n"), /3화 추천 메타가 없다/);
  assert.match(v.join("\n"), /3화 검수 확인이 안 됐다/);
  assert.match(seriesPublishBlockers(s, [ep(1, "packaged"), ep(3, "packaged")], { C1: ok, C3: ok }).join(), /1~3화로 다 있지 않다 \(지금 1, 3\)/);
  assert.match(seriesPublishBlockers({ status: "planning", total_episodes: 3 }, [], {}).join(), /승인된 시리즈만/);
});

test("이어서 올리기 — 이미 올린 편은 검수 없이 건너뛰고, 남은 편을 1화부터 순서대로 올린다", () => {
  const eps = [ep(3, "packaged"), ep(1, "published", { content_id: "x1" }), ep(2, "packaged")];
  assert.deepEqual(seriesPublishBlockers({ status: "approved", total_episodes: 3 }, eps, { C2: ok, C3: ok }), []);
  assert.deepEqual(seriesUploadQueue(eps).map((e) => e.no), [2, 3]);
});

test("시리즈 썸네일 글자 칸 — 큰 단어는 영문 소문자, 라벨은 대문자, 길이 상한", async () => {
  const { cleanSeriesThumb } = await import("./series");
  assert.deepEqual(cleanSeriesThumb({ word: " Keyword ", label: "keyword series", box: "경제편" }), { word: "keyword", label: "KEYWORD SERIES", box: "경제편", problems: [] });
  assert.match(cleanSeriesThumb({ word: "경제", label: "", box: "" }).problems.join(), /영문/);
  assert.match(cleanSeriesThumb({ word: "basics", label: "", box: "아주 긴 박스 글자입니다요" }).problems.join(), /12자/);
});
