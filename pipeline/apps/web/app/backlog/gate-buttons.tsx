"use client";
import { useTransition } from "react";
import { setBacklogStatus } from "../actions";
import { btnCls } from "@/components/ui";

export function GateButtons({ id, status }: { id: string; status: string }) {
  const [pending, start] = useTransition();
  const go = (s: Parameters<typeof setBacklogStatus>[1]) => start(async () => { try { await setBacklogStatus(id, s); } catch (e: any) { alert(e.message); } });
  if (status === "proposed" || status === "held") return (
    <div className="flex gap-1">
      <button className={btnCls("primary")} disabled={pending} onClick={() => { if (confirm(`${id} 승인 — 워커가 대본 생성을 시작합니다.`)) go("approved"); }}>승인</button>
      {status === "proposed" && <button className={btnCls()} disabled={pending} onClick={() => go("held")}>보류</button>}
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
