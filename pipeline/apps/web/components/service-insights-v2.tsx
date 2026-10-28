"use client";
import { useCallback, useEffect, useState } from "react";
import { Panel, Stat, Table, Td, Tr, btnCls } from "@/components/ui";
import {
  EarApiError, type EarBreakdownDimension, type EarChannel, type EarFunnelCohort, type EarFunnelStepKey, type EarInsightsMarket,
  type EarInsightsV2, type EarNorthStarWeek, type EarSegment, earChannelLabel, getEarInsightsV2,
} from "@/lib/ear";
import { EarGate, EarSession, earErrMsg } from "@/app/publish/ear-connect";
import { fmtInt, fmtMonthDay, fmtPct, isSmall, maxOf, shortDate } from "@/lib/insights-format";
import { CHANGE_LOG, DIMENSION_LABEL, SEGMENT_META, STEP_META, breakdownLabel, changesInWeek, fmtDelta, fmtGap } from "@/lib/insights-v2";

const WEEK_OPTIONS = [4, 8, 12] as const;
const MARKET_OPTIONS = [
  { value: null, label: "통합" },
  { value: "kr", label: "국내" },
  { value: "global", label: "글로벌" },
] as const satisfies readonly { value: EarInsightsMarket | null; label: string }[];
const MARKET_LABEL: Record<EarInsightsMarket, string> = { kr: "국내", global: "글로벌" };
const DIMENSIONS: readonly EarBreakdownDimension[] = ["push", "onboarding", "marketing", "provider", "market"];

const chip = (on: boolean, tone: "brand" | "ink" = "brand") =>
  `rounded-full border px-3 py-1 text-xs ${on ? (tone === "brand" ? "border-brand bg-brand text-white" : "border-ink bg-ink text-white") : "border-line bg-white text-ink hover:bg-[#f7f9fb]"}`;

/**
 * 서비스 지표 v2 탭(2026-10-28 멘토 피드백 — "숫자가 많은데 가설·행동으로 이어지지 않는다"). 패널마다 **질문 하나**에 답하고
 * "그래서 할 일"을 한 줄로 단다. 일별 합계 대신 서비스 주·가입 주 코호트로 비교하고, 상위 N 대신 안 듣는 쪽을 본다.
 * 기존 "서비스 지표" 탭은 그대로 둔다. 열 때 1회 + [새로고침] — 자동 폴링 없음.
 */
export function ServiceInsightsV2() {
  const [channel, setChannel] = useState<EarChannel>("prod");
  const [weeks, setWeeks] = useState<number>(8);
  const [market, setMarket] = useState<EarInsightsMarket | null>(null);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {(["prod", "dev"] as const).map((ch) => (
          <button key={ch} type="button" onClick={() => setChannel(ch)} className={chip(channel === ch)}>
            {earChannelLabel(ch)}{ch === "prod" ? " (실배포)" : ""}
          </button>
        ))}
        <span className="mx-1 h-4 w-px bg-line" aria-hidden="true" />
        {WEEK_OPTIONS.map((w) => (
          <button key={w} type="button" onClick={() => setWeeks(w)} className={chip(weeks === w, "ink")}>최근 {w}주</button>
        ))}
        <span className="mx-1 h-4 w-px bg-line" aria-hidden="true" />
        {MARKET_OPTIONS.map((m) => (
          <button key={m.label} type="button" onClick={() => setMarket(m.value)} aria-pressed={market === m.value} className={chip(market === m.value)}>{m.label}</button>
        ))}
        <span className="ml-auto"><EarSession channel={channel} /></span>
      </div>
      <EarGate key={channel} channel={channel}>
        <V2View channel={channel} weeks={weeks} market={market} onSwitchToDev={channel === "prod" ? () => setChannel("dev") : undefined} />
      </EarGate>
    </div>
  );
}

