"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { btnCls, Panel } from "@/components/ui";
import type { SeriesEpisode, SeriesStatus } from "@/lib/series";
import { approveSeries, cancelSeries, regenerateSeriesPlan, saveSeries } from "../actions";

const inp = "w-full rounded border border-line px-2 py-1 text-[12.5px] outline-none focus:border-brand disabled:bg-slate-50";
const blank = (): SeriesEpisode => ({ no: 0, title: "", scope: "", carries: "", only_here: "", minutes: 0 });

/** 설계안 편집 (spec/11 3장) — 이름·한 줄 소개·편 목록. 기획 중일 때만 고치고, [승인] = 편수 확정(상한 없음) */
export function SeriesEditor({ id, status, name: name0, introLine, plan: plan0, short = false }: { id: string; status: SeriesStatus; name: string; introLine: string; plan: SeriesEpisode[]; /** 짧은 판 시리즈(0041) — 원본 편 열·승인 문구 */ short?: boolean }) {
  const router = useRouter();
  const editable = status === "planning";
  const [name, setName] = useState(name0);
  const [intro, setIntro] = useState(introLine);
  const [plan, setPlan] = useState<SeriesEpisode[]>(plan0);
  const [count, setCount] = useState("");
  const [msg, setMsg] = useState<{ text: string; bad: boolean } | null>(null);
  const [pending, start] = useTransition();
  const dirty = name !== name0 || intro !== introLine || JSON.stringify(plan) !== JSON.stringify(plan0);
  const set = (k: number, f: keyof SeriesEpisode, v: string) => setPlan((p) => p.map((e, i) => (i === k ? { ...e, [f]: f === "minutes" ? Number(v) || 0 : v } : e)));
  const move = (k: number, d: -1 | 1) => setPlan((p) => { const q = [...p]; const j = k + d; if (j < 0 || j >= q.length) return p; [q[k], q[j]] = [q[j], q[k]]; return q; });
  const run = (f: () => Promise<{ ok: boolean; reason?: string } & Record<string, unknown>>, done: (r: any) => string) =>
    start(async () => { const r = await f(); setMsg(r.ok ? { text: done(r), bad: false } : { text: r.reason ?? "실패", bad: true }); if (r.ok) router.refresh(); });

  return (
    <Panel title={`설계안 — ${plan.length}편`} right={editable && <span className="text-[11px] text-ink-soft">편수 상한 없음 · 같은 개념은 한 편에서만 자세히</span>}>
      <div className="space-y-3 text-[13px]">
        <div className="grid gap-2 md:grid-cols-[8rem_1fr]">
          <label className="pt-1 text-xs font-semibold text-ink-soft">시리즈 이름</label>
          <input className={inp} value={name} disabled={!editable} onChange={(e) => setName(e.target.value)} />
          <label className="pt-1 text-xs font-semibold text-ink-soft">한 줄 소개</label>
          <input className={inp} value={intro} disabled={!editable} onChange={(e) => setIntro(e.target.value)} placeholder="인트로에서 읽는 한 문장" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[56rem] text-[12px]">
            <thead className="text-left text-[11px] text-ink-soft">
              <tr><th className="w-10 py-1">화</th>{short && <th className="w-14 py-1">원본</th>}<th className="py-1">제목</th><th className="py-1">범위</th><th className="py-1">앞 편에서 이어받음</th><th className="py-1">이 편에서만 자세히</th><th className="w-16 py-1">분</th>{editable && <th className="w-20" />}</tr>
            </thead>
            <tbody>
              {plan.map((e, k) => (
                <tr key={k} className="align-top">
                  <td className="py-1 font-mono text-ink-soft">{k + 1}</td>
                  {short && <td className="py-1 font-mono text-ink-soft" title="이 편이 나온 원본 편 — 주제 기획이 그 편의 소스를 우선 후보로 쓴다">{e.from_no ? `${e.from_no}화` : <span className="text-rose-600">없음</span>}</td>}
                  <td className="py-1 pr-1"><input className={inp} value={e.title} disabled={!editable} onChange={(v) => set(k, "title", v.target.value)} /></td>
                  <td className="py-1 pr-1"><textarea className={inp} rows={2} value={e.scope} disabled={!editable} onChange={(v) => set(k, "scope", v.target.value)} /></td>
                  <td className="py-1 pr-1"><textarea className={inp} rows={2} value={k === 0 ? "" : e.carries} disabled={!editable || k === 0} onChange={(v) => set(k, "carries", v.target.value)} /></td>
                  <td className="py-1 pr-1"><textarea className={inp} rows={2} value={e.only_here} disabled={!editable} onChange={(v) => set(k, "only_here", v.target.value)} /></td>
                  <td className="py-1 pr-1"><input className={inp} type="number" min={0} value={e.minutes || ""} disabled={!editable} onChange={(v) => set(k, "minutes", v.target.value)} /></td>
                  {editable && (
                    <td className="whitespace-nowrap py-1 text-[11px]">
                      <button className="px-1 text-ink-soft hover:text-ink" onClick={() => move(k, -1)} aria-label="위로">▲</button>
                      <button className="px-1 text-ink-soft hover:text-ink" onClick={() => move(k, 1)} aria-label="아래로">▼</button>
                      <button className="px-1 text-rose-600" onClick={() => setPlan((p) => p.filter((_, i) => i !== k))} aria-label="빼기">빼기</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {!plan.length && <p className="py-3 text-xs text-ink-soft">편 목록이 아직 없다 — 설계안 작업이 끝나면 채워진다. 직접 편을 더해도 된다.</p>}
        </div>
        {editable && (
          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
            <button className={btnCls()} onClick={() => setPlan((p) => [...p, blank()])}>편 더하기</button>
            <button className={btnCls()} disabled={pending || !dirty} onClick={() => run(() => saveSeries(id, { name, intro_line: intro, plan }), (r) => (r.problems?.length ? `저장 — 확인할 것: ${r.problems.join(" · ")}` : "저장했다"))}>저장</button>
            <span className="mx-1 h-4 w-px bg-line" />
            <input className={`${inp} w-20`} type="number" min={1} placeholder="편수" value={count} onChange={(e) => setCount(e.target.value)} />
            <button className={btnCls()} disabled={pending} onClick={() => { if (confirm("설계안을 다시 만듭니다. 지금 편 목록은 작업이 끝나면 덮어씁니다.")) run(() => regenerateSeriesPlan(id, Number(count) || null), () => "다시 만들기 요청 — 서버 워커가 집으면 덮어쓴다"); }}>AI로 다시 만들기</button>
            <span className="flex-1" />
            <button className={btnCls("danger")} disabled={pending} onClick={() => { if (confirm("시리즈를 중단합니다. 되돌릴 수 없습니다.")) run(() => cancelSeries(id), (r) => `중단 — 반려한 편 후보 ${r.rejected}건`); }}>중단</button>
            <button className={btnCls("primary")} disabled={pending || dirty || !plan.length}
              title={dirty ? "먼저 저장" : "편수를 확정하고 편마다 주제 기획 후보를 만든다"}
              onClick={() => { if (confirm(short ? `${plan.length}편으로 승인합니다.\n\n편마다 주제 기획 작업이 걸려 원본 편의 소스와 새로 찾은 자료로 후보가 생깁니다. 짧은 판이라 성립한 편은 바로 승인되고, 초안은 1화부터 순서대로 돕니다.` : `${plan.length}편으로 승인합니다.\n\n승인하면 편수가 확정되고, 편마다 주제 기획 작업이 걸려 후보가 생깁니다.`)) run(() => approveSeries(id), (r) => `승인 — 편 후보 작업 ${r.queued}건`); }}>{plan.length}편으로 승인</button>
          </div>
        )}
        {!editable && status === "approved" && (
          <div className="flex items-center gap-2 border-t border-line pt-3">
            <span className="text-xs text-ink-soft">승인됨 — 편 목록 변경은 첫 발행 전 재작성 흐름(spec/11 3장)으로 한다.</span>
            <span className="flex-1" />
            <button className={btnCls("danger")} disabled={pending} onClick={() => { if (confirm("시리즈를 중단합니다. 아직 초안에 들어가지 않은 편 후보는 반려됩니다.")) run(() => cancelSeries(id), (r) => `중단 — 반려한 편 후보 ${r.rejected}건`); }}>시리즈 중단</button>
          </div>
        )}
        {msg && <p className={`text-xs ${msg.bad ? "text-rose-700" : "text-ink-soft"}`}>{msg.text}</p>}
      </div>
    </Panel>
  );
}
