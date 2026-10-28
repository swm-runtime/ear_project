"use client";
import { useCallback, useEffect, useState } from "react";
import { Table, Td, Tr, btnCls } from "@/components/ui";
import { EarApiError, type EarChannel, type EarFunnelCohort, type EarFunnelStepKey, type EarInsightsMarket, type EarSignupFunnel, earChannelLabel, getEarSignupFunnel } from "@/lib/ear";
import { EarGate, EarSession, earErrMsg } from "@/app/publish/ear-connect";
import { fmtInt, fmtMonthDay, fmtPct, isSmall, shortDate } from "@/lib/insights-format";

const WEEK_OPTIONS = [4, 8, 12] as const;
const MARKET_OPTIONS = [
  { value: null, label: "통합" },
  { value: "kr", label: "국내" },
  { value: "global", label: "글로벌" },
] as const satisfies readonly { value: EarInsightsMarket | null; label: string }[];
const MARKET_LABEL: Record<EarInsightsMarket, string> = { kr: "국내", global: "글로벌" };

/** 퍼널 단계 — 이름과 "다음에 고칠 곳". 순서는 서버 `steps` 순서를 따른다 */
const STEP_META: Record<EarFunnelStepKey, { label: string; short: string; hint: string }> = {
  signups: { label: "가입", short: "가입", hint: "유입 — 광고 소재·스토어 리스팅" },
  onboarding_completed: { label: "온보딩 완료", short: "온보딩", hint: "로그인 → 온보딩 — 주제 선택·커리어 단계 수, 건너뛰기, 로그인 직후 첫 화면" },
  first_play_24h: { label: "24시간 안 첫 재생", short: "24h 재생", hint: "첫 드립 도착 전 첫 화면 — 온보딩 직후 바로 들을 한 편이 보이는가, 첫 드립이 늦지 않은가" },
  first_complete: { label: "첫 완청", short: "첫 완청", hint: "첫 편 선택과 앞부분 — 첫 추천 편의 주제·길이, 앞 30초 도입" },
  w1_return: { label: "W1 복귀 (가입 7~13일째)", short: "W1", hint: "둘째 주 복귀 — 리텐션 알림 대상·발송 시각, 주제 다양화" },
  habit_14d: { label: "14일 안 3일 이상 청취", short: "14일 습관", hint: "습관 — 드립 품질(매일 들을 만한 편이 오는가)·편성 시각" },
  paid_ever: { label: "결제", short: "결제", hint: "페이월 — 노출 시점·가격·체험 종료 안내" },
};

const chip = (on: boolean, tone: "brand" | "ink" = "brand") =>
  `rounded-full border px-3 py-1 text-xs ${on ? (tone === "brand" ? "border-brand bg-brand text-white" : "border-ink bg-ink text-white") : "border-line bg-white text-ink hover:bg-[#f7f9fb]"}`;

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

/**
 * 가입 퍼널 — "가입한 사람은 어느 단계에서 가장 많이 빠지나"(실험 지표 탭, 2026-10-28). 가입 주(서비스 주 — 월 05시 시작)로 묶고,
 * 끝난 묶음만 합쳐 단계별 남는 비율을 낸다. 가장 큰 이탈 판정은 서버(`largest_drop_step`)가 하고 화면은 표시만 한다.
 * 열 때 1회 + [새로고침] — 자동 폴링 없음.
 */
export function SignupFunnel() {
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
        <FunnelView channel={channel} weeks={weeks} market={market} onSwitchToDev={channel === "prod" ? () => setChannel("dev") : undefined} />
      </EarGate>
    </div>
  );
}