function V2View({ channel, weeks, market, onSwitchToDev }: { channel: EarChannel; weeks: number; market: EarInsightsMarket | null; onSwitchToDev?: () => void }) {
  const [data, setData] = useState<EarInsightsV2 | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // 404 = 이 서버에 v2 가 아직 없다(dev 머지로 개발계에 먼저 나가고 운영은 다음 main 배포 때)
  const [notDeployed, setNotDeployed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    setNotDeployed(false);
    try {
      setData(await getEarInsightsV2(channel, weeks, market));
      setLoadedAt(new Date());
    } catch (e) {
      if (e instanceof EarApiError && e.status === 404) setNotDeployed(true);
      else setErr(earErrMsg(e));
    } finally {
      setLoading(false);
    }
  }, [channel, weeks, market]);

  useEffect(() => {
    // 마운트 직후·조건 변경 시 1회 — 효과 안에서 바로 setState 하지 않도록 한 틱 미룬다
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const refresh = (
    <span className="flex items-center gap-2 text-xs text-ink-soft">
      {loadedAt && <span>{loadedAt.toLocaleTimeString("ko-KR", { hour12: false })} 기준</span>}
      <button className={btnCls("ghost")} disabled={loading} onClick={() => void load()}>{loading ? "불러오는 중…" : "새로고침"}</button>
    </span>
  );

  if (notDeployed) {
    return (
      <div className="space-y-2">
        <p className="text-[13px] text-amber-800">
          이 서버({earChannelLabel(channel)})에는 서비스 지표 v2 API 가 아직 배포되지 않았어요 — 개발계에 먼저 나가고 운영은 다음 main 배포 때 들어갑니다. 기존 [서비스 지표] 탭은 지금도 볼 수 있어요.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {onSwitchToDev && <button type="button" className={btnCls("primary")} onClick={onSwitchToDev}>개발계로 보기</button>}
          {refresh}
        </div>
      </div>
    );
  }
  if (err) return <div className="space-y-2"><p className="text-[13px] text-rose-700">{err}</p>{refresh}</div>;
  if (!data) return <p className="text-[13px] text-ink-soft">불러오는 중…</p>;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-ink-soft">
        <span>{data.market ? `${MARKET_LABEL[data.market]} 사용자만 — 지금 시장 기준` : "통합 — 전 시장"} · 서비스 주(월요일 05시 시작) {data.weeks}주 · 현재 계정 기준(탈퇴자 제외)</span>
        <span className="ml-auto">{refresh}</span>
      </div>
      <NorthStarPanel data={data} />
      <FunnelPanel data={data} />
      <SegmentsPanel data={data} />
      <ChangeLogNote />
    </div>
  );
}

