import { test } from "node:test";
import assert from "node:assert/strict";

import { collectRequestLogs, isHealthCheck, LogEvent, parseRequests } from "./backend-request-log";

/**
 * 운영 로그와 **같은 모양**의 이벤트를 만든다 — 요청 1건이 9줄로 쪼개진다.
 * 이 모양은 2026-09-08 운영 CloudWatch 실로그에서 확인했다(요청 1건 = 9~11줄,
 * 1,000줄 안의 요청 90건 중 54건이 헬스체크였다). 실로그는 user_id 가 들어 있어
 * 레포에 넣지 않는다 — 모양만 옮긴다.
 */
function requestRecord(t: number, i: number, path: string, ms: number): LogEvent[] {
  const head = "[Nest] 1  - 09/08/2026, 12:05:03 PM     LOG [LoggingInterceptor]";
  return [
    `${head} request completed`,
    `${head} Object(6) {`,
    `  trace_id: 'af3d4137-aff5-4102-8aea-e856d8f0${String(i).padStart(4, "0")}',`,
    `  user_id: 'ea7a84ff-3eb9-4830-aac3-7e8284${String(i).padStart(6, "0")}',`,
    `  method: 'GET',`,
    `  path: '${path}',`,
    `  status: 200,`,
    `  duration_ms: ${ms}`,
    "}",
  ].map((message, line) => ({ t: t + line, message }));
}

/** 요청 n건 — 3건 중 1건은 헬스체크(운영 비율에 가깝게) */
function stream(n: number): LogEvent[] {
  const events: LogEvent[] = [];
  for (let i = 0; i < n; i++) {
    const health = i % 3 === 0;
    events.push(...requestRecord(1_000_000 + i * 1_000, i, health ? "/api/v1/health" : `/api/v1/explore?q=${i}`, health ? 1 : 20 + i));
  }
  return events;
}

/** CloudWatch tail 흉내 — 최신 페이지부터 주고 nextToken 으로 과거를 준다 */
function pager(events: LogEvent[], pageSize: number) {
  const pages: LogEvent[][] = [];
  for (let i = events.length; i > 0; i -= pageSize) pages.push(events.slice(Math.max(0, i - pageSize), i));
  return async (token: string | undefined) => {
    const i = token === undefined ? 0 : Number(token);
    if (i >= pages.length) return { events: [], nextToken: token }; // 스트림 끝 = 빈 응답
    return { events: pages[i], nextToken: String(i + 1) };
  };
}

test("여러 줄로 쪼개진 요청 record 를 한 건으로 모은다", () => {
  const parsed = parseRequests(requestRecord(0, 1, "/api/v1/explore", 42));
  assert.equal(parsed.length, 1);
  assert.deepEqual(
    { method: parsed[0].method, path: parsed[0].path, status: parsed[0].status, durationMs: parsed[0].durationMs },
    { method: "GET", path: "/api/v1/explore", status: 200, durationMs: 42 },
  );
});

test("느린 쿼리 WARN 의 duration_ms 는 요청에 섞이지 않는다", () => {
  const events: LogEvent[] = [
    { t: 1, message: "[Nest] 1  - WARN [SlowQuery] Object(2) {" },
    { t: 2, message: "  duration_ms: 1730," },
    { t: 3, message: "  query: 'SELECT $1 FROM contents'" },
    { t: 4, message: "}" },
    ...requestRecord(10, 1, "/api/v1/explore", 20),
  ];
  const parsed = parseRequests(events);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].durationMs, 20);
});

test("페이지 경계에서 record 가 잘리지 않는다", async () => {
  const events = stream(60);
  const whole = parseRequests(events).filter((p) => !isHealthCheck(p));
  for (const pageSize of [7, 13, 40, 97, 200]) {
    const r = await collectRequestLogs(pager(events, pageSize), { target: 1000, excludeHealth: true, maxPages: 100 });
    assert.equal(r.requests.length, whole.length, `페이지 ${pageSize}줄`);
  }
});

test("헬스체크는 목표 건수를 세기 전에 버린다", async () => {
  const events = stream(30); // 헬스체크 10건 + 나머지 20건
  const kept = await collectRequestLogs(pager(events, 1000), { target: 100, excludeHealth: true, maxPages: 5 });
  const all = await collectRequestLogs(pager(events, 1000), { target: 100, excludeHealth: false, maxPages: 5 });
  assert.equal(kept.requests.length, 20);
  assert.equal(all.requests.length, 30);
});

test("목표를 채우면 더 부르지 않는다", async () => {
  const r = await collectRequestLogs(pager(stream(60), 90), { target: 5, excludeHealth: true, maxPages: 100 });
  assert.equal(r.requests.length, 5);
  assert.equal(r.pages, 1);
  assert.equal(r.exhausted, false, "더 남아 있으므로 exhausted 가 아니다");
});

test("페이지 상한에 걸리면 exhausted 가 아니다 — 화면이 잘린 창을 온전한 창으로 그리면 안 된다", async () => {
  const r = await collectRequestLogs(pager(stream(200), 50), { target: 1000, excludeHealth: true, maxPages: 2 });
  assert.equal(r.pages, 2);
  assert.equal(r.exhausted, false);
});

test("스트림을 다 읽으면 exhausted 이고 시각 순서가 유지된다", async () => {
  const r = await collectRequestLogs(pager(stream(40), 90), { target: 1000, excludeHealth: true, maxPages: 100 });
  assert.equal(r.exhausted, true);
  assert.ok(r.requests.every((p, i, a) => i === 0 || a[i - 1].t <= p.t));
});
