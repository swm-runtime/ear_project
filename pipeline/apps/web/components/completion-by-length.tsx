"use client";
import { useCallback, useEffect, useState } from "react";
import { btnCls } from "@/components/ui";
import { EarApiError, type EarChannel, type EarCompletionByLength, type EarCompletionContent, earChannelLabel, getEarCompletionByLength } from "@/lib/ear";
import { EarGate, EarSession, earErrMsg } from "@/app/publish/ear-connect";
import { fmtInt, fmtPct } from "@/lib/insights-format";

const chip = (on: boolean) =>
  `rounded-full border px-3 py-1 text-xs ${on ? "border-brand bg-brand text-white" : "border-line bg-white text-ink hover:bg-[#f7f9fb]"}`;

/**
 * 길이별 완청률 — "길수록 진짜 덜 끝까지 듣나"(실험 지표 탭, 2026-10-28). 한국 콘텐츠만.
 * 편별 점은 서버가 축소한 비율(`shrunk_rate`, 경험적 베이즈)이고 점 크기는 시작한 사람 수다. 선과 띠는 서버가 맞춘 로지스틱 회귀 추세와
 * 95% 구간이다. 추세 판정(`direction`)도 서버가 하고 화면은 표시만 한다. 열 때 1회 + [새로고침].
 */
export function CompletionByLength() {
  const [channel, setChannel] = useState<EarChannel>("prod");
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {(["prod", "dev"] as const).map((ch) => (
          <button key={ch} type="button" onClick={() => setChannel(ch)} className={chip(channel === ch)}>
            {earChannelLabel(ch)}{ch === "prod" ? " (실배포)" : ""}
          </button>
        ))}
        <span className="ml-auto"><EarSession channel={channel} /></span>
      </div>
      <EarGate key={channel} channel={channel}>
        <CompletionView channel={channel} onSwitchToDev={channel === "prod" ? () => setChannel("dev") : undefined} />
      </EarGate>
    </div>
  );
}

