"use client";
import { useState, useTransition } from "react";
import { setThumbnailAnchor } from "../../actions";
import { btnCls } from "@/components/ui";

/**
 * [이 썸네일을 앵커로 지정] (KAN-50) — 이후 모든 생성이 이 그림의 화풍을 참조한다.
 *
 * 이미지 API 에는 seed 가 없어 같은 프롬프트도 매번 화풍이 달라진다. 앵커는 그것을 묶는 유일한
 * 수단이라, **화풍을 맞추는 실험은 사람이 그림을 보며 돌려야 한다** — 그래서 env 가 아니라 화면에 둔다.
 */
export function AnchorButton({ episodeId, isCurrent }: { episodeId: string; isCurrent: boolean }) {
  const [busy, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <button className={btnCls()} disabled={busy}
        title={isCurrent ? "지금 이 에피소드가 앵커입니다 — 다시 누르면 현재 썸네일로 갱신합니다" : "이후 생성이 이 그림의 화풍을 따라갑니다"}
        onClick={() => {
          if (!confirm(`${episodeId} 의 썸네일을 스타일 앵커로 지정합니다.\n\n이후 만들어지는 모든 썸네일이 이 그림의 화풍을 참조해요. 이미 만들어진 썸네일은 바뀌지 않습니다.\n\n진행할까요?`)) return;
          start(async () => {
            try { const r = await setThumbnailAnchor(episodeId); setMsg(`앵커로 지정됨 (${Math.round(r.bytes / 1024)}KB)`); }
            catch (e: any) { setMsg(e.message); }
          });
        }}>
        {busy ? "지정 중…" : isCurrent ? "앵커 갱신" : "이 썸네일을 앵커로 지정"}
      </button>
      {isCurrent && !msg && <span className="text-xs text-brand-ink">현재 앵커</span>}
      {msg && <span className="text-xs text-ink-soft">{msg}</span>}
    </span>
  );
}
