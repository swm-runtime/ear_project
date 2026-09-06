"use client";
import { useCallback, useEffect, useState } from "react";
import { Stat } from "@/components/ui";

/**
 * 대시보드 탭 — 요청 로그(LoggingInterceptor 라인)를 시간축 그래프로, 자원/DB 스냅샷을
 * 게이지로 그린다. **자동 폴링하지 않는다** — 열 때 1회 + [새로고침] (사용자 결정 2026-09-06).
 *
 * 데이터는 불러온 창(최대 1,000줄) 안의 근사치다. 헬스체크(/health, 30초 심장박동)는
 * 트래픽이 아니므로 그래프에서 뺀다 — 넣으면 30초 간격 막대가 실트래픽을 덮는다.
 */

const RANGES = [
  { minutes: 30, label: "30분" },
  { minutes: 60, label: "1시간" },
  { minutes: 180, label: "3시간" },
  { minutes: 360, label: "6시간" },
];

type LogEvent = { t: number; message: string };
type Parsed = { t: number; path: string; status: number; durationMs: number };

type Metrics = {
  host: { load_1m: number; cpu_count: number; cpu_used_percent: number | null; mem_total_bytes: number; mem_available_bytes: number };
  db: { connections: { total: number; active: number; max: number }; cache_hit_ratio: number | null; size_bytes: number };
};

const FIELD_RES = {
  method: /method:\s*'([A-Z]+)'/,
  path: /path:\s*'([^']+)'/,
  status: /status:\s*(\d{3})\b/,
  durationMs: /duration_ms:\s*(\d+)\b/,
};

/** backend-traffic.tsx 와 같은 순차 스캔 — 여기서는 시간축이 필요해 record 시작 시각을 함께 든다 */
function parseRequests(events: LogEvent[]): Parsed[] {
  const parsed: Parsed[] = [];
  let current: Partial<Parsed> = {};

  for (const e of events) {
    if (FIELD_RES.method.exec(e.message)) current = { t: e.t };
    const path = FIELD_RES.path.exec(e.message)?.[1];
    if (path) current.path = path.split("?")[0];
    const status = FIELD_RES.status.exec(e.message)?.[1];
    if (status) current.status = Number(status);
    const durationMs = FIELD_RES.durationMs.exec(e.message)?.[1];
    if (durationMs) current.durationMs = Number(durationMs);

    if (current.t && current.path && current.status !== undefined && current.durationMs !== undefined) {
      if (!current.path.endsWith("/health")) parsed.push(current as Parsed);
      current = {};
    }
  }
  return parsed;
}

type Bucket = { start: number; ok: number; errors: number; durations: number[] };

