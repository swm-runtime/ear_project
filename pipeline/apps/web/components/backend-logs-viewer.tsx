"use client";
import { useCallback, useEffect, useRef, useState } from "react";

/** 백엔드 로그 화면의 본체 — /api/backend-logs(CloudWatch tail)를 폴링해 보여준다.
 * 텍스트 필터는 불러온 범위(최근 N분·최대 1000줄) 안에서만 거른다 — 전 기간 검색이 아니다. */

const GROUPS = [
  { key: "api", label: "api (NestJS)" },
  { key: "caddy", label: "caddy (접근 로그)" },
];
const RANGES = [
  { minutes: 15, label: "15분" },
  { minutes: 60, label: "1시간" },
  { minutes: 360, label: "6시간" },
  { minutes: 1440, label: "24시간" },
];
const POLL_SEC = 5;

type LogEvent = { t: number; message: string };

const timeFmt = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul", hour12: false,
  month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
});

function lineTone(message: string): string {
  if (/\b(ERROR|FATAL)\b|"level":"error"/i.test(message)) return "text-red-400";
  if (/\bWARN\b|"level":"warn"/i.test(message)) return "text-amber-300";
  return "text-[#c9d4de]";
}

export function BackendLogsViewer() {
  const [group, setGroup] = useState("api");
  const [minutes, setMinutes] = useState(60);
  const [filter, setFilter] = useState("");
  const [auto, setAuto] = useState(true);
  const [events, setEvents] = useState<LogEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const stickBottom = useRef(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/backend-logs?group=${group}&minutes=${minutes}`, { cache: "no-store" });
      const body = (await res.json()) as { events?: LogEvent[]; message?: string };
      if (!res.ok) { setError(body.message ?? `조회 실패 (${res.status})`); return; }
      setEvents(body.events ?? []);
      setError(null);
      setUpdatedAt(new Date());
    } catch {
      setError("네트워크 오류 — 잠시 후 다시 시도합니다");
    } finally {
      setLoading(false);
    }
  }, [group, minutes]);

  useEffect(() => { setLoading(true); void load(); }, [load]);
  useEffect(() => {
    if (!auto) return;
    const id = setInterval(() => void load(), POLL_SEC * 1000);
    return () => clearInterval(id);
  }, [auto, load]);

  // 맨 아래를 보고 있었을 때만 갱신 후에도 아래에 붙인다 — 위로 스크롤해 읽는 중이면 방해하지 않는다
  useEffect(() => {
    const box = boxRef.current;
    if (box && stickBottom.current) box.scrollTop = box.scrollHeight;
  }, [events]);

  const visible = filter
    ? events.filter((e) => e.message.toLowerCase().includes(filter.toLowerCase()))
    : events;

  const chip = (active: boolean) =>
    `rounded border px-2 py-1 text-xs ${active ? "border-ink bg-panel font-medium" : "border-line bg-panel text-ink-soft hover:text-ink"}`;

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
            <button key={r.minutes} type="button" className={chip(minutes === r.minutes)} onClick={() => setMinutes(r.minutes)}>
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
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
          자동 새로고침 {POLL_SEC}초
        </label>
        <button type="button" className={chip(false)} onClick={() => { setLoading(true); void load(); }}>
          새로고침
        </button>
        <span className="ml-auto text-ink-soft">
          {loading ? "불러오는 중…" : `${visible.length}줄${filter ? ` / 전체 ${events.length}줄` : ""}${updatedAt ? ` · ${timeFmt.format(updatedAt)} 갱신` : ""}`}
        </span>
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
