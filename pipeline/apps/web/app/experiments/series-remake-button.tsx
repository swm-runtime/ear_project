"use client";
import { useTransition } from "react";
import { btnCls } from "@/components/ui";
import { requestSeriesRemake } from "./actions";

/** [시리즈 짧게 다시 만들기] — 원본 시리즈 하나를 통째로 짧은 판으로 (0041) */
export function SeriesRemakeButton({ id, name, total }: { id: string; name: string; total: number }) {
  const [pending, start] = useTransition();
  return (
    <button className={btnCls()} disabled={pending} onClick={() => {
      if (!confirm(`"${name}" ${total}편을 짧은 판(5~12분) 시리즈로 다시 만듭니다. 편마다 설계·대본·QA·비평·TTS 가 화 순서대로 돌아갑니다. 계속할까요?`)) return;
      start(async () => { const r = await requestSeriesRemake(id); if (!r.ok) alert(r.reason); });
    }}>시리즈 짧게 다시 만들기</button>
  );
}
