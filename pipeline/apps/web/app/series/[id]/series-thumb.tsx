"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { btnCls, Panel } from "@/components/ui";
import { saveSeriesThumb } from "../actions";

const inp = "w-full rounded border border-line px-2 py-1 text-[12.5px] outline-none focus:border-brand";

/**
 * 시리즈 썸네일 글자 칸 (2026-10-20, KAN-136) — 시리즈의 모든 편이 같은 그림에 번호만 다르다(레퍼런스 "이어 · KEYWORD SERIES · keyword · 경제편 · 01").
 * 큰 단어는 이미지 모델이 바탕에 손글씨로 그리고(바뀌면 바탕을 다시 그린다), 라벨·박스·번호·표지 편수는 코드가 얹는다.
 */
export function SeriesThumb({ id, word: w0, label: l0, box: b0, hasBase }: { id: string; word: string; label: string; box: string; hasBase: boolean }) {
  const router = useRouter();
  const [word, setWord] = useState(w0);
  const [label, setLabel] = useState(l0);
  const [box, setBox] = useState(b0);
  const [msg, setMsg] = useState<{ text: string; bad: boolean } | null>(null);
  const [pending, start] = useTransition();
  const dirty = word !== w0 || label !== l0 || box !== b0;
  const save = (regenerate: boolean) => start(async () => {
    const r = await saveSeriesThumb(id, { word, label, box }, regenerate);
    setMsg(r.ok ? { text: regenerate ? `저장 · 편 썸네일 ${r.queued}개 다시 만들기 작업을 걸었다${word !== w0 ? " — 큰 단어가 바뀌어 바탕을 새로 그린다" : " — 바탕은 그대로, 글자만 다시 얹는다"}` : `저장${word !== w0 ? " — 다음 썸네일이 바탕을 새로 그린다" : ""}`, bad: false } : { text: r.reason, bad: true });
    if (r.ok) router.refresh();
  });
  return (
    <Panel title="시리즈 썸네일" right={<span className="text-[11px] text-ink-soft">{hasBase ? "바탕 그림 있음 — 편마다 번호만 얹는다" : "바탕 그림 없음 — 첫 편 썸네일이 그린다"}</span>}>
      <div className="space-y-2 text-[13px]">
        <div className="grid gap-2 md:grid-cols-3">
          <label className="block"><span className="mb-1 block text-xs font-semibold text-ink-soft">큰 단어 (영문 손글씨 — 그림에 그린다)</span><input className={inp} value={word} maxLength={16} onChange={(e) => setWord(e.target.value)} placeholder="keyword" /></label>
          <label className="block"><span className="mb-1 block text-xs font-semibold text-ink-soft">오른쪽 위 라벨</span><input className={inp} value={label} maxLength={24} onChange={(e) => setLabel(e.target.value)} placeholder="KEYWORD SERIES" /></label>
          <label className="block"><span className="mb-1 block text-xs font-semibold text-ink-soft">왼쪽 아래 박스</span><input className={inp} value={box} maxLength={12} onChange={(e) => setBox(e.target.value)} placeholder="경제편" /></label>
        </div>
        <p className="text-[11px] text-ink-soft">편 썸네일은 왼쪽 아래에 번호(01·02…), 시리즈 표지는 오른쪽 위 라벨 아래에 편수를 얹는다. 로고는 고정이다.</p>
        <div className="flex flex-wrap items-center gap-2">
          <button className={btnCls()} disabled={pending || !dirty} onClick={() => save(false)}>저장</button>
          <button className={btnCls("primary")} disabled={pending} onClick={() => { if (confirm(`이 시리즈에서 썸네일이 있는 편을 전부 다시 만들까요?${word !== w0 ? "\n큰 단어가 바뀌어 바탕 그림을 새로 그린다(이미지 1장)." : "\n바탕은 그대로 두고 글자만 다시 얹는다(이미지 생성 없음)."}`)) save(true); }}>저장하고 편 썸네일 다시 만들기</button>
          {msg && <span className={`text-[12px] ${msg.bad ? "text-rose-700" : "text-emerald-700"}`}>{msg.text}</span>}
        </div>
      </div>
    </Panel>
  );
}
