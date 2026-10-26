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
/** 나온 콘텐츠 수 — 서버가 첫 페이지 건수만 남기므로(총수를 세지 않는다) 다음 페이지가 있으면 "20건+" */
const found = (r: { result_count: number | null; has_more: boolean }) => (r.result_count == null ? "-" : `${r.result_count}건${r.has_more ? "+" : ""}`);
const times = (n: number | null) => (n != null && n > 0 ? `${n}회` : "-");
/** 결과 편들의 주제 중 가장 많이 나온 것부터 2개 — "아리스토텔레스 → 철학"처럼 무엇으로 이어졌는지 한눈에 */
const topTopics = (contents: { topics: string[] }[]): string[] => {
  const counts = new Map<string, number>();
  for (const c of contents) for (const name of c.topics) counts.set(name, (counts.get(name) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([name]) => name);
};

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
  // 의미 검색(KAN-238 하이브리드) — 키워드만이었다면 결과 없음이었을 비율과 실제 비율의 차이가 의미 검색 몫이다
  const keywordMissRate = t?.keyword_misses == null ? null : ratio(t.keyword_misses, t.searches);
  const semanticDownRate = t?.semantic_unavailable == null ? null : ratio(t.semantic_unavailable, t.searches);

  return (
    <div className="space-y-3">
      {err && <p className="text-[13px] text-rose-700">{err}</p>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        <Stat label="검색" value={t ? t.searches.toLocaleString() : "…"} sub={t ? `사용자 ${t.users.toLocaleString()}명 · 타이핑 묶음 단위` : undefined} />
        <Stat label="결과 없음 비율" value={t ? pct(missRate) : "…"} sub={t ? <>{small ? `결과 없음 ${t.misses}회 — 표본 ${t.searches}회, 참고만` : `결과 없음 ${t.misses.toLocaleString()}회 ÷ 검색`}{keywordMissRate != null && <><br />키워드만이었다면 <b>{pct(keywordMissRate)}</b></>}</> : undefined} tone={missTone} />
        <Stat
          label="의미 검색이 살림"
          value={t ? (t.rescued == null ? "-" : `${t.rescued.toLocaleString()}회`) : "…"}
          sub={t && t.rescued != null ? <>키워드 0건 {(t.keyword_misses ?? 0).toLocaleString()}회 중 결과를 냄 · <span className={(semanticDownRate ?? 0) >= 0.05 ? "font-semibold text-rose-700" : ""}>의미 엔진 결손 {pct(semanticDownRate)}</span></> : "이 서버는 아직 집계하지 않는다"}
          tone="text-sky-700"
        />
        <Stat label="콘텐츠 클릭" value={t ? (t.clicked == null ? "-" : `${t.clicked.toLocaleString()}회`) : "…"} sub={t && t.clicked == null ? "이 서버는 아직 집계하지 않는다 — 배포 대기" : "검색 뒤 10분 안에 결과를 재생·담은 검색"} />
        <Stat label="2자 질의" value={t ? pct(ratio(t.short_queries, t.searches)) : "…"} sub="트라이그램 인덱스를 못 타는 길이" />
        <Stat label="주제 필터 동반" value={t ? pct(ratio(t.filtered_searches, t.searches)) : "…"} sub="결과 없음이 필터 탓인지 가를 때" />
      </div>

      <Panel title={`일별 추이 — ${data ? `${data.since.slice(0, 10)} 이후` : "…"}`} right={<button className={btnCls("ghost")} disabled={loading} onClick={() => void load()}>{loading ? "불러오는 중…" : "새로고침"}</button>}>
        {data && data.daily.length === 0 ? (
          <p className="text-[13px] text-ink-soft">이 창에는 검색이 없다 — 앱에서 검색이 일어나면 그날부터 쌓인다.</p>
        ) : (
          <div className="flex items-end gap-1 overflow-x-auto" style={{ height: 96 }}>
            {(data?.daily ?? []).map((d) => {
              const h = Math.max(2, Math.round((d.searches / maxDaily) * 80));
              const mh = d.searches > 0 ? Math.round((d.misses / d.searches) * h) : 0;
              const ch = d.searches > 0 ? Math.round((d.clicked / d.searches) * h) : 0;
              const rh = d.searches > 0 ? Math.round((d.rescued / d.searches) * h) : 0;
              return (
                <div key={d.date} className="flex min-w-[18px] flex-1 flex-col items-center justify-end gap-1" title={`${d.date} · 검색 ${d.searches}회 · 결과 없음 ${d.misses}회 · 의미 검색이 살림 ${d.rescued}회 · 콘텐츠 클릭 ${d.clicked}회`}>
                  {/* 막대 전체가 검색. 아래부터 빨강(결과 없음) → 하늘(의미 검색이 살림) → 초록(콘텐츠 클릭). 나머지는 반응이 안 잡힌 검색 — 이유는 알 수 없어 따로 이름 붙이지 않는다 */}
                  <div className="relative w-full rounded-t bg-brand/40" style={{ height: h }}>
                    {/* 빨강(결과 없음) 바로 위 하늘색 = 키워드로는 0건이었는데 의미 검색이 결과를 낸 검색 — 없었다면 빨강이었다 */}
                    <div className="absolute inset-x-0 bg-sky-400" style={{ height: rh, bottom: mh }} />
                    <div className="absolute inset-x-0 bottom-0 bg-emerald-500" style={{ height: ch, bottom: mh + rh }} />
                    <div className="absolute inset-x-0 bottom-0 bg-rose-400" style={{ height: mh }} />
                  </div>
                  <span className="text-[10px] tabular-nums text-ink-soft">{d.date.slice(5)}</span>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title={`결과가 없던 검색어 ${data?.missed.length ?? 0}개`} flush>
          <Table head={["검색어", "검색 횟수", "결과 없음", "나온 콘텐츠(최근)", "콘텐츠 클릭", "마지막"]} empty={data === null ? "불러오는 중…" : "결과가 없던 검색이 없다"}>
            {(data?.missed ?? []).map((r) => (
              <Tr key={r.query}>
                <Td className="font-medium">{r.query}</Td>
                <Td className="tabular-nums">{r.searches}회</Td>
                <Td className="tabular-nums text-rose-700">{times(r.misses)}</Td>
                <Td className={`tabular-nums ${r.result_count === 0 ? "text-rose-700" : ""}`}>{found(r)}</Td>
                <Td className={`tabular-nums ${(r.clicked ?? 0) > 0 ? "text-emerald-700" : "text-ink-soft"}`}>{times(r.clicked)}</Td>
                <Td className="whitespace-nowrap text-ink-soft">{fmtTime(r.last_searched_at)}</Td>
              </Tr>
            ))}
          </Table>
        </Panel>
        <Panel title={`많이 찾은 검색어 ${data?.top.length ?? 0}개`} flush>
          <Table head={["검색어", "검색 횟수", "나온 콘텐츠(최근)", "결과 없음", "콘텐츠 클릭", "마지막"]} empty={data === null ? "불러오는 중…" : "검색이 없다"}>
            {(data?.top ?? []).map((r) => (
              <Tr key={r.query}>
                <Td className="font-medium">{r.query}</Td>
                <Td className="tabular-nums">{r.searches}회</Td>
                <Td className={`tabular-nums ${r.result_count === 0 ? "text-rose-700" : ""}`}>{found(r)}</Td>
                <Td className={`tabular-nums ${r.misses > 0 ? "text-rose-700" : "text-ink-soft"}`}>{times(r.misses)}</Td>
                <Td className={`tabular-nums ${(r.clicked ?? 0) > 0 ? "text-emerald-700" : "text-ink-soft"}`}>{times(r.clicked)}</Td>
                <Td className="whitespace-nowrap text-ink-soft">{fmtTime(r.last_searched_at)}</Td>
              </Tr>
            ))}
          </Table>
        </Panel>
      </div>

      {(data?.semantic || data?.corrections) && (
        <div className="grid gap-3 lg:grid-cols-2">
          {data?.semantic && (
            <Panel title={`의미 검색으로 찾은 검색어 ${data.semantic.length}개 — 키워드로는 0건`} flush>
              <Table head={["검색어", "→ 주제", "나온 콘텐츠(최근 앞 3편)", "검색", "콘텐츠 클릭", "마지막"]} empty="이 창에는 의미 검색만으로 결과가 나온 검색이 없다">
                {data.semantic.map((r) => (
                  <Tr key={r.query}>
                    <Td className="font-medium">{r.query}</Td>
                    <Td className="text-sky-700">{topTopics(r.contents).join(" · ") || "-"}</Td>
                    <Td className="text-ink-soft">{r.contents.map((c) => `「${c.title}」`).join(", ") || "-"}</Td>
                    <Td className="tabular-nums">{r.searches}회</Td>
                    <Td className={`tabular-nums ${r.clicked > 0 ? "text-emerald-700" : "text-amber-700"}`}>{r.clicked > 0 ? `${r.clicked}회` : "없음"}</Td>
                    <Td className="whitespace-nowrap text-ink-soft">{fmtTime(r.last_searched_at)}</Td>
                  </Tr>
                ))}
              </Table>
            </Panel>
          )}
          {data?.corrections && (
            <Panel title={`오타 교정 ${data.corrections.length}개`} flush>
              <Table head={["입력 → 교정", "검색", "원문으로 다시", "콘텐츠 클릭", "마지막"]} empty="이 창에는 교정된 검색이 없다">
                {data.corrections.map((r) => (
                  <Tr key={`${r.query}→${r.query_used}`}>
                    <Td className="font-medium">{r.query} <span className="text-ink-soft">→</span> {r.query_used}</Td>
                    <Td className="tabular-nums">{r.searches}회</Td>
                    <Td className={`tabular-nums ${r.rejected > 0 ? "text-amber-700" : "text-ink-soft"}`}>{times(r.rejected)}</Td>
                    <Td className={`tabular-nums ${r.clicked > 0 ? "text-emerald-700" : "text-ink-soft"}`}>{times(r.clicked)}</Td>
                    <Td className="whitespace-nowrap text-ink-soft">{fmtTime(r.last_searched_at)}</Td>
                  </Tr>
                ))}
              </Table>
            </Panel>
          )}
        </div>
      )}

      <p className="text-xs text-ink-soft">
        한 행은 사용자가 치다가 멈춘 질의 하나다 — 디바운스 자동 검색의 중간 입력(‘커’ → ‘커리’ → ‘커리어’)과 한 글자 고침은 서버가 10초 창 안에서 마지막 것으로 접는다. <b>나온 콘텐츠</b>는 그 검색어를 가장 최근에 쳤을 때 나온 수다 — 서버가 첫 페이지(20건)까지만 세므로 그보다 많으면 ‘20건+’로 적는다. <b>결과 없음</b>은 그 검색어가 콘텐츠 0건으로 끝난 횟수다. <b>콘텐츠 클릭</b>은 검색 뒤 10분 안에 결과 중 하나를 재생하거나 담은 횟수다 — 앱이 탭을 보내는 게 아니라 서버가 재생·담기 기록에서 역산한다(재생 한도에 막힌 탭·상세만 본 탭은 안 잡힌다). 그래서 클릭이 없는 검색을 비율로 만들지 않고, 검색어별로 ‘눌린 적이 있나’만 본다. 결과 없는 검색어가 콘텐츠가 없는 주제면 제작 쪽 수요이고, 콘텐츠가 나왔는데 클릭이 한 번도 없는 검색어는 매칭이 엉뚱한지(explore.md 4.5-5) 볼 후보다. <b>의미 검색이 살림</b>은 키워드로는 0건이었는데 의미 검색(질의 임베딩)이 결과를 낸 검색이다 — 의미 검색이 없었다면 결과 없음이었다(“키워드만이었다면”과 실제 결과 없음 비율의 차이). <b>의미 검색으로 찾은 검색어</b>는 그런 검색만 모아 무엇을 찾아 줬는지(가장 최근 결과 앞 3편과 그 주제) 보인다 — 키워드가 하나도 안 맞았으니 결과가 전부 의미 검색 몫이다. 클릭이 <b>없음</b>인 줄은 결과는 나왔지만 안 눌린 것이라, 의미가 엉뚱하게 이어졌는지 먼저 볼 후보다. 키워드와 의미 결과가 섞인 검색은 어느 편이 의미 몫인지 기록이 없어 이 표에 넣지 않는다. <b>의미 엔진 결손</b>은 AI 서버가 늦거나 꺼져 키워드만으로 답한 검색 비율이다(5% 이상 빨강). <b>오타 교정</b>의 ‘원문으로 다시’는 교정 결과를 보고 원래 입력으로 다시 찾은 횟수다 — 잦으면 그 교정이 틀렸다는 뜻이다. 보존 90일.
      </p>
    </div>
  );
}
