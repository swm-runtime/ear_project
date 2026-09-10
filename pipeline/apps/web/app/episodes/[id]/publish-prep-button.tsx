"use client";
import { useTransition } from "react";
import { enqueueJob } from "../../actions";
import { btnCls } from "@/components/ui";

/**
 * [발행 준비] (KAN-50 1번) — 누르면 `tts → thumbnail → package` 가 자동으로 이어진다.
 *
 * 종전에는 [TTS 변환]·[패키지]를 따로 눌렀고 그 사이에 썸네일을 파이프라인 밖에서 만들었다.
 * 세 번의 개입을 한 번으로 줄이는 것이 이 버튼의 목적이다.
 *
 * **이미 있는 산출물은 건너뛴다.** 음원은 대본이 그 뒤로 바뀌었을 때만 다시 만들고, 썸네일은
 * 있으면 그대로 쓴다 — 둘 다 과금 단계라 모르는 사이에 다시 도는 일이 없어야 한다.
 * 개별 강제 재실행은 각 산출물 탭의 버튼이 담당한다.
 */
export function PublishPrepButton({
  episodeId, backlogId, enabled, pending,
}: { episodeId: string; backlogId: string; enabled: boolean; pending: boolean }) {
  const [busy, start] = useTransition();
  return (
    <button className={btnCls("primary")} disabled={!enabled || pending || busy}
      title={enabled ? "TTS → 썸네일 → 패키지를 자동으로 이어서 실행 (이미 있는 산출물은 건너뜀)" : "QA 통과(qa_passed) 이후에만"}
      onClick={() => {
        if (!confirm(`${episodeId} 의 발행 준비를 시작합니다.\n\nTTS → 썸네일 → 패키지가 이어서 실행돼요. 이미 있는 산출물은 건너뜁니다.\n음원(ElevenLabs)과 썸네일(OpenAI)은 새로 만들 때만 과금됩니다.\n\n진행할까요?`)) return;
        start(async () => {
          try {
            await enqueueJob("tts", {
              episode_id: episodeId, backlog_id: backlogId,
              chain: ["thumbnail", "package"],
            });
          } catch (e: any) { alert(e.message); }
        });
      }}>
      {pending ? "발행 준비 중…" : "발행 준비"}
    </button>
  );
}
