"use client";
import { useCallback, useEffect, useState } from "react";
import { btnCls } from "@/components/ui";
import { EarApiError, type EarChannel, type EarDripArrivalTime, type EarDripArrivalTimeArm, type EarInsightsMarket, earChannelLabel, getEarDripArrivalTime } from "@/lib/ear";
import { EarGate, EarSession, earErrMsg } from "@/app/publish/ear-connect";
import { fmtInt, fmtKstDate, fmtPct } from "@/lib/insights-format";

const MARKET_OPTIONS = [
  { value: null, label: "통합" },
  { value: "kr", label: "국내" },
  { value: "global", label: "글로벌" },
] as const satisfies readonly { value: EarInsightsMarket | null; label: string }[];
const DAY_OPTIONS = [7, 14, 30, 90] as const;

const chip = (on: boolean) =>
  `rounded-full border px-3 py-1 text-xs ${on ? "border-brand bg-brand text-white" : "border-line bg-white text-ink hover:bg-[#f7f9fb]"}`;

const ARM_LABEL: Record<EarDripArrivalTimeArm["key"], string> = {
  baseline: "기준선 (스위치 전)",
  a: "A 그룹",
  b: "B 그룹",
  morning: "참고: 아침 알림",
};

/**
 * 도착 알림 시각 실험 — 07:00 기준선 · 07:30(A) · 08:00(B)의 2시간·당일 재생률(실험 지표 탭, KAN-289, 2026-10-30).
 * 재생률만 본다 — 알림 탭(`opened_at`)은 기록되지 않는다. 묶음·비율·발송 시각·표본 기준(`min_sample`)은 서버가 주고 화면은 표시만 한다.
 */
export function DripArrivalTimeExperiment() {
  const [channel, setChannel] = useState<EarChannel>("prod");
  const [market, setMarket] = useState<EarInsightsMarket | null>(null);
  const [days, setDays] = useState<number>(14);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {(["prod", "dev"] as const).map((ch) => (
          <button key={ch} type="button" onClick={() => setChannel(ch)} className={chip(channel === ch)}>
            {earChannelLabel(ch)}{ch === "prod" ? " (실배포)" : ""}
          </button>
        ))}
        <span className="mx-1 h-4 w-px bg-line" aria-hidden="true" />
        {MARKET_OPTIONS.map((m) => (
          <button key={m.label} type="button" onClick={() => setMarket(m.value)} aria-pressed={market === m.value} className={chip(market === m.value)}>{m.label}</button>
        ))}
        <span className="mx-1 h-4 w-px bg-line" aria-hidden="true" />
        {DAY_OPTIONS.map((d) => (
          <button key={d} type="button" onClick={() => setDays(d)} aria-pressed={days === d} className={chip(days === d)}>최근 {d}일</button>
        ))}
        <span className="ml-auto"><EarSession channel={channel} /></span>
      </div>
      <EarGate key={channel} channel={channel}>
        <DripArrivalTimeView channel={channel} market={market} days={days} onSwitchToDev={channel === "prod" ? () => setChannel("dev") : undefined} />
      </EarGate>
    </div>
  );
}

