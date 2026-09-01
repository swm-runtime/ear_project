"use client";
import { useState, useTransition } from "react";
import { addDomain } from "../actions";
import { btnCls } from "@/components/ui";

export function AddDomainForm({ topics }: { topics: string[] }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ domain: "", publisher: "", category: "", feed_url: "", topic_coverage: "" as string, note: "" });
  const [pending, start] = useTransition();
  if (!open) return <button className={btnCls("primary")} onClick={() => setOpen(true)}>+ 편입 후보 추가</button>;
  const inp = "w-full rounded border border-line px-2.5 py-1.5 text-[13px] outline-none focus:border-brand";
  return (
    <form className="grid gap-2 rounded-md border border-line bg-panel p-4 shadow-[0_1px_2px_rgba(38,49,61,0.04)] md:grid-cols-2" onSubmit={(e) => { e.preventDefault(); start(async () => { try { await addDomain({ domain: f.domain.trim().replace(/^https?:\/\//, "").replace(/\/$/, ""), publisher: f.publisher, category: f.category, feed_url: f.feed_url || null, topic_coverage: f.topic_coverage.split(",").map((s) => s.trim()).filter(Boolean), note: `웹 UI 편입 제안 ${new Date().toISOString().slice(0, 10)}: ${f.note}` }); setOpen(false); } catch (e: any) { alert(e.message); } }); }}>
      <input className={inp} placeholder="호스트 (예: daily.jstor.org — www. 제거, 공유 호스트는 첫 경로까지)" value={f.domain} onChange={(e) => setF({ ...f, domain: e.target.value })} required />
      <input className={inp} placeholder="발행 주체" value={f.publisher} onChange={(e) => setF({ ...f, publisher: e.target.value })} required />
      <input className={inp} placeholder="카테고리 (공공기관 / 상업 매체 / 기업 공식 블로그 …)" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} />
      <input className={inp} placeholder="RSS/Atom URL (없으면 비움 — 모드 B 전용)" value={f.feed_url} onChange={(e) => setF({ ...f, feed_url: e.target.value })} />
      <input className={inp} placeholder={`중분류 (쉼표 구분): ${topics.slice(0, 4).join(", ")}`} value={f.topic_coverage} onChange={(e) => setF({ ...f, topic_coverage: e.target.value })} required />
      <input className={inp} placeholder="판정 단서 (라이선스 표기·약관 관찰 등)" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
      <div className="flex gap-2 md:col-span-2"><button className={btnCls("primary")} disabled={pending}>후보로 등록</button><button type="button" className={btnCls()} onClick={() => setOpen(false)}>취소</button></div>
    </form>
  );
}
