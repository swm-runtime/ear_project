"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Panel, btnCls } from "@/components/ui";
import { createEarSeries, EarTopic, listEarSeries, patchEarSeries, uploadEarContent, uploadPipelineSeriesCover, withdrawEarContent } from "@/lib/ear";
import { listConsoleTopics } from "@/lib/console-topics";
import { episodePublishFiles } from "@/lib/publish-episode";
import { seriesContentTitle, seriesPublishBlockers, seriesUploadQueue, type SeriesPublishEpisode, type SeriesStatus } from "@/lib/series";
import { clampSources } from "@/lib/sources-clamp";
import { shortSeriesFields, shortUploadFields } from "@/lib/short-publish";
import { logPublishEvent, markPublished, requestEpisodeEnrich } from "../../actions";
import { EarGate, earErrMsg } from "../../publish/ear-connect";
import { finishSeriesPublish, markSeriesWithdrawn, recordProductSeries } from "../actions";

interface Meta { backlog_id: string; title: string; description: string; mid_topic: string; sources: { publisher: string; title: string; url: string }[]; remake_of_content_ref?: string | null }
interface Row {
  meta: Meta; enrichment: boolean; script: boolean; audio: boolean; thumbnail: boolean;
  title: string; description: string; topicIds: string[]; checks: boolean[];
}
const CHECKLIST = ["사실·출처 대조 (게이트 2 #1)", "소스 적법 (#2)", "오디오 청취 (#3)", "제목·설명 (#5)"];
const inp = "w-full rounded border border-line px-2 py-1 text-[12.5px] outline-none focus:border-brand";

/**
 * [시리즈 발행]·[시리즈 회수] (spec/11 7장, KAN-136 6단계). 검수는 편마다(아래 표의 체크), 발행은 시리즈 단위다.
 * 1) 제품 시리즈가 없으면 POST /admin/series 로 만들고 id 를 파이프라인에 남긴다 2) 1화부터 순서대로 업로드(series_id·episode_no·total_episodes)
 * 3) 도중에 실패하면 멈추고, 다시 누르면 이미 올린 편(published_content_ref)은 건너뛴다 4) 다 올라가면 제품 시리즈를 completed 로.
 * 짧은 판 시리즈(KAN-296 · BE KAN-298)는 1)에서 원본 시리즈의 변형(length_profile short · variant_of_series_id)으로 만들고, 편마다 원본 편의
 * content_id 와 도입 훅을 싣는다(lib/short-publish.ts). 노출은 서버가 가입 코호트로 가른다.
 */
type SeriesPublishProps = { id: string; name: string; introLine: string; total: number; status: SeriesStatus; productSeriesId: string | null; publisherName: string | null; episodes: SeriesPublishEpisode[]; /** 짧은 판 시리즈면 원본 시리즈의 제품 id(없으면 null) */ short: { variantOfSeriesId: string | null } | null };
export function SeriesPublish(props: SeriesPublishProps) {
  return <EarGate><SeriesPublishInner {...props} /></EarGate>;
}

