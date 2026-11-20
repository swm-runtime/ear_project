import { test } from "node:test";
import assert from "node:assert/strict";
import { clampCursor, formatGap, scanWindow, type FetchLogPage, type LogPage } from "./log-watch-scan.js";

const LIMITS = { maxEvents: 500, maxPages: 20 };
const ev = (t: number) => ({ t, message: `ERROR at ${t}` });

/** 페이지를 순서대로 돌려주고, 받은 요청을 기록하는 가짜 CloudWatch */
function fakePages(pages: LogPage[]) {
  const calls: { startTime: number; endTime: number; nextToken?: string }[] = [];
  const fetchPage: FetchLogPage = async (startTime, endTime, nextToken) => {
    calls.push({ startTime, endTime, nextToken });
    return pages[calls.length - 1] ?? { events: [] };
  };
  return { fetchPage, calls };
}

// 2026-11-20 사고 — 첫 페이지가 비고 nextToken 만 오면 종전 감시는 그 자리에 멈췄다
test("첫 페이지가 비어도 nextToken 을 따라가 뒤 페이지의 오류를 읽고, 읽은 위치는 창 끝이다", async () => {
  const { fetchPage, calls } = fakePages([
    { events: [], nextToken: "a" },
    { events: [], nextToken: "b" },
    { events: [ev(150), ev(160)] },
  ]);

  const r = await scanWindow(fetchPage, 100, 1000, LIMITS);

  assert.deepEqual(r.events.map((e) => e.t), [150, 160]);
  assert.equal(r.cursor, 1000);
  assert.equal(r.complete, true);
  assert.deepEqual(calls.map((c) => c.nextToken), [undefined, "a", "b"]);
});

test("모든 페이지 요청은 같은 창 (읽은 위치+1, 창 끝) 으로 나간다", async () => {
  const { fetchPage, calls } = fakePages([{ events: [], nextToken: "a" }, { events: [] }]);

  await scanWindow(fetchPage, 100, 1000, LIMITS);

  assert.ok(calls.every((c) => c.startTime === 101 && c.endTime === 1000));
});

test("오류가 하나도 없어도 창을 다 읽으면 읽은 위치가 창 끝으로 간다", async () => {
  const { fetchPage } = fakePages([{ events: [] }]);

  const r = await scanWindow(fetchPage, 100, 1000, LIMITS);

  assert.deepEqual(r, { events: [], cursor: 1000, complete: true });
});

test("건수 상한에 걸리면 마지막 시각 직전까지만 보내고, 다음 틱이 그 시각부터 다시 읽는다", async () => {
  const { fetchPage } = fakePages([{ events: [ev(200), ev(300), ev(300), ev(400)], nextToken: "a" }]);

  const r = await scanWindow(fetchPage, 100, 1000, { maxEvents: 3, maxPages: 20 });

  // 앞 3건은 200·300·300 — 300 이 다음 페이지에도 있을 수 있으므로 300 은 다음 틱으로 미룬다
  assert.deepEqual(r.events.map((e) => e.t), [200]);
  assert.equal(r.cursor, 299);
  assert.equal(r.complete, false);
});

test("상한에서 끊을 때 전부 같은 시각이면 그대로 보내고 그 시각까지 옮긴다", async () => {
  const { fetchPage } = fakePages([{ events: [ev(300), ev(300)], nextToken: "a" }]);

  const r = await scanWindow(fetchPage, 100, 1000, { maxEvents: 2, maxPages: 20 });

  assert.equal(r.events.length, 2);
  assert.equal(r.cursor, 300);
});

test("페이지 상한 안에 하나도 못 받으면 읽은 위치를 옮기지 않는다(진척 없음)", async () => {
  const { fetchPage, calls } = fakePages(Array.from({ length: 5 }, (_, i) => ({ events: [], nextToken: `t${i}` })));

  const r = await scanWindow(fetchPage, 100, 1000, { maxEvents: 500, maxPages: 3 });

  assert.deepEqual(r, { events: [], cursor: 100, complete: false });
  assert.equal(calls.length, 3);
});

test("창이 비었으면(창 끝 ≤ 읽은 위치) 조회하지 않는다", async () => {
  const { fetchPage, calls } = fakePages([]);

  const r = await scanWindow(fetchPage, 1000, 1000, LIMITS);

  assert.deepEqual(r, { events: [], cursor: 1000, complete: true });
  assert.equal(calls.length, 0);
});

test("읽은 위치가 상한보다 뒤처지면 창 끝 − 상한으로 당기고 건너뛴 길이를 돌려준다", () => {
  const hour = 3_600_000;
  assert.deepEqual(clampCursor(0, 5 * hour, hour), { cursor: 4 * hour, skippedMs: 4 * hour });
  assert.deepEqual(clampCursor(4.5 * hour, 5 * hour, hour), { cursor: 4.5 * hour, skippedMs: 0 });
});

test("건너뛴 길이는 일·시간·분으로 읽힌다", () => {
  const min = 60_000;
  assert.equal(formatGap(12 * min), "12분");
  assert.equal(formatGap(125 * min), "2시간 5분");
  assert.equal(formatGap((3 * 1440 + 4 * 60 + 30) * min), "3일 4시간");
  assert.equal(formatGap(20_000), "1분 미만");
});
