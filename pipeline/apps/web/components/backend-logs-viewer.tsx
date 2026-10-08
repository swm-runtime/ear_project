"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * 백엔드 로그 화면의 본체 — /api/backend-logs(CloudWatch tail)를 폴링해 보여준다.
 *
 * 기간 버튼이 **줄 한도도 함께** 정한다(15분 500 … 24시간 10,000). 서버는 `GetLogEvents` 로
 * 최신 N줄만 꼬리로 가져오므로 기간만 바꾸고 한도가 같으면 어느 기간을 눌러도 최근 몇 분치
 * 300줄이 나왔다(2026-10-08 — "24시간이나 6시간이나 보이는 양이 같다"). 한도까지 채웠는데 창이
 * 더 남았으면 [이전 로그 더 보기]로 `nextToken` 을 따라 과거를 위쪽에 이어 붙인다.
 *
 * 텍스트 필터는 불러온 범위 안에서만 거른다 — 전 기간 검색이 아니다.
 */

const GROUPS = [
  { key: "api", label: "api (NestJS)" },
  { key: "caddy", label: "caddy (접근 로그)" },
];
/**
 * 줄 한도는 "그 기간에 보통 몇 줄 쌓이는가"가 아니라 "브라우저가 한 번에 받아 그릴 만한가"로 정했다.
 * CloudWatch `GetLogEvents` 는 호출당 최대 10,000건·1MB 라 24시간은 1MB 에 먼저 걸려 그보다 적게 온다 —
 * 그때는 서버가 `exhausted:false` 를 주고 [더 보기]가 나온다.
 */
const RANGES = [
  { minutes: 15, limit: 500, label: "15분" },
  { minutes: 60, limit: 1_500, label: "1시간" },
  { minutes: 360, limit: 5_000, label: "6시간" },
  { minutes: 1440, limit: 10_000, label: "24시간" },
];
const POLL_SEC = 5;

type LogEvent = { t: number; message: string };
type TailResponse = { events?: LogEvent[]; nextToken?: string; windowFrom?: number; exhausted?: boolean; message?: string };

const timeFmt = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul", hour12: false,
  month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
});
const hmFmt = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour12: false, hour: "2-digit", minute: "2-digit" });

function lineTone(message: string): string {
  if (/\b(ERROR|FATAL)\b|"level":"error"/i.test(message)) return "text-red-400";
  if (/\bWARN\b|"level":"warn"/i.test(message)) return "text-amber-300";
  return "text-[#c9d4de]";
}

