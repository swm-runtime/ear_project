"use client";
import { useTransition } from "react";
import { setSubTopic } from "../actions";
import { btnCls } from "@/components/ui";

/** 글로벌판 보조 주제 — 후보 구성 뒤 더하거나 뺀다 (명세 2장). 대표 주제는 사람이 기획 때 정한 그대로 */
export function SubTopicSelect({ id, main, sub, topics }: { id: string; main: string; sub: string | null; topics: readonly string[] }) {
  const [pending, start] = useTransition();
  return (
    <select className="mt-1 rounded border border-line px-1 py-0.5 text-[11px]" disabled={pending} value={sub ?? ""} title="보조 주제"
      onChange={(e) => { const v = e.target.value || null; start(async () => { try { await setSubTopic(id, v); } catch (err: any) { alert(err.message); } }); }}>
      <option value="">+ 보조 주제 없음</option>
      {topics.filter((t) => t !== main).map((t) => <option key={t} value={t}>+ {t}</option>)}
    </select>
  );
}
