"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteEpisode } from "../../actions";
import { btnCls } from "@/components/ui";

/** 에피소드 삭제 (0015) — 사유와 후보 처리(재승인 대기 / 반려)를 받고 지운다. 발행됨·회귀 세트·진행 중 작업은 서버가 막는다 */
export function DeleteButton({ episodeId, backlogId, disabled, disabledReason }: { episodeId: string; backlogId: string; disabled?: boolean; disabledReason?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function run() {
    const reason = prompt(`${episodeId} 을(를) 지웁니다. 대본·QA·비평·오디오 산출물이 함께 삭제됩니다.\n\n사유 (백로그 ${backlogId} 메모에 남습니다):`);
    if (reason === null) return;
    const rejectToo = confirm(`후보 ${backlogId} 도 반려할까요?\n\n[확인] 반려 — 다시 만들지 않는다\n[취소] 재승인 대기로 되돌린다 — 승인하면 새 에피소드로 다시 만든다`);
    setBusy(true);
    try {
      const r = await deleteEpisode(episodeId, { backlogTo: rejectToo ? "rejected" : "proposed", reason });
      alert(`${episodeId} 삭제 완료 — 후보 ${r.backlog_id} → ${r.backlog_status === "rejected" ? "반려" : "재승인 대기"} · 대기 작업 취소 ${r.cancelled_jobs}건 · ${r.storage}`);
      router.push("/episodes");
    } catch (e) { alert((e as Error).message); setBusy(false); }
  }
  return (
    <button className={btnCls("danger")} disabled={disabled || busy} title={disabled ? disabledReason : "에피소드와 산출물을 지우고 후보를 되돌린다"} onClick={() => void run()}>
      {busy ? "삭제 중…" : "삭제"}
    </button>
  );
}
