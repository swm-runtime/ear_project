"use client";
import { useCallback, useEffect, useState } from "react";
import { Panel, Stat, Table, Td, Tr, btnCls } from "@/components/ui";
import { EarApiError, type EarChannel, type EarInsightsSummary, earChannelLabel, getEarInsightsSummary } from "@/lib/ear";
import { EarGate, EarSession, earErrMsg } from "@/app/publish/ear-connect";
import {
  PROVIDER_LABEL, REASON_LABEL, TIER_LABEL,
  fmtInt, fmtKstDate, fmtListenSec, fmtPct, isSmall, labelOf, maxOf, shortDate, shortId,
} from "@/lib/insights-format";

const DAY_OPTIONS = [7, 14, 30, 90] as const;

/**
 * 서비스 지표 탭 — 제품 API 의 `GET /admin/insights/summary`(admin-api 4.22) 한 번으로 화면 전체를 그린다.
 * 실배포가 기본이고 개발계 토글은 검색 로그 탭과 같은 용도(테스트 계정 흐름 확인)다. **열 때 1회 + [새로고침]** —
 * 자동 폴링하지 않는다(사용자 결정 2026-09-06 · 2026-10-08 "누군가 사이트를 켰을 때 그때 요청").
 * 창(7·14·30·90일)은 추이·창 집계에만 걸리고, 누적 카드·순위는 전 기간이다.
 */
export function ServiceInsights() {
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
            최근 {d}일
          </button>
        ))}
        <span className="ml-auto"><EarSession channel={channel} /></span>
      </div>
      <EarGate key={channel} channel={channel}>
        <InsightsView channel={channel} days={days} onSwitchToDev={channel === "prod" ? () => setChannel("dev") : undefined} />
      </EarGate>
    </div>
  );
}

/**
 * `onSwitchToDev` — 운영 채널일 때만 넘어온다. 엔드포인트가 404(미배포)면 [개발계로 보기]로 부모 채널을 바꾼다.
 */
