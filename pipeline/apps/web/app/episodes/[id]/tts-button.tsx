"use client";
import { useTransition } from "react";
import { enqueueJob } from "../../actions";
import { btnCls } from "@/components/ui";

/**
 * [음원 다시 변환] — 음원 탭에 둔다(KAN-50 1번, 요청자 2026-09-10: "따로 다시 뽑아야 하는 경우가 생긴다").
 *
 * 상단 [발행 준비]와 달리 **건너뛰기 규칙을 무시하고 강제로 다시 합성한다.** 끝나면 패키지가
 * 자동으로 따라온다 — `upload-meta.json` 이 새 음원을 가리켜야 하기 때문이다.
 * **썸네일은 건드리지 않는다.** 연쇄에 넣으면 음원만 고치려는 사람이 썸네일까지 재과금하게 된다.
 */
export function TtsButton({ episodeId, backlogId, enabled, pending }: { episodeId: string; backlogId: string; enabled: boolean; pending: boolean }) {
  const [busy, start] = useTransition();
  return (
    <button className={btnCls()} disabled={!enabled || pending || busy}
      title={enabled ? "건너뛰기 규칙을 무시하고 다시 합성 — 끝나면 패키지가 자동으로 따라옵니다" : "QA 통과(qa_passed) 이후에만"}
      onClick={() => { if (confirm(`${episodeId} 의 음원을 다시 변환합니다.\n\n대본이 바뀌지 않았어도 강제로 다시 합성하며 ElevenLabs 크레딧이 소모됩니다. 썸네일은 그대로 두고 패키지만 다시 만들어요.\n\n진행할까요?`)) start(async () => { try { await enqueueJob("tts", { episode_id: episodeId, backlog_id: backlogId, force: true, chain: ["package"] }); } catch (e: any) { alert(e.message); } }); }}>
      {pending ? "음원 변환 중…" : "음원 다시 변환"}
    </button>
  );
}
