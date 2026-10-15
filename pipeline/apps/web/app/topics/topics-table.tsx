"use client";
import { useState, useTransition } from "react";
import { deleteTopic, upsertTopic } from "../actions";
import { btnCls } from "@/components/ui";

type Row = { id?: string; major: string; mid: string; ai_generation: boolean; explainer: string | null; active: boolean; note: string | null };

/**
 * speakers = 인스턴스의 진행자 이름 · majors = 인스턴스의 대분류 목록(서버가 넘긴다).
 * singleLevel = 글로벌판 — 주제가 1단계라 대분류 칸을 숨기고 저장 때 major 를 주제 이름(mid)과 같게 둔다. 해설은 첫째 진행자 고정이라 선택 칸 대신 표시만(topics.explainer 는 비워 둔다)
 */
export function TopicsTable({ rows, speakers, majors, singleLevel }: { rows: Row[]; speakers: readonly [string, string]; majors: readonly string[]; singleLevel: boolean }) {
  const fixedExplainer = singleLevel;
  const [draft, setDraft] = useState<Row>({ major: singleLevel ? "" : majors[0], mid: "", ai_generation: true, explainer: fixedExplainer ? null : speakers[0], active: true, note: "" });
  const [pending, start] = useTransition();
  const save = (r: Row) => start(async () => { try { await upsertTopic(r); } catch (e: any) { alert(e.message); } });
  return (
    <div className="overflow-x-auto text-[13px]">
      <table className="w-full">
        <thead className="border-b border-line bg-[#f7f9fb] text-[11px] font-semibold uppercase tracking-wide text-ink-soft"><tr>{!singleLevel && <th className="p-2 text-left">대분류</th>}<th className="p-2 text-left">{singleLevel ? "주제" : "중분류"}</th><th className="p-2">AI 생성</th><th className="p-2">해설</th><th className="p-2">활성</th><th className="p-2 text-left">메모</th><th className="p-2"></th></tr></thead>
        <tbody>
          {rows.map((r) => <EditableRow key={r.id} row={r} speakers={speakers} majors={majors} singleLevel={singleLevel} onSave={save} onDelete={(id) => start(async () => { if (confirm(`${r.mid} 삭제?`)) { try { await deleteTopic(id); } catch (e: any) { alert(e.message); } } })} pending={pending} />)}
          <EditableRow row={draft} speakers={speakers} majors={majors} singleLevel={singleLevel} isNew onSave={(r) => { save(r); setDraft({ ...draft, mid: "", note: "" }); }} pending={pending} />
        </tbody>
      </table>
    </div>
  );
}

function EditableRow({ row, speakers, majors, singleLevel, isNew, onSave, onDelete, pending }: { row: Row; speakers: readonly [string, string]; majors: readonly string[]; singleLevel: boolean; isNew?: boolean; onSave: (r: Row) => void; onDelete?: (id: string) => void; pending: boolean }) {
  const [r, setR] = useState<Row>(row);
  const dirty = JSON.stringify(r) !== JSON.stringify(row);
  const inp = "w-full rounded border border-line px-2 py-1 outline-none focus:border-brand";
  return (
    <tr className="border-b border-line last:border-0 hover:bg-[#f7f9fb]">
      {!singleLevel && <td className="p-2"><select className={inp} value={r.major} onChange={(e) => setR({ ...r, major: e.target.value })}>{majors.map((m) => <option key={m}>{m}</option>)}</select></td>}
      <td className="p-2"><input className={inp} value={r.mid} placeholder={singleLevel ? "주제" : "중분류"} onChange={(e) => setR({ ...r, mid: e.target.value })} /></td>
      <td className="p-2 text-center"><input type="checkbox" checked={r.ai_generation} onChange={(e) => setR({ ...r, ai_generation: e.target.checked })} /></td>
      <td className="p-2">{singleLevel ? <span className="text-xs text-ink-soft">{speakers[0]} (고정)</span> : <select className={inp} value={r.explainer ?? ""} onChange={(e) => setR({ ...r, explainer: e.target.value || null })}><option value="">-</option>{speakers.map((sp) => <option key={sp}>{sp}</option>)}</select>}</td>
      <td className="p-2 text-center"><input type="checkbox" checked={r.active} onChange={(e) => setR({ ...r, active: e.target.checked })} /></td>
      <td className="p-2"><input className={inp} value={r.note ?? ""} onChange={(e) => setR({ ...r, note: e.target.value })} /></td>
      <td className="whitespace-nowrap p-2 text-right">
        <button className={btnCls(isNew ? "primary" : "ghost")} disabled={pending || !r.mid || (!isNew && !dirty)} onClick={() => onSave(singleLevel ? { ...r, major: r.mid } : r)}>{isNew ? "추가" : "저장"}</button>
        {!isNew && onDelete && r.id && <button className={`ml-1 ${btnCls("danger")}`} disabled={pending} onClick={() => onDelete(r.id!)}>삭제</button>}
      </td>
    </tr>
  );
}