/** "그래서 할 일" 한 줄 — 패널마다 맨 아래 */
function Todo({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 rounded border border-brand/30 bg-brand/5 px-3 py-2 text-[13px] text-ink"><b className="mr-1 text-brand-ink">그래서 할 일</b>{children}</p>;
}

function ChangeMarks({ weekStart }: { weekStart: string }) {
  const marks = changesInWeek(weekStart);
  if (marks.length === 0) return null;
  return (
    <span className="ml-1 inline-flex gap-0.5 align-middle">
      {marks.map((m) => (
        <span key={`${m.date}-${m.label}`} title={`${fmtMonthDay(m.date)} ${m.label}`} className="rounded bg-violet-100 px-1 text-[10px] font-medium text-violet-700">{shortDate(m.date)} {m.label}</span>
      ))}
    </span>
  );
}

// ① North Star ────────────────────────────────────────────────────────────────

function NorthStarPanel({ data }: { data: EarInsightsV2 }) {
  const ns = data.north_star;
  const weeks = ns.weeks;
  const current = weeks[weeks.length - 1];
  const last = weeks[weeks.length - 2];
  const fourAgo = weeks.length >= 5 ? weeks[weeks.length - 5] : undefined;
  const same = ns.last_week_same_point;
  const max = maxOf(weeks, (w) => w.listeners);
  const gap = current.habit_users - same.habit_users;

  return (
    <Panel title={`① 이번 주 습관이 된 사람은 늘었나 — 한 주에 ${ns.min_play_days}일 이상 들은 사람`}>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label={`이번 주 (진행 중 · ${ns.days_elapsed}/7일)`} value={`${fmtInt(current.habit_users)}명`} sub={`청취자 ${fmtInt(current.listeners)}명 중 ${fmtPct(current.habit_ratio, 0)}`} tone="text-brand-ink" />
        <Stat label={`지난주 같은 시점 (첫 ${same.days}일)`} value={`${fmtInt(same.habit_users)}명`} sub={<span>이번 주가 <b className={gap >= 0 ? "text-emerald-700" : "text-rose-700"}>{fmtDelta(gap)}</b> · 청취자 {fmtInt(same.listeners)}명</span>} />
        <Stat label={`지난주 (${shortDate(last.week_start)} 주 · 마감)`} value={`${fmtInt(last.habit_users)}명`} sub={`청취자 ${fmtInt(last.listeners)}명 중 ${fmtPct(last.habit_ratio, 0)}`} />
        <Stat label={fourAgo ? `4주 전 (${shortDate(fourAgo.week_start)} 주)` : "4주 전"} value={fourAgo ? `${fmtInt(fourAgo.habit_users)}명` : "-"} sub={fourAgo ? `청취자 ${fmtInt(fourAgo.listeners)}명 중 ${fmtPct(fourAgo.habit_ratio, 0)}` : "주 수를 늘리면 보인다"} />
      </div>

      <div className="mt-4 flex items-end gap-2" style={{ height: 120 }} role="img" aria-label="주별 습관 사용자와 청취자 막대">
        {weeks.map((w) => <WeekBar key={w.week_start} week={w} max={max} />)}
      </div>
      <div className="mt-1 flex gap-2">
        {weeks.map((w) => (
          <div key={w.week_start} className="min-w-0 flex-1 text-center text-[10px] leading-tight text-ink-soft">
            <div className="tabular-nums">{shortDate(w.week_start)}{w.partial ? " (진행)" : ""}</div>
            {changesInWeek(w.week_start).map((m) => (
              <div key={`${m.date}-${m.label}`} className="truncate text-violet-700" title={`${fmtMonthDay(m.date)} ${m.label}`}>▲ {m.label}</div>
            ))}
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-ink-soft">
        진한 막대 = 습관 사용자({ns.min_play_days}일 이상), 연한 막대 = 그 주 청취자(1일 이상). &quot;들었다&quot;는 0초가 아닌 재생이고, 날짜는 서비스 날짜(05시 경계)다.
        이번 주는 아직 끝나지 않아 낮게 나온다 — 비교는 &quot;지난주 같은 시점&quot;으로 한다(오늘은 하루가 덜 지나 그만큼 불리하다). 보라 표시는 그 주의 변경 기록.
      </p>
      <Todo>
        {gap < 0
          ? <>지난주 같은 시점보다 {Math.abs(gap)}명 적다 — 아래 ③의 &quot;이탈 직전&quot; 사람이 어디에 몰렸는지부터 본다.</>
          : <>지난주 같은 시점보다 줄지 않았다 — 늘었다면 그 주의 변경 기록과 맞춰 무엇이 효과였는지 남기고, ②에서 가장 많이 새는 단계를 고친다.</>}
      </Todo>
    </Panel>
  );
}

function WeekBar({ week, max }: { week: EarNorthStarWeek; max: number }) {
  const h = (n: number) => `${Math.max(n > 0 ? 3 : 0, Math.round((n / max) * 100))}%`;
  return (
    <div className="relative flex h-full min-w-0 flex-1 flex-col justify-end" title={`${week.week_start} 주 · 습관 ${week.habit_users}명 / 청취자 ${week.listeners}명${week.partial ? " (진행 중)" : ""}`}>
      <span className="mb-0.5 text-center text-[11px] font-semibold tabular-nums text-ink">{week.habit_users}</span>
      <div className={`relative w-full rounded-t ${week.partial ? "border border-dashed border-brand/60 bg-brand/10" : "bg-brand/20"}`} style={{ height: h(week.listeners) }}>
        <div className={`absolute inset-x-0 bottom-0 rounded-t ${week.partial ? "bg-brand/50" : "bg-brand"}`} style={{ height: week.listeners > 0 ? `${(week.habit_users / week.listeners) * 100}%` : 0 }} />
      </div>
    </div>
  );
}

// ② 퍼널 ────────────────────────────────────────────────────────────────────

const cohortValue = (c: EarFunnelCohort, key: EarFunnelStepKey): number | null => {
  switch (key) {
    case "signups": return c.signups;
    case "onboarding_completed": return c.onboarding_completed;
    case "first_play_24h": return c.first_play_24h;
    case "first_complete": return c.first_complete;
    case "w1_return": return c.w1_return;
    case "habit_14d": return c.habit_14d;
    case "paid_ever": return c.paid_ever;
  }
};

function FunnelPanel({ data }: { data: EarInsightsV2 }) {
  const f = data.funnel;
  const worst = f.largest_drop_step;
  const keys = f.steps.map((s) => s.key);

  return (
    <Panel title="② 가입한 사람은 어디서 새나 — 가입 주 코호트 퍼널">
      <div className="flex flex-wrap items-stretch gap-1.5">
        {f.steps.map((s, i) => {
          const isWorst = s.key === worst;
          return (
            <div key={s.key} className="flex items-center gap-1.5">
              {i > 0 && <span className="text-ink-soft" aria-hidden="true">→</span>}
              <div className={`rounded border px-2.5 py-1.5 ${isWorst ? "border-rose-300 bg-rose-50" : "border-line bg-white"}`} title={STEP_META[s.key].hint}>
                <div className="text-[11px] font-semibold text-ink-soft">{STEP_META[s.key].label}</div>
                <div className={`text-sm font-semibold tabular-nums ${isWorst ? "text-rose-700" : "text-ink"}`}>
                  {i === 0 ? "기준" : s.rate == null ? "판정 전" : `${fmtPct(s.rate, 0)} 남음`}
                </div>
                {i > 0 && <div className="text-[10px] text-ink-soft">성숙 묶음 {s.mature_cohorts}개{isWorst ? " · 가장 많이 샌다" : ""}</div>}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-3 -mx-4">
        <Table head={["가입 주", "가입", ...keys.slice(1).map((k) => <span key={k} className={k === worst ? "text-rose-700" : ""}>{STEP_META[k].short}</span>), "첫 재생(전체)"]} empty="가입자가 없다">
          {f.cohorts.map((c) => (
            <Tr key={c.week_start}>
              <Td className="whitespace-nowrap font-medium tabular-nums">
                {shortDate(c.week_start)} 주{c.in_progress && <span className="ml-1 text-xs font-normal text-ink-soft">(가입 중)</span>}
                <ChangeMarks weekStart={c.week_start} />
              </Td>
              <Td className="tabular-nums">{fmtInt(c.signups)}{isSmall(c.signups) && <span className="ml-1 text-[10px] text-ink-soft">표본 적음</span>}</Td>
              {keys.slice(1).map((k) => {
                const v = cohortValue(c, k);
                const rate = c.rates[k];
                return (
                  <Td key={k} className={`tabular-nums ${k === worst ? "bg-rose-50/60" : ""}`}>
                    {v == null ? <span className="text-xs text-ink-soft">집계 중</span> : (
                      <>
                        {fmtInt(v)} <span className="text-xs text-ink-soft">{fmtPct(rate?.of_signups ?? null, 0)}</span>
                        {k === "w1_return" && c.w1_partial && <span className="ml-1 text-[10px] text-amber-700" title="그 주 접속 기록이 지워져 재생만 잡혔다 — 실제보다 낮다">부분</span>}
                      </>
                    )}
                  </Td>
                );
              })}
              <Td className="tabular-nums text-ink-soft">{fmtInt(c.first_play_ever)} <span className="text-xs">{fmtPct(c.signups > 0 ? c.first_play_ever / c.signups : null, 0)}</span></Td>
            </Tr>
          ))}
        </Table>
      </div>
      <p className="mt-2 text-xs text-ink-soft">
        칸 = 그 단계에 이른 사람 수와 <b>가입자 대비</b> 비율. 위 줄의 &quot;남음&quot;은 끝난 묶음만 합쳐 낸 <b>앞 단계 대비</b> 비율이고, 빨간 단계가 가장 많이 새는 곳이다.
        단계는 엄밀한 포함 관계가 아니다(24시간 안에 안 듣고 나중에 완청할 수 있다). &quot;집계 중&quot; = 묶음의 마지막 가입자 기준으로 아직 끝나지 않은 단계.
        24시간 첫 재생 = 가입 뒤 24시간 안 재생 · 첫 완청 = 완청 신호가 한 번이라도(180일 보존) · W1 = 가입 7~13일째(KST) 접속 또는 재생 · 14일 습관 = 가입 뒤 14일 안에 서로 다른 날 {data.north_star.min_play_days}일 이상 청취 · 결제 = 실결제 경험(환불·시험 결제 제외).
        &quot;부분&quot; = W1 이 {fmtMonthDay(f.reliable_since)} 접속 기록 시작 전이라 재생만 잡혔다(가장 큰 이탈 판정에서 뺀다).
      </p>
      <Todo>
        {worst
          ? <><b>{STEP_META[worst].label}</b> 단계가 가장 많이 샌다 — {STEP_META[worst].hint}.</>
          : <>아직 끝난 묶음이 없어 판정할 단계가 없다 — 주 수를 늘려 본다.</>}
      </Todo>
    </Panel>
  );
}

// ③ 세그먼트 ─────────────────────────────────────────────────────────────────

function SegmentsPanel({ data }: { data: EarInsightsV2 }) {
  const seg = data.segments;
  return (
    <Panel title="③ 안 듣는 사람은 누구고 왜인가 — 세 무리와 어디에 몰렸나">
      <div className="grid gap-3 lg:grid-cols-3">
        {seg.items.map((s) => <SegmentCard key={s.key} segment={s} />)}
      </div>
      <p className="mt-3 text-xs text-ink-soft">
        현재 계정 {fmtInt(seg.population)}명 기준. <b>1주 전</b>은 같은 정의를 7일 전 시각으로 다시 센 값이다(그때 이미 가입·재생·완청했던 것만 — 탈퇴자는 양쪽 다 없다).
        이탈 직전은 서비스 주가 아니라 <b>굴러가는 {seg.lapse_window_days}일 창</b>이다 — 이번 주로 자르면 월요일엔 거의 모두가 이탈로 보인다.
        분해 칸의 <b>차이</b> = 그 무리 안 비율 − 전체 현재 계정 안 비율. ±15%p 이상(5명 이상)이면 강조한다 — 원인 후보다. 알림 권한·마케팅 동의·온보딩은 지금 상태다.
      </p>
      <Todo>강조된 칸이 있는 무리부터 — 그 칸(예: 알림 못 받음)을 겨냥한 변경을 하나 고르고, 변경 기록에 날짜를 남긴 뒤 다음 주 같은 화면에서 줄었는지 본다.</Todo>
    </Panel>
  );
}

function SegmentCard({ segment: s }: { segment: EarSegment }) {
  const [open, setOpen] = useState(false);
  const meta = SEGMENT_META[s.key];
  const notable = s.breakdown.filter((b) => b.notable).sort((a, b) => Math.abs(b.gap ?? 0) - Math.abs(a.gap ?? 0));
  return (
    <div className="rounded-md border border-line p-3">
      <div className="text-[13px] font-semibold text-ink">{meta.title}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-2xl font-semibold tabular-nums text-ink">{fmtInt(s.count)}명</span>
        <span className="text-xs text-ink-soft">{meta.base} {fmtInt(s.base)}명의 {fmtPct(s.rate, 0)}</span>
      </div>
      <div className="mt-0.5 text-xs text-ink-soft">
        1주 전 {fmtInt(s.week_ago.count)}명({fmtPct(s.week_ago.rate, 0)}) → <b className={s.delta > 0 ? "text-rose-700" : s.delta < 0 ? "text-emerald-700" : ""}>{fmtDelta(s.delta)}</b>
      </div>
      <div className="mt-2 text-xs">
        {notable.length === 0
          ? <span className="text-ink-soft">전체와 크게 다른 칸 없음</span>
          : (
            <ul className="space-y-0.5">
              {notable.slice(0, 4).map((b) => (
                <li key={`${b.dimension}-${b.key}`} className={(b.gap ?? 0) > 0 ? "text-rose-700" : "text-emerald-700"}>
                  {breakdownLabel(b.dimension, b.key)} 비율이 전체보다 <b>{fmtGap(b.gap)}</b> <span className="text-ink-soft">({fmtPct(b.share, 0)} vs {fmtPct(b.population_share, 0)})</span>
                </li>
              ))}
            </ul>
          )}
      </div>
      <p className="mt-2 text-xs text-ink"><b className="text-brand-ink">할 수 있는 일</b> {meta.hint}</p>
      <button type="button" className="mt-2 text-xs text-brand-ink underline" onClick={() => setOpen((v) => !v)} aria-expanded={open}>{open ? "분해 접기" : "분해 보기"}</button>
      {open && (
        <div className="mt-2 space-y-2">
          {DIMENSIONS.map((dim) => {
            const rows = s.breakdown.filter((b) => b.dimension === dim);
            if (rows.length === 0) return null;
            return (
              <table key={dim} className="w-full text-xs">
                <thead>
                  <tr className="text-left text-[10px] text-ink-soft">
                    <th className="py-0.5 font-semibold">{DIMENSION_LABEL[dim]}</th>
                    <th className="py-0.5 text-right font-semibold">무리 안</th>
                    <th className="py-0.5 text-right font-semibold">전체</th>
                    <th className="py-0.5 text-right font-semibold">차이</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((b) => (
                    <tr key={b.key} className={b.notable ? ((b.gap ?? 0) > 0 ? "bg-rose-50 font-medium text-rose-800" : "bg-emerald-50 text-emerald-800") : ""}>
                      <td className="py-0.5">{breakdownLabel(dim, b.key)}</td>
                      <td className="py-0.5 text-right tabular-nums">{fmtInt(b.count)}명 · {fmtPct(b.share, 0)}</td>
                      <td className="py-0.5 text-right tabular-nums">{fmtPct(b.population_share, 0)}</td>
                      <td className="py-0.5 text-right tabular-nums">{fmtGap(b.gap)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ④ 변경 기록 ─────────────────────────────────────────────────────────────────

function ChangeLogNote() {
  return (
    <p className="text-xs text-ink-soft">
      <b>변경 기록</b> — {CHANGE_LOG.map((c) => `${fmtMonthDay(c.date)} ${c.label}`).join(" · ")}. 새 변경은 <code>lib/insights-v2.ts</code>의 <code>CHANGE_LOG</code>에 한 줄 추가한다.
      이름·이메일·user_id 는 서버가 싣지 않는다.
    </p>
  );
}
