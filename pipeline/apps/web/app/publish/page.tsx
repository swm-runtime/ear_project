"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { EarContent, getEarReviewSummary, listEarContents, listEarJobCategories, restoreEarContent, withdrawEarContent, type EarReviewSummaryItem } from "@/lib/ear";
import { fmtStars, REVIEW_SMALL_N } from "./review-panel";
import { enrichStates, latestPublishEvents, listPublishableEpisodes, logPublishEvent, republishPlans, requestEnrich, requestScriptAlign, scriptAlignStates, type PublishAction, type RepublishPlan } from "../actions";
import { EnrichCell, isStale, type EnrichState } from "./enrich-cell";
import { ScriptCell, type ScriptState } from "./script-cell";
import { StaleNote, StaleRepublishButton } from "./stale-republish";
import { SectionsApplyButton } from "./sections-apply";
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
  const [staleOnly, setStaleOnly] = useState(false); // KAN-54: 구형·없음만 보기 — 서버에 필터가 없어 전 페이지를 받아 거른다
  const [enrich, setEnrich] = useState<Record<string, EnrichState>>({});
  const [scripts, setScripts] = useState<Record<string, ScriptState>>({}); // KAN-72 소급: 자막 정렬 작업 상태
  const [plans, setPlans] = useState<Record<string, RepublishPlan>>({}); // 발행본 구형 판정 (구형 전체 재발행)
  const [jobCats, setJobCats] = useState<string[]>([]);
  const [reviews, setReviews] = useState<Record<string, EarReviewSummaryItem> | null>(null); // KAN-284: 편별 후기 집계 — API 가 없는 서버(운영 배포 전)면 null 로 열을 비운다

  const load = useCallback(async (st = status, off = offset, stale = staleOnly) => {
    try {
      const [d, ev] = await Promise.all([stale ? listAllContents(st) : listEarContents(st, off, LIMIT), latestPublishEvents().catch(() => ({}))]);
      const shown = stale ? { items: d.items.filter(isStale), total: d.items.filter(isStale).length } : d;
      setErr(null); setData(shown); setLatest(ev);
      setEnrich(await enrichStates(shown.items.map((c) => c.id)).catch(() => ({})));
      setScripts(await scriptAlignStates(shown.items.map((c) => c.id)).catch(() => ({})));
      setPlans(await republishPlans(shown.items.map((c) => c.id)).catch(() => ({})));
      setReviews(await getEarReviewSummary().then((r) => Object.fromEntries(r.items.map((x) => [x.content_id, x]))).catch(() => null));
    } catch (e) { setErr(earErrMsg(e)); }
  }, [status, offset, staleOnly]);
  useEffect(() => { listEarJobCategories().then((r) => setJobCats(r.items.map((x) => x.name))).catch(() => setJobCats([])); }, []);
  const [pendingN, setPendingN] = useState<number | null>(null); // 발행 대기(패키지·오디오 완료·미발행) 편수 — 업로드 화면 진입 버튼에 표시 (2026-10-25 일괄 발행)
  useEffect(() => { listPublishableEpisodes().then((r) => setPendingN(r.length)).catch(() => setPendingN(null)); }, []);
  useEffect(() => { // 재부여 작업이 도는 동안 상태를 20초마다 갱신
    const running = Object.values(enrich).some((s) => ["queued", "claimed", "running"].includes(s.status)) || Object.values(scripts).some((s) => ["queued", "claimed", "running"].includes(s.status));
    if (!running || !data) return;
    const ids = data.items.map((c) => c.id);
    const t = setInterval(() => { enrichStates(ids).then(setEnrich).catch(() => {}); scriptAlignStates(ids).then(setScripts).catch(() => {}); }, 20_000);
    return () => clearInterval(t);
  }, [enrich, scripts, data]);
  useEffect(() => { queueMicrotask(() => void load()); }, [load]); // 동기 setState 회피 (react-hooks/set-state-in-effect)

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    try { await fn(); await load(); } catch (e) { alert(earErrMsg(e)); } finally { setBusy(false); }
  }

  return (
    <>
      <Toolbar
        right={<LinkBtn kind="primary" href="/publish/upload">{pendingN ? `발행 대기 ${pendingN}편 · 업로드` : "발행 대기 · 업로드"}</LinkBtn>}>
        <select className="rounded border border-line bg-white px-2 py-1.5 text-xs" value={status}
          onChange={(e) => { setStatus(e.target.value); setOffset(0); }}>
          <option value="">전체 상태</option>
          <option value="published">published</option>
          <option value="withdrawn">withdrawn</option>
          <option value="expired">expired</option>
        </select>
        <Link href="/publish/topics" className={btnCls()}>제품 주제 관리</Link>
        <label className="flex items-center gap-1 text-xs text-ink-soft"><input type="checkbox" checked={staleOnly} onChange={(e) => { setStaleOnly(e.target.checked); setOffset(0); }} />구형·없음·임베딩 미갱신 추천 메타만</label>
        {staleOnly && data && data.items.length > 0 && (
          <button className={btnCls()} disabled={busy} title="목록의 콘텐츠 전부에 메타 재부여 작업을 넣는다 (반영은 각 행의 [반영])" onClick={() => {
            if (!confirm(`${data.items.length}건의 추천 메타를 다시 뽑을까요? 워커가 순서대로 판정합니다 (편당 $0.1~0.3).`)) return;
            void act(async () => { const r = await requestEnrich(data.items.map((c) => ({ content_id: c.id, title: c.title, description: c.description, topic_names: c.topics.map((t) => t.name), origin: c.origin })), jobCats); alert(`요청 ${r.queued}건 · 이미 진행 중 ${r.skipped}건`); });
          }}>전부 다시 뽑기</button>
        )}
        {data && data.items.some((c) => c.status === "published" && !c.has_script) && (
          <button className={btnCls()} disabled={busy} title="이 페이지의 자막 없는 발행 콘텐츠 전부에 자막 정렬 작업을 넣는다 (오디오 그대로 · 반영은 각 행의 [반영])" onClick={() => {
            const targets = data.items.filter((c) => c.status === "published" && !c.has_script).map((c) => c.id);
            if (!confirm(`${targets.length}건의 자막을 뽑을까요? 서버 워커가 발행본 오디오와 대본을 강제 정렬합니다.`)) return;
            void act(async () => { const r = await requestScriptAlign(targets); alert(`요청 ${r.queued}건 · 진행 중 ${r.skipped}건 · 에피소드 없음 ${r.noEpisode}건`); });
          }}>자막 없는 것 전부 뽑기</button>
        )}
        <StaleRepublishButton disabled={busy} onDone={() => void load()} />
        <SectionsApplyButton disabled={busy} onDone={() => void load()} />
        <button className={btnCls()} onClick={() => void load()}>새로고침</button>
        {data && <span className="text-xs text-ink-soft">총 {data.total}건</span>}
      </Toolbar>
      {err && <p className="rounded-md border border-rose-200 bg-rose-50 p-3 text-[13px] text-rose-700">{err}</p>}
      <Panel flush>
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-ink-soft">
              {["콘텐츠", "주제", "길이", "후기", "최근 발행", "추천 메타", "자막", "상태", ""].map((h) => <th key={h} className="px-4 py-2.5 font-semibold">{h}</th>)}
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
                <td className="px-4 py-2.5"><ReviewCell r={reviews ? reviews[c.id] ?? null : undefined} /></td>
                <td className="px-4 py-2.5 text-ink-soft"><LatestCell c={c} ev={latest[c.id]} /><StaleNote c={c} p={plans[c.id]} /></td>
                <td className="px-4 py-2.5"><EnrichCell c={c} st={enrich[c.id]} jobCategories={jobCats} onChange={() => void load()} /></td>
                <td className="px-4 py-2.5"><ScriptCell c={c} st={scripts[c.id]} onChange={() => void load()} /></td>
                <td className="px-4 py-2.5"><Badge tone={c.status === "published" ? "done" : "failed"}>{c.status}</Badge></td>
                <td className="px-4 py-2.5 text-right">
                  <Link href={`/publish/${c.id}`} className={`${btnCls()} mr-1.5`}>상세·수정</Link>
                  {c.status === "published" && c.series_id && <span className="text-[11px] text-ink-soft" title="시리즈 편은 개별 회수가 없다 — 시리즈 화면의 [시리즈 회수]로 전 편을 한꺼번에 (spec/11 7장)">시리즈 {c.episode_no}화</span>}
                  {c.status === "published" && !c.series_id && (
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
              <tr><td colSpan={9} className="px-4 py-8 text-center text-ink-soft">{staleOnly ? "구형·없음 메타인 콘텐츠가 없습니다." : "콘텐츠가 없습니다."}</td></tr>
            )}
          </tbody>
        </table>
      </Panel>
      {data && !staleOnly && data.total > LIMIT && (
        <div className="flex gap-2">
          <button className={btnCls()} disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - LIMIT))}>이전</button>
          <button className={btnCls()} disabled={offset + LIMIT >= data.total} onClick={() => setOffset(offset + LIMIT)}>다음</button>
        </div>
      )}
    </>
  );
}

