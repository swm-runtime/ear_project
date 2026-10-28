"use client";
import { useCallback, useEffect, useState } from "react";
import { Panel, Stat, Table, Td, Tr, btnCls } from "@/components/ui";
import { EarApiError, type EarChannel, type EarInsightsCohortTable, type EarInsightsMarket, type EarInsightsMarketRow, type EarInsightsSummary, type EarInsightsWeekday, earChannelLabel, getEarInsightsSummary } from "@/lib/ear";
import { EarGate, EarSession, earErrMsg } from "@/app/publish/ear-connect";
import { fmtTime } from "@/lib/format";
import {
  PROVIDER_LABEL, REASON_LABEL, TIER_LABEL,
  fmtAvg, fmtInt, fmtKstDate, fmtListenSec, fmtMonthDay, fmtPct, isSmall, labelOf, maxOf, shortDate, shortId,
} from "@/lib/insights-format";

const DAY_OPTIONS = [7, 14, 30, 90] as const;
/**
 * 시장 선택(2026-10-25) — 통합은 전 시장, 국내·글로벌은 화면 전체를 그 시장 사용자(**지금 시장** 기준)로 다시 센다.
 * 통합에서만 맨 위에 시장 비교표를 둔다. 고른 값은 주소(`?market=`)에 남겨 새로고침·링크 공유에도 유지한다
 */
const MARKET_OPTIONS = [
  { value: null, label: "통합" },
  { value: "kr", label: "국내" },
  { value: "global", label: "글로벌" },
] as const satisfies readonly { value: EarInsightsMarket | null; label: string }[];
const MARKET_LABEL: Record<EarInsightsMarket, string> = { kr: "국내", global: "글로벌" };

const marketFromUrl = (): EarInsightsMarket | null => {
  if (typeof window === "undefined") return null;
  const v = new URLSearchParams(window.location.search).get("market");
  return v === "kr" || v === "global" ? v : null;
};

/**
 * 그래프 패널을 그리드 줄 높이만큼 채운다 — 옆 패널(각주가 붙은 그래프·7행 표)이 더 길면 그리드가 이 패널을 늘리는데, 그래프가
 * 고정 높이면 아래가 비어 보인다(2026-10-18). 본문(`Panel`의 둘째 자식 div)을 끝까지 늘리고 그래프가 남은 높이를 차지한다.
 */
const FILL_PANEL = "flex flex-col [&>div]:flex [&>div]:flex-1 [&>div]:flex-col";

/**
 * 서비스 지표 탭 — 제품 API 의 `GET /admin/insights/summary`(admin-api 4.22) 한 번으로 화면 전체를 그린다.
 * 실배포가 기본이고 개발계 토글은 검색 로그 탭과 같은 용도(테스트 계정 흐름 확인)다. **열 때 1회 + [새로고침]** —
 * 자동 폴링하지 않는다(사용자 결정 2026-09-06 · 2026-10-08 "누군가 사이트를 켰을 때 그때 요청").
 * 창(7·14·30·90일)은 추이·창 집계에만 걸리고, 누적 카드·순위는 전 기간이다.
 */
export function ServiceInsights() {
  const [channel, setChannel] = useState<EarChannel>("prod");
  const [days, setDays] = useState<number>(14);
  const [market, setMarketState] = useState<EarInsightsMarket | null>(null);
  // 주소의 `?market=`은 마운트 뒤에 읽는다 — 서버 렌더와 첫 화면이 어긋나지 않게
  useEffect(() => {
    const timer = setTimeout(() => setMarketState(marketFromUrl()), 0);
    return () => clearTimeout(timer);
  }, []);
  const setMarket = (next: EarInsightsMarket | null) => {
    setMarketState(next);
    const url = new URL(window.location.href);
    if (next) url.searchParams.set("market", next);
    else url.searchParams.delete("market");
    window.history.replaceState(null, "", url);
  };
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
            최근 {d}일
          </button>
        ))}
        <span className="mx-1 h-4 w-px bg-line" aria-hidden="true" />
        {MARKET_OPTIONS.map((m) => (
          <button key={m.label} type="button" onClick={() => setMarket(m.value)} aria-pressed={market === m.value} className={`rounded-full border px-3 py-1 text-xs ${market === m.value ? "border-brand bg-brand text-white" : "border-line bg-white text-ink hover:bg-[#f7f9fb]"}`}>
            {m.label}
          </button>
        ))}
        <span className="ml-auto"><EarSession channel={channel} /></span>
      </div>
      <EarGate key={channel} channel={channel}>
        <InsightsView channel={channel} days={days} market={market} onSwitchToDev={channel === "prod" ? () => setChannel("dev") : undefined} />
      </EarGate>
    </div>
  );
}

/**
 * `onSwitchToDev` — 운영 채널일 때만 넘어온다. 엔드포인트가 404(미배포)면 [개발계로 보기]로 부모 채널을 바꾼다.
 */
/** 주제별 수요·공급 표에 먼저 보이는 행 수 — 나머지는 [더보기]. 주제가 30개 가까워 화면을 다 덮는다 */
const TOPIC_SUPPLY_PREVIEW = 10;

/** 저녁 리텐션 알림 규칙(`notification.md` 4.6) — 서버 `RetentionRuleKey` 값. 모르는 규칙은 키 그대로 */
const RETENTION_RULE_LABEL: Record<string, string> = {
  weekly_rank_gap: "주간 순위 근접",
  streak_keep: "연속 기록",
  resume_content: "듣던 콘텐츠",
  peers_listening: "지금 듣는 사람",
};

/**
 * 성공지표 목표(2026-10-26 박준현) — 달성이면 초록, 미달이면 빨강. 출처가 바뀌면 각주도 함께.
 * - 리텐션: MWM Retention Benchmarks — 미국 2025 Q3 **미디어·엔터테인먼트** 카테고리 중앙값(원문 mwm.ai/glossary/retention).
 *   스토어 카테고리는 교육이지만 교육·지식(24.9·8.6·3.6%)과 차이가 작아 동종 콘텐츠 앱인 미디어·엔터로 둔다.
 *   **바운디드(N일째 하루)** 와 비교한다 — 벤치마크가 strict N-day 정의다
 * - 고착도: 오디오·음악 앱 DAU/MAU 경험치 25~40%의 하단(회사 발표 수치가 아닌 약한 근거)
 * - 유료 전환: RevenueCat State of Subscription Apps 2025 — 프리미엄(무료+유료) 앱 다운로드→유료 중앙값 2.18%.
 *   우리 값은 유료 경험(해지·만료 포함) ÷ 현재 가입자 — 분모가 다운로드보다 작아 조금 유리하게 나온다
 * - 탈퇴율(낮을수록 좋다): 공개 벤치마크가 없어 **운영 실측 기준선**(2026-10-26 누적 5.6%)에서 상대 10% 개선한 5.0% 이하
 */
