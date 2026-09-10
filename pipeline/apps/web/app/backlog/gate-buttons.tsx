"use client";
import { useTransition } from "react";
import { requestReinforce, setBacklogStatus } from "../actions";
import { btnCls } from "@/components/ui";

export function GateButtons({ id, status, reinforce }: { id: string; status: string; reinforce?: { eligible: boolean; running: boolean } }) {
  const [pending, start] = useTransition();
  const go = (s: Parameters<typeof setBacklogStatus>[1]) => start(async () => { try { await setBacklogStatus(id, s); } catch (e: any) { alert(e.message); } });
  if (status === "proposed" || status === "held") return (
    <div className="flex gap-1">
      <button className={btnCls("primary")} disabled={pending} onClick={() => { if (confirm(`${id} 승인 — 워커가 대본 생성을 시작합니다.`)) go("approved"); }}>승인</button>
      {status === "proposed" && <button className={btnCls()} disabled={pending} onClick={() => go("held")}>보류</button>}
      {reinforce?.running && <span className="inline-flex items-center rounded bg-blue-50 px-2 py-1 text-[11px] font-medium text-blue-700 ring-1 ring-inset ring-blue-200">보강 중</span>}
      {reinforce?.eligible && !reinforce.running && (
        <button className={btnCls()} disabled={pending} title="빈 역할(없으면 발행처 다양화)을 웹 검색으로 채우고 이 후보만 재판정 (후보당 1회, $1.5 안팎)" onClick={() => { if (confirm(`${id} 보강 — ${status === "held" ? "빈 역할을" : "다른 발행처의 근거를"} 웹 검색으로 채우고 재판정합니다 (후보당 1회, $1.5 안팎).`)) start(async () => { try { await requestReinforce(id); } catch (e: any) { alert(e.message); } }); }}>보강</button>
      )}
      <button className={btnCls("danger")} disabled={pending} onClick={() => { if (confirm(`${id} 반려?`)) go("rejected"); }}>반려</button>
    </div>
  );
  if (status === "review_required") return (
    <div className="flex gap-1">
      <button className={btnCls("primary")} disabled={pending} onClick={() => { if (confirm("사람 수정 완료 — QA 통과 처리?")) go("qa_passed"); }}>QA 통과 처리</button>
      <button className={btnCls("danger")} disabled={pending} onClick={() => { if (confirm(`${id} 반려?`)) go("rejected"); }}>반려</button>
    </div>
  );
  return null;
}
