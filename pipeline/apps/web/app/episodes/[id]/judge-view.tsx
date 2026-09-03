"use client";
import { useEffect, useMemo, useState, useTransition } from "react";
import { saveCriticVerdicts } from "@/app/actions";
import type { CriticFlag, ScoreRow, Turn } from "@/lib/artifacts";
import { ReQaButton, TurnEditor } from "./script-editor";
import { btnCls } from "@/components/ui";

/**
 * 판정 화면 (2026-09-01) — 대본과 비평 리포트를 한 화면에서.
 * 왼쪽: 대본. 플래그·⭐가 걸린 턴에 표시가 붙고, 턴을 클릭하면 그 자리에서 판정(동의/부분/비동의)과 직접 수정을 남긴다.
 * 오른쪽: 12항목 점수표(AI 점수 + 사람 점수·사유 = 앵커 원료) + 플래그 목록(클릭하면 해당 턴으로 이동).
 * 저장은 episodes.critic_verdicts 한 곳 — 리포트 파일은 AI 스냅샷으로 손대지 않는다 (spec/09 3.1).
 */

type V = { verdict: "" | "동의" | "부분동의" | "비동의"; reason: string };
type SV = { human: string; reason: string };
const VERDICTS: V["verdict"][] = ["", "동의", "부분동의", "비동의"];

/** "E20~E25" · "E1·E2·E22" · "전편 (특히 E34~E39)" → 턴 ID 목록 */
function turnRefs(where: string): string[] {
  const out = new Set<string>();
  const range = /([EY])(\d+)\s*[~–-]\s*[EY]?(\d+)/g; let m: RegExpExecArray | null;
  while ((m = range.exec(where))) { const a = +m[2], b = +m[3]; if (b > a && b - a <= 20) for (let i = a; i <= b; i++) out.add(m[1] + i); }
  const single = /([EY])(\d+)/g;
  while ((m = single.exec(where))) out.add(m[1] + m[2]);
  return [...out];
}
const shortItem = (item: string) => item.match(/^[A-G]\d/)?.[0] ?? item.slice(0, 3);
const tone = (strength?: string) => strength === "위반" ? "bg-rose-50 text-rose-700 ring-rose-200" : "bg-amber-50 text-amber-800 ring-amber-200";
const vTone = (v: V["verdict"]) => v === "동의" ? "text-emerald-700" : v === "부분동의" ? "text-amber-700" : v === "비동의" ? "text-rose-700" : "text-ink-soft";

/** 모듈 최상위여야 한다 — JudgeView 안에 정의하면 리렌더마다 새 타입이 되어 입력창이 remount 되고 키 입력마다 포커스를 잃는다 */
function VerdictRow({ r, v, set, star }: { r: CriticFlag; v: V; set: (v: V) => void; star?: boolean }) {
  return (
    <div className="rounded border border-line bg-panel px-2.5 py-2 text-[12.5px]">
      <div className="mb-1 flex flex-wrap items-center gap-1.5">
        <span className={`rounded px-1.5 py-0.5 text-[10.5px] font-medium ring-1 ring-inset ${star ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : tone(r.strength)}`}>{star ? "⭐" : `${r.item}${r.strength ? ` · ${r.strength}` : ""}`}</span>
        <span className="text-[11px] text-ink-soft">#{r.n} · {r.where}</span>
      </div>
      <p className="break-words leading-relaxed text-ink">{r.note}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <select className={`rounded border border-line px-1.5 py-1 text-[12px] outline-none focus:border-brand ${vTone(v.verdict)}`} value={v.verdict} onChange={(e) => set({ ...v, verdict: e.target.value as V["verdict"] })}>
          {VERDICTS.map((o) => <option key={o} value={o}>{o || "판정"}</option>)}
        </select>
        <input className="min-w-[12rem] flex-1 rounded border border-line px-2 py-1 text-[12px] outline-none focus:border-brand" placeholder="사유 (비동의·부분동의는 필수)" value={v.reason} onChange={(e) => set({ ...v, reason: e.target.value })} />
      </div>
    </div>
  );
}

