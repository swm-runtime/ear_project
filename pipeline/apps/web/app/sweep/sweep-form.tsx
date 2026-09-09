"use client";
import { useState, useTransition } from "react";
import { enqueueJob } from "../actions";
import { btnCls } from "@/components/ui";

export function SweepForm({ mids, majorOfMid }: { mids: string[]; majorOfMid: Record<string, string> }) {
  const [mid, setMid] = useState(mids[0] ?? "");
  const majorOf = (m: string) => majorOfMid[m];
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
      <button className={btnCls()} disabled={pending} title="군집화 v2 — 축(대립·역설·재정의)을 먼저 세우고 역할·다양성으로 후보를 만든다. 중분류가 속한 대분류 풀 전체에서 찾는다 (spec/03 2장 v2)"
        onClick={() => start(async () => { try { const id = await enqueueJob("cluster", { mid_topic: mid, cluster_version: "v2", major_topic: majorOf(mid) }); setMsg(`군집화 v2 요청됨 — 대분류 풀 (${id.slice(0, 8)})`); } catch (e: any) { setMsg(e.message); } })}>군집화 v2 (축 먼저)</button>
      {msg && <span className="text-xs text-ink-soft">{msg}</span>}
    </div>
  );
}