const SUCCESS_TARGETS = {
  retention: { 1: 0.249, 7: 0.08, 30: 0.034 } as Record<number, number>,
  stickiness: 0.25,
  paidRate: 0.0218,
  withdrawalRateMax: 0.05,
};

/** 목표 대비 색 — 값이 없으면 칠하지 않는다. `lowerIsBetter`면 목표 이하가 달성이다(탈퇴율) */
const targetTone = (value: number | null | undefined, target: number | undefined, lowerIsBetter = false): string =>
  value == null || target === undefined
    ? "text-ink"
    : (lowerIsBetter ? value <= target : value >= target)
      ? "text-emerald-700"
      : "text-rose-700";

function TargetMark({ value, target, lowerIsBetter = false }: { value: number | null | undefined; target: number; lowerIsBetter?: boolean }) {
  const label = `목표 ${fmtPct(target, 1)}${lowerIsBetter ? " 이하" : ""}`;
  if (value == null) return <span className="text-ink-soft">{label}</span>;
  const met = lowerIsBetter ? value <= target : value >= target;
  return <span className={met ? "text-emerald-700" : "text-rose-700"}>{label} {met ? "달성" : "미달"}</span>;
}

function InsightsView({ channel, days, market, onSwitchToDev }: { channel: EarChannel; days: number; market: EarInsightsMarket | null; onSwitchToDev?: () => void }) {
  const [data, setData] = useState<EarInsightsSummary | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // 404 = 이 서버에 엔드포인트가 아직 없다(dev 머지로 개발계에 먼저 나가고 운영은 다음 main 배포 때 들어감).
  // 서버 메시지("찾을 수 없어요")만 띄우면 고장으로 읽혀서 별도 안내로 그린다(2026-10-08) — backend-metrics 라우트의 404 처리와 같은 취지
  const [notDeployed, setNotDeployed] = useState(false);
  // 시장을 골랐는데 400 = 그 서버가 시장 필터(2026-10-25)를 아직 모른다 — 웹은 dev 머지로 바로 나가고 운영 API 는 다음 main 배포 때 바뀐다
  const [marketUnsupported, setMarketUnsupported] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);
  const [showAllTopics, setShowAllTopics] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    setNotDeployed(false);
    setMarketUnsupported(false);
    try {
      setData(await getEarInsightsSummary(channel, days, market));
      setLoadedAt(new Date());
    } catch (e) {
      if (e instanceof EarApiError && e.status === 404) setNotDeployed(true);
      else if (e instanceof EarApiError && e.status === 400 && market) setMarketUnsupported(true);
      else setErr(earErrMsg(e));
    } finally {
      setLoading(false);
    }
  }, [channel, days, market]);

  useEffect(() => {
    // 마운트 직후·창 변경 시 1회 — 효과 안에서 바로 setState 하지 않도록 한 틱 미룬다
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
          이 서버({earChannelLabel(channel)})에는 서비스 지표 API 가 아직 배포되지 않았어요 — 개발계에 먼저 나가고 운영은 다음 main 배포 때 들어갑니다.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {onSwitchToDev && <button type="button" className={btnCls("primary")} onClick={onSwitchToDev}>개발계로 보기</button>}
          {refresh}
        </div>
      </div>
    );
  }
  if (marketUnsupported) {
    return (
      <div className="space-y-2">
        <p className="text-[13px] text-amber-800">
          이 서버({earChannelLabel(channel)})는 시장별 지표를 아직 몰라요 — 개발계에 먼저 나가고 운영은 다음 main 배포 때 들어갑니다. [통합]은 지금도 볼 수 있어요.
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

  const u = data.users;
  const all = data.listening.all_time;
  const win = data.listening.window;
  const winLabel = `최근 ${data.days}일`;
  // 사유 필수(1.3.0) 전 옛 앱의 사유 없는 탈퇴는 비율에서 뺀다 — 섞으면 실제 사유 비중이 묽어진다
  const reasoned = data.withdrawal_reasons.filter((r) => r.reason_code !== null);
  const reasonTotal = reasoned.reduce((sum, r) => sum + r.count, 0);
  const unreasoned = data.withdrawal_reasons.filter((r) => r.reason_code === null).reduce((sum, r) => sum + r.count, 0);
  const hourlyMax = maxOf(data.hourly, (r) => r.plays);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-ink-soft">
          {data.market ? `${MARKET_LABEL[data.market]} 사용자만 — 지금 시장 기준(시장을 옮긴 사람은 새 시장으로 셉니다)` : "통합 — 전 시장"}
        </span>
        {refresh}
      </div>

      {!data.market && data.by_market && data.by_market.length > 0 && (
        <Panel title={`시장 비교 — 활성·청취자는 최근 7일, 가입·청취는 ${winLabel}`} flush>
          <MarketTable rows={data.by_market} />
        </Panel>
      )}

      {data.market === "global" && data.by_region && data.by_region.length > 0 && (
        <Panel title={`나라별(기기 시간대 기준) — 활성·청취자는 최근 7일, 가입·청취는 ${winLabel}`} flush>
          <RegionTable rows={data.by_region} />
        </Panel>
      )}

      {/* ── 사용자 ── */}
      <SectionTitle>사용자</SectionTitle>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Stat label="누적 가입 (탈퇴 포함)" value={fmtInt(u.total_signups)} sub={<>현재 계정 + 탈퇴 기록<PlatformLine rows={u.by_platform} extra={u.withdrawals > 0 ? `탈퇴 ${fmtInt(u.withdrawals)}(기기 모름)` : undefined} /></>} />
        <Stat label="현재 가입자" value={fmtInt(u.current)} sub={<>온보딩 완료 {fmtInt(u.onboarding_completed)}명 · {fmtPct(u.onboarding_rate)}<PlatformLine rows={u.by_platform} /></>} tone="text-brand-ink" />
        <Stat label="탈퇴 · 탈퇴율" value={`${fmtInt(u.withdrawals)}명 · ${fmtPct(u.withdrawal_rate)}`} sub={<>탈퇴 ÷ 누적 가입 · <TargetMark value={u.withdrawal_rate} target={SUCCESS_TARGETS.withdrawalRateMax} lowerIsBetter /></>} tone={targetTone(u.withdrawal_rate, SUCCESS_TARGETS.withdrawalRateMax, true)} />
        <Stat
          label="체험 중 · 유료"
          value={`${fmtInt(u.trial_active)} · ${fmtInt(u.paid_active)}`}
          sub={<>
            {u.paid_ever_rate === undefined ? (
              <>지금 유료 {fmtPct(u.paid_rate)}</>
            ) : (
              <>유료 전환 <span className={`font-semibold ${targetTone(u.paid_ever_rate, SUCCESS_TARGETS.paidRate)}`}>{fmtPct(u.paid_ever_rate, 2)}</span> (유료 경험 {fmtInt(u.paid_ever ?? 0)}명 · <TargetMark value={u.paid_ever_rate} target={SUCCESS_TARGETS.paidRate} />)</>
            )}
            {" "}· 무료 {fmtInt(u.tiers.light)}명 · {tierWithEvent("Daily", u.tiers.daily, u.tier_events?.daily)} · {tierWithEvent("Pro", u.tiers.pro, u.tier_events?.pro)}
          </>}
        />
        <Stat label="활성화율" value={fmtPct(u.activation_rate)} sub={`한 번이라도 재생 ${fmtInt(u.activated)}명 ÷ 현재 가입자`} />
        <Stat label="가입 경로" value={u.by_provider.length ? `${labelOf(PROVIDER_LABEL, u.by_provider[0].provider)} ${fmtPct(u.by_provider[0].count / Math.max(1, u.current), 0)}` : "-"} sub={u.by_provider.map((p) => `${labelOf(PROVIDER_LABEL, p.provider)} ${p.count}`).join(" · ")} />
      </div>

      <SectionTitle>활성 사용자 (앱 사용 기준) → 그중 재생</SectionTitle>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="최근 1일 (DAU)" value={fmtInt(u.active_1d)} sub={`그중 재생 ${fmtInt(u.listeners_1d)}명 · ${fmtPct(u.listener_rate_1d, 0)}`} />
        <Stat label="최근 7일 (WAU)" value={fmtInt(u.active_7d)} sub={`그중 재생 ${fmtInt(u.listeners_7d)}명 · ${fmtPct(u.listener_rate_7d, 0)}`} />
        <Stat label="최근 30일 (MAU)" value={fmtInt(u.active_30d)} sub={`그중 재생 ${fmtInt(u.listeners_30d)}명 · ${fmtPct(u.listener_rate_30d, 0)}`} />
        <Stat label="고착도 DAU/MAU" value={fmtPct(u.stickiness, 0)} sub={<><TargetMark value={u.stickiness} target={SUCCESS_TARGETS.stickiness} /> · 앱 사용 기준(오디오·음악 앱 25~40%)</>} tone={targetTone(u.stickiness, SUCCESS_TARGETS.stickiness)} />
      </div>

      {/* ── 청취 ── */}
      <SectionTitle>청취</SectionTitle>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Stat label="누적 청취 시간" value={fmtListenSec(all.listen_sec)} sub={`${winLabel} ${fmtListenSec(win.listen_sec)}`} tone="text-brand-ink" />
        <Stat label="재생 수" value={fmtInt(all.plays)} sub={`${winLabel} ${fmtInt(win.plays)}회 · 청취자 ${fmtInt(win.listeners)}명`} />
        <Stat label="완청 · 완청률" value={`${fmtInt(all.completes)} · ${fmtPct(all.complete_rate, 0)}`} sub={`${winLabel} ${fmtInt(win.completes)}회 · ${fmtPct(win.complete_rate, 0)}${isSmall(win.plays) ? " (표본 적음)" : ""}`} />
        <Stat label="재생 1회당 청취" value={fmtListenSec(all.avg_listen_sec_per_play)} sub={`${winLabel} ${fmtListenSec(win.avg_listen_sec_per_play)}`} />
        <Stat label="청취자 1인당 청취" value={fmtListenSec(all.avg_listen_sec_per_listener)} sub={`${winLabel} ${fmtListenSec(win.avg_listen_sec_per_listener)}`} />
        <Stat label="담기" value={fmtInt(all.saves)} sub={`${winLabel} ${fmtInt(win.saves)}회 · 직접 담은 콘텐츠`} />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title={`일별 청취 — ${winLabel} (KST 달력일)`} className={FILL_PANEL}>
          <DailyBars
            rows={data.daily}
            primary={(d) => d.listen_sec}
            ratio={(d, max) => d.listen_sec / max}
            title={(d) => `${d.date} · 청취 ${fmtListenSec(d.listen_sec)} · 재생 ${d.plays}회 · 청취자 ${d.listeners}명${d.active_users !== undefined ? ` (접속자 ${d.active_users == null ? "기록 없음" : `${fmtInt(d.active_users)}명`})` : ""} · 완청 ${d.completes}회`}
            legend="막대 = 청취 시간. 호버하면 재생·청취자·접속자·완청"
          />
          {data.active_users_since && (
            <p className="mt-1 text-xs text-ink-soft">
              접속자 수는 {fmtMonthDay(data.active_users_since)}부터 집계돼요. 접속 기록(로그인 세션)을 30일만 보관해서, 이 기능을 넣기 전 기간은 남아 있던 최근 30일까지만 채울 수 있었어요. 이후로는 매일 저장돼 계속 쌓여요.
            </p>
          )}
        </Panel>
        <Panel title={`일별 가입·탈퇴 — ${winLabel} (KST 달력일)`} className={FILL_PANEL}>
          <DailyBars
            rows={data.daily}
            primary={(d) => d.signups}
            ratio={(d, max) => d.signups / max}
            overlay={(d, max) => d.withdrawals / max}
            title={(d) => `${d.date} · 가입 ${d.signups}명 · 탈퇴 ${d.withdrawals}명`}
            legend="막대 = 가입. 아래 빨간 부분 = 탈퇴(같은 축)"
          />
        </Panel>
      </div>

      {data.weekday && (
        <div className="grid gap-3 lg:grid-cols-2">
          <Panel title={`일별 접속자 → 청취자 — ${winLabel} (KST 달력일)`} className={FILL_PANEL}>
            <ActiveListenerBars rows={data.daily} />
          </Panel>
          <Panel title={`요일별 평균 — ${winLabel} (온전한 날만)`} flush>
            <WeekdayTable rows={data.weekday} />
          </Panel>
        </div>
      )}

      <Panel title={`시간대별 재생 — ${winLabel} (KST)`}>
        <div className="flex items-end gap-1" style={{ height: 96 }}>
          {data.hourly.map((h) => {
            const height = Math.max(2, Math.round((h.plays / hourlyMax) * 80));
            return (
              <div key={h.hour} className="flex min-w-[14px] flex-1 flex-col items-center justify-end gap-1" title={`${h.hour}시 · 재생 ${h.plays}회 · 청취 ${fmtListenSec(h.listen_sec)}`}>
                <div className="w-full rounded-t bg-brand/60" style={{ height }} />
                {/* 라벨 칸은 비어 있어도 같은 높이를 차지한다 — 빈 span 이 0으로 접히면 막대 바닥이 칸마다 어긋난다. */}
                <span className="block h-3 shrink-0 text-[10px] leading-3 tabular-nums text-ink-soft">{h.hour % 3 === 0 ? h.hour : ""}</span>
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-ink-soft">재생이 시작된 시각의 분포 — 편성(04/05시)·푸시 발송 시각을 고를 때 본다.</p>
      </Panel>

      {/* ── 최근 하루 인기 ── */}
      {data.recent_top_contents && (
        <Panel title={`최근 24시간 인기 콘텐츠 ${data.recent_top_contents.length}편 — 청취자 많은 순`} right={data.recent_since ? <span className="text-xs text-ink-soft">{fmtTime(data.recent_since)} 이후</span> : undefined} flush>
          <Table head={["#", "콘텐츠", "길이", "청취자", "재생", "청취 시간", "완청률", "담기"]} empty="최근 24시간 재생 기록이 없다">
            {data.recent_top_contents.map((c, i) => (
              <Tr key={c.content_id}>
                <Td className="tabular-nums text-ink-soft">{i + 1}</Td>
                <Td className="max-w-[360px] truncate font-medium">{c.title}</Td>
                <Td className="tabular-nums text-ink-soft">{fmtListenSec(c.duration_sec)}</Td>
                <Td className="tabular-nums font-medium">{c.listeners}명</Td>
                <Td className="tabular-nums">{c.plays}회</Td>
                <Td className="tabular-nums">{fmtListenSec(c.listen_sec)}</Td>
                <Td className="tabular-nums">{fmtPct(c.complete_rate, 0)} <span className="text-ink-soft">({c.completes})</span></Td>
                <Td className="tabular-nums">{c.saves}</Td>
              </Tr>
            ))}
          </Table>
        </Panel>
      )}

      {/* ── 순위 ── */}
      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title={`가장 많이 들은 사용자 ${data.top_users.length}명 (전 기간)`} flush>
          <Table head={["#", "사용자", "티어", "청취 시간", "재생", "완청", "가입", "마지막 재생"]} empty="재생 기록이 없다">
            {data.top_users.map((r, i) => (
              <Tr key={r.user_id}>
                <Td className="tabular-nums text-ink-soft">{i + 1}</Td>
                <Td className="font-mono text-[12px]">{shortId(r.user_id)}</Td>
                <Td>{labelOf(TIER_LABEL, r.tier, r.tier)}</Td>
                <Td className="tabular-nums font-medium">{fmtListenSec(r.listen_sec)}</Td>
                <Td className="tabular-nums">{r.plays}회</Td>
                <Td className="tabular-nums">{r.completes}회</Td>
                <Td className="whitespace-nowrap text-ink-soft">{fmtKstDate(r.signed_up_at)}</Td>
                <Td className="whitespace-nowrap text-ink-soft">{fmtKstDate(r.last_played_at)}</Td>
              </Tr>
            ))}
          </Table>
        </Panel>
        <Panel title={`가장 많이 들은 콘텐츠 ${data.top_contents.length}편 (전 기간)`} flush>
          <Table head={["#", "콘텐츠", "길이", "청취 시간", "재생", "청취자", "완청률", "담기"]} empty="재생 기록이 없다">
            {data.top_contents.map((c, i) => (
              <Tr key={c.content_id}>
                <Td className="tabular-nums text-ink-soft">{i + 1}</Td>
                <Td className="max-w-[260px] truncate font-medium">{c.title}</Td>
                <Td className="tabular-nums text-ink-soft">{fmtListenSec(c.duration_sec)}</Td>
                <Td className="tabular-nums font-medium">{fmtListenSec(c.listen_sec)}</Td>
                <Td className="tabular-nums">{c.plays}회</Td>
                <Td className="tabular-nums">{c.listeners}명</Td>
                <Td className="tabular-nums">{fmtPct(c.complete_rate, 0)} <span className="text-ink-soft">({c.completes})</span></Td>
                <Td className="tabular-nums">{c.saves}</Td>
              </Tr>
            ))}
          </Table>
        </Panel>
      </div>

      {/* ── 리텐션·탈퇴 ── */}
      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title="리텐션 — 가입 N일 뒤에도 앱 사용" flush>
          <Table head={["기준", "대상", "돌아옴", "이후 언제든", "N일째 하루", "목표(업계 중앙값)"]} empty="-">
            {data.retention.map((r) => (
              <Tr key={r.day}>
                <Td className="font-medium">D{r.day}</Td>
                <Td className="tabular-nums text-ink-soft">{fmtInt(r.cohort_size)}명</Td>
                <Td className="tabular-nums">{fmtInt(r.returned)}명</Td>
                <Td className="tabular-nums font-medium">{fmtPct(r.rate, 0)}{isSmall(r.cohort_size) ? <span className="ml-1 text-xs font-normal text-ink-soft">표본 적음</span> : null}</Td>
                <Td className={`tabular-nums font-semibold ${targetTone(r.bounded_rate, SUCCESS_TARGETS.retention[r.day])}`}>
                  {r.bounded_cohort_size === undefined ? "-" : (
                    <>
                      {fmtPct(r.bounded_rate ?? null, 1)}
                      <span className="ml-1 text-xs font-normal text-ink-soft">{fmtInt(r.bounded_returned ?? 0)}/{fmtInt(r.bounded_cohort_size)}명{isSmall(r.bounded_cohort_size) ? " · 표본 적음" : ""}</span>
                    </>
                  )}
                </Td>
                <Td className="tabular-nums text-ink-soft">{SUCCESS_TARGETS.retention[r.day] === undefined ? "-" : fmtPct(SUCCESS_TARGETS.retention[r.day], 1)}</Td>
              </Tr>
            ))}
          </Table>
          <p className="px-3 py-2 text-xs text-ink-soft">
            <b>이후 언제든</b> = 가입 N일 뒤부터 지금까지 한 번이라도(언바운디드 — 오래된 가입자일수록 높아진다 — 완전히 떠나지 않은 비율).
            {" "}<b>N일째 하루</b> = 가입한 날 다음 N번째 날(KST) 하루 안에 앱을 씀(바운디드 — 업계 벤치마크와 같은 정의, 아래 코호트 표 칸의 전 기간 평균). N일째가 다 지났고 접속 기록을 믿을 수 있는 가입자만 센다.
            {" "}<b>목표</b> = MWM Retention Benchmarks 미국 2025 Q3 미디어·엔터테인먼트 카테고리 중앙값(팟캐스트 전용 수치가 아니다). <b>N일째 하루</b>가 목표 이상이면 <span className="text-emerald-700">초록</span>, 미달이면 <span className="text-rose-700">빨강</span>. 탈퇴자는 분모에 없어 우리 값이 실제보다 조금 높고, 표본이 적으면 색이 크게 흔들린다.
          </p>
        </Panel>
        <Panel title={`탈퇴 사유 (전 기간 사유 있는 ${fmtInt(reasonTotal)}건)`} flush>
          <Table head={["사유", "건수", "비율"]} empty="탈퇴 기록이 없다">
            {reasoned.map((r) => {
              const share = r.count / Math.max(1, reasonTotal);
              return (
                <Tr key={r.reason_code ?? "null"}>
                  <Td className="font-medium">{labelOf(REASON_LABEL, r.reason_code)}</Td>
                  <Td className="tabular-nums">{r.count}건</Td>
                  <Td className="tabular-nums font-medium">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-24 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full bg-brand" style={{ width: `${Math.round(share * 1000) / 10}%` }} /></div>
                      {fmtPct(share, 1)}
                    </div>
                  </Td>
                </Tr>
              );
            })}
          </Table>
          {unreasoned > 0 && (
            <p className="px-3 py-2 text-xs text-ink-soft">
              사유 필수 입력(앱 1.3.0 — 최소 지원 버전 2026-10-25) 전 옛 앱에서 사유 없이 탈퇴한 {fmtInt(unreasoned)}건은 뺐다. 비율은 사유가 있는 탈퇴 중의 비율이다.
            </p>
          )}
        </Panel>
      </div>
      {data.push_reactions && (
        <Panel title={`알림 반응 — 보낸 뒤 2시간 안에 재생 (${winLabel})`} flush>
          <Table head={["알림", "문구", "발송", "반응", "반응률"]} empty="이 기간에 보낸 알림이 없다">
            {data.push_reactions.map((r) => (
              <Tr key={r.type}>
                <Td className="font-medium">{r.rule ? labelOf(RETENTION_RULE_LABEL, r.rule) : "드립 도착 (기준선)"}</Td>
                <Td className="text-ink-soft">{r.variant ? `변형 ${r.variant.toUpperCase()}` : "-"}</Td>
                <Td className="tabular-nums">{fmtInt(r.sent)}건</Td>
                <Td className="tabular-nums">{fmtInt(r.reacted)}건</Td>
                <Td className="tabular-nums font-medium">{fmtPct(r.reaction_rate, 1)}{isSmall(r.sent) ? <span className="ml-1 text-xs font-normal text-ink-soft">표본 적음</span> : null}</Td>
              </Tr>
            ))}
          </Table>
          <p className="px-3 py-2 text-xs text-ink-soft">
            저녁 리텐션 알림(현지 18:00, 마케팅 동의자)을 규칙·문구 변형별로, 아침 드립 도착 알림(07:00)을 비교 기준선으로 센다. <b>반응</b> = 알림을 보낸 뒤 2시간 안에 그 사용자가 재생함 — 앱이 알림 탭을 서버에 알리지 않아 탭 대신 재생으로 역산한다(알림을 안 누르고 앱을 열어 들은 것도 잡힌다). 같은 규칙의 변형 A·B 반응률을 비교해 문구를 고른다.
          </p>
        </Panel>
      )}
      {data.retention_cohorts && (
        <Panel title="코호트 리텐션 — 가입한 날·주로 묶어 그 뒤에도 앱을 쓴 사람 (명 · 비율)">
          <div className="grid gap-4 lg:grid-cols-2">
            <CohortTable table={data.retention_cohorts.daily} />
            <CohortTable table={data.retention_cohorts.weekly} />
          </div>
          <p className="mt-2 text-xs text-ink-soft">
            D1 = 가입 다음 날 하루, D7 = 가입 7일 뒤 하루. W1~W4 = 가입 7~13일 · 14~20일 · 21~27일 · 28~34일 뒤에 한 번이라도. 구간은 사람마다 자기 가입일 기준이다. 접속(토큰 갱신) 또는 재생이면 돌아온 것으로 센다.
            {" "}<b>집계 중</b> = 구간이 아직 끝나지 않음(묶음의 마지막 가입자 기준 — 0명이 아니다). <span className="text-ink-soft/70">흐린 칸*</span> = 접속 기록({fmtMonthDay(data.retention_cohorts.daily.reliable_since)}~) 이전 구간이라 재생만 잡혀 실제보다 낮다. 가입자 {SMALL_COHORT}명 미만 묶음은 비율이 크게 흔들린다.
          </p>
        </Panel>
      )}

      {/* ── 주제별 수요·공급 ── */}
      {data.topic_supply ? (
        <Panel title={`주제별 수요·공급 — 관심 사용자 많은 순 (신규 발행은 ${winLabel})`} flush>
          <Table head={["주제", "발행", "신규 발행", "관심 사용자", "남은 편수(중앙값)", "더 줄 것 없음", "2편 이하"]} empty="주제가 없다">
            {(showAllTopics ? data.topic_supply : data.topic_supply.slice(0, TOPIC_SUPPLY_PREVIEW)).map((t) => (
              <Tr key={t.topic_id}>
                <Td className="font-medium">{t.name}{t.is_visible ? null : <span className="ml-1 text-xs font-normal text-ink-soft">숨김</span>}</Td>
                <Td className="tabular-nums">{fmtInt(t.published)}편</Td>
                <Td className="tabular-nums text-ink-soft">{fmtInt(t.published_in_window)}편</Td>
                <Td className="tabular-nums font-medium">{fmtInt(t.interested_users)}명</Td>
                <Td className="tabular-nums">{t.median_remaining.toLocaleString("ko-KR", { maximumFractionDigits: 1 })}편</Td>
                <Td className={`tabular-nums ${t.exhausted_users > 0 ? "font-medium text-rose-700" : "text-ink-soft"}`}>{fmtInt(t.exhausted_users)}명 <span className="text-ink-soft font-normal">({fmtPct(t.exhausted_users / Math.max(1, t.interested_users), 0)})</span></Td>
                <Td className="tabular-nums text-ink-soft">{fmtInt(t.low_users)}명</Td>
              </Tr>
            ))}
          </Table>
          {data.topic_supply.length > TOPIC_SUPPLY_PREVIEW && (
            <div className="border-t border-line px-3 py-2 text-center">
              <button className="text-xs text-ink-soft hover:text-ink" onClick={() => setShowAllTopics((v) => !v)}>
                {showAllTopics ? "접기" : `더보기 (${data.topic_supply.length - TOPIC_SUPPLY_PREVIEW}개 더)`}
              </button>
            </div>
          )}
        </Panel>
      ) : null}
      <Panel title="읽는 법">
          <ul className="list-disc space-y-1 pl-4 text-xs text-ink-soft">
            <li><b>누적 가입(탈퇴 포함)</b>은 현재 계정 수 + 탈퇴 기록 수다. <b>유료</b>는 실결제 구독이 만료 전인 사람(해지 예약 포함)이다. 탈퇴하면 계정 행이 지워지므로(domain.md 12.3) 둘을 더해야 &quot;가입한 적 있는 사람&quot;이 된다.</li>
            <li><b>누적 청취 시간·재생·완청</b>(전 기간 카드)은 줄지 않는 누적(<code>play_daily_totals</code>)이다 — 재생·완청이 기록될 때 함께 더해지고, 탈퇴하거나 완청 신호가 보존 기간(180일)으로 지워져도 남는다. <b>최근 N일 값·순위·일별 추이·시간대·시장별</b>은 재생 기록(<code>play_records</code>)을 바로 세므로 즉시 반영되지만 <b>현재 계정 기준</b>이다 — 탈퇴자의 몫은 빠진다. 그래서 순위·추이를 더한 값이 누적 카드보다 작을 수 있다.</li>
            <li><b>활성 사용자(DAU/WAU/MAU)</b>는 앱을 써서 서버 토큰을 갱신한 사람이다 — 액세스 토큰이 30분짜리라 앱을 열면 거의 매번 갱신이 일어나므로 &quot;앱 실행&quot;에 가장 가까운 서버 신호다(30분 안의 재실행은 안 잡힌다). 그중 <b>재생</b>까지 간 사람을 함께 적어 켜고 안 듣는 비율을 본다. <b>완청</b>은 서버의 90% 판정 신호다.</li>
            <li><b>접속자</b>는 그날(KST 달력일 0~24시) 앱을 열어 서버 토큰을 갱신한 사람이다 — 위 <b>활성 사용자</b>와 같은 신호를 하루 단위로 센 것이다. 지난날은 매일 00:10 에 저장한 값, 오늘은 지금까지 센 값이다. <b>요일별 평균</b>은 창 안의 온전한 날(첫날 부분일·오늘 제외)만 그 요일의 날 수로 나눈다 — 날 수가 1~2일이면 한 주의 사정이 그대로 드러나니 30·90일 창으로 본다.</li>
            <li><b>코호트 리텐션</b>은 가입한 날(최근 14일)·주(최근 8주, 월요일 시작)로 묶어, 가입 뒤 그 구간에 앱을 쓴 사람을 <b>인원과 비율</b>로 적는다 — 위의 언바운디드 리텐션과 달리 <b>그 구간 안</b>만 본다(바운디드). 광고로 유입을 늘릴 때 최근 묶음의 D1·W1 이 떨어지면 들어온 사람이 새고 있는 것이다. 사람마다 접속한 날을 매일 00:10 에 따로 저장해(<code>user_active_dates</code>) 세션이 30일 뒤 지워져도 W4 를 셀 수 있다. 탈퇴자는 분모·분자 모두에서 빠진다.</li>
            <li><b>성공지표 목표</b>(초록 = 달성 · 빨강 = 미달)
              <ul className="ml-4 list-disc">
                <li><b>리텐션</b> — <b>N일째 하루</b>(바운디드)를 MWM 미국 2025 Q3 미디어·엔터테인먼트 카테고리 중앙값(D1 24.9% · D7 8.0% · D30 3.4%)과 비교. 스토어 카테고리는 교육이지만 교육·지식(24.9 · 8.6 · 3.6%)과 차이가 작아 동종 콘텐츠 앱 기준으로 둔다.</li>
                <li><b>고착도</b> — 오디오·음악 앱 DAU/MAU 경험치 25~40%의 하단 25%(약한 근거).</li>
                <li><b>유료 전환</b> — 실결제를 한 번이라도 한 현재 계정(해지·만료 포함, 환불·시험 결제·초대 이벤트 제외) ÷ 현재 가입자를 RevenueCat State of Subscription Apps 2025 프리미엄 앱 다운로드→유료 중앙값 2.18%와 비교. 벤치마크 분모는 다운로드라 우리 값(분모 = 가입자)이 조금 유리하게 나온다. 탈퇴자의 결제 이력은 법정 보존용이라 세지 않는다.</li>
                <li><b>탈퇴율</b>(낮을수록 좋음) — 회원 탈퇴율은 공개 벤치마크가 없다(업계가 공개하는 것은 앱 삭제율·구독 해지율로 정의가 다르다). 그래서 <b>운영 실측을 기준선</b>으로 둔다: 2026-10-26 누적 5.6% → 목표 <b>5.0% 이하</b>(상대 10% 개선). 누적값이라 천천히 움직이므로 분기 단위로 보고, 광고로 신규 유입이 몰리면 단기 탈퇴가 늘어 잠시 오를 수 있다 — 그때는 아래 코호트별 흐름과 탈퇴 사유를 함께 본다.</li>
              </ul>
            </li>
            <li><b>리텐션</b>은 가입한 지 N일이 지난 현재 계정 중 N일 뒤 이후 아무 때나 앱을 쓴(토큰 갱신 또는 재생) 사람의 비율(언바운디드)이다. 탈퇴자는 분모에 없어 실제보다 높게 나오고(생존 편향), 같은 이유로 <b>일별 가입</b>에서도 그날 가입했다가 탈퇴한 사람은 빠진다.</li>
            <li><b>최근 24시간 인기 콘텐츠</b>는 지금부터 24시간 전까지(달력일이 아니다) 시작된 재생을 콘텐츠별로 센다 — 청취자(서로 다른 사람) 수 순이라 한 사람이 오래 들은 편이 위로 오지 않는다. 완청·담기도 그 24시간 안에 생긴 것만이다(재생은 그날 첫 시작 시각, 완청은 완청한 시각 기준이라 서비스 날짜 경계를 걸친 편은 완청률이 드물게 높게 나온다).</li>
            <li><b>날짜</b>는 KST 달력일이다(앱의 서비스 날짜 04/05시 경계가 아니다 — 운영자가 읽는 단위). 창 버튼은 추이·&quot;최근 N일&quot; 값에만 걸리고 누적·순위는 전 기간이다.</li>
            <li><b>주제별 수요·공급</b>의 <b>남은 편수</b>는 그 주제를 관심으로 둔 온보딩 완료 사용자마다 &quot;아직 드립으로 받을 수 있는 편수&quot;다 — 라이브러리에 한 번이라도 들어왔거나(지운 것 포함) 드립으로 이미 받은 콘텐츠는 빠진다. <b>더 줄 것 없음</b>이 많은 주제가 제작 우선순위다. 시리즈 순서 게이트는 반영하지 않은 근사값이다.</li>
            <li>이름·이메일은 서버가 싣지 않는다 — 사용자 순위는 <code>user_id</code> 앞 8자다. 특정 사용자를 더 봐야 하면 목적을 적고 DB 를 직접 본다.</li>
          </ul>
      </Panel>
    </div>
  );
}

/** 통합 화면 맨 위 시장 비교 — 전체 대비 비율은 현재 가입자 기준 */
function MarketTable({ rows }: { rows: EarInsightsMarketRow[] }) {
  const total = rows.reduce((sum, r) => sum + r.users, 0);
  return (
    <Table head={["시장", "가입자", "기간 가입", "온보딩 완료", "7일 활성", "7일 청취자", "기간 청취", "기간 재생", "유료"]}>
      {rows.map((r) => (
        <Tr key={r.market}>
          <Td className="font-medium">{MARKET_LABEL[r.market] ?? r.market}</Td>
          <Td className="tabular-nums">{fmtInt(r.users)} <span className="text-ink-soft">· {fmtPct(r.users / Math.max(1, total), 0)}</span></Td>
          <Td className="tabular-nums">{fmtInt(r.signups_in_window)}</Td>
          <Td className="tabular-nums">{fmtInt(r.onboarding_completed)}</Td>
          <Td className="tabular-nums">{fmtInt(r.active_7d)}</Td>
          <Td className="tabular-nums">{fmtInt(r.listeners_7d)}</Td>
          <Td className="tabular-nums">{fmtListenSec(r.listen_sec)}</Td>
          <Td className="tabular-nums">{fmtInt(r.plays)}</Td>
          <Td className="tabular-nums">{fmtInt(r.paid_active)}</Td>
        </Tr>
      ))}
    </Table>
  );
}

/**
 * 글로벌 화면 맨 위 나라별 표(2026-10-29) — 시장 비교표와 같은 열. 나라는 서버가 **기기 시간대**에서 추정한 코드다
 * (기기 언어 지역은 필리핀의 en-GB 폰을 영국으로 잡았다). 이름은 브라우저 `Intl.DisplayNames`(한국어)로 바꾸고, 표에 없는
 * 시간대(예: Africa/Lagos)는 서버가 보낸 이름 그대로 둔다
 */
function RegionTable({ rows }: { rows: NonNullable<EarInsightsSummary["by_region"]> }) {
  const total = rows.reduce((sum, r) => sum + r.users, 0);
  return (
    <Table head={["나라", "가입자", "기간 가입", "온보딩 완료", "7일 활성", "7일 청취자", "기간 청취", "기간 재생", "유료"]}>
      {rows.map((r) => (
        <Tr key={r.region}>
          <Td className="font-medium">{regionLabel(r.region)}</Td>
          <Td className="tabular-nums">{fmtInt(r.users)} <span className="text-ink-soft">· {fmtPct(r.users / Math.max(1, total), 0)}</span></Td>
          <Td className="tabular-nums">{fmtInt(r.signups_in_window)}</Td>
          <Td className="tabular-nums">{fmtInt(r.onboarding_completed)}</Td>
          <Td className="tabular-nums">{fmtInt(r.active_7d)}</Td>
          <Td className="tabular-nums">{fmtInt(r.listeners_7d)}</Td>
          <Td className="tabular-nums">{fmtListenSec(r.listen_sec)}</Td>
          <Td className="tabular-nums">{fmtInt(r.plays)}</Td>
          <Td className="tabular-nums">{fmtInt(r.paid_active)}</Td>
        </Tr>
      ))}
    </Table>
  );
}

const REGION_NAMES = (() => {
  try {
    return new Intl.DisplayNames(["ko"], { type: "region" });
  } catch {
    return null;
  }
})();

/** `PH` → "필리핀 (PH)", `unknown` → "모름" */
function regionLabel(code: string): string {
  if (code === "unknown") return "모름";
  let name: string | undefined;
  try {
    name = REGION_NAMES?.of(code);
  } catch {
    name = undefined;
  }
  return name && name !== code ? `${name} (${code})` : code;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-1 text-[12px] font-semibold uppercase tracking-wide text-ink-soft">{children}</h2>;
}

type DailyRow = EarInsightsSummary["daily"][number];

/**
 * 일별 막대 — 검색 로그 탭과 같은 div 막대. `overlay`가 있으면 같은 축으로 아래에 빨간 부분을 덧그린다.
 * `ratio`·`overlay`는 0~1(최댓값 대비). 막대 칸이 패널 높이만큼 늘어나므로(최소 96px — `FILL_PANEL`) 높이를 비율로 준다.
 */
function DailyBars({ rows, primary, ratio, overlay, title, legend }: {
  rows: DailyRow[];
  primary: (d: DailyRow) => number;
  ratio: (d: DailyRow, max: number) => number;
  overlay?: (d: DailyRow, max: number) => number;
  title: (d: DailyRow) => string;
  legend: string;
}) {
  const max = maxOf(rows, primary);
  if (rows.length === 0) return <p className="text-[13px] text-ink-soft">이 창에는 기록이 없다.</p>;
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-1 items-stretch gap-1 overflow-x-auto" style={{ minHeight: 96 }}>
        {rows.map((d) => {
          const h = ratio(d, max);
          const o = overlay ? Math.min(h, overlay(d, max)) : 0;
          return (
            <div key={d.date} className="flex min-w-[18px] flex-1 flex-col items-center gap-1" title={title(d)}>
              <div className="relative w-full flex-1">
                <div className="absolute inset-x-0 bottom-0 rounded-t bg-brand/40" style={{ height: barHeight(h) }}>
                  {o > 0 && <div className="absolute inset-x-0 bottom-0 bg-rose-400" style={{ height: `${(o / h) * 100}%` }} />}
                </div>
              </div>
              {/* 라벨 칸 높이 고정 — 라벨 없는 칸에서도 막대 바닥이 한 줄로 맞게. */}
              <span className="block h-3 shrink-0 whitespace-nowrap text-[10px] leading-3 tabular-nums text-ink-soft">{rows.length > 31 ? (d.date.endsWith("01") || d.date.endsWith("15") ? shortDate(d.date) : "") : shortDate(d.date)}</span>
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-ink-soft">{legend}</p>
    </div>
  );
}

/** 막대 칸 높이 대비 비율(0~1) → CSS 높이. 0 이어도 2px 는 보이게(막대가 사라지면 "기록 없음"처럼 읽힌다) */
const barHeight = (ratio: number): string => `max(2px, ${Math.round(ratio * 1000) / 10}%)`;

/**
 * 일별 접속자·청취자 한 쌍 막대 — 회색 = 접속자, 파랑 = 그중 재생한 청취자(같은 축). 접속자를 모르는 날(첫 신뢰 날짜 앞)은
 * 회색 막대 대신 점선 칸을 그린다 — 0명과 "기록 없음"이 섞이지 않게.
 */
function ActiveListenerBars({ rows }: { rows: DailyRow[] }) {
  const max = maxOf(rows, (d) => Math.max(d.active_users ?? 0, d.listeners));
  if (rows.length === 0) return <p className="text-[13px] text-ink-soft">이 창에는 기록이 없다.</p>;
  // 높이를 px 가 아니라 막대 칸의 비율로 준다 — 칸이 패널 높이만큼 늘어나므로(`FILL_PANEL`) 그래프도 함께 자란다
  const pct = (n: number) => barHeight(n / max);
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-1 items-stretch gap-1 overflow-x-auto" style={{ minHeight: 96 }}>
        {rows.map((d) => (
          <div key={d.date} className="flex min-w-[18px] flex-1 flex-col items-center gap-1" title={`${d.date} · 접속자 ${d.active_users == null ? "기록 없음" : `${fmtInt(d.active_users)}명`} · 청취자 ${fmtInt(d.listeners)}명${d.active_users ? ` (${fmtPct(d.listeners / d.active_users, 0)})` : ""}`}>
            {/* 막대 칸 — 남은 높이 전부. 막대는 바닥에 붙여 칸 높이의 비율로 그린다 */}
            <div className="relative w-full flex-1">
              <div className="absolute inset-0 flex items-end justify-center gap-px">
                {d.active_users == null
                  ? <div className="w-1/2 rounded-t border border-dashed border-line" style={{ height: 8 }} />
                  : <div className="w-1/2 rounded-t bg-ink-soft/40" style={{ height: pct(d.active_users) }} />}
                <div className="w-1/2 rounded-t bg-brand/60" style={{ height: pct(d.listeners) }} />
              </div>
            </div>
            {/* 라벨 칸 높이 고정 — DailyBars 와 같은 규칙 */}
            <span className="block h-3 shrink-0 whitespace-nowrap text-[10px] leading-3 tabular-nums text-ink-soft">{rows.length > 31 ? (d.date.endsWith("01") || d.date.endsWith("15") ? shortDate(d.date) : "") : shortDate(d.date)}</span>
          </div>
        ))}
      </div>
      <p className="mt-2 flex flex-wrap items-center gap-3 text-xs text-ink-soft">
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm bg-ink-soft/40" />접속자</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm bg-brand/60" />청취자(그중 재생)</span>
        <span>점선 = 접속 기록 없음. 호버하면 인원·청취 전환</span>
      </p>
    </div>
  );
}

/** 요일별 평균 표 — 막대는 같은 축(회색 접속자 · 파랑 청취자). 날 수가 적은 요일은 한 주의 사정이 그대로라 날 수를 함께 적는다 */
function WeekdayTable({ rows }: { rows: EarInsightsWeekday[] }) {
  const max = maxOf(rows, (w) => Math.max(w.avg_active_users ?? 0, w.avg_listeners ?? 0));
  return (
    <Table head={["요일", "날 수", "평균 접속자", "평균 청취자", "청취 전환", ""]} empty="-">
      {rows.map((w) => (
        <Tr key={w.weekday}>
          <Td className={`font-medium ${w.weekday >= 6 ? "text-brand-ink" : ""}`}>{w.label}</Td>
          <Td className="tabular-nums text-ink-soft">{w.days}일{w.active_days < w.days ? <span className="ml-1 text-xs">(접속 {w.active_days}일)</span> : null}</Td>
          <Td className="tabular-nums font-medium">{fmtAvg(w.avg_active_users)}{w.avg_active_users != null ? "명" : ""}</Td>
          <Td className="tabular-nums">{fmtAvg(w.avg_listeners)}{w.avg_listeners != null ? "명" : ""}</Td>
          <Td className="tabular-nums text-ink-soft">{w.avg_active_users && w.avg_listeners != null && w.active_days === w.days ? fmtPct(w.avg_listeners / w.avg_active_users, 0) : "-"}</Td>
          <Td className="w-[30%]">
            <div className="space-y-0.5">
              <div className="h-1.5 rounded-sm bg-ink-soft/40" style={{ width: `${((w.avg_active_users ?? 0) / max) * 100}%` }} />
              <div className="h-1.5 rounded-sm bg-brand/60" style={{ width: `${((w.avg_listeners ?? 0) / max) * 100}%` }} />
            </div>
          </Td>
        </Tr>
      ))}
    </Table>
  );
}

/** 이 인원 미만 묶음은 비율을 흐리게 — 한두 명으로 수십 %p 가 움직인다 */
const SMALL_COHORT = 10;

/**
 * 코호트 표 한 장 — 행 = 묶음(최근 먼저), 칸 = "N명 · R%". 칸 배경은 비율만큼 진하게(브랜드색 `--brand` #16a394 — 같은 표 안에서 눈으로 비교).
 * 끝나지 않은 칸은 `집계 중`(빈칸·`…`이면 0명으로 읽혀 이름을 붙였다 — 2026-10-22), 접속 기록 이전 구간은 흐리게 + `*`.
 */
function CohortTable({ table }: { table: EarInsightsCohortTable }) {
  const weekly = table.span === 7;
  const head = [weekly ? "가입 주" : "가입일", "가입자", ...table.offsets.map((o) => `${weekly ? "W" : "D"}${o}`)];
  return (
    <Table head={head} empty="-">
      {table.rows.map((r) => (
        <Tr key={r.start}>
          <Td className="whitespace-nowrap font-medium tabular-nums">{shortDate(r.start)}{weekly ? " 주" : ""}</Td>
          <Td className="tabular-nums text-ink-soft">{fmtInt(r.users)}명</Td>
          {r.cells.map((c, i) => (
            <Td key={table.offsets[i]} className="whitespace-nowrap tabular-nums">
              {c === null ? (
                <span className="text-ink-soft" title="이 묶음의 마지막 가입자 기준 구간이 아직 끝나지 않았다 — 0명이 아니다">집계 중</span>
              ) : r.users === 0 ? (
                <span className="text-ink-soft">-</span>
              ) : (
                <span
                  className={`inline-block rounded px-1.5 py-0.5 ${c.partial || r.users < SMALL_COHORT ? "text-ink-soft" : "text-ink"}`}
                  style={{ backgroundColor: `rgba(22, 163, 148, ${Math.min(0.35, (c.rate ?? 0) * 0.5)})` }}
                  title={c.partial ? "접속 기록 이전 구간 — 재생만 잡혀 실제보다 낮다" : undefined}
                >
                  {fmtInt(c.returned)}명 · {fmtPct(c.rate, 0)}{c.partial ? "*" : ""}
                </span>
              )}
            </Td>
          ))}
        </Tr>
      ))}
    </Table>
  );
}

/** "Pro 30명 (이벤트 11명)" — 이벤트가 0이거나 값이 없으면(옛 API) 괄호를 뺀다. 유료 수(`paid_active`)는 결제만 센다 */
function tierWithEvent(label: string, count: number, eventCount: number | undefined): string {
  return eventCount ? `${label} ${fmtInt(count)}명 (이벤트 ${fmtInt(eventCount)}명)` : `${label} ${fmtInt(count)}명`;
}

const PLATFORM_LABEL: Record<string, string> = { ios: "iOS", android: "Android", unknown: "기기 없음" };
const PLATFORM_ORDER = ["ios", "android", "unknown"];

/**
 * 플랫폼 작은 줄(2026-10-29) — 현재 계정을 가장 최근 기기의 플랫폼으로 나눈 수(`users.by_platform`). 탈퇴자는 기기 행이
 * 지워져 플랫폼을 모르므로 누적 가입 칸에서는 `extra`로 따로 적는다. 옛 서버 응답(필드 없음)이면 그리지 않는다
 */
function PlatformLine({ rows, extra }: { rows?: { platform: string; count: number }[]; extra?: string }) {
  if (!rows || rows.length === 0) return null;
  const rank = (p: string) => (PLATFORM_ORDER.includes(p) ? PLATFORM_ORDER.indexOf(p) : PLATFORM_ORDER.length);
  const sorted = [...rows].sort((x, y) => rank(x.platform) - rank(y.platform));
  const parts = sorted.filter((r) => r.count > 0).map((r) => `${PLATFORM_LABEL[r.platform] ?? r.platform} ${fmtInt(r.count)}`);
  if (extra) parts.push(extra);
  return <span className="mt-0.5 block text-[11px] text-ink-soft">{parts.join(" · ")}</span>;
}