export function JudgeView({ episodeId, backlogId, turns, flags, stars, scores, total, saved, edits }: {
  episodeId: string; backlogId: string; turns: Turn[]; flags: CriticFlag[]; stars: CriticFlag[]; scores: ScoreRow[]; total: string | null; saved: any; edits: any[];
}) {
  const init = (rows: CriticFlag[], key: "flags" | "stars") => Object.fromEntries(rows.map((r) => [r.n, saved?.[key]?.[r.n] ?? { verdict: "", reason: "" }])) as Record<string, V>;
  const [fv, setFv] = useState<Record<string, V>>(init(flags, "flags"));
  const [sv, setSv] = useState<Record<string, V>>(init(stars, "stars"));
  const [sc, setSc] = useState<Record<string, SV>>(Object.fromEntries(scores.map((s) => [s.key, saved?.scores?.[s.key] ?? { human: "", reason: "" }])));
  const [open, setOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [edited, setEdited] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const byTurn = useMemo(() => {
    const f = new Map<string, CriticFlag[]>(); const s = new Map<string, CriticFlag[]>(); const global: CriticFlag[] = [];
    for (const x of flags) { const refs = turnRefs(x.where); if (!refs.length) global.push(x); for (const id of refs) f.set(id, [...(f.get(id) ?? []), x]); }
    for (const x of stars) for (const id of turnRefs(x.where)) s.set(id, [...(s.get(id) ?? []), x]);
    return { f, s, global };
  }, [flags, stars]);
  const editedTurns = useMemo(() => new Set((edits ?? []).map((e) => e.turn)), [edits]);

  const counts = Object.values(fv).reduce((a, v) => { if (v.verdict) a[v.verdict] = (a[v.verdict] ?? 0) + 1; return a; }, {} as Record<string, number>);
  const scored = Object.values(sc).filter((s) => s.human !== "").length;
  const humanTotal = scores.reduce((a, s) => a + (Number(sc[s.key]?.human) || 0), 0);

  const jump = (id: string) => { setOpen(id); document.getElementById(`turn-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }); };
  const save = () => start(async () => {
    try { await saveCriticVerdicts(episodeId, { flags: fv, stars: sv, scores: sc, extra: saved?.extra ?? "" }); setMsg("저장됨"); setDirty(false); }
    catch (e: any) { setMsg(e.message); }
  });
  useEffect(() => { if (!dirty) return; const h = (e: BeforeUnloadEvent) => { e.preventDefault(); }; window.addEventListener("beforeunload", h); return () => window.removeEventListener("beforeunload", h); }, [dirty]);

  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      {/* ── 왼쪽: 대본 ── */}
      <div className="min-w-0 space-y-3">
        {edited && (
          <div className="flex items-center gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-2.5 text-[13px] text-amber-900">
            <span>대본을 수정했습니다. 사람 수정도 사실 오류·중복을 만들 수 있으니 재QA를 권합니다.</span>
            <ReQaButton episodeId={episodeId} backlogId={backlogId} onDone={() => setEdited(false)} />
          </div>
        )}
        {byTurn.global.length > 0 && (
          <div className="rounded-md border border-line bg-panel p-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-soft">전편·구간 플래그 (특정 턴 없음)</p>
            <div className="space-y-1.5">{byTurn.global.map((r) => <VerdictRow key={r.n} r={r} v={fv[r.n]} set={(v) => { setFv({ ...fv, [r.n]: v }); setDirty(true); }} />)}</div>
          </div>
        )}
        <div className="space-y-1 rounded-md border border-line bg-panel p-5 text-[13px] leading-relaxed">
          {turns.map((t, i) => {
            if (t.kind === "section") return <h3 key={i} className="mt-4 text-[11px] font-semibold uppercase tracking-wide text-ink-soft">{t.text}</h3>;
            if (t.kind === "meta") return <p key={i} className="text-[11px] text-ink-soft">{t.text}</p>;
            const id = t.kind === "E" || t.kind === "Y" ? `${t.kind}${t.n}` : null;
            const fl = id ? byTurn.f.get(id) ?? [] : []; const st = id ? byTurn.s.get(id) ?? [] : [];
            const marked = fl.length > 0 || st.length > 0; const isOpen = id !== null && open === id;
            const judged = fl.every((r) => fv[r.n]?.verdict) && st.every((r) => sv[r.n]?.verdict);
            return (
              <div key={i} id={id ? `turn-${id}` : undefined}
                className={`rounded px-2 py-1 ${t.kind === "Y" ? "pl-8" : ""} ${isOpen ? "bg-amber-50/70 ring-1 ring-amber-200" : marked ? "cursor-pointer hover:bg-[#f7f9fb]" : id ? "cursor-pointer hover:bg-[#fafbfc]" : ""}`}
                onClick={() => id && !isOpen && setOpen(id)}>
                <div className="flex gap-3">
                  <span className={`h-fit shrink-0 whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ${t.speaker === "윤아" ? "bg-rose-50 text-rose-700 ring-rose-200" : "bg-sky-50 text-sky-700 ring-sky-200"}`}>
                    {id ?? t.section ?? "발췌"} {t.speaker}{id && editedTurns.has(id) ? " ✎" : ""}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="break-words leading-relaxed">{t.text}</p>
                    {marked && !isOpen && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {fl.map((r) => <span key={r.n} className={`rounded px-1.5 py-0.5 text-[10.5px] font-medium ring-1 ring-inset ${tone(r.strength)} ${fv[r.n]?.verdict ? "opacity-60" : ""}`} title={r.note}>{shortItem(r.item)}{fv[r.n]?.verdict ? ` ✓${fv[r.n].verdict[0]}` : ""}</span>)}
                        {st.map((r) => <span key={`s${r.n}`} className={`rounded bg-emerald-50 px-1.5 py-0.5 text-[10.5px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200 ${sv[r.n]?.verdict ? "opacity-60" : ""}`} title={r.note}>⭐{sv[r.n]?.verdict ? ` ✓${sv[r.n].verdict[0]}` : ""}</span>)}
                        {judged && <span className="text-[10.5px] text-ink-soft">판정 완료</span>}
                      </div>
                    )}
                  </div>
                </div>
                {isOpen && id && (
                  <div className="mt-2 space-y-2 border-t border-amber-200 pt-2" onClick={(e) => e.stopPropagation()}>
                    {fl.map((r) => <VerdictRow key={r.n} r={r} v={fv[r.n]} set={(v) => { setFv({ ...fv, [r.n]: v }); setDirty(true); }} />)}
                    {st.map((r) => <VerdictRow key={`s${r.n}`} r={r} v={sv[r.n]} set={(v) => { setSv({ ...sv, [r.n]: v }); setDirty(true); }} star />)}
                    {editing === id ? (
                      <div className="rounded border border-line bg-panel p-2.5"><TurnEditor episodeId={episodeId} turn={id} initial={t.text} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); setEdited(true); }} /></div>
                    ) : (
                      <div className="flex gap-2">
                        <button className={btnCls()} onClick={() => setEditing(id)}>이 턴 직접 수정</button>
                        <button className={btnCls()} onClick={() => setOpen(null)}>닫기</button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {edits?.length > 0 && (
          <details className="rounded-md border border-line bg-panel p-4 text-[13px]">
            <summary className="cursor-pointer font-semibold">사람 수정 로그 ({edits.length})</summary>
            <div className="mt-2 space-y-2">
              {edits.map((e, i) => (
                <div key={i} className="border-b pb-2 text-xs">
                  <span className="mr-2 rounded bg-gray-100 px-1">{e.turn}</span><span className="text-gray-400">{e.by ?? ""} {String(e.at).slice(5, 16).replace("T", " ")}</span>
                  <div className="mt-1 text-red-700 line-through decoration-red-300">{e.before}</div>
                  <div className="text-green-800">{e.after}</div>
                  {e.reason && <div className="mt-0.5 text-gray-600">사유: {e.reason}</div>}
                </div>
              ))}
            </div>
          </details>
        )}
      </div>

      {/* ── 오른쪽: 점수표 + 플래그 목록 (고정) ── */}
      <div className="min-w-0 space-y-3 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
        <div className="rounded-md border border-line bg-panel p-3">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-[13px] font-semibold">점수 · 12항목 <span className="font-normal text-ink-soft">AI {total ?? "-"} · 사람 {scored ? `${humanTotal}/100` : "-"}</span></h3>
            <span className="text-[11px] text-ink-soft">{scored}/{scores.length} 입력</span>
          </div>
          {scores.length === 0 && <p className="text-[12px] text-ink-soft">리포트에서 점수표를 찾지 못했습니다 (v1 리포트이거나 규격 불일치).</p>}
          <div className="space-y-1.5">
            {scores.map((s) => {
              const v = sc[s.key] ?? { human: "", reason: "" };
              return (
                <div key={s.key} className="rounded border border-line-soft px-2 py-1.5 text-[12px]">
                  <div className="flex items-center gap-2">
                    <span className="w-14 shrink-0 text-[10.5px] text-ink-soft">{s.axis}</span>
                    <span className="flex-1 truncate font-medium" title={s.item}>{s.item}</span>
                    <span className="w-12 text-right font-mono text-ink-soft">{s.ai ?? "-"}/{s.max ?? "?"}</span>
                    <input type="number" min={0} max={s.max ?? 100} className="w-12 rounded border border-line px-1 py-0.5 text-right font-mono text-[12px] outline-none focus:border-brand" placeholder="사람" value={v.human} onChange={(e) => { setSc({ ...sc, [s.key]: { ...v, human: e.target.value } }); setDirty(true); }} />
                  </div>
                  <details className="mt-1">
                    <summary className="cursor-pointer text-[11px] text-ink-soft">AI 근거 · 사유 입력</summary>
                    <p className="mt-1 text-[11.5px] leading-relaxed text-ink-soft">{s.evidence}</p>
                    <input className="mt-1 w-full rounded border border-line px-2 py-1 text-[12px] outline-none focus:border-brand" placeholder='사유 — "왜 이 구간인가"를 턴·자구로 (앵커가 됩니다)' value={v.reason} onChange={(e) => { setSc({ ...sc, [s.key]: { ...v, reason: e.target.value } }); setDirty(true); }} />
                  </details>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-md border border-line bg-panel p-3">
          <h3 className="mb-2 text-[13px] font-semibold">플래그 {flags.length} · ⭐ {stars.length} <span className="font-normal text-ink-soft">동의 {counts["동의"] ?? 0} · 부분 {counts["부분동의"] ?? 0} · 비동의 {counts["비동의"] ?? 0}</span><a href="/assets/skills/draft/guidelines.md?promote=1" className="ml-2 text-[11px] font-normal text-brand hover:underline" title="반복되는 동의 플래그를 생성 규칙으로 (spec/09 4.1 — 새 버전 draft 로 저장 후 활성화)">규칙으로 승격 →</a></h3>
          <div className="space-y-1">
            {flags.map((r) => {
              const refs = turnRefs(r.where); const v = fv[r.n];
              return (
                <button key={r.n} className="flex w-full items-start gap-2 rounded px-1.5 py-1 text-left text-[12px] hover:bg-[#f7f9fb]" onClick={() => refs[0] ? jump(refs[0]) : window.scrollTo({ top: 0, behavior: "smooth" })}>
                  <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10.5px] font-medium ring-1 ring-inset ${tone(r.strength)}`}>{shortItem(r.item)}</span>
                  <span className="min-w-0 flex-1 truncate" title={r.note}><span className="font-mono text-[11px] text-ink-soft">{r.where}</span> {r.note}</span>
                  <span className={`shrink-0 text-[11px] ${vTone(v?.verdict ?? "")}`}>{v?.verdict || "·"}</span>
                </button>
              );
            })}
            {stars.map((r) => {
              const refs = turnRefs(r.where); const v = sv[r.n];
              return (
                <button key={`s${r.n}`} className="flex w-full items-start gap-2 rounded px-1.5 py-1 text-left text-[12px] hover:bg-[#f7f9fb]" onClick={() => refs[0] && jump(refs[0])}>
                  <span className="shrink-0 rounded bg-emerald-50 px-1.5 py-0.5 text-[10.5px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">⭐</span>
                  <span className="min-w-0 flex-1 truncate" title={r.note}><span className="font-mono text-[11px] text-ink-soft">{r.where}</span> {r.note}</span>
                  <span className={`shrink-0 text-[11px] ${vTone(v?.verdict ?? "")}`}>{v?.verdict || "·"}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-md border border-line bg-panel p-3">
          <button className={btnCls("primary")} disabled={pending} onClick={save}>판정 저장</button>
          <span className="text-[11px] text-ink-soft">{msg ?? (dirty ? "저장되지 않은 변경" : saved?.judged_by ? `마지막 저장 ${saved.judged_by}` : "리포트 파일은 그대로 — 판정은 DB에만")}</span>
        </div>
      </div>
    </div>
  );
}
