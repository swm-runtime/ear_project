"use client";
import { useState, useTransition } from "react";
import { savePronunciations } from "../../actions";
import { btnCls } from "@/components/ui";

/**
 * 에피소드 발음 맵 편집 (spec/06 6장) — TTS 병합 사전의 에피소드 층. 대본 단계가 생성하고 사람이 여기서 보정한다.
 * 전역 사전(/assets 의 TTS 음차 사전)과 겹치는 표기는 전역이 이긴다 — 공용 항목은 전역으로 승격해 쌓는다.
 */
export function PronEditor({ episodeId, initial }: { episodeId: string; initial: string | null }) {
  const [text, setText] = useState(initial ?? "{}");
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, start] = useTransition();
  return (
    <div className="space-y-3">
      <div className="rounded-md border border-line bg-panel p-4">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-[13px] font-medium">pronunciations.json — 비한글 표기 → 한글 발음 ({"{"}&quot;표기&quot;: &quot;발음&quot;{"}"})</div>
          <button className={btnCls()} disabled={busy}
            onClick={() => start(async () => {
              try { const r = await savePronunciations(episodeId, text); setSaved(`${r.count}건 저장됨 — 다음 TTS 합성부터 적용`); }
              catch (e: any) { setSaved(null); alert(e.message); }
            })}>
            {busy ? "저장 중…" : "저장"}
          </button>
        </div>
        <textarea className="h-80 w-full rounded border border-line p-3 font-mono text-[12px] leading-relaxed outline-none focus:border-brand" spellCheck={false}
          value={text} onChange={(e) => { setText(e.target.value); setSaved(null); }} />
        {saved && <p className="mt-2 text-[12px] text-emerald-700">{saved}</p>}
      </div>
      <p className="text-xs text-ink-soft">
        정규화 후 잔존 에러가 뜨면 여기(이 에피소드 전용) 또는 <a className="text-brand underline" href="/assets/skills/tts/pronunciation.json">전역 음차 사전</a>(재등장하는 공용 항목)에 추가하고 TTS 를 다시 요청한다 — 코드 배포 불필요.
        겹치는 표기는 전역 사전 값이 우선한다 (spec/06 6장).
      </p>
    </div>
  );
}
