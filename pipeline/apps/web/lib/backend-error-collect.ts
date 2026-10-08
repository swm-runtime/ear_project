/**
 * ERROR 로그 수집기 — CloudWatch `FilterLogEvents` 의 조각(1MB) 특성을 감싸는 순수 로직.
 *
 * `FilterLogEvents` 는 `startTime`(창의 **오래된 쪽**)부터 앞으로 훑다가 약 1MB(또는
 * 10,000 이벤트)를 **읽으면** — 걸러진 결과가 아니라 읽은 양이다 — 거기서 끊고 `nextToken` 을
 * 돌려준다. api 로그는 요청 1건이 9~11줄이라 1MB 가 한두 시간치다. 그래서 한 번만 부르면
 * "24시간 창"이 실제로는 **24시간 전 시점부터 한두 시간 안의 ERROR** 가 되고, 창의 시작이
 * 호출마다 밀려 24시간 → 3일 → 24시간을 누르면 있던 에러가 사라졌다(2026-10-08 발견).
 *
 * 그래서 창을 **최신 → 과거 방향의 시간 조각**으로 나눠 조각마다 `nextToken` 을 끝까지 따라가고,
 * 누적 이벤트 수나 총 왕복 수가 상한에 닿으면 멈춘다. 최신 조각부터 보기 때문에 상한에 걸려도
 * "방금 난 에러"는 들어 있고, 빠지는 것은 창의 **오래된 쪽**이다. 어디까지 다 봤는지는
 * `coveredFrom` 으로 돌려주어 화면이 사실대로 밝힌다.
 *
 * CloudWatch 를 모르는 순수 함수라 가짜 `fetchPage` 로 검증한다(호출부는 route.ts).
 */
import type { LogEvent } from "./backend-request-log";

export type TimeRange = { startTime: number; endTime: number };
export type FilterPage = { events: LogEvent[]; nextToken?: string };
export type FetchFilterPage = (range: TimeRange, token: string | undefined) => Promise<FilterPage>;

export type ErrorCollection = {
  /** 시각 오름차순 */
  events: LogEvent[];
  /** 이 시각 이후는 **전부** 봤다. 상한에 걸려 조각 중간에 멈췄으면 그 조각의 이벤트는 일부만 들어 있다 */
  coveredFrom: number;
  /** 창을 끝까지(windowFrom 까지) 봤는가 */
  exhausted: boolean;
  /** 총 왕복 수 */
  pages: number;
};

export const HOUR_MS = 60 * 60_000;

/**
 * 조각 길이 — 창을 `parts` 등분하되 `minMs` 보다 작게는 자르지 않는다.
 * 1시간 창(서버 상태)은 조각 1개, 24시간은 2시간 조각 12개, 7일은 14시간 조각 12개.
 * 조각마다 최소 1회는 부르므로 너무 잘게 자르면 에러가 하나도 없어도 왕복이 는다.
 */
export function sliceSizeFor(windowMs: number, parts = 12, minMs = HOUR_MS): number {
  return Math.max(minMs, Math.ceil(windowMs / parts));
}

/**
 * 창 `[windowFrom, now]` 를 **최신부터** 서로 겹치지 않는 조각으로 나눈다.
 * `FilterLogEvents` 의 startTime·endTime 은 둘 다 포함 경계라 조각 사이를 1ms 띄운다 —
 * 겹치면 경계 시각의 이벤트가 두 번 세어진다.
 */
export function sliceWindow(windowFrom: number, now: number, sliceMs: number): TimeRange[] {
  if (now < windowFrom) return [];
  // 조각 수는 창 길이로 정하고, 포함 경계 때문에 남는 1ms 는 가장 오래된 조각이 흡수한다
  const count = Math.max(1, Math.ceil((now - windowFrom) / sliceMs));
  const slices: TimeRange[] = [];
  for (let i = 0; i < count; i++) {
    const endTime = now - i * sliceMs;
    const startTime = i === count - 1 ? windowFrom : endTime - sliceMs + 1;
    slices.push({ startTime, endTime });
  }
  return slices;
}

export async function collectErrorLogs(
  fetchPage: FetchFilterPage,
  opts: { windowFrom: number; now: number; maxEvents: number; maxPages: number; sliceMs?: number },
): Promise<ErrorCollection> {
  const sliceMs = opts.sliceMs ?? sliceSizeFor(opts.now - opts.windowFrom);
  const slices = sliceWindow(opts.windowFrom, opts.now, sliceMs);
  const events: LogEvent[] = [];
  let pages = 0;
  // 아직 완주한 조각이 없으면 "now 이후"만 봤다 = 아무것도 다 보지 못했다
  let coveredFrom = opts.now;

  const stop = (): ErrorCollection => ({ events: sorted(events), coveredFrom, exhausted: false, pages });

  for (const slice of slices) {
    let token: string | undefined;
    for (;;) {
      if (pages >= opts.maxPages) return stop();
      const page = await fetchPage(slice, token);
      pages += 1;
      events.push(...page.events);
      // 빈 페이지라도 nextToken 이 있으면 끝이 아니다 — 1MB 를 읽었는데 ERROR 가 없었을 뿐이다.
      // (GetLogEvents 와 달리 FilterLogEvents 는 끝에서 nextToken 을 아예 주지 않는다.
      //  같은 토큰이 되돌아오는 경우도 끝으로 본다 — 무한 루프 방지)
      if (!page.nextToken || page.nextToken === token) break;
      token = page.nextToken;
      if (events.length >= opts.maxEvents) return stop(); // 조각 중간 — coveredFrom 은 이 조각 이후까지만
    }
    coveredFrom = slice.startTime;
    if (events.length >= opts.maxEvents && slice !== slices[slices.length - 1]) return stop();
  }

  return { events: sorted(events), coveredFrom: opts.windowFrom, exhausted: true, pages };
}

const sorted = (events: LogEvent[]) => [...events].sort((a, b) => a.t - b.t);
