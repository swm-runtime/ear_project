"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { episodeJudgeScores, markPublished } from "../../actions";
import type { AgentScore } from "@/lib/agent-verdict";
import { EarTopic, uploadEarContent } from "@/lib/ear";
import { listConsoleTopics } from "@/lib/console-topics";
import { episodePublishFiles } from "@/lib/publish-episode";
import { Badge, Panel, btnCls } from "@/components/ui";
import { earErrMsg } from "../ear-connect";

/**
 * 발행 대기 일괄 발행 (2026-10-25 박수헌 — "검수만 쭉 하고 나서 일괄 발행").
 * 단일 편 업로드와 같은 재료·같은 제품 API 를 쓴다: 패키지 `upload-meta.json` 의 제목·설명·소스, 중분류와 이름이 같은 제품 주제,
 * 배포본 오디오(+무손실)·썸네일, 있으면 추천 메타·자막. 게이트 2 체크리스트는 선택한 편 전체에 한 번 확인하고(review_confirmed),
 * 한 편씩 순서대로 올린다 — 한 편이 실패해도 다음 편은 계속하고 끝에 결과를 모아 보여 준다. 시리즈 편은 목록(listPublishableEpisodes)에서 이미 빠져 있다.
 * 제목·설명·소스를 고쳐야 하는 편은 행의 [단일 발행]으로 간다.
 */
export type PendingEpisode = { id: string; title: string; mid_topic: string; created_at: string };

interface Detail {
  meta: { episode_id: string; backlog_id: string; title: string; description: string; mid_topic: string; duration_min_estimate: number | null; sources: { publisher: string; title: string; url: string }[] };
  has_audio: boolean; has_thumbnail: boolean; has_enrichment?: boolean; enrichment_version?: number | null; has_script?: boolean; script_segments?: number | null;
}
type Row = PendingEpisode & { d?: Detail; topic?: EarTopic; block?: string; err?: string };

/** 판정 점수 표기 — "판정 69 (원판 58 → 1회차) · 필수 수정 4/4 수리". 기준(60) 아래면 주황 */
function JudgeScore({ s }: { s: AgentScore | null | undefined }) {
  if (s === undefined) return <span className="text-ink-soft">판정 읽는 중…</span>;
  if (s === null) return <span className="text-ink-soft">판정 점수 없음</span>;
  const low = s.threshold != null && s.score < s.threshold;
  const trail = s.totals.length > 1 ? ` (원판 ${s.original} → ${s.bestRound}회차)` : " (원판 그대로)";
  return (
    <span className={low ? "font-medium text-amber-700" : "font-medium text-emerald-700"} title={`편집자 중앙값 회차별 ${s.totals.join(" · ")}${s.threshold != null ? ` · 기준 ${s.threshold}` : ""}`}>
      판정 {s.score}{trail}{s.mustFix ? ` · 필수 수정 ${s.fixed}/${s.mustFix} 수리` : " · 필수 수정 없음"}
    </span>
  );
}

const CHECKLIST = [
  "사실·출처 — 선택한 편마다 claims 표본을 발췌와 대조했다 (게이트 2 #1)",
  "소스 적법 — 전 소스 계층 판정 완료, 차단 도메인 없음 (#2)",
  "오디오 — 선택한 편마다 청취 확인(오독·무음·시작/끝 고지 멘트) (#3·spec/06 8장)",
  "제목·설명 — 패키지 제목·설명이 내용과 일치하고 과장이 없다 (#5)",
];

