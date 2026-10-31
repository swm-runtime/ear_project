"use client";
import { useCallback, useEffect, useState } from "react";
import { btnCls } from "@/components/ui";
import { EarApiError, type EarChannel, type EarInsightsMarket, type EarShortVariant, type EarVariantMetrics, type EarVariantPairSide, type EarVariantSplit, earChannelLabel, getEarShortVariant } from "@/lib/ear";
import { EarGate, EarSession, earErrMsg } from "@/app/publish/ear-connect";
import { ExperimentCompareTable, type CompareColumn, type CompareRow } from "@/components/experiment-compare-table";
import { fmtKstDate } from "@/lib/insights-format";

const MARKET_OPTIONS = [
  { value: null, label: "통합" },
  { value: "kr", label: "국내" },
  { value: "global", label: "글로벌" },
] as const satisfies readonly { value: EarInsightsMarket | null; label: string }[];

const chip = (on: boolean) =>
  `rounded-full border px-3 py-1 text-xs ${on ? "border-brand bg-brand text-white" : "border-line bg-white text-ink hover:bg-[#f7f9fb]"}`;

const COHORT_LABEL: Record<string, string> = { standard: "경계 전 가입", short: "경계 뒤 가입" };
const PROFILE_LABEL: Record<string, string> = { standard: "기존 판", short: "짧은 판" };
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
            <MetricsTable rows={standardFirst(data.by_cohort).map((g) => ({ key: g.key, label: COHORT_LABEL[g.key] ?? g.key, m: pick(g) }))} minSample={data.min_sample} />
          </>
        )}
      </section>

      <section className="space-y-1">
        <h3 className="text-sm font-semibold">콘텐츠 길이 프로필 — 기존 판 vs 짧은 판</h3>
        <MetricsTable rows={standardFirst(data.by_length_profile).map((g) => ({ key: g.key, label: PROFILE_LABEL[g.key] ?? g.key, m: pick(g) }))} minSample={data.min_sample} />
      </section>

      <section className="space-y-1">
        <h3 className="text-sm font-semibold">도입부 버전 — 기존 도입부 vs 바뀐 도입부</h3>
        <MetricsTable rows={[...data.by_intro_version].sort((x, y) => Number(x.key !== null) - Number(y.key !== null)).map((g) => ({ key: g.key ?? "__legacy", label: introLabel(g.key), m: pick(g) }))} minSample={data.min_sample} />
      </section>

      <section className="space-y-1">
        <h3 className="text-sm font-semibold">짝 비교 — 짧은 판과 그 원본 (전체 값)</h3>
        <p className="text-xs text-ink-soft">
          같은 주제의 두 편을 나란히 둔다 — 가장 깨끗한 비교. 다만 두 편을 듣는 사람(코호트)이 달라 사람 차이는 남는다.
          완청률 차이가 <b>확실한 짝부터</b>(두 비율 차이의 z값이 큰 순 — 차이가 커도 몇 명뿐이면 뒤로 간다) {PAIR_PREVIEW}개만 먼저 보인다.
        </p>
        <PairList pairs={data.pairs} minSample={data.min_sample} />
      </section>

      <p className="text-xs text-ink-soft">
        시작 = 0초가 아닌 재생. 완청 = 라이브러리 완료 · 90% 도달 · 완청 신호 중 하나. 10초·30초·1분 이탈 = 그 편의 청취 합이 그 이하인 비율(첫 편 1분 안 이탈 54% 분석과 같은 정의).
        주의 — 코호트 비교는 같은 날 시작한 다른 실험과 섞여 있다. 첫 편 제외 값과 짝 비교로 함께 본다.
      </p>
    </div>
  );
}

/** 기준 열(기존 판 · 경계 전)이 먼저 오게 */
const standardFirst = <T extends { key: string }>(groups: T[]): T[] => [...groups].sort((x, y) => Number(x.key !== "standard") - Number(y.key !== "standard"));

const isSmall = (m: EarVariantMetrics, minSample: number) => m.starters > 0 && m.starters < minSample;

