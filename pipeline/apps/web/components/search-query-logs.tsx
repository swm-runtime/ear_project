"use client";
import { useCallback, useEffect, useState } from "react";
import { Panel, Stat, Table, Td, Tr, btnCls } from "@/components/ui";
import { fmtTime } from "@/lib/format";
import { type EarChannel, type EarSearchQueryLogSummary, earChannelLabel, getEarSearchQueryLogSummary } from "@/lib/ear";
import { EarGate, EarSession, earErrMsg } from "@/app/publish/ear-connect";

const DAY_OPTIONS = [7, 14, 30, 90] as const;
/** 표본이 이 미만이면 미스율을 "참고"로 표시한다 — 몇 건으로 비율을 읽으면 오판한다 */
const SMALL_SAMPLE = 30;

/**
 * 검색 로그 — 제품 API 서버가 남긴 검색 질의 로그(`search_query_logs`)의 요약. 실배포가 기본이고 개발계는
 * 추천 테스트 계정으로 검색 흐름을 확인할 때 쓴다. 채널을 바꾸면 EarGate 를 다시 마운트해 그 서버의 관리자 세션으로 붙는다.
 */
export function SearchQueryLogs() {
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
        <SummaryView channel={channel} days={days} />
      </EarGate>
    </div>
  );
}

const pct = (n: number | null) => (n == null ? "-" : `${(n * 100).toFixed(1)}%`);
const ratio = (part: number, whole: number) => (whole > 0 ? part / whole : null);

function SummaryView({ channel, days }: { channel: EarChannel; days: number }) {
  const [data, setData] = useState<EarSearchQueryLogSummary | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try { setData(await getEarSearchQueryLogSummary(channel, days)); }
    catch (e) { setErr(earErrMsg(e)); }
    finally { setLoading(false); }
  }, [channel, days]);

  useEffect(() => {
    // 마운트 직후·창 변경 시 1회 — 효과 안에서 바로 setState 하지 않도록 한 틱 미룬다
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const t = data?.totals;
  const small = (t?.searches ?? 0) > 0 && (t?.searches ?? 0) < SMALL_SAMPLE;
  const missRate = t?.miss_rate ?? null;
  const missTone = missRate == null ? "text-ink" : missRate >= 0.3 ? "text-rose-700" : missRate >= 0.15 ? "text-amber-700" : "text-ink";
  const maxDaily = Math.max(1, ...(data?.daily ?? []).map((d) => d.searches));

  return (
    <div className="space-y-3">
      {err && <p className="text-[13px] text-rose-700">{err}</p>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="검색" value={t ? t.searches.toLocaleString() : "…"} sub={t ? `사용자 ${t.users.toLocaleString()}명 · 타이핑 묶음 단위` : undefined} />
        <Stat label="0건" value={t ? t.misses.toLocaleString() : "…"} sub="결과가 하나도 없던 검색" />
        <Stat label="미스율" value={t ? pct(missRate) : "…"} sub={small ? `표본 ${t?.searches}건 — 참고만` : "0건 ÷ 검색"} tone={missTone} />
        <Stat label="2자 질의" value={t ? pct(ratio(t.short_queries, t.searches)) : "…"} sub="트라이그램 인덱스를 못 타는 길이" />
        <Stat label="주제 필터 동반" value={t ? pct(ratio(t.filtered_searches, t.searches)) : "…"} sub="0건이 필터 탓인지 가를 때" />
      </div>

      <Panel title={`일별 추이 — ${data ? `${data.since.slice(0, 10)} 이후` : "…"}`} right={<button className={btnCls("ghost")} disabled={loading} onClick={() => void load()}>{loading ? "불러오는 중…" : "새로고침"}</button>}>
        {data && data.daily.length === 0 ? (
          <p className="text-[13px] text-ink-soft">이 창에는 검색이 없다 — 앱에서 검색이 일어나면 그날부터 쌓인다.</p>
        ) : (
          <div className="flex items-end gap-1 overflow-x-auto" style={{ height: 96 }}>
            {(data?.daily ?? []).map((d) => {
              const h = Math.max(2, Math.round((d.searches / maxDaily) * 80));
              const mh = d.searches > 0 ? Math.round((d.misses / d.searches) * h) : 0;
              return (
                <div key={d.date} className="flex min-w-[18px] flex-1 flex-col items-center justify-end gap-1" title={`${d.date} · 검색 ${d.searches} · 0건 ${d.misses}`}>
                  <div className="relative w-full rounded-t bg-brand/70" style={{ height: h }}>
                    {/* 0건 몫은 아래에서 빨강으로 채운다 — 막대 전체가 검색, 빨강이 그중 0건 */}
                    <div className="absolute inset-x-0 bottom-0 rounded-t bg-rose-400" style={{ height: mh }} />
                  </div>
                  <span className="text-[10px] tabular-nums text-ink-soft">{d.date.slice(5)}</span>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title={`0건으로 끝난 질의 ${data?.missed.length ?? 0}개`} flush>
          <Table head={["질의", "검색", "0건", "마지막"]} empty={data === null ? "불러오는 중…" : "0건으로 끝난 검색이 없다"}>
            {(data?.missed ?? []).map((r) => (
              <Tr key={r.query}>
                <Td className="font-medium">{r.query}</Td>
                <Td className="tabular-nums">{r.searches}</Td>
                <Td className="tabular-nums text-rose-700">{r.misses}</Td>
                <Td className="whitespace-nowrap text-ink-soft">{fmtTime(r.last_searched_at)}</Td>
              </Tr>
            ))}
          </Table>
        </Panel>
        <Panel title={`많이 찾은 질의 ${data?.top.length ?? 0}개`} flush>
          <Table head={["질의", "검색", "0건", "마지막"]} empty={data === null ? "불러오는 중…" : "검색이 없다"}>
            {(data?.top ?? []).map((r) => (
              <Tr key={r.query}>
                <Td className="font-medium">{r.query}</Td>
                <Td className="tabular-nums">{r.searches}</Td>
                <Td className={`tabular-nums ${r.misses > 0 ? "text-rose-700" : "text-ink-soft"}`}>{r.misses}</Td>
                <Td className="whitespace-nowrap text-ink-soft">{fmtTime(r.last_searched_at)}</Td>
              </Tr>
            ))}
          </Table>
        </Panel>
      </div>

      <p className="text-xs text-ink-soft">
        한 행은 사용자가 치다가 멈춘 질의 하나다 — 디바운스 자동 검색의 중간 입력(‘커’ → ‘커리’ → ‘커리어’)은 서버가 10초 창 안에서 마지막 것으로 접는다. 0건 질의가 콘텐츠가 없는 주제면 제작 쪽 수요이고, 있는데 못 찾은 것이면 매칭 방식(explore.md 4.5-5)을 손볼 근거다. 보존 90일.
      </p>
    </div>
  );
}
