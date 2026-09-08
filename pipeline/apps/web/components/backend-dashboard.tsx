"use client";
import { useCallback, useEffect, useState } from "react";
import { Stat } from "@/components/ui";
import { RequestLog } from "@/lib/backend-request-log";

/**
 * 대시보드 탭 — 요청 로그를 시간축 그래프로, 자원(CPU·메모리·DB 연결) 이력을 선 그래프로
 * 그린다. **자동 폴링하지 않는다** — 열 때 1회 + [새로고침] (사용자 결정 2026-09-06).
 *
 * - 요청·응답시간: 서버가 **요청 건수 기준**으로 모아준 창 안의 근사치(`mode=requests`).
 *   목표 건수를 못 채우면 창 앞부분이 빠지고, 그때는 [요청 수] 카드가 어디부터인지 밝힌다.
 *   헬스체크(/health)는 서버가 조회 단계에서 뺀다 — 예전엔 그것이 예산의 60%를 먹었다
 * - 자원 이력: 백엔드가 60초마다 쌓는 메모리 링 버퍼(최대 6시간) — 재기동(배포) 시 비워진다
 * - 모든 그래프는 마우스 호버로 시각·값을 보여준다
 */

/**
 * 서버에 요청할 **건수**. 줄이 아니라 건수라서 범위를 넓혀도 표본이 같이 늘어난다.
 * 6시간 × 10분 버킷(36칸)이면 칸당 40건쯤 — p95 가 최댓값이 아니라 진짜 p95 가 된다.
 */
const REQUEST_TARGET = 1_500;

const RANGES = [
  { minutes: 30, label: "30분" },
  { minutes: 60, label: "1시간" },
  { minutes: 180, label: "3시간" },
  { minutes: 360, label: "6시간" },
];

type HistoryPoint = { t: number; cpu_used_percent: number | null; mem_used_percent: number | null; db_conn_total: number | null };
type Metrics = {
  host: { load_1m: number; cpu_count: number; cpu_used_percent: number | null; mem_total_bytes: number; mem_available_bytes: number };
  db: { connections: { total: number; active: number; max: number }; cache_hit_ratio: number | null; size_bytes: number };
  history?: HistoryPoint[];
};

/** 서버가 요청 건수 기준으로 모아 준 응답 — 파싱은 `lib/backend-request-log.ts` 가 서버에서 한다 */
type RequestsBody = { requests: RequestLog[]; coveredFrom: number | null; windowFrom: number; exhausted: boolean };

type Bucket = { start: number; ok: number; errors: number; durations: number[] };

function buildBuckets(parsed: RequestLog[], minutes: number, now: number): Bucket[] {
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

/**
 * 최근접 순위(nearest-rank) — p 백분위는 오름차순 ceil(p/100·n) 번째 값이다.
 * floor 로 잡으면 한 칸 위를 집어(n=2 의 p50 이 최댓값) 값이 큰 쪽으로 치우친다.
 */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const rank = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank))];
}

/**
 * 응답시간 y축 상한. p95 최댓값을 그대로 쓰면 느린 요청 **하나**가 축을 끌어올려 p50 선을
 * x축에 붙여버린다 — 표본이 적은 버킷의 p95 는 곧 그 버킷의 최댓값이라 자주 벌어진다
 * (1분 버킷·표본 4건이면 2,400ms 하나에 축이 2,400ms 가 되고 40ms 대 p50 은 바닥에 깔린다).
 * 그래서 p95 들의 **중앙값** 기준으로 상한을 두고, 넘는 점은 위에서 자른 뒤 ▲ 로 표시한다.
 * 값을 잃지는 않는다 — 툴팁은 늘 실제값을 보여준다. 이상치가 없으면 예전과 같은 축이다.
 */
function axisMax(p95s: number[]): number {
  const seen = p95s.filter((v) => v > 0).sort((a, b) => a - b);
  if (seen.length === 0) return 50;
  return Math.max(50, Math.min(seen[seen.length - 1], percentile(seen, 50) * 4));
}

const hhmm = (t: number) => new Date(t).toLocaleTimeString("ko-KR", { hour12: false, hour: "2-digit", minute: "2-digit" });
const GiB = 1024 ** 3;

// --- 그래프 공통 골격 -------------------------------------------------------

const W = 720;
const H = 110;
const PAD_B = 16; // x축 시각 라벨 자리

