"use client";
import { useTransition } from "react";
import { confirmGate1Warnings, setSubTopic } from "../actions";
import { btnCls } from "@/components/ui";

/** 글로벌판 게이트 1 조건 4 — 빈 역할·소스 겹침 경고 확인 기록 (명세 6.3, KAN-209) */
export function ConfirmWarningsButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <button className={btnCls()} disabled={pending} onClick={() => { if (confirm(`${id} — 빈 역할·소스 겹침 경고를 확인했고 이대로 진행해도 된다고 기록합니다.`)) start(async () => { try { await confirmGate1Warnings(id); } catch (e: any) { alert(e.message); } }); }}>경고 확인</button>
  );
}

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
