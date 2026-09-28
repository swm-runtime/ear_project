"use client";
import { useState, useTransition } from "react";
import { enqueueJob } from "../actions";
import { btnCls } from "@/components/ui";

const sel = "rounded border border-line px-2.5 py-1.5 outline-none focus:border-brand";
const box = "flex flex-wrap items-center gap-2 rounded-md border border-line bg-panel p-4 text-[13px] shadow-[0_1px_2px_rgba(38,49,61,0.04)]";

/** 스윕 요청 (모드 A) */
export function SweepForm({ mids }: { mids: string[] }) {
  const [mid, setMid] = useState(mids[0] ?? "");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className={box}>
      <label>중분류</label>
      <select className={sel} value={mid} onChange={(e) => setMid(e.target.value)}>{mids.map((m) => <option key={m}>{m}</option>)}</select>
      <button className={btnCls("primary")} disabled={pending || !mid}
        onClick={() => start(async () => { try { const id = await enqueueJob("sweep", { mid_topic: mid }); setMsg(`스윕 요청됨 (${id.slice(0, 8)}) — 워커가 집으면 진행되고 끝나면 군집화 v2가 이어집니다`); } catch (e: any) { setMsg(e.message); } })}>스윕 요청</button>
      {msg && <span className="text-xs text-ink-soft">{msg}</span>}
    </div>
  );
}

/** 군집화 v2 수동 요청 — 중분류 풀 / 대분류 풀 */
export function ClusterForm({ mids, majorOfMid }: { mids: string[]; majorOfMid: Record<string, string> }) {
  const [mid, setMid] = useState(mids[0] ?? "");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className={box}>
      <label>중분류</label>
      <select className={sel} value={mid} onChange={(e) => setMid(e.target.value)}>{mids.map((m) => <option key={m}>{m}</option>)}</select>
      <button className={btnCls("primary")} disabled={pending || !mid} title="중분류가 속한 대분류 풀 전체에서 축을 찾는다 (spec/03 2장 v2) — 스윕 뒤 자동으로 걸리는 것과 같은 페이로드"
        onClick={() => start(async () => { try { const id = await enqueueJob("cluster", { mid_topic: mid, cluster_version: "v2", major_topic: majorOfMid[mid] }); setMsg(`군집화 v2 요청됨 — 대분류 풀 (${id.slice(0, 8)})`); } catch (e: any) { setMsg(e.message); } })}>군집화 v2 (대분류 풀)</button>
      <button className={btnCls()} disabled={pending || !mid}
        onClick={() => start(async () => { try { const id = await enqueueJob("cluster", { mid_topic: mid, cluster_version: "v2" }); setMsg(`군집화 v2 요청됨 — 중분류 풀 (${id.slice(0, 8)})`); } catch (e: any) { setMsg(e.message); } })}>군집화 v2 (중분류 풀)</button>
      {msg && <span className="text-xs text-ink-soft">{msg}</span>}
    </div>
  );
}

/** 주제 기획 (모드 B-②): 중분류 + 주제 한 줄 (+ 메모) → sweep {mode:"B2"} */
export function TopicSeedForm({ mids }: { mids: string[] }) {
  const [mid, setMid] = useState(mids[0] ?? "");
  const [topic, setTopic] = useState("");
  const [hint, setHint] = useState("");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const ok = mid && topic.trim().length >= 4;
  return (
    <div className="space-y-3 rounded-md border border-line bg-panel p-4 text-[13px] shadow-[0_1px_2px_rgba(38,49,61,0.04)]">
      <div className="flex flex-wrap items-center gap-2">
        <label>중분류</label>
        <select className={sel} value={mid} onChange={(e) => setMid(e.target.value)}>{mids.map((m) => <option key={m}>{m}</option>)}</select>
      </div>
      <label className="block">
        <span className="mb-1 block text-xs font-semibold text-ink-soft">주제 (제목안 한 줄) *</span>
        <input className={`${sel} w-full`} maxLength={120} placeholder="예: 잠을 충분히 자도 피곤한 이유 — 수면의 양이 아니라 리듬의 문제" value={topic} onChange={(e) => setTopic(e.target.value)} />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-semibold text-ink-soft">메모 (선택 — 축 힌트, 꼭 넣을 근거, 피할 방향)</span>
        <textarea className={`${sel} w-full`} rows={2} maxLength={400} value={hint} onChange={(e) => setHint(e.target.value)} />
      </label>
      <div className="flex items-center gap-2">
        <button className={btnCls("primary")} disabled={pending || !ok}
          onClick={() => start(async () => { try { const id = await enqueueJob("sweep", { mode: "B2", mid_topic: mid, topic: topic.trim(), ...(hint.trim() ? { hint: hint.trim() } : {}) }); setMsg(`주제 기획 요청됨 (${id.slice(0, 8)}) — 노트북 Claude 워커가 집으면 백로그에 🔎 후보가 보류로 생기고, 판정이 끝나면 승인 대기로 올라갑니다`); setTopic(""); setHint(""); } catch (e: any) { setMsg(e.message); } })}>소스 찾아 후보 만들기</button>
        {msg && <span className="text-xs text-ink-soft">{msg}</span>}
      </div>
    </div>
  );
}
