"use client";
import { useCallback, useEffect, useState } from "react";
import { btnCls } from "@/components/ui";
import { EarApiError, type EarChannel, type EarInsightsMarket, type EarShortVariant, type EarVariantMetrics, type EarVariantSplit, earChannelLabel, getEarShortVariant } from "@/lib/ear";
import { EarGate, EarSession, earErrMsg } from "@/app/publish/ear-connect";
import { fmtInt, fmtKstDate, fmtPct } from "@/lib/insights-format";

const MARKET_OPTIONS = [
  { value: null, label: "통합" },
  { value: "kr", label: "국내" },
  { value: "global", label: "글로벌" },
] as const satisfies readonly { value: EarInsightsMarket | null; label: string }[];

const chip = (on: boolean) =>
  `rounded-full border px-3 py-1 text-xs ${on ? "border-brand bg-brand text-white" : "border-line bg-white text-ink hover:bg-[#f7f9fb]"}`;

const COHORT_LABEL: Record<string, string> = { standard: "경계 전 가입 (기존 판)", short: "경계 뒤 가입 (짧은 판)" };
const PROFILE_LABEL: Record<string, string> = { standard: "기존 판 (standard)", short: "짧은 판 (short)" };
const introLabel = (key: string | null) => (key === null ? "기존 도입부" : key);

/**
 * 짧은 판·도입부 실험 — 기존 판 vs 짧은 판 완청률, 기존 도입부 vs 바뀐 도입부의 10초·30초·1분 이탈(실험 지표 탭, KAN-298 · KAN-296,
 * 2026-10-29). 코호트 판정·비율·표본 기준(`min_sample`)은 서버가 주고 화면은 표시만 한다. 열 때 1회 + [새로고침].
 */
export function ShortVariantExperiment() {
  const [channel, setChannel] = useState<EarChannel>("prod");
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
        {MARKET_OPTIONS.map((m) => (
          <button key={m.label} type="button" onClick={() => setMarket(m.value)} aria-pressed={market === m.value} className={chip(market === m.value)}>{m.label}</button>
        ))}
        <span className="ml-auto"><EarSession channel={channel} /></span>
      </div>
      <EarGate key={channel} channel={channel}>
        <ShortVariantView channel={channel} market={market} onSwitchToDev={channel === "prod" ? () => setChannel("dev") : undefined} />
      </EarGate>
    </div>
  );
}

