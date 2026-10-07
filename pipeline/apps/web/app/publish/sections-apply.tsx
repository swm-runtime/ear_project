"use client";
import { useState } from "react";
import { EarContent, listEarContents, republishEarContent } from "@/lib/ear";
import { readScriptSegments, republishPlans } from "../actions";
import { btnCls } from "@/components/ui";
import { earErrMsg } from "./ear-connect";

/**
 * 구간 일괄 반영 (KAN-152, 2026-10-07) — 서비스 중인 콘텐츠 전부에 구간의 구역(kind)·요약(summary)을 싣는다.
 * 행마다의 [자막 반영]과 같은 경로: `script_file` 단독 PATCH — 콘텐츠 버전이 오르지 않고 재생 위치가 보존된다(admin-api 4.10).
 * - 보낼 본문은 `lib/script-file.ts`(구간 + `lib/section-details.ts` 스위치)가 만든다 — 업로드·재발행과 같다
 * - **발행 이후 오디오를 다시 만든 편은 뺀다** — 파이프라인 자막·구간 시각이 앱에 나가 있는 오디오와 다른 렌더다(spec/07 "[자막 반영]은 같은 렌더일 때만")
 * - 발행 준비가 도는 편·에피소드 연결이 없는 편(수동 업로드)·요약 없는 편도 뺀다. 한 편씩 순서대로 보낸다
 */
export function SectionsApplyButton({ disabled, onDone }: { disabled: boolean; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function run() {
    setBusy(true); setMsg("대상 확인 중…");
    try {
      const all: EarContent[] = [];
      for (let off = 0; ; off += 50) { const d = await listEarContents("published", off, 50); all.push(...d.items); if (off + 50 >= d.total || d.items.length === 0) break; }
      const plans = await republishPlans(all.map((c) => c.id));
      const skip = { noEpisode: 0, busy: 0, newAudio: 0, noSummary: 0 };
      const targets: { c: EarContent; text: string; sections: number }[] = [];
      for (const c of all) {
        const p = plans[c.id];
        if (!p?.episodeId) { skip.noEpisode++; continue; }
        if (p.busy) { skip.busy++; continue; }
        if (p.audio) { skip.newAudio++; continue; }
        const text = await readScriptSegments(p.episodeId);
        let sections: { summary?: string }[] = [];
        try { const v = text ? JSON.parse(text) : null; sections = Array.isArray(v?.sections) ? v.sections : []; } catch { sections = []; }
        if (!text || !sections.some((s) => s.summary)) { skip.noSummary++; continue; }
        targets.push({ c, text, sections: sections.length });
      }
      const skipNote = [skip.newAudio && `오디오를 다시 만든 편 ${skip.newAudio}`, skip.busy && `발행 준비 중 ${skip.busy}`, skip.noEpisode && `에피소드 연결 없음 ${skip.noEpisode}`, skip.noSummary && `구간 요약 없음 ${skip.noSummary}`].filter(Boolean).join(" · ");
      if (!targets.length) { setMsg(`보낼 편이 없어요${skipNote ? ` (뺀 편: ${skipNote})` : ""}`); return; }
      if (!confirm([
        `서비스 중인 콘텐츠 ${targets.length}편에 구간의 구역·요약을 반영할까요?`,
        "",
        "· 대본 파일(script_file)만 보내요 — 콘텐츠 버전이 오르지 않고 앱 재생 위치가 그대로예요",
        skipNote ? `· 뺀 편: ${skipNote}` : "",
      ].filter((l) => l !== null).join("\n"))) { setMsg(null); return; }

      let ok = 0; const bad: string[] = [];
      for (const [i, t] of targets.entries()) {
        setMsg(`반영 중 ${i + 1}/${targets.length} — ${t.c.title.slice(0, 20)}`);
        try {
          const r = await republishEarContent(t.c.id, { script: new File([t.text], "script-segments.json", { type: "application/json" }) });
          if (r.script_applied) ok++; else bad.push(`${t.c.title.slice(0, 18)}: ${r.script_rejected_reason ?? "거부"}`);
        } catch (e) { bad.push(`${t.c.title.slice(0, 18)}: ${earErrMsg(e)}`); }
      }
      const text = `구간 반영 ${ok}편${bad.length ? ` · 실패 ${bad.length}편` : ""}${skipNote ? ` · 뺀 편: ${skipNote}` : ""}`;
      setMsg(text);
      alert(`${text}${bad.length ? `\n\n실패\n${bad.join("\n")}` : ""}`);
    } catch (e) { setMsg(earErrMsg(e)); }
    finally { setBusy(false); onDone(); }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button className={btnCls()} disabled={disabled || busy} onClick={() => void run()}
        title="서비스 중인 콘텐츠 전부에 구간의 구역(개요·본론·결론)·요약을 보낸다 — script_file 단독, 버전·재생 위치 그대로. 발행 이후 오디오를 다시 만든 편은 뺀다">
        {busy ? "반영 중…" : "구간 일괄 반영"}
      </button>
      {msg && <span className="text-[11px] text-ink-soft">{msg}</span>}
    </span>
  );
}
