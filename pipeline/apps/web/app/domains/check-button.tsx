"use client";
import { useState, useTransition } from "react";
import { requestDomainCheck } from "@/app/actions";
import { btnCls } from "@/components/ui";

/** 소스 풀 확인 항목 ①~④ 자동 수집 요청 — AI 없이 HTTP만 쓰는 IO 작업. 판정은 여전히 사람이 한다. */
export function CheckButton({ unchecked, total }: { unchecked: number; total: number }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const run = (onlyUnchecked: boolean) => start(async () => {
    try { await requestDomainCheck(null, onlyUnchecked); setMsg(`확인 작업 큐에 넣음 (${onlyUnchecked ? unchecked : total}곳) — 워커가 돌면 몇 분 안에 결과가 채워집니다`); }
    catch (e: any) { setMsg(e.message); }
  });
  return (
    <div className="flex items-center gap-2">
      <button className={btnCls(unchecked > 0 ? "primary" : "ghost")} disabled={pending || total === 0} onClick={() => run(unchecked > 0)}>
        {unchecked > 0 ? `확인 항목 자동 수집 (미확인 ${unchecked}곳)` : `전부 확인됨 · 다시 수집 (${total}곳)`}
      </button>
      {msg && <span className="text-[11px] text-ink-soft">{msg}</span>}
    </div>
  );
}
