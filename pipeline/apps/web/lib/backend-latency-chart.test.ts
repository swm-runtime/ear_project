import { test } from "node:test";
import assert from "node:assert/strict";

import { axisMax, bucketMsFor, buildBuckets, percentile } from "./backend-latency-chart";
import { RequestLog } from "./backend-request-log";

const req = (t: number, durationMs: number, status = 200): RequestLog =>
  ({ t, method: "GET", path: "/api/v1/explore", status, durationMs });

/** 2026-09-08 21:43:17 KST 처럼 어중간한 초에 화면을 연 상황 */
const ODD = Date.UTC(2026, 8, 8, 12, 43, 17, 421);

test("버킷 경계는 벽시계(bucketMs 배수)에 맞는다 — 화면 연 시각에 붙지 않는다", () => {
  for (const minutes of [30, 60, 180, 360]) {
    const bucketMs = bucketMsFor(minutes);
    for (const b of buildBuckets([], minutes, ODD)) {
      assert.equal(b.start % bucketMs, 0, `${minutes}분 범위의 칸 ${new Date(b.start).toISOString()}`);
    }
  }
});

test("창은 언제나 now 를 덮는다", () => {
  for (const minutes of [30, 60, 180, 360]) {
    const buckets = buildBuckets([], minutes, ODD);
    const last = buckets[buckets.length - 1];
    assert.ok(last.start <= ODD && ODD < last.start + bucketMsFor(minutes));
    assert.ok(buckets[0].start <= ODD - minutes * 60_000);
  }
});

test("새로고침해도(now 가 달라도) 같은 요청은 같은 칸에 들어간다", () => {
  const base = Date.UTC(2026, 8, 8, 12, 22, 0);
  const reqs = [req(base, 10), req(base + 61_000, 20), req(base + 121_000, 30)];
  const valued = (now: number) =>
    buildBuckets(reqs, 180, now).filter((b) => b.durations.length > 0)
      .map((b) => `${new Date(b.start).toISOString()}=${b.durations.join(",")}`);

  const at = valued(Date.UTC(2026, 8, 8, 12, 43, 17, 421));
  assert.deepEqual(valued(Date.UTC(2026, 8, 8, 12, 43, 59, 999)), at, "42초 뒤 새로고침");
  assert.deepEqual(valued(Date.UTC(2026, 8, 8, 12, 44, 30, 0)), at, "1분 뒤 새로고침");
});

test("10분 칸은 5분 칸 정확히 두 개다 — 범위를 바꿔도 구간이 포개진다", () => {
  const base = Date.UTC(2026, 8, 8, 12, 0, 0);
  const reqs = Array.from({ length: 40 }, (_, i) => req(base + i * 30_000, 10 + i));
  const now = Date.UTC(2026, 8, 8, 12, 43, 17, 421);

  const five = new Map(buildBuckets(reqs, 180, now).map((b) => [b.start, b.durations]));
  for (const ten of buildBuckets(reqs, 360, now)) {
    const merged = [...(five.get(ten.start) ?? []), ...(five.get(ten.start + 5 * 60_000) ?? [])];
    assert.deepEqual(ten.durations, merged, new Date(ten.start).toISOString());
  }
});

test("4xx/5xx 는 errors 로, 나머지는 ok 로 센다", () => {
  const base = Date.UTC(2026, 8, 8, 12, 22, 0);
  const [b] = buildBuckets([req(base, 5), req(base, 5, 404), req(base, 5, 500)], 180, Date.UTC(2026, 8, 8, 12, 43, 17))
    .filter((x) => x.durations.length > 0);
  assert.deepEqual({ ok: b.ok, errors: b.errors }, { ok: 1, errors: 2 });
});

test("percentile 은 최근접 순위다", () => {
  const s = (n: number) => Array.from({ length: n }, (_, i) => i + 1);
  assert.equal(percentile([], 50), 0);
  assert.equal(percentile(s(1), 95), 1);
  assert.equal(percentile(s(2), 50), 1, "floor 였다면 2(최댓값)였다");
  assert.equal(percentile(s(10), 50), 5);
  assert.equal(percentile(s(100), 50), 50);
  assert.equal(percentile(s(100), 95), 95);
});

test("axisMax 는 이상치 하나에 끌려가지 않는다", () => {
  const normal = Array.from({ length: 40 }, (_, i) => 40 + (i % 5)); // 40~44ms
  assert.ok(axisMax(normal) <= 60, `이상치 없으면 데이터에 붙는다 (got ${axisMax(normal)})`);
  assert.ok(axisMax([...normal, 2400]) < 200, `느린 요청 하나가 축을 2,400ms 로 끌지 못한다 (got ${axisMax([...normal, 2400])})`);
});

test("axisMax 는 칸 개수가 아니라 요청 분포를 본다 — 범위를 바꿔도 축이 흔들리지 않는다", () => {
  // 2026-09-09 운영에서 실제로 걸린 모양: 느린 무리 17건 + 빠른 무리 17건 + 드문 요청 몇 건
  const reqs = [...Array(17).fill(304), ...Array(17).fill(9), 16, 17, 303, 305];
  // 창이 넓어져 빠른 무리가 더 들어와도 축이 3배씩 튀지 않는다
  const wider = [...reqs, ...Array(20).fill(11)];
  const a = axisMax(reqs), b = axisMax(wider);
  assert.ok(Math.max(a, b) / Math.min(a, b) < 1.5, `축이 ${a}ms ↔ ${b}ms 로 튀면 안 된다`);
});

test("axisMax 경계", () => {
  assert.equal(axisMax([]), 50, "값이 없으면 기본 축");
  assert.equal(axisMax([2400]), 2400, "표본이 하나뿐이면 자를 근거가 없다");
  assert.ok(axisMax([1, 1, 1]) >= 50, "축은 최소 50ms");
  assert.ok(axisMax([100, 100, 100]) <= 100, "실제 최댓값을 넘지 않는다");
});