export function BulkPublish({ pending, onDone }: { pending: PendingEpisode[]; onDone: () => void }) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(() => pending.map((p) => ({ ...p })));
  const [topics, setTopics] = useState<EarTopic[] | null>(null);
  const [scores, setScores] = useState<Record<string, AgentScore | null> | null>(null); // 에이전트 판정 점수 — 한 번에 읽는다
  const [selected, setSelected] = useState<Set<string>>(new Set());
  useEffect(() => { episodeJudgeScores(pending.map((p) => p.id)).then(setScores).catch(() => setScores({})); }, [pending]);
  const [checks, setChecks] = useState([false, false, false, false]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [report, setReport] = useState<{ ok: string[]; bad: string[] } | null>(null);

  // 제품 주제(이 시장) + 편마다 패키지 메타·파일 유무 — 넷씩 묶어 읽는다
  useEffect(() => {
    let stop = false;
    void (async () => {
      let mine: EarTopic[] = [];
      try { mine = (await listConsoleTopics()).mine; } catch (e) { if (!stop) setRows((rs) => rs.map((r) => ({ ...r, block: `제품 주제 목록을 읽지 못함 — ${earErrMsg(e)}` }))); return; }
      if (stop) return;
      setTopics(mine);
      const queue = [...pending];
      const worker = async () => {
        for (let p = queue.shift(); p; p = queue.shift()) {
          let patch: Partial<Row>;
          try {
            const res = await fetch(`/api/publish/${p.id}`);
            if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message ?? `HTTP ${res.status}`);
            const d = (await res.json()) as Detail;
            const topic = mine.find((t) => t.name === d.meta.mid_topic);
            const block = !d.has_audio ? "배포본 오디오 없음 — TTS 먼저"
              : !d.has_thumbnail ? "썸네일 없음 — [썸네일 생성] 먼저"
              : !topic ? `중분류 "${d.meta.mid_topic}" 와 이름이 같은 제품 주제 없음 — 단일 발행에서 고르기`
              : !d.meta.title?.trim() || !d.meta.description?.trim() ? "패키지 제목·설명 비어 있음 — 단일 발행에서 입력"
              : !(d.meta.sources ?? []).some((s) => s.title?.trim()) ? "참고 소스 없음 — 단일 발행에서 입력"
              : undefined;
            patch = { d, topic, block };
          } catch (e) { patch = { err: earErrMsg(e) }; }
          if (stop) return;
          setRows((rs) => rs.map((r) => (r.id === p.id ? { ...r, ...patch } : r)));
        }
      };
      await Promise.all([worker(), worker(), worker(), worker()]);
    })();
    return () => { stop = true; };
  }, [pending]);

  const ready = useMemo(() => rows.filter((r) => r.d && !r.block && !r.err), [rows]);
  const loading = useMemo(() => rows.filter((r) => !r.d && !r.err).length, [rows]);
  const picked = useMemo(() => ready.filter((r) => selected.has(r.id)), [ready, selected]);
  const canRun = picked.length > 0 && checks.every(Boolean) && !busy;

  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const selectAll = () => setSelected(new Set(ready.map((r) => r.id)));
  const clearAll = () => setSelected(new Set());

  const run = useCallback(async () => {
    const targets = picked;
    if (!targets.length) return;
    const noMeta = targets.filter((t) => !t.d?.has_enrichment).length;
    const noScript = targets.filter((t) => !t.d?.has_script).length;
    const lines = [
      `${targets.length}편을 지금 발행할까요? 업로드는 즉시 전체 사용자에게 공개돼요(중간 상태 없음).`,
      "",
      ...targets.slice(0, 12).map((t) => `· ${t.d!.meta.title}`),
      ...(targets.length > 12 ? [`· … 외 ${targets.length - 12}편`] : []),
      "",
      `추천 메타 없이 나가는 편 ${noMeta}편(목록에서 소급 가능) · 자막 없이 나가는 편 ${noScript}편`,
      "한 편씩 순서대로 올리고, 실패한 편은 건너뛰고 끝에 알려 드려요. 창을 닫지 마세요.",
    ];
    if (!confirm(lines.join("\n"))) return;
    setBusy(true); setReport(null);
    const ok: string[] = [], bad: string[] = [];
    for (const [i, t] of targets.entries()) {
      const m = t.d!.meta;
      setProgress(`발행 중 ${i + 1}/${targets.length} — ${m.title.slice(0, 40)}`);
      try {
        const f = await episodePublishFiles(t.id, { enrichment: !!t.d!.has_enrichment, script: !!t.d!.has_script });
        const sources = (m.sources ?? []).filter((s) => s.title?.trim()).map((s) => ({ title: s.title.trim(), ...(s.publisher?.trim() ? { author: s.publisher.trim() } : {}), ...(s.url?.trim() ? { url: s.url.trim() } : {}) }));
        const sourceName = `참고한 자료: ${[...new Set((m.sources ?? []).map((s) => s.publisher).filter(Boolean))].join(", ")}`.slice(0, 100);
        const content = await uploadEarContent({
          title: m.title.trim(), description: m.description.trim(), origin: "ai_generated",
          source_name: sourceName, topic_ids: [t.topic!.id], sources, review_confirmed: true,
        }, f.audio, f.thumbnail, f.enrichment, f.script, f.lossless);
        await markPublished(m.backlog_id, content.id, content.content_version, content.published_at, {
          action: "publish",
          parts: ["audio", "thumbnail", "title", "description", "source_name", "topic_ids", ...(f.enrichment ? ["enrichment"] : []), ...(f.script ? ["script"] : [])],
          episodeId: t.id, note: `일괄 발행 ${i + 1}/${targets.length}`,
        }).catch(() => undefined); // 기록 실패해도 발행은 성립 (spec/07 5장) — [발행 연결]로 잇는다
        ok.push(`${t.id} ${m.title.slice(0, 30)}${f.enrichment && !content.enrichment_applied ? " · 추천 메타 거부" : ""}${f.script && !content.script_applied ? " · 자막 거부" : ""}`);
        setSelected((s) => { const n = new Set(s); n.delete(t.id); return n; });
      } catch (e) {
        const anyE = e as { field?: string };
        bad.push(`${t.id} ${m.title.slice(0, 30)}: ${earErrMsg(e)}${anyE.field ? ` (필드: ${anyE.field})` : ""}`);
      }
    }
    setProgress(null); setBusy(false);
    setReport({ ok, bad });
    onDone();
    if (ok.length && !bad.length) setTimeout(() => router.push("/publish"), 1500);
  }, [picked, onDone, router]);

  return (
    <Panel title={`발행 대기 — 패키지 · 오디오 완료 (미발행) ${rows.length}편`}
      right={<span className="flex items-center gap-2 text-[11px] text-ink-soft">{loading > 0 && <span>메타 확인 중 {loading}편…</span>}<button className={btnCls()} disabled={busy || !ready.length} onClick={selectAll}>발행 가능 전부 선택</button><button className={btnCls()} disabled={busy || !selected.size} onClick={clearAll}>선택 해제</button></span>}>
      {rows.length === 0 ? (
        <p className="text-[13px] text-ink-soft">발행 대기 중인(패키지·오디오 완료·미발행) 에피소드가 없어요. 아래에서 파일을 직접 올려도 됩니다.</p>
      ) : (
        <div className="divide-y divide-line">
          {rows.map((r) => {
            const d = r.d;
            const disabled = busy || !d || !!r.block || !!r.err;
            return (
              <div key={r.id} className={`flex items-start gap-3 px-1 py-2 text-[13px] ${selected.has(r.id) ? "bg-[#f3f7fb]" : ""}`}>
                <input type="checkbox" className="mt-1" disabled={disabled} checked={selected.has(r.id)} onChange={() => toggle(r.id)} title={r.block ?? r.err ?? "일괄 발행 대상으로 선택"} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-ink">{d?.meta.title ?? r.title}</span>
                    <span className="text-[11px] text-ink-soft">{r.mid_topic}</span>
                    <span className="font-mono text-[11px] text-ink-soft">{r.id}</span>
                    {d && !r.block && <Badge tone="done">발행 가능</Badge>}
                    {r.block && <Badge tone="held">단일 발행 필요</Badge>}
                    {r.err && <Badge tone="failed">읽기 실패</Badge>}
                  </div>
                  {d && d.meta.title !== r.title && <div className="text-[11px] text-ink-soft">주제: {r.title}</div>}
                  {d && <div className="text-[11px] text-ink-soft">{d.meta.duration_min_estimate ?? "?"}분 · 소스 {(d.meta.sources ?? []).length}건 · {d.has_enrichment ? `추천 메타 v${d.enrichment_version ?? 1}` : "추천 메타 없음"} · {d.has_script ? `자막 ${d.script_segments ?? 0}건` : "자막 없음"} · 제품 주제 {r.topic?.name ?? "—"}</div>}
                  <div className="text-[11px]"><JudgeScore s={scores === null ? undefined : scores[r.id] ?? null} /></div>
                  {(r.block || r.err) && <div className="text-[11px] text-amber-700">{r.block ?? r.err}</div>}
                </div>
                <div className="flex shrink-0 items-center gap-1 text-[11px]">
                  <Link className="rounded border border-line px-2 py-1 hover:bg-[#f7f9fb]" href={`/episodes/${r.id}`} target="_blank" title="대본·판정·오디오 검수 (새 탭)">검수</Link>
                  <button className={btnCls()} disabled={busy} onClick={() => router.push(`/publish/upload?episode=${r.id}`)} title="제목·설명·소스·주제를 고쳐서 한 편만 발행">단일 발행</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {rows.length > 0 && (
        <div className="mt-3 grid gap-3 border-t border-line pt-3 lg:grid-cols-[1fr_auto]">
          <div className="space-y-1.5 text-[12.5px]">
            <div className="text-xs font-semibold text-ink-soft">게이트 2 검수 — 선택한 편 전체에 대해 확인 (admin.md 4.2-1)</div>
            {CHECKLIST.map((c, i) => (
              <label key={i} className="flex items-start gap-2">
                <input type="checkbox" className="mt-0.5" disabled={busy} checked={checks[i]} onChange={(e) => setChecks((arr) => arr.map((x, j) => (j === i ? e.target.checked : x)))} />
                <span>{c}</span>
              </label>
            ))}
            <p className="text-[11px] text-ink-soft">확인 기록은 편마다 제품 감사 로그(audit_logs)에 남아요. 제목·설명을 고칠 편은 [단일 발행]으로.</p>
          </div>
          <div className="flex flex-col items-stretch gap-2 lg:w-72">
            <button className={`${btnCls("primary", "md")} justify-center`} disabled={!canRun} onClick={() => void run()}>
              {busy ? "발행 중… (창을 닫지 마세요)" : `선택 ${picked.length}편 일괄 발행 — 즉시 공개`}
            </button>
            {progress && <p className="text-[11px] text-ink-soft">{progress}</p>}
            {report && (
              <div className={`rounded-md border p-2 text-[12px] ${report.bad.length ? "border-amber-200 bg-amber-50 text-amber-900" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
                <div>발행 {report.ok.length}편{report.bad.length ? ` · 실패 ${report.bad.length}편` : ""}</div>
                {report.bad.length > 0 && <ul className="mt-1 list-disc pl-4">{report.bad.map((b) => <li key={b}>{b}</li>)}</ul>}
              </div>
            )}
          </div>
        </div>
      )}
      <p className="mt-2 text-[11px] text-ink-soft">일괄 발행은 패키지의 제목·설명·소스와 중분류에 맞는 제품 주제를 그대로 써요. 행의 [검수]에서 대본·판정·오디오를 보고, 고칠 것이 있으면 [단일 발행]으로.{topics && topics.length === 0 ? " 제품 주제가 없어요 — 제품 주제 관리에서 먼저 생성." : ""}</p>
    </Panel>
  );
}