/** 마우스 위치 → 0..1 비율. 각 차트가 자기 축으로 환산한다 */
function useHoverRatio() {
  const [ratio, setRatio] = useState<number | null>(null);
  const onMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setRatio(Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)));
  };
  return { ratio, onMouseMove, onMouseLeave: () => setRatio(null) };
}

/** 호버 툴팁 — 차트 위 절대 배치. 좌우 끝에서는 안쪽으로 붙인다 */
function Tip({ ratio, lines }: { ratio: number; lines: string[] }) {
  const left = `${Math.min(92, Math.max(8, ratio * 100))}%`;
  return (
    <div className="pointer-events-none absolute top-1 z-10 -translate-x-1/2 whitespace-nowrap rounded border border-line bg-panel px-2 py-1 text-[11px] leading-4 text-ink shadow" style={{ left }}>
      {lines.map((l) => <div key={l}>{l}</div>)}
    </div>
  );
}

/** 가로 그리드 + y축 값 라벨 (위에서부터 levels 비율 지점) */
function YGrid({ max, unit }: { max: number; unit: string }) {
  return (
    <>
      {[0.25, 0.5, 0.75].map((f) => (
        <line key={f} x1={0} x2={W} y1={H * f} y2={H * f} className="stroke-line" strokeWidth={0.5} strokeDasharray="2 3" />
      ))}
      {[0, 0.5].map((f) => (
        <text key={f} x={2} y={H * f + 9} className="fill-ink-soft text-[9px]">{Math.round(max * (1 - f))}{unit}</text>
      ))}
    </>
  );
}

/**
 * x축 시각 눈금 ~5개. `bucketed` 는 값이 점이 아니라 **구간**(버킷)일 때 — 눈금을 칸
 * 가운데에 둬서 막대·선의 x 와 같은 자리를 가리키게 한다.
 */
function XTicks({ times, bucketed = false }: { times: number[]; bucketed?: boolean }) {
  if (times.length === 0) return null;
  const tickX = (i: number) =>
    bucketed ? ((i + 0.5) * W) / times.length : (i / Math.max(1, times.length - 1)) * W;
  const step = Math.max(1, Math.ceil(times.length / 5));
  const idxs = Array.from({ length: times.length }, (_, i) => i).filter((i) => i % step === 0);
  if (idxs[idxs.length - 1] !== times.length - 1) idxs.push(times.length - 1);
  return (
    <>
      {idxs.map((i) => (
        <text key={i} x={tickX(i)} y={H + 12}
          textAnchor={i === 0 ? "start" : i === times.length - 1 ? "end" : "middle"}
          className="fill-ink-soft text-[9px]">{hhmm(times[i])}</text>
      ))}
    </>
  );
}

// --- 개별 그래프 ------------------------------------------------------------

/** 버킷별 요청 막대 — 정상 브랜드색, 4xx/5xx 빨강 적층. 호버 시 건수 */
function RequestBars({ buckets }: { buckets: Bucket[] }) {
  const { ratio, onMouseMove, onMouseLeave } = useHoverRatio();
  const max = Math.max(1, ...buckets.map((b) => b.ok + b.errors));
  const gap = 2;
  const bw = W / buckets.length - gap;
  const idx = ratio === null ? null : Math.min(buckets.length - 1, Math.floor(ratio * buckets.length));

  return (
    <div className="relative" onMouseMove={onMouseMove} onMouseLeave={onMouseLeave}>
      <svg viewBox={`0 0 ${W} ${H + PAD_B}`} className="w-full">
        <YGrid max={max} unit="건" />
        {buckets.map((b, i) => {
          const total = b.ok + b.errors;
          const h = (total / max) * H;
          const eh = total === 0 ? 0 : (b.errors / total) * h;
          const x = i * (bw + gap);
          return (
            <g key={b.start} opacity={idx === null || idx === i ? 1 : 0.45}>
              <rect x={x} y={H - h} width={bw} height={h - eh} className="fill-brand/70" />
              <rect x={x} y={H - eh} width={bw} height={eh} className="fill-red-500" />
            </g>
          );
        })}
        <XTicks times={buckets.map((b) => b.start)} bucketed />
      </svg>
      {idx !== null && (
        <Tip ratio={ratio!} lines={[
          hhmm(buckets[idx].start),
          `요청 ${buckets[idx].ok + buckets[idx].errors}건${buckets[idx].errors ? ` · 오류 ${buckets[idx].errors}건` : ""}`,
        ]} />
      )}
    </div>
  );
}

