/**
 * 백엔드 ERROR 감시(log-watch.ts)의 **읽기 창 계산** — CloudWatch·DB·Slack 을 모르는 순수 로직이라 따로 둔다(테스트가 본다).
 *
 * 2026-11-20 사고: `FilterLogEvents` 는 결과가 0건이어도 `nextToken` 을 주며 "더 있다"고 알린다(로그를 일정량씩 훑기 때문).
 * 종전 감시는 첫 페이지만 읽고, 읽은 위치를 **오류가 나왔을 때만** 옮겼다 — 첫 페이지가 비면 같은 자리를 영원히 다시 읽어
 * 적어도 11-13부터 일주일 넘게 알림이 끊겼고(채널의 마지막 감시 알림은 10-27), 보존 7일이 그 자리를 지운 날(11-20) 일주일 전 오류를
 * 5분마다 18건씩(한 페이지 분량) 다시 올렸다.
 * 그동안 생존 신호는 "조회 호출이 성공했다"에 찍혀 알람도 울리지 않았다.
 *
 * 고친 규칙:
 * - 한 틱은 `(cursor, windowEnd]` 창을 `nextToken` 이 없을 때까지 읽는다. 다 읽으면 결과와 무관하게 읽은 위치 = 창 끝
 * - 상한(건수·페이지)에 걸리면 마지막으로 받은 오류 시각까지만 옮기고 나머지는 다음 틱이 잇는다
 * - 읽은 위치가 `maxBackMs` 보다 뒤처지면 그 구간은 건너뛴다 — 오래된 오류를 몰아 올리면 지금 오류가 묻힌다(놓친 창은 어드민 웹 에러 모아보기에서)
 */
export interface LogEvent {
  t: number;
  message: string;
}

export interface LogPage {
  events: LogEvent[];
  nextToken?: string;
}

/** CloudWatch 한 페이지 — startTime·endTime 은 양끝 포함(ms) */
export type FetchLogPage = (startTime: number, endTime: number, nextToken?: string) => Promise<LogPage>;

export interface ScanResult {
  events: LogEvent[];
  /** 다음 틱이 이어 읽을 위치 — 이 시각까지는 다 봤다 */
  cursor: number;
  /** 창 끝까지 다 읽었는가. false 면 상한에 걸려 남은 것을 다음 틱이 잇는다 */
  complete: boolean;
}

/** 뒤처진 읽은 위치를 창 끝 기준 `maxBackMs` 안으로 당긴다. 건너뛴 길이(ms)를 함께 돌려준다 */
export function clampCursor(cursor: number, windowEnd: number, maxBackMs: number): { cursor: number; skippedMs: number } {
  const floor = windowEnd - maxBackMs;
  return cursor < floor ? { cursor: floor, skippedMs: floor - cursor } : { cursor, skippedMs: 0 };
}

export async function scanWindow(
  fetchPage: FetchLogPage,
  cursor: number,
  windowEnd: number,
  limits: { maxEvents: number; maxPages: number },
): Promise<ScanResult> {
  if (windowEnd <= cursor) return { events: [], cursor, complete: true };

  const events: LogEvent[] = [];
  let token: string | undefined;

  for (let page = 1; ; page += 1) {
    const out = await fetchPage(cursor + 1, windowEnd, token);
    events.push(...out.events);
    token = out.nextToken;

    if (!token) return { events: sortByTime(events), cursor: windowEnd, complete: true };
    // 이른 것부터 남긴다 — 잘린 뒤쪽은 남긴 것의 마지막 시각 이후라 다음 틱이 다시 읽는다
    if (events.length >= limits.maxEvents) return partial(sortByTime(events).slice(0, limits.maxEvents), cursor);
    if (page >= limits.maxPages) return partial(events, cursor);
  }
}

/**
 * 창을 다 못 읽었을 때 — 마지막 오류 시각에서 끊는다. 같은 시각의 오류가 다음 페이지에 남아 있을 수 있으므로
 * 그 시각의 것은 이번에 보내지 않고 다음 틱이 그 시각부터 다시 읽게 한다(전부 같은 시각이면 어쩔 수 없이 보낸다).
 * 하나도 못 받았으면 위치를 옮기지 않는다 — 이것이 "진척 없음"이고 생존 신호를 찍지 않는 조건이다.
 */
function partial(events: LogEvent[], cursor: number): ScanResult {
  if (events.length === 0) return { events: [], cursor, complete: false };

  const sorted = sortByTime(events);
  const lastT = sorted[sorted.length - 1].t;
  const before = sorted.filter((e) => e.t < lastT);
  return before.length > 0
    ? { events: before, cursor: lastT - 1, complete: false }
    : { events: sorted, cursor: lastT, complete: false };
}

/** 건너뛴 길이를 사람이 읽는 말로 — "3일 4시간" · "2시간 5분" · "12분" (일 단위면 분은 뺀다) */
export function formatGap(ms: number): string {
  const min = Math.round(ms / 60_000);
  const d = Math.floor(min / 1440);
  const h = Math.floor((min % 1440) / 60);
  const m = min % 60;
  return [d > 0 && `${d}일`, h > 0 && `${h}시간`, d === 0 && m > 0 && `${m}분`].filter(Boolean).join(" ") || "1분 미만";
}

function sortByTime(events: LogEvent[]): LogEvent[] {
  return [...events].sort((a, b) => a.t - b.t);
}