function SeriesPublishInner({ id, name, introLine, total, status, productSeriesId, publisherName, episodes, short }: SeriesPublishProps) {
  const router = useRouter();
  const [topics, setTopics] = useState<EarTopic[]>([]);
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<{ text: string; bad?: boolean }[]>([]);
  const say = (text: string, bad = false) => setLog((l) => [...l, { text, bad }]);
  const todo = useMemo(() => seriesUploadQueue(episodes), [episodes]);

  const load = useCallback(async () => {
    try {
      const items = (await listConsoleTopics()).mine;
      setTopics(items);
      const out: Record<string, Row> = {};
      for (const e of todo) {
        if (!e.episode_id) continue;
        const res = await fetch(`/api/publish/${e.episode_id}`);
        if (!res.ok) continue;
        const b = (await res.json()) as { meta: Meta; has_audio: boolean; has_thumbnail: boolean; has_enrichment?: boolean; has_script?: boolean };
        const same = items.find((t) => t.name === b.meta.mid_topic);
        out[e.backlog_id] = {
          meta: b.meta, enrichment: !!b.has_enrichment, script: !!b.has_script, audio: b.has_audio, thumbnail: b.has_thumbnail,
          title: seriesContentTitle(name, e.no, b.meta.title ?? ""), description: b.meta.description ?? "", topicIds: same ? [same.id] : [], checks: CHECKLIST.map(() => false),
        };
      }
      // 다시 불러와도(도중 실패 뒤 새로고침) 사람이 고친 제목·설명·주제·검수 체크는 남긴다 — 파일 유무만 새로 읽는다
      setRows((prev) => Object.fromEntries(Object.entries(out).map(([k, r]) => [k, prev[k] ? { ...r, title: prev[k].title, description: prev[k].description, topicIds: prev[k].topicIds, checks: prev[k].checks } : r])));
    } catch (e) { setLoadErr(earErrMsg(e)); }
  }, [todo, name]);
  useEffect(() => { void load(); }, [load]);

  const ready = useMemo(() => Object.fromEntries(Object.entries(rows).map(([k, r]) => [k, {
    reviewed: r.checks.every(Boolean) && !!r.title.trim() && !!r.description.trim() && r.topicIds.length > 0 && r.meta.sources.some((s) => s.title.trim()) && r.audio && r.thumbnail,
    enrichment: r.enrichment,
  }])), [rows]);
  const shortSeries = short ? shortSeriesFields(short.variantOfSeriesId) : null;
  const blockers = [...seriesPublishBlockers({ status, total_episodes: total }, episodes, ready), ...(shortSeries?.blocker && !productSeriesId ? [shortSeries.blocker] : [])];
  const set = (k: string, f: (r: Row) => Row) => setRows((m) => ({ ...m, [k]: f(m[k]) }));

  const publish = async () => {
    if (!confirm(`"${name}" ${total}편을 1화부터 순서대로 발행할까요?\n\n${short ? "짧은 판 시리즈예요 — 원본 시리즈의 변형으로 올라가고, 서버가 새 앱 배포 뒤 가입한 사용자에게만 보여요." : "업로드하면 바로 전체 사용자에게 보여요."} 도중에 멈추면 다시 눌러 이어서 올립니다.`)) return;
    setBusy(true); setLog([]);
    try {
      // 1) 제품 시리즈 — 기록된 id 가 없으면 만든다. 직전 시도가 만들고 기록에 실패했을 수 있어, 같은 제목·편수에 올라간 편이 없는 시리즈가 있으면 그것을 쓴다
      let sid = productSeriesId;
      if (!sid) {
        // 길이 프로필도 같아야 재사용한다 — 짧은 판을 기존 판 시리즈에(또는 그 반대로) 올리지 않는다. 칸이 없는 서버(KAN-298 전)의 시리즈는 standard 로 본다
        const want = short ? "short" : "standard";
        const prev = (await listEarSeries()).items.find((x) => x.title === name.trim() && x.total_episodes === total && (x.length_profile ?? "standard") === want && x.episode_counts.published + x.episode_counts.withdrawn + x.episode_counts.expired === 0);
        // 간행물(KAN-247) → 발행 이름. 재사용하는 시리즈도 같은 이름으로 맞춘다
        const made = prev
          ? (prev.publisher_name ?? null) === publisherName ? prev : await patchEarSeries(prev.id, { publisher_name: publisherName })
          : await createEarSeries({ title: name.trim(), description: introLine.trim(), total_episodes: total, status: "ongoing", publisher_name: publisherName, ...(shortSeries?.fields ?? {}) });
        const r = await recordProductSeries(id, made.id);
        if (!r.ok) throw new Error(`제품 시리즈 ${made.id} 를 ${prev ? "찾았지만" : "만들었지만"} 기록하지 못했어요: ${r.reason}`);
        sid = made.id; say(`제품 시리즈 ${prev ? "재사용" : "생성"} — ${sid}${publisherName ? ` · 발행 이름 ${publisherName}` : " · 발행 이름 없음"}${short ? ` · 짧은 판(원본 ${short.variantOfSeriesId})` : ""}`);
        // 표지 (spec/11 7장, 2026-10-28): 파이프라인 표지가 있으면 바로 올린다 — 없으면 앱이 1화 썸네일을 쓴다(글로벌 S01 이 그렇게 나갔다). 실패해도 발행은 계속하고, 시리즈 화면 [표지 서버에 올리기]로 뒤에 올린다
        try { const c = await uploadPipelineSeriesCover(id, sid); say(c ? "시리즈 표지 올림" : "시리즈 표지 파일 없음 — 1화 썸네일로 나간다(키워드·회화집 디자인이면 시리즈 화면에서 다시 만들기 뒤 [표지 서버에 올리기])"); }
        catch (e) { say(`시리즈 표지 업로드 실패: ${earErrMsg(e)} — 발행은 계속, 시리즈 화면 [표지 서버에 올리기]로 다시`, true); }
      }
      // 2) 1화부터 순서대로 — 실패하면 그 자리에서 멈춘다
      for (const e of todo) {
        const r = rows[e.backlog_id];
        if (!r || !e.episode_id) throw new Error(`${e.no}화 발행 정보를 읽지 못했어요`);
        say(`${e.no}화 올리는 중…`);
        const f = await episodePublishFiles(e.episode_id, { enrichment: r.enrichment, script: r.script });
        const c = await uploadEarContent({
          title: r.title.trim(), description: r.description.trim(), origin: "ai_generated",
          source_name: `참고한 자료: ${[...new Set(r.meta.sources.map((s) => s.publisher))].join(", ")}`, topic_ids: r.topicIds,
          sources: clampSources(r.meta.sources), // 제품 API 한도 — lib/sources-clamp.ts
          series_id: sid, episode_no: e.no, total_episodes: total, review_confirmed: true,
          // 짧은 시리즈 편 — 시리즈와 같은 short 를 명시하고, 원본 편 content_id(있으면) · 도입 훅을 싣는다
          ...(short ? shortUploadFields({ ...r.meta, backlog_id: e.backlog_id, length_profile: "short" }, "series").fields ?? {} : {}),
        }, f.audio, f.thumbnail, f.enrichment, f.script, f.lossless);
        // 이어서 올리기는 이 기록(published_content_ref)으로 올린 편을 가른다 — 실패하면 멈춘다(다시 올리면 서버가 같은 번호를 400 으로 막는다)
        await markPublished(e.backlog_id, c.id, c.content_version, c.published_at, { action: "publish", parts: ["audio", "thumbnail", "title", "description", "source_name", "topic_ids", "series", ...(f.enrichment ? ["enrichment"] : []), ...(f.script ? ["script"] : [])], note: `시리즈 ${e.no}/${total}${short ? " · 짧은 판" : ""}`, episodeId: e.episode_id });
        say(`${e.no}화 발행 — ${c.id}${f.enrichment && !c.enrichment_applied ? ` · 추천 메타 거부: ${c.enrichment_rejected_reason ?? "사유 없음"}` : ""}${f.script && !c.script_applied ? ` · 자막 거부: ${c.script_rejected_reason ?? "사유 없음"}` : ""}`);
      }
      // 3) 끝 — 제품 시리즈 완결, 파이프라인 시리즈 발행
      await patchEarSeries(sid, { status: "completed" });
      const done = await finishSeriesPublish(id);
      if (!done.ok) throw new Error(done.reason);
      say(`시리즈 발행 완료 — ${total}편`);
      router.refresh();
    } catch (e) {
      const field = (e as { field?: string }).field;
      say(`멈춤: ${earErrMsg(e)}${field ? ` (필드: ${field})` : ""} — 고친 뒤 다시 누르면 이어서 올려요`, true);
      router.refresh();
    } finally { setBusy(false); }
  };

  const withdraw = async () => {
    if (!confirm(`"${name}" 전 편을 회수할까요?\n\n시리즈 편은 한 편씩 회수하지 않아요(순서가 깨진다). 전 사용자 라이브러리에서 즉시 사라져요.`)) return;
    const reason = prompt("회수 사유 (선택 — 감사 로그에만)") || undefined;
    setBusy(true); setLog([]);
    try {
      for (const e of [...episodes].sort((a, b) => b.no - a.no)) {
        if (!e.content_id) continue;
        try {
          const r = await withdrawEarContent(e.content_id, reason);
          await logPublishEvent(e.content_id, "withdraw", r.content_version, reason ? `시리즈 회수 · ${reason}` : "시리즈 회수").catch(() => undefined);
          say(`${e.no}화 회수`);
        } catch (err) {
          if ((err as { status?: number }).status === 409) say(`${e.no}화 이미 회수됨`); else throw err;
        }
      }
      const r = await markSeriesWithdrawn(id);
      if (!r.ok) throw new Error(r.reason);
      say("시리즈 회수 완료");
      router.refresh();
    } catch (e) { say(`멈춤: ${earErrMsg(e)}`, true); } finally { setBusy(false); }
  };

  if (loadErr) return <p className="rounded-md border border-rose-200 bg-rose-50 p-3 text-[13px] text-rose-700">{loadErr}</p>;
  const topicName = (tid: string) => topics.find((t) => t.id === tid)?.name ?? tid;
  return (
    <Panel title={status === "published" ? "발행됨 — 시리즈 회수" : `시리즈 발행 — ${total - todo.length}/${total}편 올라감`}>
      <div className="space-y-3 text-[13px]">
        {status !== "published" && todo.length > 0 && (
          <div className="overflow-x-auto">
            {/* 일괄 조작 (2026-10-26 박수헌 "편마다 체크박스 네 개씩 다 하라고?") — 체크는 저장하지 않는 브라우저 상태라 검수를 마친 뒤 한 번에 켠다. 추천 메타도 없는 편 전부 한 번에 */}
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <button className={btnCls()} disabled={busy} title="전 편의 게이트 2 검수 네 항목을 한 번에 체크한다 — 대본·출처·오디오·제목 검수를 마친 뒤 누른다" onClick={() => setRows((prev) => Object.fromEntries(Object.entries(prev).map(([k, r]) => [k, { ...r, checks: r.checks.map(() => true) }])))}>전 편 검수 확인 체크</button>
              <button className={btnCls()} disabled={busy || !todo.some((e) => e.episode_id && rows[e.backlog_id] && !rows[e.backlog_id].enrichment)} title="추천 메타가 없는 편 전부에 메타 작업을 넣는다 — 끝나면 새로고침" onClick={() => { void (async () => { let n = 0; for (const e of todo) { const r = rows[e.backlog_id]; if (!e.episode_id || !r || r.enrichment) continue; await requestEpisodeEnrich(e.episode_id, e.backlog_id); n++; } say(`추천 메타 요청 ${n}편 — 끝나면 새로고침`); })(); }}>추천 메타 없는 편 전부 뽑기</button>
              <span className="text-[11px] text-ink-soft">체크 {todo.filter((e) => rows[e.backlog_id]?.checks.every(Boolean)).length}/{todo.length}편 · 추천 메타 {todo.filter((e) => rows[e.backlog_id]?.enrichment).length}/{todo.length}편</span>
            </div>
            <table className="w-full min-w-[60rem] text-[12px]">
              <thead className="text-left text-[11px] text-ink-soft"><tr><th className="w-10 py-1">화</th><th className="py-1">제목 · 설명</th><th className="w-40 py-1">파일</th><th className="w-48 py-1">게이트 2 검수</th></tr></thead>
              <tbody className="divide-y divide-line align-top">
                {todo.map((e) => {
                  const r = rows[e.backlog_id];
                  return (
                    <tr key={e.backlog_id}>
                      <td className="py-2 font-mono">{e.no}화</td>
                      <td className="space-y-1 py-2 pr-3">
                        {r ? <>
                          <input className={inp} value={r.title} maxLength={255} onChange={(ev) => set(e.backlog_id, (x) => ({ ...x, title: ev.target.value }))} />
                          <textarea className={`${inp} min-h-14`} value={r.description} maxLength={5000} onChange={(ev) => set(e.backlog_id, (x) => ({ ...x, description: ev.target.value }))} />
                          <p className="text-[11px] text-ink-soft">{e.episode_id} · 제품 주제 {r.topicIds.length ? r.topicIds.map(topicName).join(", ") : <span className="text-rose-700">없음 — 제품 주제 관리에서 {r.meta.mid_topic} 을 먼저 만든다</span>} · 소스 {r.meta.sources.length}개</p>
                        </> : <span className="text-ink-soft">{e.episode_id ? "불러오는 중…" : "에피소드 없음"} <Badge value={e.status} /></span>}
                      </td>
                      <td className="py-2 text-[11px]">
                        {r && <div className="space-y-0.5">
                          <div className={r.audio ? "text-emerald-700" : "text-rose-700"}>오디오 {r.audio ? "✓" : "없음"}</div>
                          <div className={r.thumbnail ? "text-emerald-700" : "text-rose-700"}>썸네일 {r.thumbnail ? "✓" : "없음"}</div>
                          <div className={r.enrichment ? "text-emerald-700" : "text-amber-700"}>추천 메타 {r.enrichment ? "✓" : <button className="underline" disabled={busy} onClick={() => void requestEpisodeEnrich(e.episode_id!, e.backlog_id).then(() => say(`${e.no}화 추천 메타 요청 — 끝나면 새로고침`))}>뽑기</button>}</div>
                          <div className="text-ink-soft">자막 {r.script ? "✓" : "없음"}</div>
                        </div>}
                      </td>
                      <td className="py-2">
                        {r && CHECKLIST.map((c, i) => (
                          <label key={i} className="flex items-center gap-1.5 text-[11.5px]">
                            <input type="checkbox" checked={r.checks[i]} onChange={(ev) => set(e.backlog_id, (x) => ({ ...x, checks: x.checks.map((v, j) => (j === i ? ev.target.checked : v)) }))} />{c}
                          </label>
                        ))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {status !== "published" && blockers.length > 0 && (
          <ul className="list-disc space-y-0.5 rounded border border-amber-200 bg-amber-50 py-2 pl-6 pr-3 text-[12px] text-amber-900">{blockers.map((b) => <li key={b}>{b}</li>)}</ul>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {status !== "published" && <button className={btnCls("primary", "md")} disabled={busy || blockers.length > 0} onClick={() => void publish()}>{busy ? "올리는 중… (창을 닫지 마세요)" : todo.length < total ? `이어서 발행 (${todo[0]?.no ?? "-"}화부터)` : "시리즈 발행"}</button>}
          {status === "published" && <button className={btnCls("danger", "md")} disabled={busy} onClick={() => void withdraw()}>{busy ? "회수 중…" : "시리즈 회수"}</button>}
          <span className="text-[11px] text-ink-soft">{productSeriesId ? `제품 시리즈 ${productSeriesId}` : "제품 시리즈는 발행할 때 만든다"}</span>
        </div>
        {log.length > 0 && <ul className="space-y-0.5 rounded border border-line bg-panel px-3 py-2 font-mono text-[11.5px]">{log.map((l, i) => <li key={i} className={l.bad ? "text-rose-700" : "text-ink"}>{l.text}</li>)}</ul>}
      </div>
    </Panel>
  );
}