function InsightsView({ channel, days, onSwitchToDev }: { channel: EarChannel; days: number; onSwitchToDev?: () => void }) {
  const [data, setData] = useState<EarInsightsSummary | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // 404 = 이 서버에 엔드포인트가 아직 없다(dev 머지로 개발계에 먼저 나가고 운영은 다음 main 배포 때 들어감).
  // 서버 메시지("찾을 수 없어요")만 띄우면 고장으로 읽혀서 별도 안내로 그린다(2026-10-08) — backend-metrics 라우트의 404 처리와 같은 취지
  const [notDeployed, setNotDeployed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    setNotDeployed(false);
    try {
      setData(await getEarInsightsSummary(channel, days));
      setLoadedAt(new Date());
    } catch (e) {
      if (e instanceof EarApiError && e.status === 404) setNotDeployed(true);
      else setErr(earErrMsg(e));
    } finally {
      setLoading(false);
    }
  }, [channel, days]);

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
  if (err) return <div className="space-y-2"><p className="text-[13px] text-rose-700">{err}</p>{refresh}</div>;
  if (!data) return <p className="text-[13px] text-ink-soft">불러오는 중…</p>;

  const u = data.users;
  const all = data.listening.all_time;
  const win = data.listening.window;
  const winLabel = `최근 ${data.days}일`;
  const hourlyMax = maxOf(data.hourly, (r) => r.plays);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end">{refresh}</div>

      {/* ── 사용자 ── */}
      <SectionTitle>사용자</SectionTitle>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Stat label="누적 가입 (탈퇴 포함)" value={fmtInt(u.total_signups)} sub="현재 계정 + 탈퇴 기록" />
        <Stat label="현재 가입자" value={fmtInt(u.current)} sub={`온보딩 완료 ${fmtInt(u.onboarding_completed)}명 · ${fmtPct(u.onboarding_rate)}`} tone="text-brand-ink" />
        <Stat label="탈퇴 · 탈퇴율" value={`${fmtInt(u.withdrawals)}명 · ${fmtPct(u.withdrawal_rate)}`} sub="탈퇴 ÷ 누적 가입" tone={(u.withdrawal_rate ?? 0) >= 0.2 ? "text-rose-700" : "text-ink"} />
        <Stat label="체험 중 · 유료" value={`${fmtInt(u.trial_active)} · ${fmtInt(u.paid_active)}`} sub={`유료 전환 ${fmtPct(u.paid_rate)} · 무료 ${fmtInt(u.tiers.light)}명 · ${tierWithEvent("Daily", u.tiers.daily, u.tier_events?.daily)} · ${tierWithEvent("Pro", u.tiers.pro, u.tier_events?.pro)}`} />
        <Stat label="활성화율" value={fmtPct(u.activation_rate)} sub={`한 번이라도 재생 ${fmtInt(u.activated)}명 ÷ 현재 가입자`} />
        <Stat label="가입 경로" value={u.by_provider.length ? `${labelOf(PROVIDER_LABEL, u.by_provider[0].provider)} ${fmtPct(u.by_provider[0].count / Math.max(1, u.current), 0)}` : "-"} sub={u.by_provider.map((p) => `${labelOf(PROVIDER_LABEL, p.provider)} ${p.count}`).join(" · ")} />
      </div>

      <SectionTitle>활성 사용자 (앱 사용 기준) → 그중 재생</SectionTitle>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="최근 1일 (DAU)" value={fmtInt(u.active_1d)} sub={`그중 재생 ${fmtInt(u.listeners_1d)}명 · ${fmtPct(u.listener_rate_1d, 0)}`} />
        <Stat label="최근 7일 (WAU)" value={fmtInt(u.active_7d)} sub={`그중 재생 ${fmtInt(u.listeners_7d)}명 · ${fmtPct(u.listener_rate_7d, 0)}`} />
        <Stat label="최근 30일 (MAU)" value={fmtInt(u.active_30d)} sub={`그중 재생 ${fmtInt(u.listeners_30d)}명 · ${fmtPct(u.listener_rate_30d, 0)}`} />
        <Stat label="고착도 DAU/MAU" value={fmtPct(u.stickiness, 0)} sub="앱 사용 기준. 20% 이상이면 매주 돌아오는 습관이 생긴 것으로 본다" tone={(u.stickiness ?? 0) >= 0.2 ? "text-brand-ink" : "text-ink"} />
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
        <Panel title={`일별 청취 — ${winLabel} (KST 달력일)`}>
          <DailyBars
            rows={data.daily}
            primary={(d) => d.listen_sec}
            height={(d, max) => Math.max(2, Math.round((d.listen_sec / max) * 80))}
            title={(d) => `${d.date} · 청취 ${fmtListenSec(d.listen_sec)} · 재생 ${d.plays}회 · 청취자 ${d.listeners}명 · 완청 ${d.completes}회`}
            legend="막대 = 청취 시간. 호버하면 재생·청취자·완청"
          />
        </Panel>
        <Panel title={`일별 가입·탈퇴 — ${winLabel} (KST 달력일)`}>
          <DailyBars
            rows={data.daily}
            primary={(d) => d.signups}
            height={(d, max) => Math.max(2, Math.round((d.signups / max) * 80))}
            overlay={(d, max) => Math.round((d.withdrawals / max) * 80)}
            title={(d) => `${d.date} · 가입 ${d.signups}명 · 탈퇴 ${d.withdrawals}명`}
            legend="막대 = 가입. 아래 빨간 부분 = 탈퇴(같은 축)"
          />
        </Panel>
      </div>

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
          <Table head={["기준", "대상", "돌아옴", "비율"]} empty="-">
            {data.retention.map((r) => (
              <Tr key={r.day}>
                <Td className="font-medium">D{r.day}</Td>
                <Td className="tabular-nums text-ink-soft">{fmtInt(r.cohort_size)}명</Td>
                <Td className="tabular-nums">{fmtInt(r.returned)}명</Td>
                <Td className="tabular-nums font-medium">{fmtPct(r.rate, 0)}{isSmall(r.cohort_size) ? <span className="ml-1 text-xs font-normal text-ink-soft">표본 적음</span> : null}</Td>
              </Tr>
            ))}
          </Table>
        </Panel>
        <Panel title={`탈퇴 사유 (전 기간 ${fmtInt(u.withdrawals)}건)`} flush>
          <Table head={["사유", "건수", "비율"]} empty="탈퇴 기록이 없다">
            {data.withdrawal_reasons.map((r) => (
              <Tr key={r.reason_code ?? "null"}>
                <Td className="font-medium">{labelOf(REASON_LABEL, r.reason_code)}</Td>
                <Td className="tabular-nums">{r.count}건</Td>
                <Td className="tabular-nums text-ink-soft">{fmtPct(r.count / Math.max(1, u.withdrawals), 0)}</Td>
              </Tr>
            ))}
          </Table>
        </Panel>
      </div>
      <Panel title="읽는 법">
          <ul className="list-disc space-y-1 pl-4 text-xs text-ink-soft">
            <li><b>누적 가입(탈퇴 포함)</b>은 현재 계정 수 + 탈퇴 기록 수다. <b>유료</b>는 실결제 구독이 만료 전인 사람(해지 예약 포함)이다. 탈퇴하면 계정 행이 지워지므로(domain.md 12.3) 둘을 더해야 &quot;가입한 적 있는 사람&quot;이 된다.</li>
            <li><b>청취 시간·재생</b>의 원천은 재생 기록(<code>play_records</code>)이다 — 즉시 반영되지만 탈퇴자의 기록은 함께 지워진다. 04시 배치가 모으는 콘텐츠 집계(<code>content_stats</code>)는 탈퇴자 몫이 남는 대신 하루 늦다. 두 숫자는 다를 수 있다.</li>
            <li><b>활성 사용자(DAU/WAU/MAU)</b>는 앱을 써서 서버 토큰을 갱신한 사람이다 — 액세스 토큰이 30분짜리라 앱을 열면 거의 매번 갱신이 일어나므로 &quot;앱 실행&quot;에 가장 가까운 서버 신호다(30분 안의 재실행은 안 잡힌다). 그중 <b>재생</b>까지 간 사람을 함께 적어 켜고 안 듣는 비율을 본다. <b>완청</b>은 서버의 90% 판정 신호다.</li>
            <li><b>리텐션</b>은 가입한 지 N일이 지난 현재 계정 중 N일 뒤 이후 아무 때나 앱을 쓴(토큰 갱신 또는 재생) 사람의 비율(언바운디드)이다. 탈퇴자는 분모에 없어 실제보다 높게 나오고(생존 편향), 같은 이유로 <b>일별 가입</b>에서도 그날 가입했다가 탈퇴한 사람은 빠진다.</li>
            <li><b>날짜</b>는 KST 달력일이다(앱의 서비스 날짜 04/05시 경계가 아니다 — 운영자가 읽는 단위). 창 버튼은 추이·&quot;최근 N일&quot; 값에만 걸리고 누적·순위는 전 기간이다.</li>
            <li>이름·이메일은 서버가 싣지 않는다 — 사용자 순위는 <code>user_id</code> 앞 8자다. 특정 사용자를 더 봐야 하면 목적을 적고 DB 를 직접 본다.</li>
          </ul>
      </Panel>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-1 text-[12px] font-semibold uppercase tracking-wide text-ink-soft">{children}</h2>;
}