function CompletionView({ channel, onSwitchToDev }: { channel: EarChannel; onSwitchToDev?: () => void }) {
  const [data, setData] = useState<EarCompletionByLength | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [notDeployed, setNotDeployed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showTable, setShowTable] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    setNotDeployed(false);
    try {
      setData(await getEarCompletionByLength(channel));
    } catch (e) {
      if (e instanceof EarApiError && e.status === 404) setNotDeployed(true);
      else setErr(earErrMsg(e));
    } finally {
      setLoading(false);
    }
  }, [channel]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const refresh = <button className={btnCls("ghost")} disabled={loading} onClick={() => void load()}>{loading ? "불러오는 중…" : "새로고침"}</button>;

  if (notDeployed) {
    return (
      <div className="space-y-2">
        <p className="text-[13px] text-amber-800">이 서버({earChannelLabel(channel)})에는 길이별 완청률 API 가 아직 배포되지 않았어요 — 개발계에 먼저 나가고 운영은 다음 main 배포 때 들어갑니다.</p>
        <div className="flex gap-2">{onSwitchToDev && <button type="button" className={btnCls("primary")} onClick={onSwitchToDev}>개발계로 보기</button>}{refresh}</div>
      </div>
    );
  }
  if (err) return <div className="space-y-2"><p className="text-[13px] text-rose-700">{err}</p>{refresh}</div>;
  if (!data) return <p className="text-[13px] text-ink-soft">불러오는 중…</p>;

  const t = data.trend;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-ink-soft">
        <span>한국 콘텐츠 {fmtInt(data.contents.length)}편 · 시작 {fmtInt(data.starters)}건 중 완청 {fmtInt(data.completers)}건 ({fmtPct(data.overall_rate, 0)}) · 시작한 지 {data.min_age_hours}시간 지난 것만</span>
        <span className="ml-auto">{refresh}</span>
      </div>

      <p className="rounded border border-brand/30 bg-brand/5 px-3 py-2 text-[13px] text-ink">
        <b className="mr-1 text-brand-ink">추세</b>
        {t == null ? "편이 적어 추세를 내지 않았다." : (
          <>
            {t.slope_step_min}분 길어질 때마다 완청할 오즈가 <b>{t.odds_ratio_per_step.toFixed(2)}배</b> (95% 구간 {t.odds_ratio_low.toFixed(2)}~{t.odds_ratio_high.toFixed(2)}) —{" "}
            {t.direction === "down" ? <b>길수록 완청이 줄어든다(구간이 1 아래).</b> : t.direction === "up" ? <b>길수록 완청이 늘어난다(구간이 1 위).</b> : <b>길이만으로는 뚜렷한 추세가 없다(구간이 1 을 걸친다).</b>}
          </>
        )}
      </p>

      <Chart data={data} />

      <p className="text-xs text-ink-soft">
        점 = 편 하나, 크기 = 시작한 사람 수. 높이는 <b>축소한 완청률</b>이다 — 시작한 사람이 적은 편(예: 2명 시작·0명 완청)은 0% 로 찍지 않고 전체 평균({fmtPct(data.overall_rate, 0)}) 쪽으로
        당긴다(경험적 베이즈, 가상의 시작자 {data.prior_strength == null ? "-" : Math.round(data.prior_strength)}명만큼). 많이 시작한 편은 거의 제 값이다.
        선과 띠 = 로지스틱 회귀 추세와 95% 구간 — (사용자, 편) 하나하나를 완청 여부로 두고 맞춰서, 한두 명짜리 편은 선을 거의 움직이지 못한다.
        편끼리 주제·품질 차이로 생기는 흔들림만큼 구간을 넓혔다(과분산 {t ? t.dispersion.toFixed(1) : "-"}배).
        완청 = 라이브러리 완료 · 90% 도달 · 완청 신호 중 하나. 주의 — 길이는 원인 하나일 뿐이라, 긴 편이 특정 주제·시리즈에 몰려 있으면 그 차이도 기울기에 섞인다.
      </p>

      <button type="button" className="text-xs text-brand-ink underline" onClick={() => setShowTable((v) => !v)} aria-expanded={showTable}>{showTable ? "표 접기" : "편별 표 보기"}</button>
      {showTable && (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-[11px] text-ink-soft">
              <th className="py-1 font-semibold">편</th>
              <th className="py-1 text-right font-semibold">길이</th>
              <th className="py-1 text-right font-semibold">시작</th>
              <th className="py-1 text-right font-semibold">완청</th>
              <th className="py-1 text-right font-semibold">날것</th>
              <th className="py-1 text-right font-semibold">축소</th>
            </tr>
          </thead>
          <tbody>
            {data.contents.map((c) => (
              <tr key={c.content_id} className="border-t border-line">
                <td className="py-1 pr-2">{c.title}</td>
                <td className="py-1 text-right tabular-nums">{fmtMinutes(c.duration_sec)}</td>
                <td className="py-1 text-right tabular-nums">{fmtInt(c.starters)}</td>
                <td className="py-1 text-right tabular-nums">{fmtInt(c.completers)}</td>
                <td className="py-1 text-right tabular-nums text-ink-soft">{fmtPct(c.raw_rate, 0)}</td>
                <td className="py-1 text-right tabular-nums">{fmtPct(c.shrunk_rate, 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

const fmtMinutes = (sec: number) => `${Math.floor(sec / 60)}분 ${String(sec % 60).padStart(2, "0")}초`;

const W = 720;
const H = 300;
const PAD = { top: 12, right: 16, bottom: 36, left: 44 };

/** 편별 점(축소 비율) + 추세선·95% 띠. 축은 하나(완청률), 격자는 연하게 */
function Chart({ data }: { data: EarCompletionByLength }) {
  const [hover, setHover] = useState<EarCompletionContent | null>(null);
  const minutes = data.contents.map((c) => c.duration_sec / 60);
  if (minutes.length === 0) return <p className="text-[13px] text-ink-soft">재생된 편이 없다.</p>;
  const xMin = Math.floor(Math.min(...minutes));
  const xMax = Math.max(xMin + 1, Math.ceil(Math.max(...minutes)));
  const yTop = Math.min(1, Math.ceil(Math.max(0.1, ...data.contents.map((c) => c.shrunk_rate), ...(data.trend?.curve.map((p) => p.high) ?? [])) * 10) / 10);
  const x = (m: number) => PAD.left + ((m - xMin) / (xMax - xMin)) * (W - PAD.left - PAD.right);
  const y = (r: number) => PAD.top + (1 - r / yTop) * (H - PAD.top - PAD.bottom);
  const maxStarters = Math.max(1, ...data.contents.map((c) => c.starters));
  const radius = (n: number) => 4 + 10 * Math.sqrt(n / maxStarters);
  const yTicks = Array.from({ length: Math.round(yTop * 10) + 1 }, (_, i) => i / 10).filter((_, i, a) => a.length <= 6 || i % 2 === 0);
  const xTicks: number[] = [];
  for (let m = Math.ceil(xMin / 5) * 5; m <= xMax; m += 5) xTicks.push(m);
  const curve = data.trend?.curve ?? [];
  const band = curve.length > 1
    ? `M${curve.map((p) => `${x(p.minute)},${y(p.high)}`).join("L")}L${[...curve].reverse().map((p) => `${x(p.minute)},${y(p.low)}`).join("L")}Z`
    : null;
  const line = curve.length > 1 ? `M${curve.map((p) => `${x(p.minute)},${y(p.rate)}`).join("L")}` : null;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="콘텐츠 길이(분)별 완청률 — 편별 점과 추세선">
        {yTicks.map((r) => (
          <g key={r}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(r)} y2={y(r)} stroke="var(--line, #e5e9ee)" strokeWidth={1} />
            <text x={PAD.left - 6} y={y(r)} textAnchor="end" dominantBaseline="middle" className="fill-ink-soft text-[10px]">{Math.round(r * 100)}%</text>
          </g>
        ))}
        {xTicks.map((m) => (
          <text key={m} x={x(m)} y={H - PAD.bottom + 14} textAnchor="middle" className="fill-ink-soft text-[10px]">{m}분</text>
        ))}
        <text x={(W + PAD.left) / 2} y={H - 4} textAnchor="middle" className="fill-ink-soft text-[10px]">콘텐츠 길이</text>
        {band && <path d={band} fill="var(--brand)" opacity={0.12} />}
        {line && <path d={line} fill="none" stroke="var(--brand-ink)" strokeWidth={2} />}
        {data.contents.map((c) => (
          <g key={c.content_id} onMouseEnter={() => setHover(c)} onMouseLeave={() => setHover(null)}>
            {/* 맞히기 쉬운 투명 영역 — 점보다 크게 */}
            <circle cx={x(c.duration_sec / 60)} cy={y(c.shrunk_rate)} r={Math.max(10, radius(c.starters))} fill="transparent" />
            <circle
              cx={x(c.duration_sec / 60)} cy={y(c.shrunk_rate)} r={radius(c.starters)}
              fill="var(--brand)" fillOpacity={hover?.content_id === c.content_id ? 0.9 : 0.45}
              stroke="white" strokeWidth={2}
            />
          </g>
        ))}
      </svg>
      {hover && (
        <div
          className="pointer-events-none absolute z-10 w-60 rounded border border-line bg-white px-3 py-2 text-xs shadow"
          style={{ left: `min(calc(${(x(hover.duration_sec / 60) / W) * 100}% + 8px), calc(100% - 15rem))`, top: `${(y(hover.shrunk_rate) / H) * 100}%` }}
        >
          <div className="font-semibold text-ink">{hover.title}</div>
          <div className="mt-1 text-ink-soft">{fmtMinutes(hover.duration_sec)} · 시작 {fmtInt(hover.starters)}명 · 완청 {fmtInt(hover.completers)}명</div>
          <div className="text-ink">축소 {fmtPct(hover.shrunk_rate, 0)} <span className="text-ink-soft">(날것 {fmtPct(hover.raw_rate, 0)})</span></div>
        </div>
      )}
    </div>
  );
}
