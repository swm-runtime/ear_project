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

test("axisMax 는 이상치에만 개입한다", () => {
  assert.equal(axisMax([]), 50, "값이 없으면 기본 축");
  assert.equal(axisMax([60, 62, 64, 66, 70]), 70, "이상치가 없으면 최댓값 그대로");
  assert.equal(axisMax([2400]), 2400, "칸이 하나뿐이면 자를 근거가 없다");
  assert.equal(axisMax([60, 62, 64, 2400]), 248, "중앙값 62 × 4");
  assert.ok(axisMax([1, 1, 1]) >= 50, "축은 최소 50ms");
});