type DailyRow = EarInsightsSummary["daily"][number];

/** 일별 막대 — 검색 로그 탭과 같은 div 막대. `overlay`가 있으면 같은 축으로 아래에 빨간 부분을 덧그린다 */
function DailyBars({ rows, primary, height, overlay, title, legend }: {
  rows: DailyRow[];
  primary: (d: DailyRow) => number;
  height: (d: DailyRow, max: number) => number;
  overlay?: (d: DailyRow, max: number) => number;
  title: (d: DailyRow) => string;
  legend: string;
}) {
  const max = maxOf(rows, primary);
  if (rows.length === 0) return <p className="text-[13px] text-ink-soft">이 창에는 기록이 없다.</p>;
  return (
    <div>
      <div className="flex items-end gap-1 overflow-x-auto" style={{ height: 96 }}>
        {rows.map((d) => {
          const h = height(d, max);
          const o = overlay ? Math.min(h, overlay(d, max)) : 0;
          return (
            <div key={d.date} className="flex min-w-[18px] flex-1 flex-col items-center justify-end gap-1" title={title(d)}>
              <div className="relative w-full rounded-t bg-brand/40" style={{ height: h }}>
                {o > 0 && <div className="absolute inset-x-0 bottom-0 bg-rose-400" style={{ height: o }} />}
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

/** "Pro 30명 (이벤트 11명)" — 이벤트가 0이거나 값이 없으면(옛 API) 괄호를 뺀다. 유료 수(`paid_active`)는 결제만 센다 */
function tierWithEvent(label: string, count: number, eventCount: number | undefined): string {
  return eventCount ? `${label} ${fmtInt(count)}명 (이벤트 ${fmtInt(eventCount)}명)` : `${label} ${fmtInt(count)}명`;
}
