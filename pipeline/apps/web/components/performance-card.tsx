"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Panel, btnCls } from "@/components/ui";
import { type EarChannel, type EarInsightsMarket, type EarInsightsSummary, getEarInsightsSummary } from "@/lib/ear";
import { fmtInt, fmtPct } from "@/lib/insights-format";
import { EarGate, EarSession, earErrMsg } from "@/app/publish/ear-connect";

/** 서비스 지표 요약이 허용하는 최대 창(admin INSIGHTS_SUMMARY_MAX_DAYS) — 주 후보를 최대한 넓게 본다 */
const SUMMARY_DAYS = 90;
/** 카드 크기 — 포트폴리오·발표 자료에 그대로 붙이는 비율(900:650) */
const CARD_W = 900;
const CARD_H = 650;

const MARKET_OPTIONS = [
  { value: null, label: "통합" },
  { value: "kr", label: "국내" },
  { value: "global", label: "글로벌" },
] as const satisfies readonly { value: EarInsightsMarket | null; label: string }[];

type Daily = EarInsightsSummary["daily"][number];

/** 한 주(월~일, KST)의 지표 — 모든 지표를 같은 7일로 묶는다 */
interface WeekMetrics {
  start: string;
  end: string;
  days: Daily[];
  signups: number;
  avgActive: number | null;
  avgListeners: number;
  listenSec: number;
  plays: number;
  completes: number;
  completeRate: number | null;
  /** 그 주 가입자의 다음 주 복귀율(주별 코호트 W1) — 구간이 안 끝났거나 표 밖이면 null */
  w1: number | null;
  w1Users: number | null;
  /** 후보 주 사이에서 각 지표를 최댓값 대비로 맞춘 평균(0~1) */
  score: number;
}

/** 지표별 최댓값 대비 비율의 평균 — 값이 없는 지표(접속자 기록 전·W1 미완)는 그 주 평균에서 뺀다 */
const SCORE_KEYS = ["signups", "avgActive", "avgListeners", "listenSec", "completeRate", "w1"] as const;

const addDays = (date: string, n: number): string => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
/** KST 달력일의 그 주 월요일 */
const mondayOf = (date: string): string => {
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
  return addDays(date, -((dow + 6) % 7));
};
const dotDate = (date: string): string => date.replaceAll("-", ".");

function buildWeeks(data: EarInsightsSummary, today: string): WeekMetrics[] {
  const byWeek = new Map<string, Daily[]>();
  for (const d of data.daily) {
    const key = mondayOf(d.date);
    byWeek.set(key, [...(byWeek.get(key) ?? []), d]);
  }
  const w1ByStart = new Map<string, { rate: number | null; users: number }>();
  for (const row of data.retention_cohorts?.weekly.rows ?? []) {
    const cell = row.cells[0];
    if (cell && cell.rate != null && !cell.partial) w1ByStart.set(row.start, { rate: cell.rate, users: row.users });
  }

  const weeks: Omit<WeekMetrics, "score">[] = [];
  for (const [start, days] of byWeek) {
    const end = addDays(start, 6);
    // 온전한 주만 — 7일이 다 있고 이미 끝난 주
    if (days.length < 7 || end >= today) continue;
    const sum = (pick: (d: Daily) => number) => days.reduce((acc, d) => acc + pick(d), 0);
    const actives = days.map((d) => d.active_users).filter((v): v is number => v != null);
    const plays = sum((d) => d.plays);
    const completes = sum((d) => d.completes);
    const w1 = w1ByStart.get(start);
    weeks.push({
      start,
      end,
      days: [...days].sort((a, b) => a.date.localeCompare(b.date)),
      signups: sum((d) => d.signups),
      avgActive: actives.length === 7 ? actives.reduce((a, b) => a + b, 0) / 7 : null,
      avgListeners: sum((d) => d.listeners) / 7,
      listenSec: sum((d) => d.listen_sec),
      plays,
      completes,
      completeRate: plays > 0 ? completes / plays : null,
      w1: w1?.rate ?? null,
      w1Users: w1?.users ?? null,
    });
  }

  const max = Object.fromEntries(
    SCORE_KEYS.map((k) => [k, Math.max(0, ...weeks.map((w) => w[k] ?? 0))]),
  ) as Record<(typeof SCORE_KEYS)[number], number>;
  return weeks
    .map((w) => {
      const parts = SCORE_KEYS.map((k) => (w[k] == null || max[k] === 0 ? null : (w[k] as number) / max[k])).filter(
        (v): v is number => v != null,
      );
      return { ...w, score: parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : 0 };
    })
    .sort((a, b) => b.start.localeCompare(a.start));
}