function ShortVariantView({ channel, market, onSwitchToDev }: { channel: EarChannel; market: EarInsightsMarket | null; onSwitchToDev?: () => void }) {
  const [data, setData] = useState<EarShortVariant | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [notDeployed, setNotDeployed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [excludeFirst, setExcludeFirst] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    setNotDeployed(false);
    try {
      setData(await getEarShortVariant(channel, market));
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
        <p className="text-[13px] text-amber-800">이 서버({earChannelLabel(channel)})에는 짧은 판 실험 API 가 아직 배포되지 않았어요 — 개발계에 먼저 나가고 운영은 다음 main 배포 때 들어갑니다.</p>
        <div className="flex gap-2">{onSwitchToDev && <button type="button" className={btnCls("primary")} onClick={onSwitchToDev}>개발계로 보기</button>}{refresh}</div>
      </div>
    );
  }
  if (err) return <div className="space-y-2"><p className="text-[13px] text-rose-700">{err}</p>{refresh}</div>;
  if (!data) return <p className="text-[13px] text-ink-soft">불러오는 중…</p>;

  const pick = (s: EarVariantSplit) => (excludeFirst ? s.excluding_first : s.all);
  const windowDays = data.cohort_window_hours == null ? null : data.cohort_window_hours / 24;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-xs text-ink-soft">
        <span>단위 = (사용자, 편) · 시작한 지 {data.min_age_hours}시간 지난 것만 · 시작자 {data.min_sample}명 미만 행은 &lsquo;표본 작음&rsquo;</span>
        <span className="ml-auto flex items-center gap-2">
          <button type="button" className={chip(!excludeFirst)} aria-pressed={!excludeFirst} onClick={() => setExcludeFirst(false)}>전체</button>
          <button type="button" className={chip(excludeFirst)} aria-pressed={excludeFirst} onClick={() => setExcludeFirst(true)}>첫 편 제외</button>
          {refresh}
        </span>
      </div>
      {excludeFirst && (
        <p className="text-xs text-ink-soft">첫 편 제외 — 사용자마다 처음 시작한 편을 뺐다. 같은 날 시작한 다른 실험(첫 드립 무작위 · 온보딩 뒤 플레이어)이 첫 편 행동을 바꾸기 때문이다. 짝 비교 표는 늘 전체 값이다.</p>
      )}

      <section className="space-y-1">
        <h3 className="text-sm font-semibold">가입 코호트 — 경계 전 vs 경계 뒤 가입</h3>
        {data.by_cohort == null ? (
          <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
            경계 미설정 — 서버 설정 <code>SHORT_CONTENT_COHORT_SINCE</code> 가 비어 전원이 기존 판을 받는다. 코호트 비교 없이 아래 콘텐츠 단위 비교만 본다.
          </p>
        ) : (
          <>
            <p className="text-xs text-ink-soft">
              경계 {fmtKstDate(data.cohort_since)} — 경계 전 코호트는 경계 직전 {windowDays == null ? "-" : windowDays.toFixed(1)}일 안 가입자만, 두 코호트 모두 가입 뒤 같은 기간 안에 시작한 편만 센다(오래된 사용자와 섞지 않는다).
            </p>
            <MetricsTable rows={data.by_cohort.map((g) => ({ key: g.key, label: COHORT_LABEL[g.key] ?? g.key, m: pick(g) }))} minSample={data.min_sample} />
          </>
        )}
      </section>

      <section className="space-y-1">
        <h3 className="text-sm font-semibold">콘텐츠 길이 프로필 — 기존 판 vs 짧은 판</h3>
        <MetricsTable rows={data.by_length_profile.map((g) => ({ key: g.key, label: PROFILE_LABEL[g.key] ?? g.key, m: pick(g) }))} minSample={data.min_sample} />
      </section>

      <section className="space-y-1">
        <h3 className="text-sm font-semibold">도입부 버전 — 기존 도입부 vs 바뀐 도입부</h3>
        <MetricsTable rows={data.by_intro_version.map((g) => ({ key: g.key ?? "__legacy", label: introLabel(g.key), m: pick(g) }))} minSample={data.min_sample} />
      </section>

      <section className="space-y-1">
        <h3 className="text-sm font-semibold">짝 비교 — 짧은 판과 그 원본 (전체 값)</h3>
        <p className="text-xs text-ink-soft">같은 주제의 두 편을 나란히 둔다 — 가장 깨끗한 비교. 다만 두 편을 듣는 사람(코호트)이 달라 사람 차이는 남는다.</p>
        {data.pairs.length === 0 ? (
          <p className="text-[13px] text-ink-soft">원본이 연결된 짧은 판이 아직 없다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[11px] text-ink-soft">
                  <th className="py-1 font-semibold">편</th>
                  <th className="py-1 text-right font-semibold">길이</th>
                  <th className="py-1 text-right font-semibold">시작</th>
                  <th className="py-1 text-right font-semibold">완청률</th>
                  <th className="py-1 text-right font-semibold">10초 이탈</th>
                  <th className="py-1 text-right font-semibold">30초 이탈</th>
                  <th className="py-1 text-right font-semibold">1분 이탈</th>
                </tr>
              </thead>
              <tbody>
                {data.pairs.map((p) => (
                  [
                    { side: p.short, tag: "짧은 판" },
                    { side: p.original, tag: "원본" },
                  ].map(({ side, tag }, i) => (
                    <tr key={`${p.short.content_id}-${tag}`} className={i === 0 ? "border-t border-line" : ""}>
                      <td className="py-1 pr-2">
                        <span className="mr-1 text-[11px] text-ink-soft">{tag}</span>{side.title}
                        <span className="ml-1 text-[11px] text-ink-soft">· {introLabel(side.intro_version)}</span>
                      </td>
                      <td className="py-1 text-right tabular-nums">{Math.round(side.duration_sec / 60)}분</td>
                      <MetricCells m={side.all} minSample={data.min_sample} />
                    </tr>
                  ))
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="text-xs text-ink-soft">
        시작 = 0초가 아닌 재생. 완청 = 라이브러리 완료 · 90% 도달 · 완청 신호 중 하나. 10초·30초·1분 이탈 = 그 편의 청취 합이 그 이하인 비율(첫 편 1분 안 이탈 54% 분석과 같은 정의).
        주의 — 코호트 비교는 같은 날 시작한 다른 실험과 섞여 있다. 첫 편 제외 값과 짝 비교로 함께 본다.
      </p>
    </div>
  );
}

function MetricsTable({ rows, minSample }: { rows: { key: string; label: string; m: EarVariantMetrics }[]; minSample: number }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-[11px] text-ink-soft">
            <th className="py-1 font-semibold">묶음</th>
            <th className="py-1 text-right font-semibold">시작</th>
            <th className="py-1 text-right font-semibold">완청률</th>
            <th className="py-1 text-right font-semibold">10초 이탈</th>
            <th className="py-1 text-right font-semibold">30초 이탈</th>
            <th className="py-1 text-right font-semibold">1분 이탈</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-t border-line">
              <td className="py-1 pr-2">{r.label}</td>
              <MetricCells m={r.m} minSample={minSample} />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** 시작 · 완청률(막대) · 10초 · 30초 · 1분 이탈 — 표본이 작으면 시작 칸에 표시 */
function MetricCells({ m, minSample }: { m: EarVariantMetrics; minSample: number }) {
  const small = m.starters > 0 && m.starters < minSample;
  return (
    <>
      <td className="py-1 text-right tabular-nums">
        {fmtInt(m.starters)}
        {small && <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] text-amber-900">표본 작음</span>}
      </td>
      <td className="py-1 text-right tabular-nums">
        <span className="inline-flex items-center justify-end gap-1">
          <span className="inline-block h-1.5 w-14 overflow-hidden rounded bg-line" aria-hidden="true">
            <span className="block h-full bg-brand" style={{ width: `${Math.round((m.completion_rate ?? 0) * 100)}%` }} />
          </span>
          {fmtPct(m.completion_rate, 0)}
          <span className="text-ink-soft">({fmtInt(m.completers)})</span>
        </span>
      </td>
      <td className="py-1 text-right tabular-nums">{fmtPct(m.rate_10s, 0)}</td>
      <td className="py-1 text-right tabular-nums">{fmtPct(m.rate_30s, 0)}</td>
      <td className="py-1 text-right tabular-nums">{fmtPct(m.rate_60s, 0)}</td>
    </>
  );
}
