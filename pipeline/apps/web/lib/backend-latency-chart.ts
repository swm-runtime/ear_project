import { RequestLog } from "./backend-request-log";

/**
 * 대시보드 응답시간·요청 수 그래프의 계산부 — 그리기(JSX)와 분리해 테스트할 수 있게 둔다.
 */

export type Bucket = { start: number; ok: number; errors: number; durations: number[] };

/** 범위가 넓어질수록 칸을 넓힌다 — 칸 수를 30~36개로 유지한다 */
export function bucketMsFor(minutes: number): number {
  return (minutes <= 30 ? 1 : minutes <= 60 ? 2 : minutes <= 180 ? 5 : 10) * 60_000;
}

/**
 * 버킷 경계를 **벽시계**(bucketMs 의 배수)에 맞춘다.
 *
 * 예전에는 `now - minutes*60_000` 에서 그대로 시작해서 경계가 화면을 연 시각에 붙었다.
 * 12:31:53 에 열면 5분 칸이 12:01:53·12:06:53… 이 되고, **새로고침만 해도 모든 칸과
 * 라벨이 통째로 밀렸다.** 범위를 3시간↔6시간으로 바꾸면 같은 라벨이 서로 다른 구간을
 * 가리켰다(라벨 12:21 이 3시간에서는 12:21:53~12:26:53, 6시간에서는 ~12:31:53).
 *
 * 벽시계에 맞추면 10분 칸이 5분 칸 **정확히 두 개**가 된다. 그래도 두 범위의 p50/p95 가
 * 같아지지는 않는다 — 표본 집합이 다르니 당연하다. 다만 그 차이가 설명 가능해진다.
 */
/**
 * 대시보드 요청 차트들이 공유하는 x축 창. **막대와 산점도가 같은 창을 써야 한다** —
 * 버킷만 벽시계에 맞추고 산점도는 원래 창을 쓰면, 나란히 놓인 두 차트에서 같은 가로
 * 위치가 서로 다른 시각을 가리킨다(6시간 뷰에서 최대 10분 어긋난다).
 *
 * `to` 가 `now` 보다 최대 한 칸 뒤인 것은 의도한 것이다 — 마지막 칸을 온전히 그리고,
 * 로그 시각이 브라우저 시계보다 조금 앞서도 점이 잘리지 않는다.
 */
export function chartWindow(minutes: number, now: number): { from: number; to: number; bucketMs: number } {
  const bucketMs = bucketMsFor(minutes);
  const from = Math.floor((now - minutes * 60_000) / bucketMs) * bucketMs;
  const count = Math.ceil((now - from) / bucketMs); // 정렬로 앞이 밀린 만큼 칸이 하나 늘 수 있다
  return { from, to: from + count * bucketMs, bucketMs };
}

export function buildBuckets(parsed: RequestLog[], minutes: number, now: number): Bucket[] {
  const { from, to, bucketMs } = chartWindow(minutes, now);
  const count = Math.round((to - from) / bucketMs);
  const buckets: Bucket[] = Array.from({ length: count }, (_, i) => ({
    start: from + i * bucketMs, ok: 0, errors: 0, durations: [],
  }));

  for (const p of parsed) {
    const idx = Math.floor((p.t - from) / bucketMs);
    if (idx < 0 || idx >= count) continue;
    if (p.status >= 400) buckets[idx].errors += 1;
    else buckets[idx].ok += 1;
    buckets[idx].durations.push(p.durationMs);
  }
  return buckets;
}

/**
 * 최근접 순위(nearest-rank) — p 백분위는 오름차순 ceil(p/100·n) 번째 값이다.
 * floor 로 잡으면 한 칸 위를 집어(n=2 의 p50 이 최댓값) 값이 큰 쪽으로 치우친다.
 */
export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const rank = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank))];
}

/**
 * 호버 툴팁의 가로 기준점. 끝에서도 가운데 정렬을 유지하면 상자의 절반이 카드 밖으로
 * 나가고, **절대 배치라도 문서의 스크롤 폭은 늘어나** 페이지에 가로 스크롤이 생긴다
 * (오른쪽 끝 점을 볼 때 화면이 밀리는 증상).
 *
 * 그래서 끝에서는 정렬 기준을 바꾼다 — 오른쪽 끝이면 상자의 **오른쪽 모서리**를, 왼쪽
 * 끝이면 **왼쪽 모서리**를 점에 맞춘다. 가운데에서는 지금처럼 가운데를 맞춘다.
 */
export function tipAnchor(ratio: number): { leftPercent: number; align: "start" | "center" | "end" } {
  const pct = Math.min(100, Math.max(0, ratio * 100));
  // 30/70 은 임의값이 아니다 — 상자가 컨테이너의 53%(경로까지 든 툴팁 ≈240px / 카드 ≈450px)
  // 여도 가운데 정렬 구간의 양끝이 안에 남는 가장 느슨한 경계다. 아래 테스트가 이를 고정한다.
  if (pct >= 70) return { leftPercent: Math.min(99, pct), align: "end" };
  if (pct <= 30) return { leftPercent: Math.max(1, pct), align: "start" };
  return { leftPercent: pct, align: "center" };
}