function buildBuckets(parsed: Parsed[], minutes: number, now: number): Bucket[] {
  const bucketMs = (minutes <= 30 ? 1 : minutes <= 60 ? 2 : minutes <= 180 ? 5 : 10) * 60_000;
  const from = now - minutes * 60_000;
  const count = Math.ceil((minutes * 60_000) / bucketMs);
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

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

const hhmm = (t: number) => new Date(t).toLocaleTimeString("ko-KR", { hour12: false, hour: "2-digit", minute: "2-digit" });
const GiB = 1024 ** 3;

/** 분당 요청 막대 — 정상은 브랜드색, 4xx/5xx는 빨강으로 위에 쌓는다 */
function RequestBars({ buckets }: { buckets: Bucket[] }) {
  const W = 720; const H = 110; const gap = 2;
  const bw = W / buckets.length - gap;
  const max = Math.max(1, ...buckets.map((b) => b.ok + b.errors));
  return (
    <svg viewBox={`0 0 ${W} ${H + 16}`} className="w-full">
      {buckets.map((b, i) => {
        const total = b.ok + b.errors;
        const h = (total / max) * H;
        const eh = total === 0 ? 0 : (b.errors / total) * h;
        const x = i * (bw + gap);
        return (
          <g key={b.start}>
            <rect x={x} y={H - h} width={bw} height={h - eh} className="fill-brand/70" />
            <rect x={x} y={H - eh} width={bw} height={eh} className="fill-red-500" />
          </g>
        );
      })}
      <text x={0} y={H + 12} className="fill-ink-soft text-[9px]">{hhmm(buckets[0].start)}</text>
      <text x={W} y={H + 12} textAnchor="end" className="fill-ink-soft text-[9px]">{hhmm(buckets[buckets.length - 1].start)}</text>
    </svg>
  );
}

/** 응답시간 p50/p95 선 그래프 — 요청이 없는 버킷은 선을 끊는다 */
function LatencyLines({ buckets }: { buckets: Bucket[] }) {
  const W = 720; const H = 110;
  const points = buckets.map((b, i) => {
    const sorted = [...b.durations].sort((a, z) => a - z);
    return { i, p50: percentile(sorted, 50), p95: percentile(sorted, 95), has: sorted.length > 0 };
  });
  const max = Math.max(50, ...points.map((p) => p.p95));
  const x = (i: number) => (i / Math.max(1, buckets.length - 1)) * W;
  const y = (v: number) => H - (v / max) * H;
  const path = (pick: (p: (typeof points)[number]) => number) =>
    points.map((p, idx) => (p.has ? `${idx === 0 || !points[idx - 1]?.has ? "M" : "L"}${x(p.i).toFixed(1)},${y(pick(p)).toFixed(1)}` : "")).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H + 16}`} className="w-full">
      <path d={path((p) => p.p95)} className="fill-none stroke-amber-500" strokeWidth={1.5} />
      <path d={path((p) => p.p50)} className="fill-none stroke-brand" strokeWidth={1.5} />
      <text x={0} y={12} className="fill-ink-soft text-[9px]">최대 {Math.round(max)}ms</text>
      <text x={0} y={H + 12} className="fill-ink-soft text-[9px]">{hhmm(buckets[0].start)}</text>
      <text x={W} y={H + 12} textAnchor="end" className="fill-ink-soft text-[9px]">{hhmm(buckets[buckets.length - 1].start)}</text>
    </svg>
  );
}

/** 임계 색이 칠해지는 가로 게이지 */
function Gauge({ label, percent, detail, warnAt, badAt }: { label: string; percent: number | null; detail: string; warnAt: number; badAt: number }) {
  const tone = percent === null ? "bg-line" : percent >= badAt ? "bg-red-500" : percent >= warnAt ? "bg-amber-500" : "bg-brand";
  return (
    <div className="rounded border border-line bg-panel p-3">
      <div className="flex items-baseline justify-between text-[12px]">
        <span className="text-ink-soft">{label}</span>
        <span className="font-semibold text-ink">{percent === null ? "—" : `${percent.toFixed(0)}%`}</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded bg-paper-soft">
        <div className={`h-full ${tone}`} style={{ width: `${Math.min(100, percent ?? 0)}%` }} />
      </div>
      <p className="mt-1.5 text-[11px] text-ink-soft">{detail}</p>
    </div>
  );
}

export function BackendDashboard() {
  const [minutes, setMinutes] = useState(60);
  const [events, setEvents] = useState<LogEvent[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadedAt, setLoadedAt] = useState<number>(Date.now());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [logsRes, metricsRes] = await Promise.all([
        fetch(`/api/backend-logs?group=api&minutes=${minutes}&limit=1000`, { cache: "no-store" }),
        fetch("/api/backend-metrics", { cache: "no-store" }),
      ]);
      const logsBody = (await logsRes.json()) as { events?: LogEvent[]; message?: string };
      if (!logsRes.ok) { setError(logsBody.message ?? `조회 실패 (${logsRes.status})`); return; }
      setEvents(logsBody.events ?? []);
      // 자원 스냅샷은 실패해도 그래프는 그린다 (서버 미배포 등)
      setMetrics(metricsRes.ok ? ((await metricsRes.json()) as Metrics) : null);
      setError(null);
      setLoadedAt(Date.now());
    } catch {
      setError("네트워크 오류 — 잠시 후 다시 시도하세요");
    } finally {
      setLoading(false);
    }
  }, [minutes]);

  useEffect(() => { void load(); }, [load]);

  const chip = (active: boolean) =>
    `rounded border px-2 py-1 text-xs ${active ? "border-ink bg-panel font-medium" : "border-line bg-panel text-ink-soft hover:text-ink"}`;

  if (error) {
    return <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">{error}</div>;
  }

  const parsed = parseRequests(events);
  const buckets = buildBuckets(parsed, minutes, loadedAt);
  const errorCount = parsed.filter((p) => p.status >= 400).length;
  const sortedAll = parsed.map((p) => p.durationMs).sort((a, b) => a - b);

  const memUsed = metrics ? ((metrics.host.mem_total_bytes - metrics.host.mem_available_bytes) / metrics.host.mem_total_bytes) * 100 : null;
  const connUsed = metrics ? (metrics.db.connections.total / Math.max(1, metrics.db.connections.max)) * 100 : null;

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
          {loading ? "불러오는 중…" : `연 시점 기준 · 요청 ${parsed.length}건 (헬스체크 제외) · ${new Date(loadedAt).toLocaleTimeString("ko-KR", { hour12: false })}`}
        </span>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="요청 수" value={`${parsed.length}건`} sub={`창 ${minutes}분 · 최대 1,000줄 근사`} tone="text-ink" />
        <Stat label="오류(4xx/5xx)" value={`${errorCount}건`} sub={parsed.length ? `${((errorCount / parsed.length) * 100).toFixed(1)}%` : "—"} tone={errorCount > 0 ? "text-red-600" : "text-brand-ink"} />
        <Stat label="응답시간 p50" value={`${percentile(sortedAll, 50)}ms`} sub="파싱된 요청 기준" tone="text-ink" />
        <Stat label="응답시간 p95" value={`${percentile(sortedAll, 95)}ms`} sub="파싱된 요청 기준" tone="text-ink" />
      </div>

      <div className="mb-3 grid gap-3 lg:grid-cols-2">
        <div className="rounded border border-line bg-panel p-3">
          <h3 className="mb-2 text-[12px] font-semibold text-ink">요청 수 <span className="font-normal text-ink-soft">· 빨강 = 4xx/5xx</span></h3>
          <RequestBars buckets={buckets} />
        </div>
        <div className="rounded border border-line bg-panel p-3">
          <h3 className="mb-2 text-[12px] font-semibold text-ink">응답시간 <span className="font-normal text-ink-soft">· <span className="text-brand">p50</span> / <span className="text-amber-600">p95</span></span></h3>
          <LatencyLines buckets={buckets} />
        </div>
      </div>

      {metrics ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Gauge label="CPU" percent={metrics.host.cpu_used_percent} warnAt={70} badAt={90}
            detail={`load ${metrics.host.load_1m.toFixed(2)} · ${metrics.host.cpu_count}코어 · Slack 알림 임계 70%`} />
          <Gauge label="메모리" percent={memUsed} warnAt={80} badAt={92}
            detail={`가용 ${((metrics.host.mem_available_bytes) / GiB).toFixed(1)}GB / ${(metrics.host.mem_total_bytes / GiB).toFixed(1)}GB · Slack 알림 임계 80%`} />
          <Gauge label="DB 연결" percent={connUsed} warnAt={60} badAt={80}
            detail={`${metrics.db.connections.total}/${metrics.db.connections.max} · 활성 ${metrics.db.connections.active} · 캐시 ${metrics.db.cache_hit_ratio === null ? "—" : `${(metrics.db.cache_hit_ratio * 100).toFixed(1)}%`}`} />
        </div>
      ) : (
        <p className="text-[12px] text-ink-soft">자원 스냅샷을 불러오지 못했습니다 — 제품 서버 미배포이거나 조회 실패 (그래프는 로그 기준이라 무관)</p>
      )}
    </div>
  );
}