/**
 * 버킷별 응답시간 p50/p95 선 — 요청 없는 버킷은 선을 끊는다. 호버 시 값과 표본 수.
 *
 * x 는 **버킷 가운데**다 — 옆의 요청 수 막대(폭 W/n)와 같은 자리를 가리켜야 두 그래프를
 * 나란히 읽을 수 있다. 끝점을 0..W 로 펼치면 버킷마다 반 칸씩 어긋난다.
 * 표본이 적은 버킷의 p95 는 정의상 그 버킷의 최댓값에 가깝다 — 그래서 건수를 함께 띄우고,
 * y축은 그 값 하나에 끌려가지 않게 `axisMax` 로 잡는다(넘는 점은 ▲).
 * 앞뒤가 빈 **고립된 칸은 점으로** 찍는다 — 선만으로는 화면에서 사라진다.
 */
function LatencyLines({ buckets }: { buckets: Bucket[] }) {
  const { ratio, onMouseMove, onMouseLeave } = useHoverRatio();
  const points = buckets.map((b, i) => {
    const sorted = [...b.durations].sort((a, z) => a - z);
    return { i, p50: percentile(sorted, 50), p95: percentile(sorted, 95), n: sorted.length };
  });
  const max = axisMax(points.map((p) => p.p95));
  const x = (i: number) => ((i + 0.5) * W) / buckets.length;
  const y = (v: number) => H - (Math.min(v, max) / max) * H;
  const path = (pick: (p: (typeof points)[number]) => number) =>
    points.map((p, i) => (p.n > 0 ? `${i === 0 || !points[i - 1]?.n ? "M" : "L"}${x(p.i).toFixed(1)},${y(pick(p)).toFixed(1)}` : "")).join(" ");
  // 앞뒤가 모두 빈 칸은 subpath 가 moveto 하나뿐이라 SVG 가 **아무것도 그리지 않는다** —
  // 요청이 있었는데도 조용히 사라지므로 점으로 찍는다. 한산한 시간대일수록 자주 생긴다
  const isolated = points.filter((p) => p.n > 0 && !points[p.i - 1]?.n && !points[p.i + 1]?.n);
  const clipped = points.filter((p) => p.n > 0 && p.p95 > max);
  const idx = ratio === null ? null : Math.min(buckets.length - 1, Math.floor(ratio * buckets.length));

  return (
    <div className="relative" onMouseMove={onMouseMove} onMouseLeave={onMouseLeave}>
      <svg viewBox={`0 0 ${W} ${H + PAD_B}`} className="w-full">
        <YGrid max={max} unit="ms" />
        <path d={path((p) => p.p95)} className="fill-none stroke-amber-500" strokeWidth={1.5} />
        <path d={path((p) => p.p50)} className="fill-none stroke-brand" strokeWidth={1.5} />
        {isolated.map((p) => (
          <g key={`iso-${p.i}`}>
            <circle cx={x(p.i)} cy={y(p.p95)} r={1.75} className="fill-amber-500" />
            <circle cx={x(p.i)} cy={y(p.p50)} r={1.75} className="fill-brand" />
          </g>
        ))}
        {clipped.map((p) => (
          <path key={`clip-${p.i}`} d={`M${(x(p.i) - 3.5).toFixed(1)},5 L${(x(p.i) + 3.5).toFixed(1)},5 L${x(p.i).toFixed(1)},0 Z`}
            className="fill-amber-500" />
        ))}
        {idx !== null && points[idx].n > 0 && (
          <>
            <line x1={x(idx)} x2={x(idx)} y1={0} y2={H} className="stroke-ink-soft" strokeWidth={0.5} />
            <circle cx={x(idx)} cy={y(points[idx].p50)} r={2.5} className="fill-brand" />
            <circle cx={x(idx)} cy={y(points[idx].p95)} r={2.5} className="fill-amber-500" />
          </>
        )}
        <XTicks times={buckets.map((b) => b.start)} bucketed />
      </svg>
      {idx !== null && (
        <Tip ratio={ratio!} lines={points[idx].n > 0
          ? [hhmm(buckets[idx].start), `p50 ${points[idx].p50}ms · p95 ${points[idx].p95}ms`,
             `${points[idx].n}건${points[idx].p95 > max ? " · p95 는 축 상한 초과" : ""}`]
          : [hhmm(buckets[idx].start), "요청 없음"]} />
      )}
    </div>
  );
}