/** 완청률(높을수록 좋음) · 10초·30초·1분 이탈(낮을수록 좋음) · 시작 수 — 열 순서대로 */
function metricRows(ms: EarVariantMetrics[]): CompareRow[] {
  return [
    { kind: "rate", label: "완청률", better: "higher", cells: ms.map((m) => ({ rate: m.completion_rate, count: m.completers })) },
    { kind: "rate", label: "10초 안 이탈", better: "lower", cells: ms.map((m) => ({ rate: m.rate_10s })) },
    { kind: "rate", label: "30초 안 이탈", better: "lower", cells: ms.map((m) => ({ rate: m.rate_30s })) },
    { kind: "rate", label: "1분 안 이탈", better: "lower", cells: ms.map((m) => ({ rate: m.rate_60s })) },
    { kind: "count", label: "시작한 (사용자, 편)", cells: ms.map((m) => m.starters) },
  ];
}

/** 첫 행이 기준 열이다 — 기존 판 · 기존 도입부 · 경계 전 코호트를 먼저 넘긴다 */
function MetricsTable({ rows, minSample }: { rows: { key: string; label: string; m: EarVariantMetrics }[]; minSample: number }) {
  if (rows.length === 0) return <p className="text-[13px] text-ink-soft">아직 값이 없다.</p>;
  const columns: CompareColumn[] = rows.map((r) => ({ key: r.key, title: r.label, smallSample: isSmall(r.m, minSample) }));
  return <ExperimentCompareTable columns={columns} rows={metricRows(rows.map((r) => r.m))} />;
}

/** 처음에 보여 줄 짝 수 — 나머지는 [더 보기] */
const PAIR_PREVIEW = 5;

/**
 * 짝의 완청률 차이가 얼마나 확실한가 — 두 비율 차이의 z값(합친 비율로 표준오차). 표본이 작으면 차이가 커도 작게 나온다.
 * 순서를 정하는 데만 쓴다(판정·유의성 표기는 하지 않는다). 시작이 없는 쪽이 있으면 0
 */
function completionDiffZ(original: EarVariantMetrics, short: EarVariantMetrics): number {
  const n1 = original.starters;
  const n2 = short.starters;
  if (n1 === 0 || n2 === 0) return 0;
  const p1 = original.completers / n1;
  const p2 = short.completers / n2;
  const pooled = (original.completers + short.completers) / (n1 + n2);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / n1 + 1 / n2));
  return se === 0 ? 0 : (p2 - p1) / se;
}

function PairList({ pairs, minSample }: { pairs: { short: EarVariantPairSide; original: EarVariantPairSide }[]; minSample: number }) {
  const [expanded, setExpanded] = useState(false);
  if (pairs.length === 0) return <p className="text-[13px] text-ink-soft">원본이 연결된 짧은 판이 아직 없다.</p>;

  const ranked = pairs
    .map((p) => ({ p, z: completionDiffZ(p.original.all, p.short.all) }))
    .sort((x, y) => Math.abs(y.z) - Math.abs(x.z) || y.p.short.all.starters + y.p.original.all.starters - (x.p.short.all.starters + x.p.original.all.starters));
  const shown = expanded ? ranked : ranked.slice(0, PAIR_PREVIEW);
  const diffPp = (p: { short: EarVariantPairSide; original: EarVariantPairSide }) =>
    p.short.all.completion_rate === null || p.original.all.completion_rate === null ? null : (p.short.all.completion_rate - p.original.all.completion_rate) * 100;

  return (
    <div className="space-y-4">
      {shown.map(({ p, z }) => {
        const d = diffPp(p);
        const verdict = d === null ? "비교할 값 없음" : `짧은 판 완청률 ${d >= 0 ? "+" : ""}${d.toFixed(1)}%p · 확실도 z ${Math.abs(z).toFixed(1)}`;
        return (
          <ExperimentCompareTable
            key={p.short.content_id}
            caption={`${p.short.title} — ${verdict}`}
            columns={[
              { key: "original", title: "원본", subtitle: introLabel(p.original.intro_version), smallSample: isSmall(p.original.all, minSample) },
              { key: "short", title: "짧은 판", subtitle: introLabel(p.short.intro_version), smallSample: isSmall(p.short.all, minSample) },
            ]}
            rows={[
              { kind: "text", label: "길이", cells: [`${Math.round(p.original.duration_sec / 60)}분`, `${Math.round(p.short.duration_sec / 60)}분`] },
              ...metricRows([p.original.all, p.short.all]),
            ]}
          />
        );
      })}
      {ranked.length > PAIR_PREVIEW && (
        <button type="button" className={btnCls("ghost")} onClick={() => setExpanded((v) => !v)}>
          {expanded ? "접기" : `더 보기 (${ranked.length - PAIR_PREVIEW}개 더)`}
        </button>
      )}
    </div>
  );
}
