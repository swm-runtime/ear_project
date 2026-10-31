"use client";
import { useCallback, useEffect, useState } from "react";
import { btnCls } from "@/components/ui";
import { EarApiError, type EarChannel, type EarInsightsMarket, type EarSeriesEpisodes, earChannelLabel, getEarSeriesEpisodes } from "@/lib/ear";
import { EarGate, EarSession, earErrMsg } from "@/app/publish/ear-connect";
import { fmtInt, fmtPct } from "@/lib/insights-format";

const MARKET_OPTIONS = [
  { value: null, label: "통합" },
  { value: "kr", label: "국내" },
  { value: "global", label: "글로벌" },
] as const satisfies readonly { value: EarInsightsMarket | null; label: string }[];

const chip = (on: boolean) =>
  `rounded-full border px-3 py-1 text-xs ${on ? "border-brand bg-brand text-white" : "border-line bg-white text-ink hover:bg-[#f7f9fb]"}`;

/** 시작자가 이보다 적은 편은 비율을 흐리게 — 몇 명만 들어도 0%·100%로 튀기 때문 */
const SMALL_SAMPLE = 10;

/**
 * 시리즈 편별 완청·다음 편 진행(실험 지표 탭, KAN-293 — 2026-10-31). 시리즈 하나를 골라 편마다 시작·완청·다음 편으로 넘어간 비율을 본다.
 * 묶음·비율·정렬은 서버가 주고 화면은 표시만 한다.
 */
export function SeriesEpisodeInsight() {
  const [channel, setChannel] = useState<EarChannel>("prod");
  const [market, setMarket] = useState<EarInsightsMarket | null>("kr");
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
        <span className="ml-auto"><EarSession channel={channel} /></span>
      </div>
      <EarGate key={channel} channel={channel}>
        <SeriesEpisodeView channel={channel} market={market} onSwitchToDev={channel === "prod" ? () => setChannel("dev") : undefined} />
      </EarGate>
    </div>
  );
}

function SeriesEpisodeView({ channel, market, onSwitchToDev }: { channel: EarChannel; market: EarInsightsMarket | null; onSwitchToDev?: () => void }) {
  const [data, setData] = useState<EarSeriesEpisodes | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [notDeployed, setNotDeployed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [seriesId, setSeriesId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    setNotDeployed(false);
    try {
      setData(await getEarSeriesEpisodes(channel, market));
    } catch (e) {
      if (e instanceof EarApiError && e.status === 404) setNotDeployed(true);
      else setErr(earErrMsg(e));
    } finally {
      setLoading(false);
    }
  }, [channel, market]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const refresh = <button className={btnCls("ghost")} disabled={loading} onClick={() => void load()}>{loading ? "불러오는 중…" : "새로고침"}</button>;

  if (notDeployed) {
    return (
      <div className="space-y-2">
        <p className="text-[13px] text-amber-800">이 서버({earChannelLabel(channel)})에는 시리즈 편별 API 가 아직 배포되지 않았어요.</p>
        <div className="flex gap-2">{onSwitchToDev && <button type="button" className={btnCls("primary")} onClick={onSwitchToDev}>개발계로 보기</button>}{refresh}</div>
      </div>
    );
  }
  if (err) return <div className="space-y-2"><p className="text-[13px] text-rose-700">{err}</p>{refresh}</div>;
  if (!data) return <p className="text-[13px] text-ink-soft">불러오는 중…</p>;
  if (data.series.length === 0) return <div className="space-y-2"><p className="text-[13px] text-ink-soft">재생 기록이 있는 시리즈가 없어요.</p>{refresh}</div>;

  const selected = data.series.find((s) => s.series_id === seriesId) ?? data.series[0];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <label className="flex items-center gap-2">
          <span className="text-ink-soft">시리즈</span>
          <select className="rounded border border-line bg-white px-2 py-1 text-xs" value={selected.series_id} onChange={(e) => setSeriesId(e.target.value)}>
            {data.series.map((s) => (
              <option key={s.series_id} value={s.series_id}>
                {s.title} · {s.total_episodes}편 · 1화 시작 {fmtInt(s.first_episode_starters)}명{market === null ? ` · ${s.market}` : ""}
              </option>
            ))}
          </select>
        </label>
        <span className="text-ink-soft">시작한 지 {data.min_age_hours}시간 지난 것만 · 시작 {SMALL_SAMPLE}명 미만 편은 비율 흐리게</span>
        <span className="ml-auto">{refresh}</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-[13px]">
          <thead>
            <tr className="border-b border-line text-left text-xs text-ink-soft">
              <th className="py-1.5 pr-2 font-normal">편</th>
              <th className="py-1.5 pr-2 font-normal">제목</th>
              <th className="py-1.5 pr-2 text-right font-normal">시작</th>
              <th className="py-1.5 pr-2 text-right font-normal">완청</th>
              <th className="py-1.5 pr-2 text-right font-normal">완청률</th>
              <th className="py-1.5 pr-2 text-right font-normal">다음 편 진행 (시작자 중)</th>
              <th className="py-1.5 text-right font-normal">다음 편 진행 (완청자 중)</th>
            </tr>
          </thead>
          <tbody>
            {selected.episodes.map((e) => {
              const small = e.starters < SMALL_SAMPLE;
              const rate = small ? "text-ink-soft" : "font-medium";
              const last = e.next_episode_no === null;
              return (
                <tr key={e.content_id} className="border-b border-line/60">
                  <td className="py-1.5 pr-2 tabular-nums">{e.episode_no}</td>
                  <td className="max-w-[280px] truncate py-1.5 pr-2" title={e.title}>{e.title}{e.status !== "published" ? <span className="ml-1 text-xs text-ink-soft">({e.status})</span> : null}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{fmtInt(e.starters)}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{fmtInt(e.completers)}</td>
                  <td className={`py-1.5 pr-2 text-right tabular-nums ${rate}`}>{fmtPct(e.completion_rate)}</td>
                  <td className={`py-1.5 pr-2 text-right tabular-nums ${rate}`}>{last ? "-" : `${fmtPct(e.next_rate_of_starters)} (${fmtInt(e.next_started_of_starters)})`}</td>
                  <td className={`py-1.5 text-right tabular-nums ${rate}`}>{last ? "-" : `${fmtPct(e.next_rate_of_completers)} (${fmtInt(e.next_started_of_completers)})`}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-ink-soft">
        시작 = 그 편을 0초가 아닌 재생으로 시작한 사람. 완청 = 라이브러리 완료 · 90% 도달 · 완청 신호 중 하나(길이별 완청률과 같은 정의). 다음 편 진행 = 그 편을 시작(또는 완청)한 사람 중 다음 편을 시작한 비율. 마지막 편은 다음 편이 없어 &lsquo;-&rsquo;.
        시리즈 유료화(KAN-290, 10-31부터 4편 이후 잠금)로 무료 사용자는 3편 → 4편 진행이 막힌다 — 그 이후 비교는 잠금 전후를 나눠 본다.
      </p>
    </div>
  );
}