/** 전 페이지 수집 — 구형 메타 필터는 서버에 없어 클라이언트가 거른다. 콘텐츠가 수백 건을 넘기 전까지는 충분하다 (findEarContent 와 같은 전제) */
async function listAllContents(status: string): Promise<{ items: EarContent[]; total: number }> {
  const items: EarContent[] = [];
  for (let off = 0; ; off += 50) { const d = await listEarContents(status, off, 50); items.push(...d.items); if (off + 50 >= d.total || d.items.length === 0) return { items, total: d.total }; }
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

/** 후기 칸 (KAN-284) — 수 · 평균 · 글 수. 표본이 작으면(5건 미만) 흐리게. undefined = 집계를 못 읽음(API 없는 서버) */
function ReviewCell({ r }: { r: EarReviewSummaryItem | null | undefined }) {
  if (r === undefined) return <span className="text-[11px] text-slate-300">-</span>;
  if (!r) return <span className="text-[11px] text-ink-soft">없음</span>;
  const small = r.reviews < REVIEW_SMALL_N;
  return (
    <div className="leading-tight" title={small ? `후기 ${r.reviews}건 — ${REVIEW_SMALL_N}건 미만이라 평균을 믿기 어렵다` : undefined}>
      <div className={`tabular-nums ${small ? "text-ink-soft opacity-60" : ""}`}>★ {fmtStars(r.average_stars)}</div>
      <div className="text-[10.5px] text-ink-soft">{r.reviews}건 · 글 {r.text_reviews}</div>
    </div>
  );
}