/** 성과 카드 탭 — 실배포 기준. 주(월~일) 하나를 골라 모든 지표를 그 주로 맞춘다 */
export function PerformanceCard() {
  const [channel, setChannel] = useState<EarChannel>("prod");
  const [market, setMarket] = useState<EarInsightsMarket | null>(null);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {(["prod", "dev"] as const).map((ch) => (
          <button key={ch} type="button" onClick={() => setChannel(ch)} className={`rounded-full border px-3 py-1 text-xs ${channel === ch ? "border-brand bg-brand text-white" : "border-line bg-white text-ink hover:bg-[#f7f9fb]"}`}>
            {ch === "prod" ? "실배포" : "개발계"}
          </button>
        ))}
        <span className="mx-1 h-4 w-px bg-line" aria-hidden="true" />
        {MARKET_OPTIONS.map((m) => (
          <button key={m.label} type="button" onClick={() => setMarket(m.value)} className={`rounded-full border px-3 py-1 text-xs ${market === m.value ? "border-ink bg-ink text-white" : "border-line bg-white text-ink hover:bg-[#f7f9fb]"}`}>
            {m.label}
          </button>
        ))}
        <span className="ml-auto"><EarSession channel={channel} /></span>
      </div>
      <EarGate key={channel} channel={channel}>
        <PerformanceView channel={channel} market={market} />
      </EarGate>
    </div>
  );
}

function PerformanceView({ channel, market }: { channel: EarChannel; market: EarInsightsMarket | null }) {
  const [data, setData] = useState<EarInsightsSummary | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try { setData(await getEarInsightsSummary(channel, SUMMARY_DAYS, market)); }
    catch (e) { setErr(earErrMsg(e)); }
    finally { setLoading(false); }
  }, [channel, market]);
  useEffect(() => { void load(); }, [load]);

  const today = useMemo(
    () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10),
    [],
  );
  const weeks = useMemo(() => (data ? buildWeeks(data, today) : []), [data, today]);
  const best = useMemo(() => weeks.reduce<WeekMetrics | null>((a, w) => (!a || w.score > a.score ? w : a), null), [weeks]);
  const shown = weeks.find((w) => w.start === picked) ?? best;

  if (err) return <Panel><p className="text-sm text-rose-700">{err}</p></Panel>;
  if (!data || loading) return <Panel><p className="text-sm text-ink-soft">불러오는 중…</p></Panel>;
  if (!shown) return <Panel><p className="text-sm text-ink-soft">온전히 끝난 주가 아직 없어요.</p></Panel>;

  return (
    <div className="space-y-3">
      <Panel
        title="기준 주 고르기"
        right={<button type="button" className={btnCls("ghost", "sm")} onClick={() => void load()}>새로고침</button>}
      >
        <p className="mb-2 text-xs text-ink-soft">
          최근 {SUMMARY_DAYS}일 안의 온전한 주(월~일)마다 가입·일평균 접속자·일평균 청취자·청취 시간·완청률·W1 리텐션을 후보 주 최댓값 대비로 맞춰 평균한 점수예요. 모든 지표는 같은 주 기준이고, 기본 선택은 점수가 가장 높은 주입니다.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {weeks.map((w) => (
            <button
              key={w.start}
              type="button"
              onClick={() => setPicked(w.start)}
              className={`rounded-full border px-3 py-1 text-xs tabular-nums ${shown.start === w.start ? "border-brand bg-brand text-white" : "border-line bg-white text-ink hover:bg-[#f7f9fb]"}`}
            >
              {w.start.slice(5).replace("-", "/")}~{w.end.slice(5).replace("-", "/")} · {(w.score * 100).toFixed(0)}점{best?.start === w.start ? " ★" : ""}
            </button>
          ))}
        </div>
      </Panel>
      <div className="overflow-x-auto">
        <Card week={shown} market={market} />
      </div>
      <p className="text-xs text-ink-soft">카드는 {CARD_W}×{CARD_H}px 고정이에요. 브라우저 확대를 100%로 두고 카드 영역만 캡처하면 그대로 쓸 수 있어요.</p>
    </div>
  );
}

