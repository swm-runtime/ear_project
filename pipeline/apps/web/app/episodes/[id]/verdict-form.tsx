"use client";
import { useEffect, useState, useTransition } from "react";
import { saveCriticVerdicts } from "../../actions";
import type { CriticFlag } from "@/lib/artifacts";
import { btnCls } from "@/components/ui";

type V = { verdict: "" | "동의" | "부분동의" | "비동의"; reason: string };

/** 모듈 최상위여야 한다 — 컴포넌트 안에 정의하면 리렌더마다 새 타입이 되어 입력창이 remount 되고 키 입력마다 포커스를 잃는다 */
function Row({ r, v, set }: { r: CriticFlag; v: V; set: (v: V) => void }) {
  return (
    <div className="border-b border-line py-2 text-xs">
      <div className="mb-1 leading-relaxed">
        <span className="mr-1 rounded bg-[#f2f5f8] px-1 font-medium">#{r.n}</span>
        <span className="mr-1 font-medium text-ink">{r.where}</span>
        <span className="mr-1 rounded bg-[#f2f5f8] px-1 text-ink-soft">{r.item}</span>
        {r.strength && <span className={`mr-1 rounded px-1 text-[10px] font-medium ${r.strength.includes("위반") ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-800"}`}>{r.strength}</span>}
        <span className="text-ink-soft">{r.note}</span>
      </div>
      <div className="flex gap-2">
        <select className="rounded border border-line px-1.5 py-1 outline-none focus:border-brand" value={v.verdict} onChange={(e) => set({ ...v, verdict: e.target.value as V["verdict"] })}>
          <option value="">판정</option><option>동의</option><option>부분동의</option><option>비동의</option>
        </select>
        <input className="flex-1 rounded border border-line px-2 py-1 outline-none focus:border-brand" placeholder="사유 (비동의·부분동의는 필수)" value={v.reason} onChange={(e) => set({ ...v, reason: e.target.value })} />
      </div>
    </div>
  );
}

/** 비평 판정 입력 (spec/09 판정 규약: 동의/부분동의/비동의 + 사유, 놓친 지적 자유 기입) */
export function VerdictForm({ episodeId, parsed, saved }: { episodeId: string; parsed: { flags: CriticFlag[]; stars: CriticFlag[] }; saved: any }) {
  const init = (rows: CriticFlag[], key: "flags" | "stars") => Object.fromEntries(rows.map((r) => [r.n, saved?.[key]?.[r.n] ?? { verdict: "", reason: "" }])) as Record<string, V>;
  const [flags, setFlags] = useState<Record<string, V>>(init(parsed.flags, "flags"));
  const [stars, setStars] = useState<Record<string, V>>(init(parsed.stars, "stars"));
  const [extra, setExtra] = useState<string>(saved?.extra ?? "");
  const [dirty, setDirty] = useState(false);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const counts = Object.values(flags).reduce((a, v) => { if (v.verdict) a[v.verdict] = (a[v.verdict] ?? 0) + 1; return a; }, {} as Record<string, number>);

  const persist = (label: string) => start(async () => {
    try { await saveCriticVerdicts(episodeId, { flags, stars, extra }); setMsg(label); setDirty(false); }
    catch (e: any) { setMsg(e.message); }
  });
  // 판정은 1.5초 디바운스로 자동 저장 — 탭 이동(클라이언트 내비게이션)에 로컬 상태가 사라지던 문제 (2026-09-03 사용자 보고).
  // dirty 게이트로 초기 마운트 저장(judged_by 덮어쓰기)을 막는다. JudgeView 와 동일 규칙.
  useEffect(() => {
    if (!dirty) return;
    const t = setTimeout(() => persist("자동 저장됨"), 1500);
    return () => clearTimeout(t);
  }, [dirty, flags, stars, extra]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-w-0 rounded-md border border-line bg-panel p-4 shadow-[0_1px_2px_rgba(38,49,61,0.04)]">
      <h3 className="mb-2 text-[13px] font-semibold">판정(사람) — 플래그 {parsed.flags.length} · ⭐ {parsed.stars.length}</h3>
      {parsed.flags.length === 0 && <p className="text-xs text-gray-500">리포트에서 플래그 표를 찾지 못했습니다 (규격 확인).</p>}
      {parsed.flags.map((r) => <Row key={`f${r.n}`} r={r} v={flags[r.n]} set={(v) => { setFlags({ ...flags, [r.n]: v }); setDirty(true); }} />)}
      {parsed.stars.length > 0 && <h4 className="mt-3 text-xs font-semibold text-gray-600">⭐ 잘된 지점</h4>}
      {parsed.stars.map((r) => <Row key={`s${r.n}`} r={r} v={stars[r.n]} set={(v) => { setStars({ ...stars, [r.n]: v }); setDirty(true); }} />)}
      <h4 className="mt-3 text-xs font-semibold text-gray-600">놓친 지적 (자유 기입)</h4>
      <textarea className="mt-1 w-full rounded border border-line px-2 py-1 text-xs outline-none focus:border-brand" rows={3} value={extra} onChange={(e) => { setExtra(e.target.value); setDirty(true); }} />
      <div className="mt-3 flex items-center gap-3">
        <button className={btnCls("primary")} disabled={pending} onClick={() => persist("저장됨")}>지금 저장</button>
        <span className="text-xs text-ink-soft">동의 {counts["동의"] ?? 0} · 부분 {counts["부분동의"] ?? 0} · 비동의 {counts["비동의"] ?? 0}{saved?.judged_by ? ` · 마지막 저장 ${saved.judged_by}` : ""}</span>
        <span className="text-xs">{pending ? "저장 중…" : dirty ? "변경됨 — 자동 저장 중…" : msg ?? ""}</span>
      </div>
    </div>
  );
}