function FunnelView({ channel, weeks, market, onSwitchToDev }: { channel: EarChannel; weeks: number; market: EarInsightsMarket | null; onSwitchToDev?: () => void }) {
  const [data, setData] = useState<EarSignupFunnel | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // 404 = 이 서버에 퍼널 API 가 아직 없다(dev 머지로 개발계에 먼저 나가고 운영은 다음 main 배포 때)
  const [notDeployed, setNotDeployed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    setNotDeployed(false);
    try {
      setData(await getEarSignupFunnel(channel, weeks, market));
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
          이 서버({earChannelLabel(channel)})에는 가입 퍼널 API 가 아직 배포되지 않았어요 — 개발계에 먼저 나가고 운영은 다음 main 배포 때 들어갑니다.
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

  const worst = data.largest_drop_step;
  const keys = data.steps.map((s) => s.key);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-ink-soft">
        <span>{data.market ? `${MARKET_LABEL[data.market]} 사용자만 — 지금 시장 기준` : "통합 — 전 시장"} · 가입 주(월요일 05시 시작) {data.weeks}주 · 현재 계정 기준(탈퇴자 제외)</span>
        <span className="ml-auto">{refresh}</span>
      </div>

      <div className="flex flex-wrap items-stretch gap-1.5">
        {data.steps.map((s, i) => {
          const isWorst = s.key === worst;
          return (
            <div key={s.key} className="flex items-center gap-1.5">
              {i > 0 && <span className="text-ink-soft" aria-hidden="true">→</span>}
              <div className={`rounded border px-2.5 py-1.5 ${isWorst ? "border-rose-300 bg-rose-50" : "border-line bg-white"}`} title={STEP_META[s.key].hint}>
                <div className="text-[11px] font-semibold text-ink-soft">{STEP_META[s.key].label}</div>
                <div className={`text-sm font-semibold tabular-nums ${isWorst ? "text-rose-700" : "text-ink"}`}>
                  {i === 0 ? "기준" : s.rate == null ? "판정 전" : `${fmtPct(s.rate, 0)} 남음`}
                </div>
                {i > 0 && <div className="text-[10px] text-ink-soft">끝난 묶음 {s.mature_cohorts}개{isWorst ? " · 가장 많이 빠짐" : ""}</div>}
              </div>
            </div>
          );
        })}
      </div>

      <p className="rounded border border-brand/30 bg-brand/5 px-3 py-2 text-[13px] text-ink">
        <b className="mr-1 text-brand-ink">가장 많이 빠지는 곳</b>
        {worst
          ? <><b>{STEP_META[worst].label}</b> — {STEP_META[worst].hint}.</>
          : <>아직 끝난 묶음이 없어 판정할 단계가 없다 — 주 수를 늘려 본다.</>}
      </p>

      <div className="-mx-4">
        <Table head={["가입 주", "가입", ...keys.slice(1).map((k) => <span key={k} className={k === worst ? "text-rose-700" : ""}>{STEP_META[k].short}</span>), "첫 재생(전체)"]} empty="가입자가 없다">
          {data.cohorts.map((c) => (
            <Tr key={c.week_start}>
              <Td className="whitespace-nowrap font-medium tabular-nums">
                {shortDate(c.week_start)} 주{c.in_progress && <span className="ml-1 text-xs font-normal text-ink-soft">(가입 중)</span>}
              </Td>
              <Td className="tabular-nums">{fmtInt(c.signups)}{isSmall(c.signups) && <span className="ml-1 text-[10px] text-ink-soft">표본 적음</span>}</Td>
              {keys.slice(1).map((k) => {
                const v = cohortValue(c, k);
                return (
                  <Td key={k} className={`tabular-nums ${k === worst ? "bg-rose-50/60" : ""}`}>
                    {v == null ? <span className="text-xs text-ink-soft">집계 중</span> : (
                      <>
                        {fmtInt(v)} <span className="text-xs text-ink-soft">{fmtPct(c.rates[k]?.of_signups ?? null, 0)}</span>
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
      <p className="text-xs text-ink-soft">
        위 줄의 &quot;남음&quot; = 끝난 묶음만 합쳐 낸 <b>앞 단계 대비</b> 비율이고, 빨간 단계가 가장 많이 빠지는 곳이다. 표의 칸 = 그 단계에 이른 사람 수와 <b>가입자 대비</b> 비율.
        단계는 엄밀한 포함 관계가 아니다(24시간 안에 안 듣고 나중에 완청할 수 있다). &quot;집계 중&quot; = 묶음의 마지막 가입자 기준으로 아직 끝나지 않은 단계.
        24시간 첫 재생 = 가입 뒤 24시간 안 재생 · 첫 완청 = 완청 신호가 한 번이라도(180일 보존) · W1 = 가입 7~13일째(KST) 접속 또는 재생 · 14일 습관 = 가입 뒤 14일 안에 서로 다른 날 {data.habit_min_play_days}일 이상 청취 · 결제 = 실결제 경험(환불·시험 결제 제외).
        &quot;부분&quot; = W1 이 {fmtMonthDay(data.reliable_since)} 접속 기록 시작 전이라 재생만 잡혔다(가장 큰 이탈 판정에서 뺀다). 이름·이메일·user_id 는 서버가 싣지 않는다.
      </p>
    </div>
  );
}
