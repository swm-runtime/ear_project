"use client";
import { useCallback, useEffect, useState } from "react";
import { Stat } from "@/components/ui";
import { RequestLog } from "@/lib/backend-request-log";
import { Bucket, buildBuckets, percentile, tipAnchor } from "@/lib/backend-latency-chart";

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

/**
 * 호버 툴팁 — 차트 위 절대 배치. 좌우 끝에서는 **정렬 기준을 바꿔** 카드 밖으로 나가지
 * 않게 한다(`tipAnchor`). 넘치면 페이지에 가로 스크롤이 생겨 화면이 밀린다.
 * `max-w-full`·`overflow-hidden` 은 경로가 유난히 긴 경우를 위한 마지막 방어선이다.
 */
function Tip({ ratio, lines }: { ratio: number; lines: string[] }) {
  const { leftPercent, align } = tipAnchor(ratio);
  const shift = align === "end" ? "-translate-x-full" : align === "start" ? "translate-x-0" : "-translate-x-1/2";
  return (
    <div
      className={`pointer-events-none absolute top-1 z-10 ${shift} max-w-full overflow-hidden whitespace-nowrap rounded border border-line bg-panel px-2 py-1 text-[11px] leading-4 text-ink shadow`}
      style={{ left: `${leftPercent}%` }}
    >
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
 * 요청 산점도 — **요청 한 건이 점 하나**다. 버킷도 백분위도 쓰지 않는다.
 *
 * 원래는 버킷별 p50/p95 선이었는데, 지금 트래픽에서는 그 표현이 성립하지 않는다.
 * 6시간에 요청 39건(2026-09-09 운영 실측)이면 칸당 표본이 한두 건이고, 표본 2건의
 * "p95"는 통계가 아니라 그냥 그 칸의 최댓값이다. 게다가 **백분위는 합칠 수 없어서**
 * 범위를 바꿔 칸 폭이 달라지면 같은 시각의 값이 통째로 달라졌다(10분 칸의 p95는
 * 5분 칸 두 개 p95의 평균도 최댓값도 아니다). 축도 그 값들에 끌려 함께 흔들렸다.
 *
 * 점을 그대로 찍으면 그 문제가 전부 사라진다. 칸 폭도, 표본 수도, 축 상한 추정도
 * 필요 없다. 대신 **느린 요청이 언제 어느 경로에서 났는지**가 바로 보인다 — 이 트래픽
 * 규모에서 실제로 알고 싶은 것이 그것이다.
 *
 * y 는 **로그 축**이다. 응답시간은 배수로 읽는 지표고(20→40ms 가 300→320ms 보다 큰
 * 신호다), 지금 데이터는 10ms 대와 300ms 대로 갈려 선형 축에서는 빠른 쪽이 바닥에 뭉갠다.
 *
 * 트래픽이 칸당 수십 건 규모로 늘면 이 표현은 점이 뭉개진다. 그때는 산점도가 아니라
 * 히스토그램 버킷(개수는 합칠 수 있다) 기반의 백분위나 히트맵으로 가는 것이 맞다 —
 * CloudWatch Logs Insights 의 `pct(duration_ms, 95) by bin(5m)` 이 그 첫 단계다.
 */
function LatencyScatter({ requests, from, to }: { requests: RequestLog[]; from: number; to: number }) {
  const { ratio, onMouseMove, onMouseLeave } = useHoverRatio();

  const peak = requests.reduce((m, r) => Math.max(m, r.durationMs), 0);
  // 축 상한은 10의 거듭제곱으로 올린다 — 눈금이 1·10·100 처럼 읽히는 값이어야 로그 축이 읽힌다
  const decades = Math.max(2, Math.ceil(Math.log10(Math.max(100, peak))));
  const x = (t: number) => ((t - from) / Math.max(1, to - from)) * W;
  const y = (v: number) => H - (Math.log10(Math.max(1, v)) / decades) * H;
  const ticks = Array.from({ length: decades + 1 }, (_, i) => 10 ** i);

  // 호버 지점에 가장 가까운 요청 하나
  const at = ratio === null ? null : from + ratio * (to - from);
  const near = at === null || requests.length === 0 ? null
    : requests.reduce((best, r) => (Math.abs(r.t - at) < Math.abs(best.t - at) ? r : best));

  // 모든 경로에 붙는 `/api/v1` 은 떼고 길이를 자른다 — 툴팁이 넓어질수록 카드를 넘기 쉽다
  const shortPath = (path: string) => {
    const clean = path.split("?")[0].replace(/^\/api\/v1/, "");
    return clean.length > 36 ? `…${clean.slice(-35)}` : clean;
  };

  return (
    <div className="relative" onMouseMove={onMouseMove} onMouseLeave={onMouseLeave}>
      <svg viewBox={`0 0 ${W} ${H + PAD_B}`} className="w-full">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={0} x2={W} y1={y(t)} y2={y(t)} className="stroke-line" strokeWidth={0.5} strokeDasharray="2 3" />
            <text x={2} y={y(t) - 2} className="fill-ink-soft text-[9px]">{t < 1000 ? `${t}ms` : `${t / 1000}s`}</text>
          </g>
        ))}
        {requests.map((r, i) => (
          <circle key={`${r.t}-${i}`} cx={x(r.t)} cy={y(r.durationMs)} r={2}
            className={r.status >= 400 ? "fill-red-500" : "fill-brand"} opacity={0.65} />
        ))}
        {near && (
          <>
            <line x1={x(near.t)} x2={x(near.t)} y1={0} y2={H} className="stroke-ink-soft" strokeWidth={0.5} />
            <circle cx={x(near.t)} cy={y(near.durationMs)} r={3.5} className="fill-none stroke-ink" strokeWidth={1} />
          </>
        )}
        <XTicks times={[from, (from + to) / 2, to]} />
      </svg>
      {near && (
        <Tip ratio={ratio!} lines={[
          `${hhmm(near.t)} · ${near.durationMs}ms`,
          `${near.method} ${shortPath(near.path)}`,
          `status ${near.status}`,
        ]} />
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
  // 창 전체를 한 표본으로 본 백분위 — 버킷으로 쪼개지 않으므로 합산 문제가 없다
  const allDurations = parsed.map((p) => p.durationMs).sort((a, b) => a - b);

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
          <h3 className={title}>응답시간 <span className="font-normal text-ink-soft">· 요청 1건 = 점 1개 · <span className="text-red-600">빨강</span> = 4xx/5xx · y축은 로그</span></h3>
          <p className="mb-2 text-[11px] text-ink-soft">
            {parsed.length > 0
              ? `창 전체 ${parsed.length}건 — p50 ${percentile(allDurations, 50)}ms · p95 ${percentile(allDurations, 95)}ms · 최대 ${allDurations[allDurations.length - 1]}ms`
              : "요청 없음"}
          </p>
          <LatencyScatter requests={parsed} from={from} to={loadedAt} />
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