/** 60초 샘플 시계열 선 — 자원 이력(CPU/메모리 % 또는 DB 연결 수) 공용 */
function SampleLines({ history, from, to, series, yMax, unit, refLines }: {
  history: HistoryPoint[];
  from: number;
  to: number;
  series: { key: keyof HistoryPoint; label: string; strokeClass: string; dotClass: string }[];
  yMax: number;
  unit: string;
  refLines?: { at: number; className: string }[];
}) {
  const { ratio, onMouseMove, onMouseLeave } = useHoverRatio();
  const points = history.filter((p) => p.t >= from && p.t <= to);

  if (points.length < 2) {
    return <p className="py-8 text-center text-[12px] text-ink-soft">이력이 쌓이는 중입니다 (60초 간격, 서버 재기동 시 초기화)</p>;
  }

  const x = (t: number) => ((t - from) / (to - from)) * W;
  const y = (v: number) => H - (Math.min(v, yMax) / yMax) * H;
  const linePath = (key: keyof HistoryPoint) =>
    points.map((p, i) => {
      const v = p[key] as number | null;
      if (v === null) return "";
      const prev = i > 0 ? (points[i - 1][key] as number | null) : null;
      return `${i === 0 || prev === null ? "M" : "L"}${x(p.t).toFixed(1)},${y(v).toFixed(1)}`;
    }).join(" ");

  const idx = ratio === null ? null
    : points.reduce((best, p, i) => (Math.abs(p.t - (from + ratio * (to - from))) < Math.abs(points[best].t - (from + ratio * (to - from))) ? i : best), 0);

  return (
    <div className="relative" onMouseMove={onMouseMove} onMouseLeave={onMouseLeave}>
      <svg viewBox={`0 0 ${W} ${H + PAD_B}`} className="w-full">
        <YGrid max={yMax} unit={unit} />
        {refLines?.map((r) => (
          <line key={r.at} x1={0} x2={W} y1={y(r.at)} y2={y(r.at)} className={r.className} strokeWidth={1} strokeDasharray="4 3" />
        ))}
        {series.map((s) => <path key={s.label} d={linePath(s.key)} className={`fill-none ${s.strokeClass}`} strokeWidth={1.5} />)}
        {idx !== null && (
          <>
            <line x1={x(points[idx].t)} x2={x(points[idx].t)} y1={0} y2={H} className="stroke-ink-soft" strokeWidth={0.5} />
            {series.map((s) => {
              const v = points[idx][s.key] as number | null;
              return v === null ? null : <circle key={s.label} cx={x(points[idx].t)} cy={y(v)} r={2.5} className={s.dotClass} />;
            })}
          </>
        )}
        <XTicks times={[from, (from + to) / 2, to]} />
      </svg>
      {idx !== null && (
        <Tip ratio={ratio!} lines={[
          hhmm(points[idx].t),
          ...series.map((s) => {
            const v = points[idx][s.key] as number | null;
            return `${s.label} ${v === null ? "—" : `${Math.round(v)}${unit}`}`;
          }),
        ]} />
      )}
    </div>
  );
}

// --- 페이지 ----------------------------------------------------------------

