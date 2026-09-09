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
export function buildBuckets(parsed: RequestLog[], minutes: number, now: number): Bucket[] {
  const bucketMs = bucketMsFor(minutes);
  const from = Math.floor((now - minutes * 60_000) / bucketMs) * bucketMs;
  const count = Math.ceil((now - from) / bucketMs); // 정렬로 앞이 밀린 만큼 칸이 하나 늘 수 있다
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
 * 응답시간 y축 상한. p95 최댓값을 그대로 쓰면 느린 요청 **하나**가 축을 끌어올려 p50 선을
 * x축에 붙여버린다 — 표본이 적은 버킷의 p95 는 곧 그 버킷의 최댓값이라 자주 벌어진다.
 * 그래서 p95 들의 **중앙값** 기준으로 상한을 두고, 넘는 점은 위에서 자른 뒤 ▲ 로 표시한다.
 * 값을 잃지는 않는다 — 툴팁은 늘 실제값을 보여준다. 이상치가 없으면 예전과 같은 축이다.
 */
export function axisMax(p95s: number[]): number {
  const seen = p95s.filter((v) => v > 0).sort((a, b) => a - b);
  if (seen.length === 0) return 50;
  return Math.max(50, Math.min(seen[seen.length - 1], percentile(seen, 50) * 4));
}