function DripArrivalTimeView({ channel, market, days, onSwitchToDev }: { channel: EarChannel; market: EarInsightsMarket | null; days: number; onSwitchToDev?: () => void }) {
  const [data, setData] = useState<EarDripArrivalTime | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [notDeployed, setNotDeployed] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    setNotDeployed(false);
    try {
      setData(await getEarDripArrivalTime(channel, days, market));
    } catch (e) {
      if (e instanceof EarApiError && e.status === 404) setNotDeployed(true);
      else setErr(earErrMsg(e));
    } finally {
      setLoading(false);
    }
  }, [channel, market, days]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const refresh = <button className={btnCls("ghost")} disabled={loading} onClick={() => void load()}>{loading ? "불러오는 중…" : "새로고침"}</button>;

  if (notDeployed) {
    return (
      <div className="space-y-2">
        <p className="text-[13px] text-amber-800">이 서버({earChannelLabel(channel)})에는 도착 알림 시각 실험 API 가 아직 배포되지 않았어요 — 개발계에 먼저 나가고 운영은 다음 main 배포 때 들어갑니다.</p>
        <div className="flex gap-2">{onSwitchToDev && <button type="button" className={btnCls("primary")} onClick={onSwitchToDev}>개발계로 보기</button>}{refresh}</div>
      </div>
    );
  }
  if (err) return <div className="space-y-2"><p className="text-[13px] text-rose-700">{err}</p>{refresh}</div>;
  if (!data) return <p className="text-[13px] text-ink-soft">불러오는 중…</p>;

  const compared = data.arms.filter((a) => !a.reference);
  const references = data.arms.filter((a) => a.reference);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-xs text-ink-soft">
        <span>단위 = 보낸 알림 · {fmtKstDate(data.since)} 이후 {data.days}일 · 보낸 알림 {data.min_sample}건 미만 행은 &lsquo;표본 작음&rsquo;</span>
        <span className="ml-auto">{refresh}</span>
      </div>

      <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
        07:00은 A/B 스위치를 켜기 <b>전 기간</b>의 기준선이다 — 07:30·08:00과 기간이 달라(아래 &lsquo;보낸 기간&rsquo;) 요일·계절 차이가 섞인다. A·B끼리는 같은 기간·사용자 해시 분할이라 바로 비교할 수 있다.
      </p>

      <section className="space-y-1">
        <h3 className="text-sm font-semibold">도착 알림 시각별 재생률</h3>
        <ArmTable arms={compared} minSample={data.min_sample} reactionHours={data.reaction_window_hours} />
      </section>

      <section className="space-y-1">
        <h3 className="text-sm font-semibold">참고 — A/B 비교에 들지 않는다</h3>
        <p className="text-xs text-ink-soft">아침 알림(KAN-288)은 드립이 없는 날에만 가서 받는 사람이 다르다. 같은 정의로 센 값을 참고로만 둔다.</p>
        <ArmTable arms={references} minSample={data.min_sample} reactionHours={data.reaction_window_hours} />
      </section>

      <p className="text-xs text-ink-soft">
        {data.reaction_window_hours}시간 재생 = 보낸 뒤 {data.reaction_window_hours}시간 안에 새 재생 또는 재생 위치 저장이 있는 알림 ÷ 보낸 알림(서비스 지표의 알림 반응과 같은 정의). 당일 재생 = 보낸 뒤 그 서비스 날짜가 끝날 때(05:00)까지 같은 판정.
        클릭률은 보지 않는다 — 앱이 알림 탭을 서버에 알리지 않아 기록이 없다. 재생은 탭이 아니라 &ldquo;그 사이 들었다&rdquo;로 역산한 값이다.
      </p>
    </div>
  );
}

function ArmTable({ arms, minSample, reactionHours }: { arms: EarDripArrivalTimeArm[]; minSample: number; reactionHours: number }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-[11px] text-ink-soft">
            <th className="py-1 font-semibold">발송 시각</th>
            <th className="py-1 text-right font-semibold">보낸 알림</th>
            <th className="py-1 text-right font-semibold">받은 사람</th>
            <th className="py-1 text-right font-semibold">{reactionHours}시간 재생률</th>
            <th className="py-1 text-right font-semibold">당일 재생률</th>
            <th className="py-1 text-right font-semibold">보낸 기간</th>
          </tr>
        </thead>
        <tbody>
          {arms.map((a) => {
            const small = a.sent > 0 && a.sent < minSample;
            return (
              <tr key={a.key} className="border-t border-line">
                <td className="py-1 pr-2">
                  <b className="tabular-nums">{a.send_time}</b>
                  <span className="ml-1 text-[11px] text-ink-soft">{ARM_LABEL[a.key] ?? a.key}</span>
                </td>
                <td className="py-1 text-right tabular-nums">
                  {fmtInt(a.sent)}
                  {small && <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] text-amber-900">표본 작음</span>}
                </td>
                <td className="py-1 text-right tabular-nums">{fmtInt(a.users)}</td>
                <RateCell rate={a.play_rate_2h} count={a.played_2h} />
                <RateCell rate={a.play_rate_same_day} count={a.played_same_day} />
                <td className="py-1 text-right tabular-nums text-ink-soft">
                  {a.first_sent_at ? `${fmtKstDate(a.first_sent_at)} ~ ${fmtKstDate(a.last_sent_at)}` : "보낸 기록 없음"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function RateCell({ rate, count }: { rate: number | null; count: number }) {
  return (
    <td className="py-1 text-right tabular-nums">
      <span className="inline-flex items-center justify-end gap-1">
        <span className="inline-block h-1.5 w-14 overflow-hidden rounded bg-line" aria-hidden="true">
          <span className="block h-full bg-brand" style={{ width: `${Math.round((rate ?? 0) * 100)}%` }} />
        </span>
        {fmtPct(rate, 1)}
        <span className="text-ink-soft">({fmtInt(count)})</span>
      </span>
    </td>
  );
}
