import Link from "next/link";
import { notFound } from "next/navigation";
import { AutoRefresh } from "@/components/auto-refresh";
import { Badge, PageHeader, Panel, Table, Td } from "@/components/ui";
import { supabaseServer } from "@/lib/supabase-server";
import { fmtTime } from "@/lib/format";
import { SERIES_STATUS_LABEL, type SeriesRow } from "@/lib/series";
import { SeriesEditor } from "./series-editor";

/** 시리즈 화면 (spec/11 9장, KAN-136) — 설계안 편집 · [승인](게이트 S) · 편별 진행 · [시리즈 중단]. [시리즈 발행]은 6단계(BE KAN-134 뒤) */
export default async function SeriesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await supabaseServer();
  const { data } = await sb.from("series").select("*").eq("id", id).single();
  if (!data) notFound();
  const s = data as SeriesRow;
  const [{ data: eps }, { data: jobs }] = await Promise.all([
    sb.from("backlog").select("id,title,status,series_no,dedup_note").eq("series_id", id).order("series_no"),
    sb.from("jobs").select("id,status,error,created_at,finished_at").eq("type", "series_plan").eq("payload->>series_id", id).order("created_at", { ascending: false }).limit(3),
  ]);
  const planJob = jobs?.[0];
  const planning = s.status === "planning";
  return (
    <div className="space-y-6">
      {(planJob && ["queued", "claimed", "running"].includes(planJob.status)) || s.status === "approved" ? <AutoRefresh seconds={10} /> : null}
      <PageHeader title={s.name} breadcrumb={["파이프라인", "시리즈", s.name]} desc={`${s.mid_topic} · ${SERIES_STATUS_LABEL[s.status]}${s.approved_by ? ` · 승인 ${s.approved_by} ${fmtTime(s.approved_at)}` : ""}`} />
      {planJob && (
        <div className="rounded border border-line bg-panel px-3 py-2 text-xs text-ink-soft">
          설계안 작업: <Badge>{planJob.status}</Badge> {fmtTime(planJob.finished_at ?? planJob.created_at)}
          {planJob.status === "failed" && planJob.error && <span className="ml-2 text-rose-700">{String(planJob.error).split("\n")[0].slice(0, 200)}</span>}
          {["queued", "claimed", "running"].includes(planJob.status) && <span className="ml-2">서버 워커가 편 목록을 만드는 중 — 끝나면 아래에 채워진다</span>}
        </div>
      )}
      <Panel title="범위 (관리자 입력)" className="text-[13px] whitespace-pre-wrap">{s.scope_note ?? "-"}</Panel>
      <SeriesEditor id={s.id} status={s.status} name={s.name} introLine={s.intro_line ?? ""} plan={Array.isArray(s.plan) ? s.plan : []} />
      {!planning && (
        <Panel title={`편 후보 (${eps?.length ?? 0}/${s.total_episodes ?? "-"})`} flush>
          <Table head={["화", "후보", "상태", "메모"]} empty="아직 후보가 없다 — 승인하면 편마다 주제 기획 작업이 걸린다">
            {(eps ?? []).map((e) => (
              <tr key={e.id} className="align-top">
                <Td className="whitespace-nowrap font-mono text-xs">{e.series_no}화</Td>
                <Td><Link className="underline-offset-2 hover:underline" href={`/backlog?q=${e.id}`}>{e.id}</Link> <span className="text-ink">{e.title}</span></Td>
                <Td><Badge value={e.status} /></Td>
                <Td className="max-w-xl text-xs text-ink-soft">{String(e.dedup_note ?? "").slice(0, 160)}</Td>
              </tr>
            ))}
          </Table>
          <p className="px-4 py-2 text-[11px] text-ink-soft">시리즈 편의 게이트 1 승인은 시리즈 대본 단계(spec/11 10장 4단계)가 들어간 뒤에 열린다. [시리즈 발행]은 서버 시리즈 API(BE KAN-134) 뒤에 붙는다.</p>
        </Panel>
      )}
    </div>
  );
}
