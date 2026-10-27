"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { btnCls } from "@/components/ui";
import { replanSeriesEpisode, restoreSeriesEpisode } from "../actions";

/** 편 후보 표의 행 버튼 (spec/11 4장, 2026-10-27) — 반려·보류된 편을 같은 화 번호로 [다시 기획]하거나, 반려를 [보류로] 되돌려 백로그의 [보강]·[승인]으로 살린다. 승인된 시리즈(첫 발행 전)에서만 */
export function SeriesEpisodeActions({ seriesId, backlogId, no, status }: { seriesId: string; backlogId: string; no: number; status: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const run = (f: () => Promise<{ ok: boolean; reason?: string }>, done: string) => start(async () => { const r = await f(); setMsg(r.ok ? done : r.reason ?? "실패"); if (r.ok) router.refresh(); });
  if (!["rejected", "held", "proposed"].includes(status)) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <button className={btnCls()} disabled={pending} title="설계안의 제목·범위 그대로 주제 기획(B-②)을 다시 건다. 이 화의 남은 후보는 반려로 정리한다 ($1.5 안팎)"
        onClick={() => { if (confirm(`${no}화를 다시 기획합니다 — 설계안 그대로 주제 기획 작업을 새로 걸고, 이 화의 남은 후보(${backlogId})는 반려로 정리합니다.`)) run(() => replanSeriesEpisode(seriesId, no), "다시 기획 요청 — 서버 워커가 집으면 새 후보가 생긴다"); }}>다시 기획</button>
      {status === "rejected" && (
        <button className={btnCls()} disabled={pending} title="반려를 보류로 되돌린다 — 백로그에서 [보강]·[승인]할 수 있다"
          onClick={() => run(() => restoreSeriesEpisode(seriesId, backlogId), "보류로 되돌렸다 — 백로그에서 [보강]·[승인]")}>보류로</button>
      )}
      {msg && <span className="text-[11px] text-ink-soft">{msg}</span>}
    </span>
  );
}
