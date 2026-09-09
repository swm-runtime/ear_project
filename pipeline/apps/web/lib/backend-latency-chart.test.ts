import { test } from "node:test";
import assert from "node:assert/strict";

import { bucketMsFor, buildBuckets, chartWindow, percentile, tipAnchor } from "./backend-latency-chart";
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

test("툴팁은 좌우 끝에서 정렬 기준을 바꿔 컨테이너를 넘지 않는다", () => {
  // 가운데: 점을 가운데로 — 지금까지의 동작
  assert.equal(tipAnchor(0.5).align, "center");

  // 오른쪽 끝: 상자의 오른쪽 모서리를 점에 맞춘다. left 가 100%를 넘지 않아야 한다
  for (const r of [0.75, 0.9, 1, 1.5]) {
    const a = tipAnchor(r);
    assert.equal(a.align, "end", `ratio ${r}`);
    assert.ok(a.leftPercent <= 99, `ratio ${r} → left ${a.leftPercent}%`);
  }

  // 왼쪽 끝: 왼쪽 모서리를 맞춘다. left 가 음수가 되면 안 된다
  for (const r of [0.25, 0.1, 0, -0.5]) {
    const a = tipAnchor(r);
    assert.equal(a.align, "start", `ratio ${r}`);
    assert.ok(a.leftPercent >= 1, `ratio ${r} → left ${a.leftPercent}%`);
  }
});

test("툴팁 상자가 어느 위치에서도 컨테이너를 넘지 않는다 — 넘으면 페이지에 가로 스크롤이 생긴다", () => {
  const CONTAINER = 450; // 2단 그리드의 카드 폭
  for (const BOX of [120, 170, 240]) { // 짧은 툴팁 ~ 경로까지 든 툴팁
    for (let pct = 0; pct <= 100; pct += 0.25) {
      const { leftPercent, align } = tipAnchor(pct / 100);
      const anchor = (leftPercent / 100) * CONTAINER;
      const left = align === "end" ? anchor - BOX : align === "start" ? anchor : anchor - BOX / 2;
      assert.ok(left >= 0, `상자 ${BOX}px · ratio ${pct}% → 왼쪽 ${left.toFixed(1)}px < 0`);
      assert.ok(left + BOX <= CONTAINER, `상자 ${BOX}px · ratio ${pct}% → 오른쪽 ${(left + BOX).toFixed(1)}px > ${CONTAINER}px`);
    }
  }
});

test("막대와 산점도가 같은 x축 창을 쓴다", () => {
  for (const minutes of [30, 60, 180, 360]) {
    const { from, to, bucketMs } = chartWindow(minutes, ODD);
    const buckets = buildBuckets([], minutes, ODD);
    // 창은 칸들이 덮는 범위와 정확히 같아야 한다 — 산점도는 이 창을 그대로 쓴다
    assert.equal(from, buckets[0].start, `${minutes}분 창의 시작`);
    assert.equal(to, buckets[buckets.length - 1].start + bucketMs, `${minutes}분 창의 끝`);
    assert.equal(to - from, buckets.length * bucketMs, `${minutes}분 창의 길이`);
  }
});

test("창은 now 를 포함하고, 로그가 브라우저 시계보다 조금 앞서도 잘리지 않는다", () => {
  for (const minutes of [30, 60, 180, 360]) {
    const { from, to, bucketMs } = chartWindow(minutes, ODD);
    assert.ok(from <= ODD && ODD < to, `${minutes}분 창이 now 를 담는다`);
    assert.ok(to - ODD <= bucketMs, `${minutes}분 창의 오른쪽 여유가 한 칸 이내`);
    assert.ok(to > ODD, `${minutes}분 창에 오른쪽 여유가 있다`);
  }
});
