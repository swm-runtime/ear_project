"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { EarContent, EarTopic, findEarContent, listEarTopics, republishEarContent } from "@/lib/ear";
import { getPublishHistory, markPublished, type PublishAction, type PublishLogRow } from "../../actions";
import { Badge, PageHeader, Panel, btnCls } from "@/components/ui";
import { fmtTime } from "@/lib/format";
import { EarGate, EarSession, earErrMsg } from "../ear-connect";

/**
 * 제품 콘텐츠 상세 — 발행된 콘텐츠의 메타(제목·설명·출처 표기·주제)·썸네일 수정과 발행 이력 (2026-09-08 박수헌 요청).
 * 수정은 admin-api 4.10 `PATCH /admin/contents/:id` — 무엇을 바꾸든 content_version 이 1 오른다(메타만 바꿔도).
 * 바뀐 필드만 payload 에 싣는다. 오디오 교체는 에피소드 화면의 [재발행 — 오디오 교체]가 맡는다(청취 확인이 선행돼야 해서).
 * 이력은 파이프라인 publish_log(0014) — 콘솔을 거친 사건만 있으므로 제품 버전이 이력보다 앞서면 그 간극을 그대로 보여준다.
 */
export default function ContentDetailPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <div className="space-y-3">
      <PageHeader title="제품 콘텐츠" breadcrumb={["파이프라인", "제품 발행", id.slice(0, 8)]}
        desc="메타·썸네일을 고치면 재발행(content_version +1)으로 반영돼요. 오디오 교체는 에피소드 화면에서."
        actions={<EarSession />} />
      <EarGate><Detail id={id} /></EarGate>
    </div>
  );
}

const PART_LABEL: Record<string, string> = { audio: "오디오", thumbnail: "썸네일", title: "제목", description: "설명", source_name: "출처 표기", topic_ids: "주제" };
const ACTION_LABEL: Record<PublishAction, string> = { publish: "발행", republish: "재발행", link: "기록 연결", withdraw: "회수", restore: "복구", backfill: "백필" };
const ACTION_TONE: Record<PublishAction, string> = { publish: "done", republish: "approved", link: "held", withdraw: "failed", restore: "done", backfill: "" };

