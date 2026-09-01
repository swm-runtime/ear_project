"use client";
import { useState, useTransition } from "react";
import { editScriptTurn, requestReQa } from "../../actions";
import type { Turn } from "@/lib/artifacts";
import { btnCls } from "@/components/ui";

/**
 * 대본 뷰어 + 턴 인라인 편집 (2026-08-31 규약: 비평 리포트에 서술로 남기는 대신 문장을 직접 고친다).
 * 수정 전/후는 episodes.human_edits 에 쌓여 골드·규칙 승격의 근거가 된다.
 */
export function ScriptEditor({ episodeId, backlogId, turns, edits, editable }: { episodeId: string; backlogId: string; turns: Turn[]; edits: any[]; editable: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const editedTurns = new Set((edits ?? []).map((e) => e.turn));
  return (
    <div className="space-y-4">
      {dirty && (
        <div className="flex items-center gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-2.5 text-[13px] text-amber-900">
          <span>대본을 수정했습니다. 사람 수정도 사실 오류·중복을 만들 수 있으니 재QA를 권합니다.</span>
          <ReQaButton episodeId={episodeId} backlogId={backlogId} onDone={() => setDirty(false)} />
        </div>
      )}
      <div className="space-y-1.5 rounded-md border border-line bg-panel p-5 text-[13px] leading-relaxed shadow-[0_1px_2px_rgba(38,49,61,0.04)]">
        {turns.map((t, i) => {
          if (t.kind === "section") return <h3 key={i} className="mt-4 text-[11px] font-semibold uppercase tracking-wide text-ink-soft">{t.text}</h3>;
          if (t.kind === "meta") return <p key={i} className="text-[11px] text-ink-soft">{t.text}</p>;
          const id = t.kind === "E" || t.kind === "Y" ? `${t.kind}${t.n}` : null;
          const isOpen = id !== null && open === id;
          return (
            <div key={i} className={`group flex gap-3 rounded px-2 py-1 ${t.kind === "Y" ? "pl-8" : ""} ${isOpen ? "bg-amber-50" : "hover:bg-[#f7f9fb]"}`}>
              <span className={`h-fit shrink-0 whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ${t.speaker === "윤아" ? "bg-rose-50 text-rose-700 ring-rose-200" : "bg-sky-50 text-sky-700 ring-sky-200"}`}>
                {id ?? t.section ?? "발췌"} {t.speaker}{id && editedTurns.has(id) ? " ✎" : ""}
              </span>
              {isOpen && id ? (
                <TurnEditor episodeId={episodeId} turn={id} initial={t.text} onClose={() => setOpen(null)} onSaved={() => { setOpen(null); setDirty(true); }} />
              ) : (
                <p className="leading-relaxed">
                  {t.text}
                  {editable && id && <button className="ml-2 hidden text-[11px] text-ink-soft underline group-hover:inline" onClick={() => setOpen(id)}>수정</button>}
                </p>
              )}
            </div>
          );
        })}
      </div>
      {edits?.length > 0 && (
        <details className="rounded-md border border-line bg-panel p-4 text-[13px]" open>
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
  );
}

export function TurnEditor({ episodeId, turn, initial, onClose, onSaved }: { episodeId: string; turn: string; initial: string; onClose: () => void; onSaved: () => void }) {
  const [text, setText] = useState(initial);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="flex-1 space-y-2">
      <textarea className="w-full rounded border border-line px-2.5 py-1.5 text-[13px] leading-relaxed outline-none focus:border-brand" rows={Math.max(3, Math.ceil(text.length / 60))} value={text} onChange={(e) => setText(e.target.value)} autoFocus />
      <input className="w-full rounded border border-line px-2.5 py-1.5 text-xs outline-none focus:border-brand" placeholder="사유 (선택 — 규칙으로 승격할 근거가 됩니다)" value={reason} onChange={(e) => setReason(e.target.value)} />
      <div className="flex items-center gap-2">
        <button className={btnCls("primary")} disabled={pending || text.trim() === initial.trim()}
          onClick={() => start(async () => {
            try { const r = await editScriptTurn(episodeId, turn, text, reason); if (r.coldOpenBroken) alert(`${turn} 은 콜드오픈 발췌 원본입니다 — 콜드오픈과 자구가 어긋났습니다. 콜드오픈도 함께 맞춰주세요 (spec/04).`); onSaved(); }
            catch (e: any) { setErr(e.message); }
          })}>저장</button>
        <button className={btnCls()} onClick={onClose}>취소</button>
        {err && <span className="text-xs text-red-600">{err}</span>}
      </div>
    </div>
  );
}

export function ReQaButton({ episodeId, backlogId, onDone }: { episodeId: string; backlogId: string; onDone: () => void }) {
  const [pending, start] = useTransition();
  return (
    <button className={`ml-auto ${btnCls()}`} disabled={pending}
      onClick={() => start(async () => { try { await requestReQa(episodeId, backlogId); alert("재QA를 요청했습니다 — AI 워커가 집으면 진행됩니다."); onDone(); } catch (e: any) { alert(e.message); } })}>
      재QA 요청
    </button>
  );
}
