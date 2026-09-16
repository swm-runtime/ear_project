"use client";
import { useState, useTransition } from "react";
import { saveOneLiner } from "../../actions";
import { btnCls } from "@/components/ui";

/**
 * 한 줄 요약 편집 (KAN-50 3-1) — 썸네일 프롬프트의 `{핵심 개념}`이자 발행 메타 설명 첫 줄.
 *
 * 대본 작성이 내주지만 **사람이 고칠 수 있어야 한다** — 이 문장 하나가 썸네일 그림과 앱의 설명을
 * 동시에 결정하는데, 모델이 늘 청취자 언어로 쓰지는 않는다. 고치면 **다음 썸네일 생성부터** 반영된다.
 */
export function OneLinerEditor({ episodeId, initial }: { episodeId: string; initial: string | null }) {
  const [value, setValue] = useState(initial ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const over = value.trim().length > 40;
  return (
    <div className="rounded-md border border-line bg-panel px-4 py-3 text-[13px]">
      <div className="mb-1 flex items-center gap-2">
        <span className="font-medium">한 줄 요약</span>
        <span className={`text-xs ${over ? "text-amber-700" : "text-ink-soft"}`}>{value.trim().length}/40자</span>
        <span className="text-xs text-ink-soft">— 썸네일 그림의 소재이자 발행 설명 첫 줄</span>
      </div>
      <div className="flex gap-2">
        <input className="flex-1 rounded border border-line px-2.5 py-1.5 outline-none focus:border-brand"
          placeholder="이 편의 축을 청취자 언어로 (예: 소득이 끊겨도 버티는 현금흐름 구조)"
          value={value} onChange={(e) => { setValue(e.target.value); setMsg(null); }} />
        <button className={btnCls("primary")} disabled={busy || value.trim() === (initial ?? "")}
          onClick={() => start(async () => {
            try { await saveOneLiner(episodeId, value); setMsg("저장됨 — 다음 썸네일 생성부터 반영"); }
            catch (e: any) { setMsg(e.message); }
          })}>저장</button>
      </div>
      {over && <p className="mt-1 text-xs text-amber-700">40자를 넘으면 썸네일에서 개념이 흐려지고 설명 첫 줄도 잘립니다.</p>}
      {!initial && <p className="mt-1 text-xs text-ink-soft">비어 있으면 썸네일 생성이 설계 축으로 대신합니다 (구 방식 초안).</p>}
      {msg && <p className="mt-1 text-xs text-ink-soft">{msg}</p>}
    </div>
  );
}
