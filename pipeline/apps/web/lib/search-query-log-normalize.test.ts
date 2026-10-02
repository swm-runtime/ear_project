import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeSearchQueryLogSummary, type RawSearchQueryLogSummary } from "./search-query-log-normalize";

/** 2026-10-02 운영 서버(main, #1093 이전)가 실제로 주던 모양 — clicked·result_count·has_more 가 없다 */
const OLD_SERVER: RawSearchQueryLogSummary = {
  days: 14,
  since: "2026-09-18T07:00:00.000Z",
  totals: { searches: 3, misses: 1, miss_rate: 1 / 3, users: 1, short_queries: 1, filtered_searches: 0 },
  daily: [{ date: "2026-10-02", searches: 3, misses: 1 }],
  missed: [{ query: "테스트", searches: 1, misses: 1, last_searched_at: "2026-10-02T07:10:00.000Z" }],
  top: [{ query: "관세", searches: 2, misses: 0, last_searched_at: "2026-10-02T07:11:00.000Z" }],
};

test("옛 서버 응답 — 없는 필드는 null(모름)로 채워지고 읽어도 죽지 않는다", () => {
  const s = normalizeSearchQueryLogSummary(OLD_SERVER);
  assert.equal(s.totals.clicked, null);
  assert.equal(s.daily[0].clicked, 0);
  assert.deepEqual(
    { clicked: s.top[0].clicked, result_count: s.top[0].result_count, has_more: s.top[0].has_more },
    { clicked: null, result_count: null, has_more: false },
  );
  assert.equal(s.missed[0].result_count, null);
  // 원래 있던 값은 그대로
  assert.equal(s.totals.searches, 3);
  assert.equal(s.top[0].query, "관세");
});

test("새 서버 응답 — 값이 그대로 남는다(0 도 null 로 바뀌지 않는다)", () => {
  const s = normalizeSearchQueryLogSummary({
    ...OLD_SERVER,
    totals: { ...OLD_SERVER.totals, clicked: 0 },
    daily: [{ date: "2026-10-02", searches: 3, misses: 1, clicked: 2 }],
    missed: [{ query: "테스트", searches: 1, misses: 1, clicked: 0, result_count: 0, has_more: false, last_searched_at: "2026-10-02T07:10:00.000Z" }],
    top: [{ query: "관세", searches: 2, misses: 0, clicked: 1, result_count: 20, has_more: true, last_searched_at: "2026-10-02T07:11:00.000Z" }],
  });
  assert.equal(s.totals.clicked, 0);
  assert.equal(s.daily[0].clicked, 2);
  assert.deepEqual({ c: s.missed[0].clicked, r: s.missed[0].result_count }, { c: 0, r: 0 });
  assert.deepEqual({ c: s.top[0].clicked, r: s.top[0].result_count, m: s.top[0].has_more }, { c: 1, r: 20, m: true });
});

test("목록이 통째로 없어도 빈 배열이다", () => {
  const s = normalizeSearchQueryLogSummary({ ...OLD_SERVER, daily: null, missed: undefined, top: null });
  assert.deepEqual([s.daily, s.missed, s.top], [[], [], []]);
});
