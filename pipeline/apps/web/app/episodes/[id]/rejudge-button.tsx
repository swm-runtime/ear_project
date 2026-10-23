"use client";
import { useTransition } from "react";
import { enqueueJob } from "../../actions";
import { btnCls } from "@/components/ui";

/**
 * [재판정] (글로벌, 2026-10-23 박수헌) — 판정 루프(judge_loop)를 다시 건다. 한국판 [QA 다시]에 해당하는 동작이 글로벌엔 없어 실패·미달 편을 스크립트로만 다시 돌렸다.
 * 현재 script.md(이전 루프의 최고판)에서 0회차부터 다시 돈다. 편당 $1.5~2, 35~50분.
 */
export function RejudgeButton({ episodeId, backlogId, disabled, reason }: { episodeId: string; backlogId: string; disabled?: boolean; reason?: string }) {
  const [busy, start] = useTransition();
  return (
    <button className={btnCls("ghost")} disabled={disabled || busy} title={disabled ? reason ?? "" : "판정·재작성 루프를 현재 대본에서 다시 돌립니다 (GPT, 편당 $1.5~2 · 35~50분)"}
      onClick={() => {
        if (!confirm(`${episodeId} 재판정 — 현재 대본에서 판정 루프를 다시 돌립니다.\n\n편집자 3회 채점 · 한국어·사실 검토 · 재작성 최대 3회차. GPT 비용 $1.5~2, 35~50분.\n통과하면 발행 준비가 자동으로 이어집니다.\n\n진행할까요?`)) return;
        start(async () => { try { await enqueueJob("judge_loop", { episode_id: episodeId, backlog_id: backlogId }); } catch (e: any) { alert(e.message); } });
      }}>
      {busy ? "등록 중…" : "재판정"}
    </button>
  );
}
