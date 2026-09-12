"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelJob } from "../actions";
import { btnCls } from "@/components/ui";

/** 작업 취소 — 대기 중은 즉시, 진행 중은 워커가 15초 안에 claude 프로세스를 끊는다 (2026-09-12) */
export function CancelButton({ id, status, type }: { id: string; status: string; type: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  if (!["queued", "claimed", "running"].includes(status)) return null;
  const running = status !== "queued";
  return (
    <button className={btnCls("danger")} disabled={pending} title={running ? "워커가 15초 안에 실행을 끊습니다. 지금까지 쓴 비용은 그대로입니다" : "큐에서 뺍니다"}
      onClick={() => { if (!confirm(`${type} ${id.slice(0, 8)} 을(를) 취소할까요?${running ? "\n\n진행 중인 실행을 끊습니다. 초안이면 백로그가 승인 대기로 돌아갑니다." : ""}`)) return; start(async () => { try { await cancelJob(id); router.refresh(); } catch (e) { alert(e instanceof Error ? e.message : String(e)); } }); }}>
      {pending ? "취소 중…" : "취소"}
    </button>
  );
}
