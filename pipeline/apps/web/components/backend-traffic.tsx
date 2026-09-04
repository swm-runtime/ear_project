"use client";
import { useCallback, useEffect, useState } from "react";
import { Panel, Stat, Table, Td } from "@/components/ui";

/**
 * 요청 통계 탭 — api 로그의 요청 완료 라인(LoggingInterceptor: method·path·status·duration_ms)을
 * 파싱해 경로별 트래픽·상태 분포·느린 요청을 요약한다.
 *
 * **불러온 창(최근 N분·최대 1,000줄) 안의 근사치다** — 전 기간 통계가 아니고,
 * 요청 로그가 아닌 라인은 세지 않는다.
 */

const RANGES = [
  { minutes: 15, label: "15분" },
  { minutes: 60, label: "1시간" },
  { minutes: 360, label: "6시간" },
];

type LogEvent = { t: number; message: string };
type Parsed = { method: string; path: string; status: number; durationMs: number };
type PathAgg = { key: string; count: number; errors: number; totalMs: number; maxMs: number };

/** LoggingInterceptor 의 객체 라인에서 필드를 뽑는다 — 형식이 다르면 조용히 건너뛴다 */
const REQUEST_RE = /method:\s*'([A-Z]+)'.*?path:\s*'([^']+)'.*?status:\s*(\d{3}).*?duration_ms:\s*(\d+)/;

/** uuid·숫자 세그먼트를 접어 같은 엔드포인트로 묶는다 */
function normalizePath(path: string): string {
  return path
    .split("?")[0]
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "/:id")
    .replace(/\/\d+(?=\/|$)/g, "/:n");
}

export function BackendTraffic() {
  const [minutes, setMinutes] = useState(60);
  const [events, setEvents] = useState<LogEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/backend-logs?group=api&minutes=${minutes}&limit=1000`, { cache: "no-store" });
      const body = (await res.json()) as { events?: LogEvent[]; message?: string };
      if (!res.ok) { setError(body.message ?? `조회 실패 (${res.status})`); return; }
      setEvents(body.events ?? []);
      setError(null);
    } catch {
      setError("네트워크 오류 — 잠시 후 다시 시도하세요");
    } finally {
      setLoading(false);
    }
  }, [minutes]);

  useEffect(() => { void load(); }, [load]);

  const parsed: Parsed[] = [];
  for (const e of events) {
    const m = REQUEST_RE.exec(e.message);
    if (m) parsed.push({ method: m[1], path: normalizePath(m[2]), status: Number(m[3]), durationMs: Number(m[4]) });
  }

  const count = (from: number, to: number) => parsed.filter((p) => p.status >= from && p.status < to).length;
  const byPath = new Map<string, PathAgg>();
  for (const p of parsed) {
    const key = `${p.method} ${p.path}`;
    const agg = byPath.get(key) ?? { key, count: 0, errors: 0, totalMs: 0, maxMs: 0 };
    agg.count += 1;
    if (p.status >= 400) agg.errors += 1;
    agg.totalMs += p.durationMs;
    agg.maxMs = Math.max(agg.maxMs, p.durationMs);
    byPath.set(key, agg);
  }
  const topPaths = [...byPath.values()].sort((a, b) => b.count - a.count).slice(0, 12);
  const slowest = [...parsed].sort((a, b) => b.durationMs - a.durationMs).slice(0, 5);

  const chip = (active: boolean) =>
    `rounded border px-2 py-1 text-xs ${active ? "border-ink bg-panel font-medium" : "border-line bg-panel text-ink-soft hover:text-ink"}`;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3 text-xs">
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <button key={r.minutes} type="button" className={chip(minutes === r.minutes)} onClick={() => setMinutes(r.minutes)}>{r.label}</button>
          ))}
        </div>
        <button type="button" className={chip(false)} onClick={() => void load()}>새로고침</button>
        <span className="ml-auto text-ink-soft">
          {loading ? "불러오는 중…" : `로그 ${events.length}줄 중 요청 ${parsed.length}건 파싱`}
        </span>
      </div>

      {error && <div className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">{error}</div>}

      {!loading && !error && parsed.length === 0 && (
        <div className="rounded border border-line bg-panel px-4 py-8 text-center text-[13px] text-ink-soft">
          이 범위에서 요청 로그를 찾지 못했습니다 — 트래픽이 없거나, 로그 형식이 바뀌었을 수 있습니다
        </div>
      )}

      {parsed.length > 0 && (
        <>
          <div className="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="요청 수" value={`${parsed.length}건`} sub={`최근 ${RANGES.find((r) => r.minutes === minutes)?.label} 창`} />
            <Stat label="성공 (2xx·3xx)" value={`${count(200, 400)}건`} tone="text-brand-ink" />
            <Stat label="클라이언트 오류 (4xx)" value={`${count(400, 500)}건`} tone={count(400, 500) > 0 ? "text-amber-600" : "text-ink"} />
            <Stat label="서버 오류 (5xx)" value={`${count(500, 600)}건`} tone={count(500, 600) > 0 ? "text-red-600" : "text-brand-ink"} />
          </div>

          <Panel title="많이 불린 경로" flush className="mb-3">
            <Table head={["경로", "건수", "4xx+", "평균", "최대"]} empty="">
              {topPaths.map((p) => (
                <tr key={p.key} className="hover:bg-[#f7f9fb]">
                  <Td className="font-mono text-[12px]">{p.key}</Td>
                  <Td>{p.count}</Td>
                  <Td className={p.errors > 0 ? "text-amber-600" : ""}>{p.errors}</Td>
                  <Td>{Math.round(p.totalMs / p.count)}ms</Td>
                  <Td>{p.maxMs}ms</Td>
                </tr>
              ))}
            </Table>
          </Panel>

          <Panel title="느린 요청 Top 5" flush>
            <Table head={["경로", "상태", "소요"]} empty="">
              {slowest.map((p, i) => (
                <tr key={i} className="hover:bg-[#f7f9fb]">
                  <Td className="font-mono text-[12px]">{p.method} {p.path}</Td>
                  <Td>{p.status}</Td>
                  <Td className={p.durationMs >= 1000 ? "text-red-600" : ""}>{p.durationMs}ms</Td>
                </tr>
              ))}
            </Table>
          </Panel>
        </>
      )}
    </div>
  );
}
