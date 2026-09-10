"use client";
import { useTransition } from "react";
import { enqueueJob } from "../../actions";
import { btnCls } from "@/components/ui";

/**
 * 썸네일 생성 요청 (KAN-50) — OpenAI 이미지 API. 사람이 명시적으로 누를 때만 돈다.
 *
 * **이미 있으면 워커가 건너뛴다.** 다시 만들려면 `force` 로 그 규칙을 무시한다 —
 * 생성 1회가 곧 과금이라 모르는 사이에 다시 만들어지는 일이 없어야 한다.
 */
export function ThumbnailButton({
  episodeId, backlogId, enabled, pending, exists,
}: { episodeId: string; backlogId: string; enabled: boolean; pending: boolean; exists: boolean }) {
  const [busy, start] = useTransition();
  const label = exists ? "썸네일 다시 만들기" : "썸네일 생성";
  return (
    <button className={btnCls()} disabled={!enabled || pending || busy}
      title={enabled ? "OpenAI 이미지 API 로 1024×1024 PNG 1장 — 편당 과금" : "QA 통과(qa_passed) 이후에만"}
      onClick={() => {
        const msg = exists
          ? `${episodeId} 의 썸네일을 다시 만듭니다. 기존 이미지를 덮어쓰고 새로 과금됩니다. 진행할까요?`
          : `${episodeId} 의 썸네일을 생성합니다. OpenAI 이미지 API 가 편당 과금됩니다. 진행할까요?`;
        if (!confirm(msg)) return;
        start(async () => {
          try { await enqueueJob("thumbnail", { episode_id: episodeId, backlog_id: backlogId, force: exists }); }
          catch (e: any) { alert(e.message); }
        });
      }}>
      {pending ? "썸네일 생성 중…" : label}
    </button>
  );
}
