"use client";
import { useTransition } from "react";
import { btnCls } from "@/components/ui";
import { setBacklogStatus } from "../actions";

/** 재제작 후보 행 — [반려]: 잘못 만들어졌거나 실패한 짧은 판을 반려한다. 반려하면 원본이 다시 [짧게 다시 만들기] 대상이 된다 */
export function RemakeRowActions({ id, status }: { id: string; status: string }) {
  const [pending, start] = useTransition();
  if (["rejected", "published"].includes(status)) return null;
  return (
    <button className={btnCls("danger")} disabled={pending} onClick={() => { if (confirm(`${id} 짧은 판을 반려합니다. 원본은 다시 고를 수 있습니다.`)) start(async () => { try { await setBacklogStatus(id, "rejected"); } catch (e: any) { alert(e.message); } }); }}>반려</button>
  );
}
