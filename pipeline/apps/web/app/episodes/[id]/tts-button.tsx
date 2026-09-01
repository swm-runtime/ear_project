"use client";
import { useTransition } from "react";
import { enqueueJob } from "../../actions";
import { btnCls } from "@/components/ui";

/** TTS 는 자동 연쇄 없음 — 사람이 여기서 명시적으로 요청할 때만 (spec/10 1장). M5 에서 워커 구현. */
export function TtsButton({ episodeId, backlogId, enabled, pending }: { episodeId: string; backlogId: string; enabled: boolean; pending: boolean }) {
  const [busy, start] = useTransition();
  return (
    <button className={btnCls()} disabled={!enabled || pending || busy}
      title={enabled ? "ElevenLabs 합성 요청 (게이트 2 통과 후)" : "QA 통과(qa_passed) 이후에만"}
      onClick={() => { if (confirm(`${episodeId} 를 TTS 로 변환합니다. 구독이 아니라 ElevenLabs 크레딧이 소모됩니다. 진행할까요?`)) start(async () => { try { await enqueueJob("tts", { episode_id: episodeId, backlog_id: backlogId }); } catch (e: any) { alert(e.message); } }); }}>
      {pending ? "TTS 진행 중…" : "TTS 변환"}
    </button>
  );
}
