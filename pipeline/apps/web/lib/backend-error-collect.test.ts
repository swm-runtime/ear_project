import { test } from "node:test";
import assert from "node:assert/strict";

import { collectErrorLogs, HOUR_MS, sliceSizeFor, sliceWindow, TimeRange } from "./backend-error-collect";
import type { LogEvent } from "./backend-request-log";

const MIN = 60_000;
const NOW = 1_800_000_000_000;

/** ERROR 가 `everyMs` 간격으로 창 전체에 깔린 스트림 (시각 오름차순) */
function errorsEvery(from: number, to: number, everyMs: number): LogEvent[] {
  const events: LogEvent[] = [];
  for (let t = from; t <= to; t += everyMs) events.push({ t, message: `[Nest] 1  - ERROR [X] boom at ${t}` });
  return events;
}

/**
 * FilterLogEvents 흉내 — 조각의 **오래된 쪽부터** `scanMs` 만큼만 읽고(1MB 조각 특성),
 * 그 안의 이벤트를 돌려준다. 조각 끝에 못 미쳤으면 nextToken(다음 읽기 시작 시각)을 준다.
 * 읽은 범위에 ERROR 가 하나도 없어도 토큰은 준다 — 실제 API 도 그렇다.
 */
function filterApi(all: LogEvent[], scanMs: number) {
  const calls: { range: TimeRange; token?: string }[] = [];
  const fetchPage = async (range: TimeRange, token: string | undefined) => {
    calls.push({ range, token });
    const cursor = token === undefined ? range.startTime : Number(token);
    const scanEnd = Math.min(range.endTime, cursor + scanMs - 1);
    const events = all.filter((e) => e.t >= cursor && e.t <= scanEnd);
    return scanEnd < range.endTime ? { events, nextToken: String(scanEnd + 1) } : { events };
  };
  return { fetchPage, calls };
}

test("조각은 최신부터, 서로 겹치지 않고, 창을 빈틈없이 덮는다", () => {
  const from = NOW - 24 * HOUR_MS;
  const slices = sliceWindow(from, NOW, 2 * HOUR_MS);
  assert.equal(slices.length, 12);
  assert.equal(slices[0].endTime, NOW);
  assert.equal(slices[slices.length - 1].startTime, from);
  for (let i = 1; i < slices.length; i++) {
    assert.ok(slices[i].endTime < slices[i - 1].startTime, "최신 → 과거 순서");
    assert.equal(slices[i].endTime + 1, slices[i - 1].startTime, "경계가 1ms 떨어져 겹치지 않는다");
  }
});

test("조각 길이는 창의 1/12 이되 1시간보다 작게는 자르지 않는다", () => {
  assert.equal(sliceSizeFor(HOUR_MS), HOUR_MS, "1시간 창(서버 상태)은 조각 1개");
  assert.equal(sliceSizeFor(6 * HOUR_MS), HOUR_MS);
  assert.equal(sliceSizeFor(24 * HOUR_MS), 2 * HOUR_MS);
  assert.equal(sliceSizeFor(7 * 24 * HOUR_MS), 14 * HOUR_MS);
  assert.equal(sliceWindow(NOW - HOUR_MS, NOW, sliceSizeFor(HOUR_MS)).length, 1);
});

test("24시간 창에서 방금(10분 전) 난 ERROR 가 들어 있다 — 한 번 호출로는 창 앞부분만 보였던 버그", async () => {
  const from = NOW - 24 * HOUR_MS;
  const all = [...errorsEvery(from, NOW - 20 * HOUR_MS, 10 * MIN), { t: NOW - 10 * MIN, message: "[Nest] 1  - ERROR [Fresh] just now" }];
  // 한 번에 90분치만 읽히는 로그 — 한 번 호출이었다면 24시간 전 ~ 22.5시간 전만 보였다
  const api = filterApi(all, 90 * MIN);
  const r = await collectErrorLogs(api.fetchPage, { windowFrom: from, now: NOW, maxEvents: 3000, maxPages: 40 });
  assert.ok(r.events.some((e) => e.message.includes("Fresh")), "최근 ERROR 가 있어야 한다");
  assert.equal(r.events.length, all.length, "창 전체의 ERROR 가 전부 모인다");
  assert.equal(r.exhausted, true);
  assert.equal(r.coveredFrom, from);
  assert.ok(r.events.every((e, i, a) => i === 0 || a[i - 1].t <= e.t), "시각 오름차순");
});

