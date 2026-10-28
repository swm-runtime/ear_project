"use client";
import { useCallback, useEffect, useState } from "react";
import { Panel, Stat, Table, Td, Tr, btnCls } from "@/components/ui";
import { type EarChannel, type EarPromotionDetail, type EarPromotionMetrics, type EarPromotionSummary, earChannelLabel, getEarPromotionDetail, getEarPromotionSummary } from "@/lib/ear";
import { fmtInt, fmtListenSec, fmtPct } from "@/lib/insights-format";
import { EarGate, EarSession, earErrMsg } from "@/app/publish/ear-connect";

const DAY_OPTIONS = [7, 14, 30, 90] as const;
/** 묶음이 이보다 작으면 비율이 크게 흔들린다 — "표본 적음"으로 표시한다 */
const SMALL_COHORT = 30;

/** 프로모션 탭 — 실배포가 기본, 개발계는 코드 입력 흐름을 시험할 때 */
export function PromotionInsights() {
  const [channel, setChannel] = useState<EarChannel>("prod");
  const [days, setDays] = useState<number>(14);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {(["prod", "dev"] as const).map((ch) => (
          <button key={ch} type="button" onClick={() => setChannel(ch)} className={`rounded-full border px-3 py-1 text-xs ${channel === ch ? "border-brand bg-brand text-white" : "border-line bg-white text-ink hover:bg-[#f7f9fb]"}`}>
            {earChannelLabel(ch)}{ch === "prod" ? " (실배포)" : ""}
          </button>
        ))}
        <span className="mx-1 h-4 w-px bg-line" aria-hidden="true" />
        {DAY_OPTIONS.map((d) => (
          <button key={d} type="button" onClick={() => setDays(d)} className={`rounded-full border px-3 py-1 text-xs ${days === d ? "border-ink bg-ink text-white" : "border-line bg-white text-ink hover:bg-[#f7f9fb]"}`}>
            청취 최근 {d}일
          </button>
        ))}
        <span className="ml-auto"><EarSession channel={channel} /></span>
      </div>
      <EarGate key={channel} channel={channel}>
        <PromotionView channel={channel} days={days} />
      </EarGate>
    </div>
  );
}

/** 기준선 대비 차이(%p) — 프로모션 사용자가 더 쓰면 초록 */
function Diff({ value, base }: { value: number | null; base: number | null }) {
  if (value == null || base == null) return null;
  const gap = (value - base) * 100;
  const tone = gap > 0 ? "text-emerald-700" : gap < 0 ? "text-rose-700" : "text-ink-soft";
  return <span className={`ml-1 text-xs ${tone}`}>{gap > 0 ? "+" : ""}{gap.toFixed(1)}%p</span>;
}

const listenRate = (m: EarPromotionMetrics) => (m.current > 0 ? m.listeners_7d / m.current : null);

