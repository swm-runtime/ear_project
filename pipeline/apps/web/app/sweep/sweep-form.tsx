"use client";
import { useState, useTransition } from "react";
import { enqueueJob } from "../actions";
import { btnCls } from "@/components/ui";

export function SweepForm({ mids }: { mids: string[] }) {
  const [mid, setMid] = useState(mids[0] ?? "");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-line bg-panel p-4 text-[13px] shadow-[0_1px_2px_rgba(38,49,61,0.04)]">
      <label>중분류</label>
      <select className="rounded border border-line px-2.5 py-1.5 outline-none focus:border-brand" value={mid} onChange={(e) => setMid(e.target.value)}>{mids.map((m) => <option key={m}>{m}</option>)}</select>
      <button className={btnCls("primary")} disabled={pending || !mid}
        onClick={() => start(async () => { try { const id = await enqueueJob("sweep", { mid_topic: mid }); setMsg(`스윕 요청됨 (${id.slice(0, 8)}) — 워커가 집으면 진행됩니다`); } catch (e: any) { setMsg(e.message); } })}>스윕 요청</button>
      <button className={btnCls()} disabled={pending || !mid}
        onClick={() => start(async () => { try { const id = await enqueueJob("cluster", { mid_topic: mid }); setMsg(`군집화만 재실행 요청됨 (${id.slice(0, 8)})`); } catch (e: any) { setMsg(e.message); } })}>군집화만 재실행</button>
      {msg && <span className="text-xs text-ink-soft">{msg}</span>}
    </div>
  );
}