test("빈 페이지라도 nextToken 이 있으면 끝이 아니다 — 1MB 안에 ERROR 가 없었을 뿐", async () => {
  const from = NOW - 6 * HOUR_MS;
  // 조각(1시간)의 끝부분에만 ERROR 가 있고, 읽기는 10분치씩 — 앞의 다섯 페이지는 비어 있다
  const all = errorsEvery(NOW - 5 * MIN, NOW, MIN);
  const api = filterApi(all, 10 * MIN);
  const r = await collectErrorLogs(api.fetchPage, { windowFrom: from, now: NOW, maxEvents: 3000, maxPages: 100 });
  assert.equal(r.events.length, all.length);
  assert.equal(r.exhausted, true);
});

test("ERROR 가 하나도 없는 창은 조각 수만큼만 부르고 exhausted 다", async () => {
  const from = NOW - 24 * HOUR_MS;
  const api = filterApi([], 24 * HOUR_MS);
  const r = await collectErrorLogs(api.fetchPage, { windowFrom: from, now: NOW, maxEvents: 3000, maxPages: 40 });
  assert.equal(r.pages, 12);
  assert.equal(r.events.length, 0);
  assert.equal(r.exhausted, true);
  assert.equal(r.coveredFrom, from);
});

test("왕복 상한에 걸리면 exhausted 가 아니고, coveredFrom 은 완주한 가장 오래된 조각의 시작이다", async () => {
  const from = NOW - 24 * HOUR_MS;
  const all = errorsEvery(from, NOW, 5 * MIN);
  // 조각 2시간을 30분치씩 읽는다 → 조각당 4회. 왕복 10회면 조각 2개 완주 + 세 번째 조각 절반
  const api = filterApi(all, 30 * MIN);
  const r = await collectErrorLogs(api.fetchPage, { windowFrom: from, now: NOW, maxEvents: 100_000, maxPages: 10 });
  assert.equal(r.pages, 10);
  assert.equal(r.exhausted, false);
  assert.equal(r.coveredFrom, NOW - 4 * HOUR_MS + 1, "완주한 조각은 최근 2개(4시간)");
  // coveredFrom 이후는 **전부** 들어 있다
  const expectedCovered = all.filter((e) => e.t >= r.coveredFrom).length;
  assert.equal(r.events.filter((e) => e.t >= r.coveredFrom).length, expectedCovered);
  // 세 번째 조각은 오래된 쪽 절반만 들어 있다(FilterLogEvents 는 오래된 쪽부터 읽으므로)
  assert.ok(r.events.some((e) => e.t < r.coveredFrom), "중간에 멈춘 조각의 일부 이벤트는 버리지 않는다");
});

test("이벤트 상한에 닿으면 멈추고, 최신 조각부터 봤으므로 남는 것은 최근 쪽이다", async () => {
  const from = NOW - 24 * HOUR_MS;
  const all = errorsEvery(from, NOW, MIN); // 1,441건
  const api = filterApi(all, 2 * HOUR_MS);
  const r = await collectErrorLogs(api.fetchPage, { windowFrom: from, now: NOW, maxEvents: 500, maxPages: 40 });
  assert.equal(r.exhausted, false);
  assert.ok(r.events.length >= 500 && r.events.length < all.length);
  assert.equal(r.events[r.events.length - 1].t, NOW, "가장 최근 ERROR 는 반드시 있다");
  assert.ok(r.coveredFrom > from);
});

test("서버 상태의 1시간 창 — 상한(500)에 닿으면 그 뒤로는 부르지 않는다", async () => {
  const from = NOW - HOUR_MS;
  const all = errorsEvery(from, NOW, 1_000); // 3,601건의 에러 폭풍
  const api = filterApi(all, 5 * MIN); // 5분치 = 300건씩
  const r = await collectErrorLogs(api.fetchPage, { windowFrom: from, now: NOW, maxEvents: 500, maxPages: 10 });
  assert.equal(r.pages, 2, "300건 → 600건에서 멈춘다");
  assert.ok(r.events.length >= 500);
  assert.equal(r.exhausted, false);
});

test("호출마다 조각의 시간 범위가 그대로 전달되고 토큰이 이어진다", async () => {
  const from = NOW - 2 * HOUR_MS;
  const api = filterApi(errorsEvery(from, NOW, MIN), 40 * MIN);
  await collectErrorLogs(api.fetchPage, { windowFrom: from, now: NOW, maxEvents: 10_000, maxPages: 40, sliceMs: HOUR_MS });
  const first = api.calls.slice(0, 2);
  assert.deepEqual(first[0].range, { startTime: NOW - HOUR_MS + 1, endTime: NOW });
  assert.equal(first[0].token, undefined);
  assert.deepEqual(first[1].range, first[0].range, "같은 조각 안에서 토큰만 바뀐다");
  assert.ok(first[1].token);
});