export function BackendLogsViewer() {
  const [group, setGroup] = useState("api");
  const [range, setRange] = useState(RANGES[1]);
  const [filter, setFilter] = useState("");
  const [auto, setAuto] = useState(true);
  /** 최신 페이지 — 폴링마다 통째로 바뀐다 */
  const [events, setEvents] = useState<LogEvent[]>([]);
  /** [더 보기]로 이어 붙인 과거 — 최신 페이지보다 앞에 그린다 */
  const [older, setOlder] = useState<LogEvent[]>([]);
  const [nextToken, setNextToken] = useState<string | undefined>(undefined);
  const [exhausted, setExhausted] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const stickBottom = useRef(true);
  /** 더 보기 직전의 스크롤 높이 — 위쪽에 붙인 만큼 scrollTop 을 밀어 보던 줄을 그대로 둔다 */
  const prependFrom = useRef<number | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/backend-logs?group=${group}&minutes=${range.minutes}&limit=${range.limit}`, { cache: "no-store" });
      const body = (await res.json()) as TailResponse;
      if (!res.ok) { setError(body.message ?? `조회 실패 (${res.status})`); return; }
      setEvents(body.events ?? []);
      setNextToken(body.nextToken);
      setExhausted(body.exhausted !== false);
      setError(null);
      setUpdatedAt(new Date());
    } catch {
      setError("네트워크 오류 — 잠시 후 다시 시도합니다");
    } finally {
      setLoading(false);
    }
  }, [group, range]);

  // 그룹·기간이 바뀌면 이어 붙인 과거는 버리고 새로 받는다 — 다른 창의 것이다.
  // (effect 안의 동기 setState 는 규칙이 막지만, 여기서는 "불러오는 중" 표시 자체가 목적이다)
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setOlder([]); setLoading(true); void load(); }, [load]);
  useEffect(() => {
    if (!auto) return;
    const id = setInterval(() => void load(), POLL_SEC * 1000);
    return () => clearInterval(id);
  }, [auto, load]);

  /**
   * [이전 로그 더 보기] — 현재 가장 오래된 토큰부터 과거로 한 페이지 더 당겨 위에 붙인다.
   * 누르면 **자동 새로고침을 끈다**: 폴링은 "최신 N줄"을 통째로 갈아 끼우는데, 시간이 지나면
   * 그 N줄의 시작이 앞으로 밀려 이어 붙인 과거와의 사이에 빈 구간이 생긴다. 틈을 메우려면 최신
   * 쪽의 forward 토큰까지 따라가야 해서, 읽는 동안은 멈추고 다시 켜면 처음부터 받는 쪽을 택했다.
   */
  const loadMore = useCallback(async () => {
    if (!nextToken || loadingMore) return;
    setAuto(false);
    setLoadingMore(true);
    try {
      const res = await fetch(
        `/api/backend-logs?group=${group}&minutes=${range.minutes}&limit=${range.limit}&token=${encodeURIComponent(nextToken)}`,
        { cache: "no-store" },
      );
      const body = (await res.json()) as TailResponse;
      if (!res.ok) { setError(body.message ?? `조회 실패 (${res.status})`); return; }
      prependFrom.current = boxRef.current?.scrollHeight ?? null;
      setOlder((prev) => [...(body.events ?? []), ...prev]);
      setNextToken(body.nextToken);
      setExhausted(body.exhausted !== false);
      setError(null);
    } catch {
      setError("네트워크 오류 — 잠시 후 다시 시도하세요");
    } finally {
      setLoadingMore(false);
    }
  }, [group, range, nextToken, loadingMore]);

  // 자동 새로고침을 다시 켜면 이어 붙인 과거를 버리고 최신부터 다시 받는다(위 loadMore 주석)
  const toggleAuto = (on: boolean) => {
    setAuto(on);
    if (on) { setOlder([]); setLoading(true); void load(); }
  };

  const all = older.length ? [...older, ...events] : events;

  // 위에 붙인 높이만큼 scrollTop 을 밀어 보고 있던 줄이 그 자리에 머문다
  useLayoutEffect(() => {
    const box = boxRef.current;
    if (box && prependFrom.current !== null) {
      box.scrollTop += box.scrollHeight - prependFrom.current;
      prependFrom.current = null;
    }
  }, [older]);

  // 맨 아래를 보고 있었을 때만 갱신 후에도 아래에 붙인다 — 위로 스크롤해 읽는 중이면 방해하지 않는다
  useEffect(() => {
    const box = boxRef.current;
    if (box && stickBottom.current) box.scrollTop = box.scrollHeight;
  }, [events]);

  const visible = filter
    ? all.filter((e) => e.message.toLowerCase().includes(filter.toLowerCase()))
    : all;

  const chip = (active: boolean) =>
    `rounded border px-2 py-1 text-xs ${active ? "border-ink bg-panel font-medium" : "border-line bg-panel text-ink-soft hover:text-ink"}`;

  /** "N줄 · 창 안 전부" 또는 "N줄 · 상한에 걸려 HH:mm 이후만" — 사실대로 */
  const statusText = () => {
    if (loading) return "불러오는 중…";
    const count = `${visible.length}줄${filter ? ` / 전체 ${all.length}줄` : ""}`;
    const scope = exhausted || all.length === 0
      ? "창 안 전부"
      : `상한에 걸려 ${hmFmt.format(new Date(all[0].t))} 이후만`;
    return `${count} · ${scope}${updatedAt ? ` · ${timeFmt.format(updatedAt)} 갱신` : ""}`;
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3 text-xs">
        <div className="flex gap-1">
          {GROUPS.map((g) => (
            <button key={g.key} type="button" className={chip(group === g.key)} onClick={() => setGroup(g.key)}>
              {g.label}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <button
              key={r.minutes}
              type="button"
              className={chip(range.minutes === r.minutes)}
              title={`최신 ${r.limit.toLocaleString("ko-KR")}줄까지`}
              onClick={() => setRange(r)}
            >
              {r.label}
            </button>
          ))}
        </div>
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="필터 (불러온 범위 안에서)"
          className="w-56 rounded border border-line bg-panel px-2 py-1 text-xs outline-none focus:border-ink"
        />
        <label className="flex cursor-pointer items-center gap-1.5 text-ink-soft">
          <input type="checkbox" checked={auto} onChange={(e) => toggleAuto(e.target.checked)} />
          자동 새로고침 {POLL_SEC}초
        </label>
        <button type="button" className={chip(false)} onClick={() => { setOlder([]); setLoading(true); void load(); }}>
          새로고침
        </button>
        <span className="ml-auto text-ink-soft">{statusText()}</span>
      </div>

      {error && (
        <div className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">{error}</div>
      )}

      <div
        ref={boxRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          stickBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
        className="h-[calc(100vh-240px)] overflow-auto rounded border border-side-soft bg-side px-3 py-2 font-mono text-[12px] leading-relaxed"
      >
        {!loading && !exhausted && nextToken && (
          <div className="mb-2 flex items-center justify-center gap-2 text-[11px] text-side-ink">
            <button
              type="button"
              disabled={loadingMore}
              onClick={() => void loadMore()}
              className="rounded border border-side-soft px-2 py-1 hover:text-[#c9d4de] disabled:opacity-50"
            >
              {loadingMore ? "불러오는 중…" : "이전 로그 더 보기"}
            </button>
            {auto && <span>— 누르면 자동 새로고침이 꺼집니다</span>}
          </div>
        )}
        {visible.length === 0 && !loading ? (
          <p className="py-6 text-center text-side-ink">
            {error ? "표시할 로그가 없습니다" : "이 범위에 로그가 없습니다 — 기간을 늘리거나 필터를 확인하세요"}
          </p>
        ) : (
          visible.map((e, i) => (
            <div key={`${e.t}-${i}`} className="flex gap-2 whitespace-pre-wrap break-all">
              <span className="shrink-0 select-none text-side-ink">{timeFmt.format(new Date(e.t))}</span>
              <span className={lineTone(e.message)}>{e.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