function Detail({ id }: { id: string }) {
  const [c, setC] = useState<EarContent | null | undefined>(undefined);
  const [topics, setTopics] = useState<EarTopic[]>([]);
  const [hist, setHist] = useState<Awaited<ReturnType<typeof getPublishHistory>> | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [sourceName, setSourceName] = useState("");
  const [topicIds, setTopicIds] = useState<string[]>([]);
  const [thumb, setThumb] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "bad"; text: string } | null>(null);

  async function load() {
    try {
      const [content, t, h] = await Promise.all([findEarContent(id), listEarTopics(), getPublishHistory(id)]);
      setC(content); setTopics(t.items); setHist(h);
      if (content) { setTitle(content.title); setDescription(content.description); setSourceName(content.source_name); setTopicIds(content.topics.map((x) => x.topic_id)); }
    } catch (e) { setErr(earErrMsg(e)); }
  }
  useEffect(() => { queueMicrotask(() => void load()); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // 바뀐 것만 — 그대로면 PATCH 하지 않는다 (버전만 오르는 헛 재발행 방지)
  const changes = useMemo(() => {
    if (!c) return { parts: [] as string[], payload: {} as Record<string, unknown> };
    const payload: Record<string, unknown> = {}; const parts: string[] = [];
    if (title.trim() !== c.title) { payload.title = title.trim(); parts.push("title"); }
    if (description.trim() !== c.description) { payload.description = description.trim(); parts.push("description"); }
    if (sourceName.trim() !== c.source_name) { payload.source_name = sourceName.trim(); parts.push("source_name"); }
    const cur = [...c.topics.map((x) => x.topic_id)].sort().join(","), nxt = [...topicIds].sort().join(",");
    if (cur !== nxt) { payload.topic_ids = topicIds; parts.push("topic_ids"); }
    if (thumb) parts.push("thumbnail");
    return { parts, payload };
  }, [c, title, description, sourceName, topicIds, thumb]);
  const valid = title.trim() && description.trim() && sourceName.trim() && topicIds.length > 0;

  async function save() {
    if (!c || changes.parts.length === 0) return;
    const what = changes.parts.map((p) => PART_LABEL[p] ?? p).join(", ");
    if (!confirm(`"${c.title}" 의 ${what} 을(를) 바꿉니다.\n\n제품 content_version 이 v${c.content_version} → v${c.content_version + 1} 로 올라가요 (메타만 바꿔도 올라감 — admin-api 4.10). 사용자 라이브러리·재생 기록은 유지됩니다.`)) return;
    setBusy(true); setMsg(null);
    try {
      const res = await republishEarContent(c.id, { ...(Object.keys(changes.payload).length ? { payload: changes.payload } : {}), ...(thumb ? { thumbnail: thumb } : {}) });
      await markPublished(hist?.backlog?.id ?? null, res.id, res.content_version, undefined, { action: "republish", parts: changes.parts, episodeId: hist?.episode_id ?? undefined, note: `메타 수정: ${what}` }).catch((e) => setMsg({ kind: "bad", text: `제품엔 반영됐지만 이력 기록 실패: ${earErrMsg(e)}` }));
      setThumb(null);
      setMsg((m) => m ?? { kind: "ok", text: `반영됐어요 — v${res.content_version}` });
      await load();
    } catch (e) { setMsg({ kind: "bad", text: earErrMsg(e) }); }
    finally { setBusy(false); }
  }

  if (err) return <p className="rounded-md border border-rose-200 bg-rose-50 p-3 text-[13px] text-rose-700">{err}</p>;
  if (c === undefined) return <p className="text-[13px] text-ink-soft">불러오는 중…</p>;
  if (c === null) return <p className="text-[13px] text-ink-soft">제품에 이 id 의 콘텐츠가 없어요 — <Link href="/publish" className="underline">목록</Link></p>;

  const loggedMax = Math.max(0, ...(hist?.log ?? []).map((r) => r.version ?? 0));
  const gap = c.content_version > loggedMax;
  const editable = c.status === "published";

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <div className="space-y-4">
        <Link href="/publish" className="inline-block text-xs text-ink-soft underline hover:text-ink">← 제품 발행 목록</Link>
        <Panel title="메타" right={<span className="text-[11px] text-ink-soft">{c.id} · v{c.content_version} · <Badge tone={c.status === "published" ? "done" : "failed"}>{c.status}</Badge></span>}>
          {!editable && <p className="mb-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900">회수·만료 상태에서는 수정(재발행)이 막혀요 (4.10 — 409). 복구한 뒤 고치세요.</p>}
          <div className="space-y-3 text-[13px]">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-ink-soft">제목</span>
              <input className="w-full rounded border border-line px-3 py-2" value={title} maxLength={255} disabled={!editable} onChange={(e) => setTitle(e.target.value)} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-ink-soft">설명</span>
              <textarea className="min-h-28 w-full rounded border border-line px-3 py-2" value={description} maxLength={5000} disabled={!editable} onChange={(e) => setDescription(e.target.value)} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-ink-soft">출처 고지 표기 (source_name)</span>
              <input className="w-full rounded border border-line px-3 py-2" value={sourceName} maxLength={100} disabled={!editable} onChange={(e) => setSourceName(e.target.value)} />
            </label>
            <div className="grid gap-1 text-[12px] text-ink-soft sm:grid-cols-2">
              <span>origin {c.origin} · 길이 {Math.floor(c.duration_sec / 60)}:{String(c.duration_sec % 60).padStart(2, "0")}</span>
              <span>최초 발행 {fmtTime(c.published_at)}{c.withdrawn_at ? ` · 회수 ${fmtTime(c.withdrawn_at)}` : ""}</span>
            </div>
            <p className="text-[11px] text-ink-soft">참고 소스(sources)는 관리자 API 응답에 실리지 않아 여기서 보거나 고칠 수 없어요 — 바꾸려면 백엔드에 8장 `AdminContentItem` 확장을 요청.</p>
          </div>
        </Panel>
        <Panel title="썸네일">
          <div className="flex items-start gap-4 text-[13px]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={thumb ? URL.createObjectURL(thumb) : c.thumbnail_url} alt="" className="h-24 w-24 rounded object-cover ring-1 ring-line" />
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-ink-soft">교체 (jpg/png/webp, ≤5MB)</span>
              <input type="file" accept=".jpg,.jpeg,.png,.webp,image/*" disabled={!editable} onChange={(e) => setThumb(e.target.files?.[0] ?? null)} />
              {thumb && <button className={`${btnCls()} mt-2`} onClick={() => setThumb(null)}>선택 취소</button>}
            </label>
          </div>
        </Panel>
      </div>

      <div className="space-y-4">
        <Panel title="제품 주제 (1개 이상)">
          <div className="flex flex-wrap gap-1.5 text-xs">
            {topics.map((t) => {
              const on = topicIds.includes(t.id);
              return (
                <button key={t.id} disabled={!editable}
                  className={`rounded-full border px-2.5 py-1 transition ${on ? "border-brand bg-brand text-white" : `border-line bg-white text-ink hover:bg-[#f7f9fb] ${t.is_visible ? "" : "border-dashed text-ink-soft"}`}`}
                  onClick={() => setTopicIds((ids) => on ? ids.filter((x) => x !== t.id) : [...ids, t.id])}>
                  {t.name}{!t.is_visible && " (숨김)"}
                </button>
              );
            })}
          </div>
        </Panel>
        <button className={`${btnCls("primary", "md")} w-full justify-center`} disabled={!editable || !valid || busy || changes.parts.length === 0} onClick={() => void save()}>
          {busy ? "반영 중…" : changes.parts.length === 0 ? "바뀐 것 없음" : `재발행 — ${changes.parts.map((p) => PART_LABEL[p] ?? p).join(", ")} 반영 (v${c.content_version + 1})`}
        </button>
        {msg && <p className={`rounded-md border p-3 text-[13px] ${msg.kind === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"}`}>{msg.text}</p>}

        <Panel title="발행 이력" right={hist?.episode_id && <Link href={`/episodes/${hist.episode_id}`} className="text-[11px] text-brand-ink underline">에피소드 {hist.episode_id}</Link>}>
          {hist?.backlog && <p className="mb-2 text-[11.5px] text-ink-soft">백로그 {hist.backlog.id} · 기록 v{hist.backlog.published_version ?? "?"} · {fmtTime(hist.backlog.published_at)}</p>}
          {gap && (
            <p className="mb-2 rounded border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11.5px] leading-snug text-amber-900">
              제품은 v{c.content_version}인데 이력에는 v{loggedMax || "없음"}까지만 있어요 — 나머지 {c.content_version - loggedMax}회는 콘솔 밖에서(제품 API 직접 호출) 재발행됐어요. 행위자·시각은 제품 audit_logs 에만 있어요.
            </p>
          )}
          <HistoryList rows={hist?.log ?? []} />
        </Panel>
      </div>
    </div>
  );
}

function HistoryList({ rows }: { rows: PublishLogRow[] }) {
  if (rows.length === 0) return <p className="text-[12.5px] text-ink-soft">기록된 사건이 없어요 (0014 이전 발행분은 [발행 기록 연결]로 잇거나, 이후 사건부터 쌓여요).</p>;
  return (
    <ol className="divide-y divide-line text-[12.5px]">
      {rows.map((r) => (
        <li key={r.id} className="py-2">
          <div className="flex items-center gap-2">
            <Badge tone={ACTION_TONE[r.action] || undefined}>{ACTION_LABEL[r.action]}</Badge>
            {r.version != null && <span className="font-mono text-[11px] text-ink-soft">v{r.version}</span>}
            <span className="ml-auto text-[11px] text-ink-soft">{fmtTime(r.at)}</span>
          </div>
          <div className="mt-0.5 text-[11.5px] text-ink-soft">
            {r.parts.length > 0 && <span>{r.parts.map((p) => PART_LABEL[p] ?? p).join(" · ")} · </span>}
            {r.actor ?? "행위자 미상"}{r.note ? ` — ${r.note}` : ""}
          </div>
        </li>
      ))}
    </ol>
  );
}