function PromotionView({ channel, days }: { channel: EarChannel; days: number }) {
  const [data, setData] = useState<EarPromotionSummary | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try { setData(await getEarPromotionSummary(channel, days)); }
    catch (e) { setErr(earErrMsg(e)); }
    finally { setLoading(false); }
  }, [channel, days]);

  useEffect(() => {
    // 마운트 직후·창 변경 시 1회 — 효과 안에서 바로 setState 하지 않도록 한 틱 미룬다
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const [selected, setSelected] = useState<string | null>(null);
  const b = data?.baseline;
  const promoted = (data?.codes ?? []).reduce((sum, c) => sum + c.current, 0);

  return (
    <div className="space-y-3">
      {err && (
        <p className="text-[13px] text-rose-700">
          {err}{err.includes("404") ? ` — 이 서버(${earChannelLabel(channel)})는 아직 프로모션 집계를 모른다. 운영은 main 배포 뒤 열린다.` : ""}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="초대 코드" value={data ? `${data.codes.length}개` : "…"} sub={data ? `입력 중인 코드 ${data.codes.filter((c) => c.is_active).length}개` : undefined} />
        <Stat label="프로모션 사용자" value={data ? `${fmtInt(promoted)}명` : "…"} sub={data ? `지금 지급 중 ${fmtInt(data.codes.reduce((s, c) => s + c.active_grants, 0))}명 · 현재 계정 기준` : undefined} tone="text-brand-ink" />
        <Stat label="코드 없는 사용자 (기준선)" value={b ? `${fmtInt(b.current)}명` : "…"} sub={b ? `7일 활성 ${fmtPct(b.active_7d_rate, 1)} · 7일 청취 ${fmtPct(listenRate(b), 1)}` : undefined} />
        <Stat label="기준선 유료 전환" value={b ? fmtPct(b.paid_ever_rate, 2) : "…"} sub={b ? `실결제 경험 ${fmtInt(b.paid_ever)}명 ÷ 코드 없는 사용자` : undefined} />
      </div>

      <Panel title={`코드별 — 청취 시간은 최근 ${data?.days ?? days}일, 활성·청취자는 최근 7일`} right={<button className={btnCls("ghost")} disabled={loading} onClick={() => void load()}>{loading ? "불러오는 중…" : "새로고침"}</button>} flush>
        <Table head={["코드", "지급", "입력 · 지금 · 탈퇴", "지급 중 · 끝", "7일 활성", "7일 청취자", "1인당 청취", "입력 뒤 결제"]} empty={data === null ? "불러오는 중…" : "초대 코드가 없다"}>
          {(data?.codes ?? []).map((c) => (
            <Tr key={c.code}>
              <Td className="font-medium">
                <button type="button" onClick={() => setSelected(selected === c.code ? null : c.code)} className={`mr-1 rounded border px-1.5 text-xs ${selected === c.code ? "border-brand bg-brand text-white" : "border-line text-ink-soft hover:bg-[#f7f9fb]"}`} aria-expanded={selected === c.code}>
                  {selected === c.code ? "접기" : "상세"}
                </button>
                {c.code}{c.name !== c.code && <span className="ml-1 text-xs font-normal text-ink-soft">{c.name}</span>}
                {!c.is_active && <span className="ml-1 text-xs font-normal text-ink-soft">(입력 닫힘)</span>}
              </Td>
              <Td className="text-ink-soft">{c.tier.toUpperCase()} · {c.grant_until_date ? `${c.grant_until_date}까지` : c.grant_days ? `${c.grant_days}일` : "-"}</Td>
              <Td className="tabular-nums">{fmtInt(c.redeemed)} · <b>{fmtInt(c.current)}</b> · <span className={c.withdrawn > 0 ? "text-rose-700" : "text-ink-soft"}>{fmtInt(c.withdrawn)}</span>{c.current < SMALL_COHORT && <span className="ml-1 text-xs text-ink-soft">표본 적음</span>}</Td>
              <Td className="tabular-nums">{fmtInt(c.active_grants)} · {fmtInt(c.ended_grants)}</Td>
              <Td className="tabular-nums">{fmtInt(c.active_7d)}명 · {fmtPct(c.active_7d_rate, 1)}<Diff value={c.active_7d_rate} base={b?.active_7d_rate ?? null} /></Td>
              <Td className="tabular-nums">{fmtInt(c.listeners_7d)}명 · {fmtPct(listenRate(c), 1)}<Diff value={listenRate(c)} base={b ? listenRate(b) : null} /></Td>
              <Td className="tabular-nums">{fmtListenSec(c.listen_sec_per_user)}<span className="ml-1 text-xs text-ink-soft">(기준 {b ? fmtListenSec(b.listen_sec_per_user) : "-"})</span></Td>
              <Td className="tabular-nums">{fmtInt(c.paid_after_start)}명 · {fmtPct(c.paid_after_start_rate, 1)}</Td>
            </Tr>
          ))}
        </Table>
      </Panel>

      {selected && <PromotionDetailView key={`${selected}-${days}`} channel={channel} code={selected} days={days} baseline={b ?? null} />}

      <p className="text-xs text-ink-soft">
        <b>입력 · 지금 · 탈퇴</b> — 코드를 입력한 계정 수(누적, 탈퇴해도 줄지 않는다) · 그중 지금 남은 계정 · 입력 뒤 탈퇴한 계정. 탈퇴하면 입력 기록이 함께 지워져 그 뒤 지표에는 지금 남은 계정만 들어간다(생존 편향).
        {" "}<b>7일 활성</b>은 앱 사용(토큰 갱신), <b>7일 청취자</b>는 재생 기준이고 비율은 지금 계정 수로 나눈다. 옆의 <b>%p</b>는 코드 없는 사용자(기준선)와의 차이 — 초록이면 프로모션 사용자가 더 쓴다.
        {" "}<b>1인당 청취</b>는 고른 창 안 청취 시간 합 ÷ 지금 계정 수. <b>입력 뒤 결제</b>는 코드를 입력한 뒤 실결제를 시작한 계정(환불·시험 결제 제외) — 지급이 끝난 뒤에야 의미가 생긴다(지급 중에는 이미 유료 기능을 쓰고 있다).
        {" "}묶음이 {SMALL_COHORT}명 미만이면 한두 명으로 비율이 크게 바뀐다. 이름·이메일·user_id 는 서버가 싣지 않는다.
      </p>
    </div>
  );
}

/** 코드 하나의 상세 — 표에서 [상세]를 누르면 열린다. 열 때 1회만 요청한다 */
function PromotionDetailView({ channel, code, days, baseline }: { channel: EarChannel; code: string; days: number; baseline: EarPromotionSummary["baseline"] | null }) {
  const [data, setData] = useState<EarPromotionDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getEarPromotionDetail(channel, code, days)
      .then((d) => { if (alive) setData(d); })
      .catch((e: unknown) => { if (alive) setErr(earErrMsg(e)); });
    return () => { alive = false; };
  }, [channel, code, days]);

  if (err) return <p className="text-[13px] text-rose-700">{err}{err.includes("404") ? " — 이 서버는 아직 상세 집계를 모른다(운영은 main 배포 뒤)." : ""}</p>;
  if (!data) return <Panel title={`${code} 상세`}><p className="text-[13px] text-ink-soft">불러오는 중…</p></Panel>;

  const ba = data.before_after;
  const total = data.listen_buckets.none + data.listen_buckets.under_10m + data.listen_buckets.under_60m + data.listen_buckets.over_60m;
  const maxDaily = Math.max(1, ...data.daily.map((d) => d.listen_sec));
  const perDayTone = (before: number | null, after: number | null) => (before == null || after == null ? "text-ink" : after >= before ? "text-emerald-700" : "text-rose-700");

  return (
    <Panel title={`${data.code} 상세 — ${data.name} · 청취는 최근 ${data.days}일`}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="1인 하루 청취 (입력 전 7일 → 입력 뒤)" value={`${fmtListenSec(ba.before_listen_sec_per_day)} → ${fmtListenSec(ba.after_listen_sec_per_day)}`} sub="Pro 를 받은 뒤 더 듣나" tone={perDayTone(ba.before_listen_sec_per_day, ba.after_listen_sec_per_day)} />
          <Stat label="접속한 날 비율 (입력 전 → 뒤)" value={`${fmtPct(ba.before_active_day_rate, 0)} → ${fmtPct(ba.after_active_day_rate, 0)}`} sub="하루하루 앱을 연 비율" tone={perDayTone(ba.before_active_day_rate, ba.after_active_day_rate)} />
          <Stat label="청취 중앙값 (창)" value={fmtListenSec(data.median_listen_sec)} sub="1인당 평균은 소수에 끌려간다 — 가운데 사람 기준" />
          <Stat label="완청률 (창)" value={fmtPct(data.completion.complete_rate, 1)} sub={`기준선 ${fmtPct(data.completion.baseline_complete_rate, 1)} · 재생 ${fmtInt(data.completion.plays)}회`} />
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <div>
            <p className="mb-1 text-xs font-semibold text-ink-soft">청취량 구간 (창 · {fmtInt(total)}명)</p>
            <Table head={["구간", "인원", "비율"]} empty="-">
              {([["0분", data.listen_buckets.none], ["10분 미만", data.listen_buckets.under_10m], ["10~60분", data.listen_buckets.under_60m], ["60분 이상", data.listen_buckets.over_60m]] as const).map(([label, n]) => (
                <Tr key={label}>
                  <Td>{label}</Td>
                  <Td className="tabular-nums">{fmtInt(n)}명</Td>
                  <Td className="tabular-nums text-ink-soft">{fmtPct(total > 0 ? n / total : null, 0)}</Td>
                </Tr>
              ))}
            </Table>
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold text-ink-soft">입력일 기준 N일째 재방문 (그날 하루 접속·재생)</p>
            <Table head={["기준", "대상", "돌아옴", "비율"]} empty="-">
              {data.retention.map((r) => (
                <Tr key={r.day}>
                  <Td className="font-medium">D{r.day}</Td>
                  <Td className="tabular-nums text-ink-soft">{fmtInt(r.eligible)}명</Td>
                  <Td className="tabular-nums">{fmtInt(r.returned)}명</Td>
                  <Td className="tabular-nums font-medium">{r.eligible === 0 ? "아직" : fmtPct(r.rate, 0)}</Td>
                </Tr>
              ))}
            </Table>
          </div>
        </div>

        <div>
          <p className="mb-1 text-xs font-semibold text-ink-soft">일별 — 막대 = 청취 시간, 숫자 = 접속자·청취자</p>
          <div className="flex items-end gap-1 overflow-x-auto" style={{ height: 96 }}>
            {data.daily.map((d) => (
              <div key={d.date} className="flex min-w-[22px] flex-1 flex-col items-center justify-end gap-1" title={`${d.date} · 접속 ${d.active}명 · 청취 ${d.listeners}명 · ${fmtListenSec(d.listen_sec)} · 재생 ${d.plays}회`}>
                <span className="text-[10px] tabular-nums text-ink-soft">{d.active}·{d.listeners}</span>
                <div className="w-full rounded-t bg-brand/60" style={{ height: Math.max(2, Math.round((d.listen_sec / maxDaily) * 60)) }} />
                <span className="text-[10px] tabular-nums text-ink-soft">{d.date.slice(5)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <div>
            <p className="mb-1 text-xs font-semibold text-ink-soft">이 묶음이 많이 들은 콘텐츠 (창)</p>
            <Table head={["콘텐츠", "청취자", "재생", "청취 시간"]} empty="창 안 재생이 없다">
              {data.top_contents.map((t) => (
                <Tr key={t.title}>
                  <Td className="max-w-[260px] truncate"><span title={t.title}>{t.title}</span></Td>
                  <Td className="tabular-nums">{fmtInt(t.listeners)}명</Td>
                  <Td className="tabular-nums">{fmtInt(t.plays)}회</Td>
                  <Td className="tabular-nums text-ink-soft">{fmtListenSec(t.listen_sec)}</Td>
                </Tr>
              ))}
            </Table>
          </div>
          <div className="space-y-2 text-[13px]">
            <p className="text-xs font-semibold text-ink-soft">지급이 끝난 뒤</p>
            <p>지급 끝 {fmtInt(data.conversion.ended)}명 중 입력 뒤 결제 <b>{fmtInt(data.conversion.paid)}명</b> ({fmtPct(data.conversion.rate, 1)}){data.conversion.ended === 0 && <span className="text-ink-soft"> — 아직 지급이 끝난 사람이 없다</span>}</p>
            {baseline && <p className="text-ink-soft">참고: 코드 없는 사용자 유료 전환 {fmtPct(baseline.paid_ever_rate, 2)}</p>}
            <p className="text-xs text-ink-soft">
              <b>입력 전 → 뒤</b>는 사람마다 입력 시각 기준이다 — 입력 전 7일과 입력 뒤 오늘까지를 하루 단위로 나눈다. 묶음이 작으면 한 사람이 값을 크게 바꾼다. 사람별 값은 중앙값·구간으로만 보이고 누구인지는 서버가 싣지 않는다.
            </p>
          </div>
        </div>
      </div>
    </Panel>
  );
}
