"use client";
import { useCallback, useEffect, useState } from "react";
import { EarApiError, getEarReviewSummary, listEarReviews, type EarReview, type EarReviewSummaryItem } from "@/lib/ear";
import { Badge, Panel, btnCls } from "@/components/ui";
import { earErrMsg } from "./ear-connect";

/** 평균을 믿기에 표본이 작다 — 이보다 적으면 흐리게 (KAN-284 요청 1: 숫자 하나로 판단하지 않게) */
export const REVIEW_SMALL_N = 5;
export const fmtStars = (v: number | null | undefined) => (v == null ? "-" : v.toFixed(1));
/** 후기 API 가 아직 그 서버에 없을 때(운영 배포 전) — 404 를 오류 대신 안내로 */
export const reviewApiMissing = (e: unknown) => e instanceof EarApiError && e.status === 404;

/**
 * 발행 상세의 후기 (KAN-284 — content-review-api.md 4.8 · 4.9). 편별 집계(수·평균·1~5 분포·글 수·버전별)와 글 목록(최신순, 글만 보기).
 * 작성자 계정·닉네임은 API 가 주지 않고 여기서도 그리지 않는다. 원문은 화면 렌더에만 쓰고 저장·로그하지 않는다.
 */
export function ReviewPanel({ contentId, currentVersion }: { contentId: string; currentVersion: number }) {
  const [sum, setSum] = useState<EarReviewSummaryItem | null | undefined>(undefined);
  const [items, setItems] = useState<EarReview[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [textOnly, setTextOnly] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (only: boolean) => {
    setBusy(true);
    try {
      const [s, l] = await Promise.all([getEarReviewSummary({ content_id: contentId }), listEarReviews({ content_id: contentId, has_text: only || undefined, limit: 20 })]);
      setSum(s.items.find((x) => x.content_id === contentId) ?? null); setItems(l.items); setCursor(l.next_cursor); setErr(null);
    } catch (e) { setErr(reviewApiMissing(e) ? "후기 API 가 이 서버에 아직 없다 (백엔드 KAN-279 배포 전)" : earErrMsg(e)); }
    finally { setBusy(false); }
  }, [contentId]);
  useEffect(() => { queueMicrotask(() => void load(textOnly)); }, [load, textOnly]);

  async function more() {
    if (!cursor) return;
    setBusy(true);
    try { const l = await listEarReviews({ content_id: contentId, has_text: textOnly || undefined, cursor, limit: 20 }); setItems((xs) => [...xs, ...l.items]); setCursor(l.next_cursor); }
    catch (e) { setErr(earErrMsg(e)); } finally { setBusy(false); }
  }

  const small = !!sum && sum.reviews < REVIEW_SMALL_N;
  const maxBar = sum ? Math.max(1, ...Object.values(sum.distribution)) : 1;
  return (
    <Panel title="후기" right={<label className="flex items-center gap-1 text-[11px] text-ink-soft"><input type="checkbox" checked={textOnly} onChange={(e) => setTextOnly(e.target.checked)} />글 있는 후기만</label>}>
      {err && <p className="text-[12.5px] text-ink-soft">{err}</p>}
      {!err && sum === undefined && <p className="text-[12.5px] text-ink-soft">불러오는 중…</p>}
      {!err && sum === null && <p className="text-[12.5px] text-ink-soft">아직 후기가 없다.</p>}
      {!err && sum && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-5">
            <div className={small ? "opacity-50" : ""} title={small ? `후기 ${sum.reviews}건 — ${REVIEW_SMALL_N}건 미만이라 평균을 믿기 어렵다` : undefined}>
              <div className="text-[11px] text-ink-soft">평균</div>
              <div className="text-[22px] font-semibold tabular-nums">★ {fmtStars(sum.average_stars)}</div>
            </div>
            <div><div className="text-[11px] text-ink-soft">후기</div><div className="text-[15px] tabular-nums">{sum.reviews}건</div></div>
            <div><div className="text-[11px] text-ink-soft">글</div><div className="text-[15px] tabular-nums">{sum.text_reviews}건</div></div>
            <div><div className="text-[11px] text-ink-soft">끝까지 듣고 씀</div><div className="text-[15px] tabular-nums">{sum.completed_reviews}건</div></div>
            {sum.status !== "published" && <Badge tone="failed">{sum.status}</Badge>}
          </div>
          <div className="space-y-1">
            {(["5", "4", "3", "2", "1"] as const).map((k) => (
              <div key={k} className="flex items-center gap-2 text-[11.5px]">
                <span className="w-6 text-right tabular-nums text-ink-soft">{k}★</span>
                <div className="h-2 flex-1 rounded bg-slate-100"><div className="h-2 rounded bg-brand" style={{ width: `${(sum.distribution[k] / maxBar) * 100}%` }} /></div>
                <span className="w-8 tabular-nums text-ink-soft">{sum.distribution[k]}</span>
              </div>
            ))}
          </div>
          {sum.by_version.length > 1 && (
            <div className="text-[11.5px] text-ink-soft">버전별: {sum.by_version.map((v) => `v${v.content_version} ${v.reviews}건 · ★${fmtStars(v.average_stars)}`).join(" · ")}</div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead><tr className="border-b border-line text-left text-[11px] text-ink-soft">{["별점", "글", "작성일", "시장", "완청", "버전"].map((h) => <th key={h} className="px-2 py-1.5 font-semibold">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-line">
                {items.map((r) => (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap px-2 py-1.5 tabular-nums">{"★".repeat(r.stars)}<span className="text-slate-300">{"★".repeat(5 - r.stars)}</span></td>
                    <td className="px-2 py-1.5">{r.text ?? <span className="text-ink-soft">—</span>}</td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-ink-soft">{r.updated_date}{r.updated_date !== r.created_date ? <span className="ml-1 text-[10.5px]">(처음 {r.created_date})</span> : null}</td>
                    <td className="px-2 py-1.5 text-ink-soft">{r.market === "kr" ? "국내" : "글로벌"}</td>
                    <td className="px-2 py-1.5 text-ink-soft">{r.is_completed ? "예" : "아니오"}</td>
                    <td className="whitespace-nowrap px-2 py-1.5">{r.content_version !== currentVersion ? <span className="text-amber-700" title="재발행 전 버전에 쓴 후기">v{r.content_version} (이전)</span> : <span className="text-ink-soft">v{r.content_version}</span>}</td>
                  </tr>
                ))}
                {items.length === 0 && <tr><td colSpan={6} className="px-2 py-4 text-center text-ink-soft">{textOnly ? "글 있는 후기가 없다." : "후기가 없다."}</td></tr>}
              </tbody>
            </table>
          </div>
          {cursor && <button className={btnCls()} disabled={busy} onClick={() => void more()}>더 보기</button>}
          <p className="text-[11px] text-ink-soft">작성자 계정·닉네임은 받지 않는다. 글 원문은 Slack·Jira·문서·커밋에 옮기지 않는다 — 규칙 개정 근거가 필요하면 요지만 적는다.</p>
        </div>
      )}
    </Panel>
  );
}
