/**
 * 백엔드 요청 로그(LoggingInterceptor) 파서 — 서버·클라이언트 공용.
 *
 * 운영 Nest 로거는 `compact: false` 가 기본이라 요청 1건을 **여러 줄**로 찍고,
 * awslogs 드라이버가 줄마다 CloudWatch 이벤트를 만든다(실로그 확인 2026-09-08):
 *
 * ```
 * [Nest] 1  - ... LOG [LoggingInterceptor] request completed
 * [Nest] 1  - ... LOG [LoggingInterceptor] Object(6) {
 *   trace_id: '...',
 *   user_id: '...',
 *   method: 'GET',
 *   path: '/api/v1/...',
 *   status: 200,
 *   duration_ms: 22
 * }
 * ```
 *
 * 요청 1건 = 9~11줄이다. 그래서 "몇 줄을 읽을까"는 "몇 건을 볼까"와 전혀 다른 질문이고,
 * 이 파서를 서버에 두는 이유도 그것이다 — 줄이 아니라 **건수**를 기준으로 모을 수 있다.
 * 한 record 의 줄들은 한 번의 console 쓰기라 연속으로 도착한다(필드가 섞이지 않는다).
 */

export type LogEvent = { t: number; message: string };
export type RequestLog = { t: number; method: string; path: string; status: number; durationMs: number };

const FIELD_RES = {
  method: /method:\s*'([A-Z]+)'/,
  path: /path:\s*'([^']+)'/,
  status: /status:\s*(\d{3})\b/,
  durationMs: /duration_ms:\s*(\d+)\b/,
};

/**
 * 순차 스캔 — `method:` 줄에서 새 record 를 열고(그 줄의 시각을 record 시각으로 든다),
 * 네 필드가 다 차면 확정한다. 형식이 다른 줄은 조용히 건너뛴다.
 * 미완성 record 는 다음 `method:` 에서 버려진다 — 느린 쿼리 WARN 의 `duration_ms` 같은
 * 남의 필드가 요청에 섞이지 않는다.
 */
export function parseRequests(events: LogEvent[]): RequestLog[] {
  const parsed: RequestLog[] = [];
  let current: Partial<RequestLog> = {};

  for (const e of events) {
    const method = FIELD_RES.method.exec(e.message)?.[1];
    if (method) current = { t: e.t, method };

    const path = FIELD_RES.path.exec(e.message)?.[1];
    if (path) current.path = path;
    const status = FIELD_RES.status.exec(e.message)?.[1];
    if (status) current.status = Number(status);
    const durationMs = FIELD_RES.durationMs.exec(e.message)?.[1];
    if (durationMs) current.durationMs = Number(durationMs);

    if (current.t && current.method && current.path && current.status !== undefined && current.durationMs !== undefined) {
      parsed.push(current as RequestLog);
      current = {};
    }
  }
  return parsed;
}

/** 헬스체크는 트래픽이 아니다 — 그래프에서 빼고, 무엇보다 **조회 예산을 먹지 않게** 한다 */
export const isHealthCheck = (p: RequestLog) => p.path.split("?")[0].endsWith("/health");

/** uuid·숫자 세그먼트를 접어 같은 엔드포인트로 묶는다 (경로별 집계용) */
export function normalizePath(path: string): string {
  return path
    .split("?")[0]
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "/:id")
    .replace(/\/\d+(?=\/|$)/g, "/:n");
}

export type LogPage = { events: LogEvent[]; nextToken?: string };

/**
 * 목표 **건수**를 채울 때까지 과거로 페이지를 넘기며 요청을 모은다.
 * CloudWatch 를 모르는 순수 함수라 가짜 `fetchPage` 로 검증할 수 있다(호출부는 route.ts).
 *
 * - 페이지 경계에서 record 가 잘리지 않도록 줄을 모아뒀다가 **매번 전체를 다시 파싱**한다.
 *   요청 1건이 9~11줄이라 경계에 걸릴 확률이 낮지 않다.
 * - 헬스체크는 **건수를 세기 전에** 버린다. 실측(2026-09-08 운영)으로 요청의 60%였다 —
 *   세고 나서 버리면 목표를 채워도 그래프에 쓸 것은 40%뿐이다.
 * - `exhausted` 는 "더 없다"는 뜻이다. 목표를 못 채웠는데 exhausted 도 아니면 페이지 상한에
 *   걸린 것이고, 화면은 그때 창의 앞부분이 빠졌다고 밝혀야 한다.
 */
export async function collectRequestLogs(
  fetchPage: (token: string | undefined) => Promise<LogPage>,
  opts: { target: number; excludeHealth: boolean; maxPages: number },
): Promise<{ requests: RequestLog[]; exhausted: boolean; pages: number }> {
  const pages: LogEvent[][] = [];
  let token: string | undefined;
  let exhausted = false;
  let fetched = 0;

  const collect = () => {
    const parsed = parseRequests(pages.flat());
    return opts.excludeHealth ? parsed.filter((p) => !isHealthCheck(p)) : parsed;
  };

  while (fetched < opts.maxPages) {
    const page = await fetchPage(token);
    fetched += 1;
    if (page.events.length === 0) { exhausted = true; break; } // 창의 시작에 닿았다
    pages.unshift(page.events); // 과거 쪽을 앞에 붙인다
    if (collect().length >= opts.target) break;
    if (!page.nextToken || page.nextToken === token) { exhausted = true; break; }
    token = page.nextToken;
  }

  const all = collect();
  // `exhausted` 는 오직 "더 읽을 것이 없다"만 뜻한다 — 모은 건수가 목표에 못 미친다고
  // 다 읽은 것이 아니다(페이지 상한에 걸렸을 수 있다). 이걸 섞으면 화면이 잘린 창을
  // 온전한 창으로 표시한다.
  return { requests: all.slice(-opts.target), exhausted, pages: fetched };
}