export function BackendDashboard() {
  const [minutes, setMinutes] = useState(60);
  const [body, setBody] = useState<RequestsBody | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadedAt, setLoadedAt] = useState<number>(Date.now());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [logsRes, metricsRes] = await Promise.all([
        fetch(`/api/backend-logs?mode=requests&group=api&minutes=${minutes}&target=${REQUEST_TARGET}&exclude=health`, { cache: "no-store" }),
        fetch("/api/backend-metrics", { cache: "no-store" }),
      ]);
      const logsBody = (await logsRes.json()) as Partial<RequestsBody> & { message?: string };
      if (!logsRes.ok) { setError(logsBody.message ?? `조회 실패 (${logsRes.status})`); return; }
      setBody({ requests: logsBody.requests ?? [], coveredFrom: logsBody.coveredFrom ?? null,
        windowFrom: logsBody.windowFrom ?? 0, exhausted: logsBody.exhausted ?? true });
      // 자원 스냅샷·이력은 실패해도 요청 그래프는 그린다 (서버 미배포 등)
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

  const parsed = body?.requests ?? [];
  const buckets = buildBuckets(parsed, minutes, loadedAt);
  const errorCount = parsed.filter((p) => p.status >= 400).length;

  const from = loadedAt - minutes * 60_000;
  // 목표 건수를 못 채우면 창의 앞부분이 빠진다 — 그래프 왼쪽이 빈 이유를 밝힌다
  const truncated = body !== null && !body.exhausted && parsed.length > 0 && parsed[0].t > from;
  const history = metrics?.history ?? [];
  const maxConn = metrics?.db.connections.max ?? 0;
  const connMaxSeen = Math.max(10, ...history.map((p) => p.db_conn_total ?? 0));
  const memUsed = metrics ? ((metrics.host.mem_total_bytes - metrics.host.mem_available_bytes) / metrics.host.mem_total_bytes) * 100 : null;

  const card = "rounded border border-line bg-panel p-3";
  const title = "mb-2 text-[12px] font-semibold text-ink";

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
        <Stat label="요청 수" value={`${parsed.length}건`}
          sub={truncated ? `${hhmm(parsed[0].t)} 이후만 — 상한 ${REQUEST_TARGET.toLocaleString()}건` : `창 ${minutes}분 · 헬스체크 제외`}
          tone="text-ink" />
        <Stat label="오류(4xx/5xx)" value={`${errorCount}건`} sub={parsed.length ? `${((errorCount / parsed.length) * 100).toFixed(1)}%` : "—"} tone={errorCount > 0 ? "text-red-600" : "text-brand-ink"} />
        <Stat label="현재 CPU" value={metrics?.host.cpu_used_percent === null || !metrics ? "—" : `${metrics.host.cpu_used_percent!.toFixed(0)}%`} sub={metrics ? `load ${metrics.host.load_1m.toFixed(2)} · ${metrics.host.cpu_count}코어` : "조회 실패"} tone="text-ink" />
        <Stat label="현재 메모리" value={memUsed === null ? "—" : `${memUsed.toFixed(0)}%`} sub={metrics ? `가용 ${(metrics.host.mem_available_bytes / GiB).toFixed(1)}GB / ${(metrics.host.mem_total_bytes / GiB).toFixed(1)}GB` : "조회 실패"} tone="text-ink" />
      </div>

      <div className="mb-3 grid gap-3 lg:grid-cols-2">
        <div className={card}>
          <h3 className={title}>요청 수 <span className="font-normal text-ink-soft">· 빨강 = 4xx/5xx</span></h3>
          <RequestBars buckets={buckets} />
        </div>
        <div className={card}>
          <h3 className={title}>응답시간 <span className="font-normal text-ink-soft">· <span className="text-brand">p50</span> / <span className="text-amber-600">p95</span> · <span className="text-amber-600">▲</span> 축 상한 초과</span></h3>
          <LatencyLines buckets={buckets} />
        </div>
        <div className={card}>
          <h3 className={title}>
            CPU · 메모리 <span className="font-normal text-ink-soft">· <span className="text-brand">CPU</span> / <span className="text-violet-600">메모리</span> · 점선 = Slack 알림 임계(70/80%)</span>
          </h3>
          <SampleLines history={history} from={from} to={loadedAt} yMax={100} unit="%"
            series={[
              { key: "cpu_used_percent", label: "CPU", strokeClass: "stroke-brand", dotClass: "fill-brand" },
              { key: "mem_used_percent", label: "메모리", strokeClass: "stroke-violet-500", dotClass: "fill-violet-500" },
            ]}
            refLines={[
              { at: 70, className: "stroke-red-400" },
              { at: 80, className: "stroke-violet-400" },
            ]} />
        </div>
        <div className={card}>
          <h3 className={title}>DB 연결 <span className="font-normal text-ink-soft">{maxConn ? `· 최대 ${maxConn}` : ""}</span></h3>
          <SampleLines history={history} from={from} to={loadedAt} yMax={Math.max(connMaxSeen * 1.3, 10)} unit="개"
            series={[{ key: "db_conn_total", label: "연결", strokeClass: "stroke-sky-600", dotClass: "fill-sky-600" }]} />
        </div>
      </div>

      {!metrics && (
        <p className="text-[12px] text-ink-soft">자원 스냅샷·이력을 불러오지 못했습니다 — 제품 서버 미배포이거나 조회 실패 (요청 그래프는 로그 기준이라 무관)</p>
      )}
    </div>
  );
}
