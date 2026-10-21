"use client";
import { useState, useTransition } from "react";
import { requestPoolDiscover } from "@/app/actions";
import { btnCls } from "@/components/ui";

/** 소스 풀 채우기 (스윕 모드 P, 2026-10-21) — 중분류(+메모)를 주면 워커가 웹 검색으로 발행처를 찾아 후보(candidate)로 올린다. 판정은 여전히 사람이 한다. */
export function DiscoverForm({ mids }: { mids: string[] }) {
  const [mid, setMid] = useState(mids[0] ?? "");
  const [hint, setHint] = useState("");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const inp = "rounded border border-line bg-panel px-2.5 py-1.5 text-[13px] outline-none focus:border-brand";
  return (
    <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); start(async () => { try { const id = await requestPoolDiscover({ midTopic: mid, hint }); setMsg(`소스 풀 채우기 요청됨 (${id.slice(0, 8)}) — 서버 워커가 검색 8회로 발행처를 찾아 판정 대기에 올립니다. 결과는 작업 화면과 판정 대기 탭에서`); } catch (err: any) { setMsg(err.message); } }); }}>
      <select className={inp} value={mid} onChange={(e) => setMid(e.target.value)} disabled={!mids.length}>{mids.map((m) => <option key={m}>{m}</option>)}</select>
      <input className={`${inp} w-72`} placeholder="메모 (선택) — 예: 학회·연구기관 위주, 영어 사이트도" value={hint} onChange={(e) => setHint(e.target.value)} />
      <button className={btnCls("primary")} disabled={pending || !mid}>소스 풀 채우기</button>
      {msg && <span className="basis-full text-[11px] text-ink-soft">{msg}</span>}
    </form>
  );
}
