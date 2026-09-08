"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { EarContent, listEarContents, restoreEarContent, withdrawEarContent } from "@/lib/ear";
import { latestPublishEvents, logPublishEvent, type PublishAction } from "../actions";
import { Badge, LinkBtn, PageHeader, Panel, Toolbar, btnCls } from "@/components/ui";
import { fmtTime } from "@/lib/format";
import { EarGate, EarSession, earErrMsg } from "./ear-connect";
import { LinkPublished } from "./link-published";

const LIMIT = 20;

/** 제품 콘텐츠 목록 — admin 콘솔의 목록·회수/복구를 파이프라인 웹으로 병합 (admin.md 4.4) */
export default function PublishPage() {
  return (
    <div className="space-y-3">
      <PageHeader title="제품 발행" breadcrumb={["파이프라인", "제품 발행"]}
        desc="제품(앱)에 발행된 콘텐츠의 목록·회수·복구. 발행은 에피소드 화면의 [제품 발행] 또는 수동 업로드로."
        actions={<EarSession />} />
      <EarGate><LinkPublished /><ContentList /></EarGate>
    </div>
  );
}

function ContentList() {
  const [status, setStatus] = useState("");
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<{ items: EarContent[]; total: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [latest, setLatest] = useState<Record<string, { at: string; action: PublishAction; version: number | null }>>({});

  const load = useCallback(async (st = status, off = offset) => {
    try {
      const [d, ev] = await Promise.all([listEarContents(st, off, LIMIT), latestPublishEvents().catch(() => ({}))]);
      setErr(null); setData(d); setLatest(ev);
    } catch (e) { setErr(earErrMsg(e)); }
  }, [status, offset]);
  useEffect(() => { queueMicrotask(() => void load()); }, [load]); // 동기 setState 회피 (react-hooks/set-state-in-effect)

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    try { await fn(); await load(); } catch (e) { alert(earErrMsg(e)); } finally { setBusy(false); }
  }

  return (
    <>
      <Toolbar
        right={<LinkBtn kind="primary" href="/publish/upload">수동 업로드</LinkBtn>}>
        <select className="rounded border border-line bg-white px-2 py-1.5 text-xs" value={status}
          onChange={(e) => { setStatus(e.target.value); setOffset(0); }}>
          <option value="">전체 상태</option>
          <option value="published">published</option>
          <option value="withdrawn">withdrawn</option>
          <option value="expired">expired</option>
        </select>
        <Link href="/publish/topics" className={btnCls()}>제품 주제 관리</Link>
        <button className={btnCls()} onClick={() => void load()}>새로고침</button>
        {data && <span className="text-xs text-ink-soft">총 {data.total}건</span>}
      </Toolbar>
      {err && <p className="rounded-md border border-rose-200 bg-rose-50 p-3 text-[13px] text-rose-700">{err}</p>}
      <Panel flush>
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-ink-soft">
              {["콘텐츠", "주제", "길이", "최근 발행", "상태", ""].map((h) => <th key={h} className="px-4 py-2.5 font-semibold">{h}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {(data?.items ?? []).map((c) => (
              <tr key={c.id} className="hover:bg-[#f7f9fb]">
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2.5">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={c.thumbnail_url} alt="" className="h-9 w-9 rounded object-cover" />
                    <div>
                      <Link href={`/publish/${c.id}`} className="font-medium text-ink hover:underline">{c.title}</Link>
                      <div className="text-[11px] text-ink-soft">{c.id}{c.content_version > 1 ? ` · v${c.content_version}` : ""}</div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-2.5 text-ink-soft">{c.topics.map((t) => t.name).join(", ")}</td>
                <td className="px-4 py-2.5 tabular-nums text-ink-soft">{Math.floor(c.duration_sec / 60)}:{String(c.duration_sec % 60).padStart(2, "0")}</td>
                <td className="px-4 py-2.5 text-ink-soft"><LatestCell c={c} ev={latest[c.id]} /></td>
                <td className="px-4 py-2.5"><Badge tone={c.status === "published" ? "done" : "failed"}>{c.status}</Badge></td>
                <td className="px-4 py-2.5 text-right">
                  <Link href={`/publish/${c.id}`} className={`${btnCls()} mr-1.5`}>상세·수정</Link>
                  {c.status === "published" && (
                    <button className={btnCls("danger")} disabled={busy} onClick={() => {
                      if (!confirm(`"${c.title}" 을(를) 회수할까요?\n\n전 사용자 라이브러리에서 즉시 사라지고, 발급된 재생 URL은 5분 안에 만료돼요.`)) return;
                      const reason = prompt("회수 사유 (선택 — 감사 로그에만)") || undefined;
                      void act(async () => { const r = await withdrawEarContent(c.id, reason); await logPublishEvent(c.id, "withdraw", r.content_version, reason).catch(() => undefined); });
                    }}>회수</button>
                  )}
                  {c.status === "withdrawn" && (
                    <button className={btnCls()} disabled={busy} onClick={() => {
                      if (!confirm(`"${c.title}" 을(를) 다시 발행할까요? 삭제됐던 라이브러리 항목은 복구되지 않아요.`)) return;
                      void act(async () => { const r = await restoreEarContent(c.id); await logPublishEvent(c.id, "restore", r.content_version).catch(() => undefined); });
                    }}>복구</button>
                  )}
                </td>
              </tr>
            ))}
            {data && data.items.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-ink-soft">콘텐츠가 없습니다.</td></tr>
            )}
          </tbody>
        </table>
      </Panel>
      {data && data.total > LIMIT && (
        <div className="flex gap-2">
          <button className={btnCls()} disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - LIMIT))}>이전</button>
          <button className={btnCls()} disabled={offset + LIMIT >= data.total} onClick={() => setOffset(offset + LIMIT)}>다음</button>
        </div>
      )}
    </>
  );
}

/**
 * 최근 발행 — 파이프라인 이력(publish_log)의 마지막 발행·재발행 시각. 제품 `published_at` 은 최초 발행 시각이라
 * 재발행해도 바뀌지 않는다(2026-09-08 확인). 이력이 없으면 제품 값을 보이고, 제품 버전이 이력보다 앞서면 콘솔 밖 재발행 표시.
 */
function LatestCell({ c, ev }: { c: EarContent; ev?: { at: string; action: PublishAction; version: number | null } }) {
  const outside = c.content_version > (ev?.version ?? 1);
  return (
    <div className="leading-tight">
      <div>{fmtTime(ev?.at ?? c.published_at)}{ev?.action === "republish" && <span className="ml-1 text-[10px] text-brand-ink">재발행</span>}</div>
      {ev && ev.at !== c.published_at && <div className="text-[10.5px] text-ink-soft">최초 {fmtTime(c.published_at)}</div>}
      {outside && <div className="text-[10.5px] text-amber-700" title="파이프라인 이력에 없는 버전 변경 — 제품 API 를 직접 호출한 재발행">v{c.content_version} 콘솔 밖 재발행</div>}
    </div>
  );
}