const hours = (sec: number): string => `${Math.round(sec / 3600).toLocaleString("ko-KR")}시간`;

function Card({ week, market }: { week: WeekMetrics; market: EarInsightsMarket | null }) {
  const maxActive = Math.max(1, ...week.days.map((d) => d.active_users ?? d.listeners));
  const weekday = ["월", "화", "수", "목", "금", "토", "일"];
  const marketLabel = market === "kr" ? "국내" : market === "global" ? "글로벌" : "국내 + 글로벌";
  const metrics = [
    { label: "주간 신규 가입", value: `${fmtInt(week.signups)}명`, sub: `하루 평균 ${(week.signups / 7).toFixed(0)}명` },
    { label: "일 평균 청취자", value: `${week.avgListeners.toFixed(0)}명`, sub: "하루 한 편 이상 재생" },
    { label: "주간 총 청취 시간", value: hours(week.listenSec), sub: `재생 ${fmtInt(week.plays)}회` },
    { label: "완청률", value: fmtPct(week.completeRate), sub: `완청 ${fmtInt(week.completes)}회 / 재생` },
    { label: "W1 리텐션", value: week.w1 == null ? "집계 중" : fmtPct(week.w1), sub: week.w1Users == null ? "그 주 가입자의 다음 주 복귀" : `그 주 가입자 ${fmtInt(week.w1Users)}명 중 복귀` },
  ];

  return (
    <div
      style={{ width: CARD_W, height: CARD_H }}
      className="relative flex shrink-0 flex-col overflow-hidden rounded-[28px] bg-[#0f1115] p-12 text-white"
    >
      <div className="pointer-events-none absolute -right-40 -top-40 h-[420px] w-[420px] rounded-full bg-[#3b5bfd] opacity-25 blur-[90px]" />
      <div className="pointer-events-none absolute -bottom-48 -left-32 h-[380px] w-[380px] rounded-full bg-[#22c3a6] opacity-20 blur-[90px]" />

      <header className="relative flex items-start justify-between">
        <div>
          <div className="text-[13px] font-semibold tracking-[0.2em] text-white/50">EARCAST · 이어</div>
          <h1 className="mt-2 text-[34px] font-bold leading-tight">한 주의 성과</h1>
          <div className="mt-1 text-[15px] tabular-nums text-white/60">
            {dotDate(week.start)} – {dotDate(week.end).slice(5)} · {marketLabel}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[13px] text-white/50">일 평균 접속자</div>
          <div className="mt-1 text-[56px] font-bold leading-none tabular-nums">
            {week.avgActive == null ? "-" : week.avgActive.toFixed(0)}
            <span className="ml-1 text-[22px] font-semibold text-white/60">명</span>
          </div>
        </div>
      </header>

      <div className="relative mt-8 flex h-[120px] items-end gap-3">
        {week.days.map((d, i) => {
          const v = d.active_users ?? d.listeners;
          return (
            <div key={d.date} className="flex flex-1 flex-col items-center gap-2">
              <div className="text-[12px] tabular-nums text-white/60">{fmtInt(v)}</div>
              <div className="w-full rounded-t-md bg-gradient-to-t from-[#3b5bfd] to-[#7c93ff]" style={{ height: `${Math.max(6, (v / maxActive) * 80)}px` }} />
              <div className="text-[12px] text-white/50">{weekday[i]}</div>
            </div>
          );
        })}
      </div>

      <div className="relative mt-auto grid grid-cols-5 gap-3">
        {metrics.map((m) => (
          <div key={m.label} className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-4">
            <div className="text-[12px] text-white/55">{m.label}</div>
            <div className="mt-2 text-[26px] font-bold leading-none tabular-nums">{m.value}</div>
            <div className="mt-2 text-[11px] leading-snug text-white/45">{m.sub}</div>
          </div>
        ))}
      </div>

      <footer className="relative mt-5 text-[11px] text-white/35">
        운영 DB 집계 · 접속자 = 그날 앱을 연 사용자 · 완청률 = 재생 대비 끝까지 들은 비율 · 탈퇴 계정 제외
      </footer>
    </div>
  );
}
