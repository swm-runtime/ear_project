import Link from "next/link";
import { AutoRefresh } from "@/components/auto-refresh";
import { Badge, PageHeader, Panel, Td } from "@/components/ui";
import { StageTrack, ProblemLine } from "@/components/stage-track";
import { Table } from "@/components/ui";
import { computeStages, type JobRow } from "@/lib/stages";
import { supabaseServer } from "@/lib/supabase-server";
import { fmtTime } from "@/lib/format";
import { pipelineLocale } from "@/lib/locale";
import { LENGTH_SPECS } from "@ear/pipeline/length-profile";
import { RemakePicker, type OriginalRow } from "./remake-picker";

/**
 * 실험 탭 (0040, KAN-296 단기 실험 ④ — 2026-10-29 박수헌): 발행된 단편을 골라 **짧은 판**(5~12분·구간 2~3개·선취 훅)을 다시 만든다.
 * 짧은 판은 새 앱 배포 뒤 가입한 사용자에게만 나간다(BE 코호트 분리) — 그래서 백로그·일반 발행 목록에는 섞이지 않고 여기서만 보인다.
 * 위: 재제작 편 진행(초안→QA→비평→TTS→패키지). 아래: 발행된 편 목록에서 고르기.
 */
export default async function ExperimentsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const topic = sp.topic ?? ""; const q = (sp.q ?? "").trim().toLowerCase();
  if (pipelineLocale() !== "ko") return <div><PageHeader title="실험" breadcrumb={["파이프라인", "실험"]} desc="짧은 판 실험은 한국판 파이프라인에만 있다." /></div>;
  const sb = await supabaseServer();
  const [{ data: originals }, { data: remakes }, { data: rjobs }] = await Promise.all([
    sb.from("backlog").select("id,title,mid_topic,published_at").eq("status", "published").is("series_id", null).is("remake_of", null).order("published_at", { ascending: false }),
    sb.from("backlog").select("id,title,mid_topic,status,remake_of,created_at,published_content_ref").not("remake_of", "is", null).order("created_at", { ascending: false }),
    sb.from("jobs").select("payload,status,error,created_at").eq("type", "remake").order("created_at", { ascending: false }).limit(300),
  ]);
  const remakeIds = (remakes ?? []).map((r) => r.id);
  const origIds = (originals ?? []).map((r) => r.id);
  const [{ data: eps }, { data: jobs }, { data: origEps }] = await Promise.all([
    remakeIds.length ? sb.from("episodes").select("id,backlog_id,script_key,qa_report_key,critic_report_key,audio_dist_key,critic_verdicts,created_at").in("backlog_id", remakeIds).order("created_at", { ascending: false }) : Promise.resolve({ data: [] as any[] }),
    remakeIds.length ? sb.from("jobs").select("type,status,attempt,error,result,created_at,payload").in("type", ["draft", "qa", "critic", "tts", "package"]).order("created_at", { ascending: false }).limit(2000) : Promise.resolve({ data: [] as any[] }),
    origIds.length ? sb.from("episodes").select("id,backlog_id,created_at").in("backlog_id", origIds).order("created_at", { ascending: false }) : Promise.resolve({ data: [] as any[] }),
  ]);
  const jobsOf = new Map<string, JobRow[]>();
  for (const j of (jobs ?? []) as JobRow[]) { const id = String(j.payload?.episode_id ?? ""); if (id) jobsOf.set(id, [...(jobsOf.get(id) ?? []), j]); }
  const epOf = new Map<string, any>(); for (const e of eps ?? []) if (!epOf.has(e.backlog_id)) epOf.set(e.backlog_id, e);
  const origEpOf = new Map<string, string>(); for (const e of origEps ?? []) if (!origEpOf.has(e.backlog_id)) origEpOf.set(e.backlog_id, e.id);
  const titleOf = new Map((originals ?? []).map((o) => [o.id, o.title]));
  // 원본별 짧은 판(살아 있는 것) · 큐에 든 요청 · 실패한 요청
  const liveRemake = new Map<string, { id: string; status: string }>();
  for (const r of remakes ?? []) if (!["rejected", "expired"].includes(r.status) && !liveRemake.has(r.remake_of)) liveRemake.set(r.remake_of, { id: r.id, status: r.status });
  const queued = new Set<string>(); const failedReq: { id: string; error: string; at: string }[] = [];
  for (const j of rjobs ?? []) { const b = String((j.payload as { backlog_id?: string } | null)?.backlog_id ?? ""); if (!b) continue; if (["queued", "claimed", "running"].includes(j.status)) queued.add(b); else if (j.status === "failed" && !liveRemake.has(b) && !failedReq.some((f) => f.id === b)) failedReq.push({ id: b, error: (j.error ?? "").split("\n")[0].slice(0, 140), at: j.created_at }); }
  const topics = [...new Set((originals ?? []).map((o) => o.mid_topic))].sort();
  const rows: OriginalRow[] = (originals ?? [])
    .filter((o) => (!topic || o.mid_topic === topic) && (!q || `${o.id} ${o.title}`.toLowerCase().includes(q)))
    .map((o) => ({ id: o.id, title: o.title, mid_topic: o.mid_topic, published_at: o.published_at, episode_id: origEpOf.get(o.id) ?? null, remake: liveRemake.get(o.id) ?? null, queued: queued.has(o.id) }));
  const s = LENGTH_SPECS.short;
  const done = (remakes ?? []).filter((r) => ["packaged", "published"].includes(r.status)).length;
  const hrefFor = (t: string) => `/experiments${t ? `?topic=${encodeURIComponent(t)}` : ""}${q ? `${t ? "&" : "?"}q=${encodeURIComponent(q)}` : ""}`;
  return (
    <div className="space-y-6">
      <AutoRefresh seconds={20} />
      <PageHeader title="실험 — 짧은 판" breadcrumb={["파이프라인", "실험"]}
        desc={`발행된 단편의 주제·소스로 ${s.floorMin}~${s.maxMin}분(본문 구간 ${s.sections[0]}~${s.sections[1]}개, 선취 훅) 짧은 판을 다시 만든다(KAN-296). 설계는 원본 구성안을 보지 않고 소스만 받아 새로 짜고, 축은 원본과 같은 질문을 유지한다. 제목·썸네일은 원본 그대로. 짧은 판은 새 앱 배포 뒤 가입한 사용자에게만 나가므로(BE 코호트 분리) 백로그·일반 발행 목록에는 보이지 않는다 — 발행 준비까지 ${done}/${remakeIds.length}편.`} />

      <Panel title={`짧은 판 진행 (${remakeIds.length})`} flush>
        <Table head={["원본 → 짧은 판", "상태", "진행", "막힌 곳 · 다음 행동", "만든 시각"]} empty="아직 짧은 판이 없다 — 아래 발행된 편에서 고른다">
          {(remakes ?? []).map((r) => {
            const e = epOf.get(r.id);
            const st = e ? computeStages(e, { id: r.id, status: r.status, published_content_ref: r.published_content_ref ?? null }, jobsOf.get(e.id) ?? []) : null;
            return (
              <tr key={r.id} className="hover:bg-[#f7f9fb]">
                <Td className="min-w-[280px]">
                  <div className="flex flex-col gap-0.5">
                    {e ? <Link href={`/episodes/${e.id}`} className="font-medium text-ink hover:underline">{r.title}</Link> : <span className="font-medium text-ink">{r.title}</span>}
                    <span className="font-mono text-[11px] text-ink-soft">{r.remake_of} → {r.id}{e ? ` · ${e.id}` : ""}{origEpOf.get(r.remake_of) ? <> · 원본 <Link href={`/episodes/${origEpOf.get(r.remake_of)}`} className="text-brand-ink hover:underline">{origEpOf.get(r.remake_of)}</Link></> : null}</span>
                  </div>
                </Td>
                <Td><Badge value={r.status} /></Td>
                <Td>{st ? <StageTrack stages={st.stages} /> : <span className="text-[11px] text-ink-soft">초안 대기</span>}</Td>
                <Td className="min-w-[220px] text-[12px]">{st?.problem ? <ProblemLine p={st.problem} /> : <span className="text-ink-soft">—</span>}</Td>
                <Td className="whitespace-nowrap text-ink-soft">{fmtTime(r.created_at)}</Td>
              </tr>
            );
          })}
        </Table>
        {failedReq.length > 0 && (
          <div className="border-t border-line px-4 py-2 text-[12px] text-rose-700">
            요청 실패 {failedReq.length}건: {failedReq.map((f) => <span key={f.id} className="mr-3"><span className="font-mono">{f.id}</span> {titleOf.get(f.id) ? `"${titleOf.get(f.id)}"` : ""} — {f.error}</span>)}
          </div>
        )}
      </Panel>

      <Panel title={`발행된 편 (${rows.length}/${(originals ?? []).length})`} flush>
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2 text-[12.5px]">
          <form className="flex items-center gap-2" action="/experiments" method="get">
            <select name="topic" defaultValue={topic} className="rounded border border-line px-2 py-1 text-[12.5px]">
              <option value="">주제 전체</option>
              {topics.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <input name="q" defaultValue={sp.q ?? ""} placeholder="제목·ID 검색" className="w-56 rounded border border-line px-2 py-1 text-[12.5px] outline-none focus:border-brand" />
            <button className="rounded border border-line px-2 py-1 text-[12.5px] hover:bg-slate-50" type="submit">적용</button>
            {(topic || q) && <Link href="/experiments" className="text-ink-soft hover:underline">초기화</Link>}
          </form>
          <span className="ml-auto text-ink-soft">주제별: {topics.map((t) => <Link key={t} href={hrefFor(t)} className={`mr-2 hover:underline ${t === topic ? "font-semibold text-ink" : ""}`}>{t} {(originals ?? []).filter((o) => o.mid_topic === t).length}</Link>)}</span>
        </div>
        <div className="p-3">
          <RemakePicker rows={rows} />
        </div>
      </Panel>
    </div>
  );
}
