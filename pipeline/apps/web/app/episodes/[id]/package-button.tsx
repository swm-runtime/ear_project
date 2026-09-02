"use client";
import { useTransition } from "react";
import { enqueueJob } from "../../actions";
import { btnCls } from "@/components/ui";

/** 패키지(upload-meta.json + packaged 전환) 요청 — 자동 연쇄 없음, qa_passed 이후 (spec/07 2장). M5. */
export function PackageButton({ episodeId, backlogId, enabled, pending }: { episodeId: string; backlogId: string; enabled: boolean; pending: boolean }) {
  const [busy, start] = useTransition();
  return (
    <button className={btnCls()} disabled={!enabled || pending || busy}
      title={enabled ? "발행 메타(upload-meta.json) 산출 + packaged 전환 — 게이트 2 검수 대기로" : "QA 통과(qa_passed) 이후에만"}
      onClick={() => start(async () => { try { await enqueueJob("package", { episode_id: episodeId, backlog_id: backlogId }); } catch (e: any) { alert(e.message); } })}>
      {pending ? "패키지 진행 중…" : "패키지"}
    </button>
  );
}
