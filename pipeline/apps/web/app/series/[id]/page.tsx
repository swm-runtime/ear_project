import Link from "next/link";
import { notFound } from "next/navigation";
import { AutoRefresh } from "@/components/auto-refresh";
import { Badge, PageHeader, Panel, Table, Td } from "@/components/ui";
import { supabaseServer } from "@/lib/supabase-server";
import { fmtTime } from "@/lib/format";
import { pipelineLocale } from "@/lib/locale";
import { SERIES_STATUS_LABEL, type SeriesRow } from "@/lib/series";
import { SeriesEditor } from "./series-editor";
import { SeriesEpisodeActions } from "./series-episode-actions";
import { SeriesPublish } from "./series-publish";
import { SeriesThumb } from "./series-thumb";
import { seriesPublishEpisodes } from "../actions";
import { loadPublications } from "@/lib/publications-server";
import { publicationOf } from "@ear/pipeline/publication";

/** 시리즈 화면 (spec/11 9장, KAN-136) — 설계안 편집 · [승인](게이트 S) · 편별 진행 · [시리즈 중단] · [시리즈 발행]·[시리즈 회수](7장, 6단계) */
export default async function SeriesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await supabaseServer();
  const { data } = await sb.from("series").select("*").eq("id", id).single();
  if (!data) notFound();
  const s = data as SeriesRow;
  const [{ data: eps }, { data: jobs }] = await Promise.all([
    sb.from("backlog").select("id,title,status,series_no,dedup_note").eq("series_id", id).order("series_no").order("id"),
    sb.from("jobs").select("id,status,error,created_at,finished_at").eq("type", "series_plan").eq("payload->>series_id", id).order("created_at", { ascending: false }).limit(3),
  ]);
  const planJob = jobs?.[0];
  const publications = await loadPublications(); // 상수 + 콘솔에서 만든 간행물(0036)
  // 반려된 옛 후보는 그 화에 살아 있는 후보가 있으면 숨긴다(2026-10-27 — [다시 기획] 뒤 한 화에 두 줄로 보여 혼란). 살아 있는 후보가 없는 화의 반려 행만 남겨 [다시 기획]·[보류로]를 쓸 수 있게 한다
  const liveNos = new Set((eps ?? []).filter((e) => e.status !== "rejected").map((e) => e.series_no));
  const shown = (eps ?? []).filter((e) => e.status !== "rejected" || !liveNos.has(e.series_no));
  const hidden = (eps?.length ?? 0) - shown.length;
  const pubEps = ["approved", "published"].includes(s.status) ? await seriesPublishEpisodes(id) : [];
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
      {!["cancelled", "withdrawn"].includes(s.status) && <SeriesThumb id={s.id} locale={pipelineLocale()} publication={s.publication ?? null} word={s.thumb_word ?? ""} label={s.thumb_label ?? ""} box={s.thumb_box ?? ""} hasBase={!!s.thumb_base_key} productSeriesId={s.published_series_id ?? null} publications={publications} layers={s.thumb_layers ?? ""} />}
      <SeriesEditor id={s.id} status={s.status} name={s.name} introLine={s.intro_line ?? ""} plan={Array.isArray(s.plan) ? s.plan : []} short={s.length_profile === "short"} />
      {!planning && (
        <Panel title={`편 후보 (${(eps ?? []).filter((e) => e.status !== "rejected").length}/${s.total_episodes ?? "-"})`} flush>
          <Table head={["화", "후보", "상태", "메모", ""]} empty="아직 후보가 없다 — 승인하면 편마다 주제 기획 작업이 걸린다">
            {shown.map((e) => (
              <tr key={e.id} className="align-top">
                <Td className="whitespace-nowrap font-mono text-xs">{e.series_no}화</Td>
                <Td><Link className="underline-offset-2 hover:underline" href={`/backlog?q=${e.id}`}>{e.id}</Link> <span className="text-ink">{e.title}</span></Td>
                <Td><Badge value={e.status} /></Td>
                <Td className="max-w-xl text-xs text-ink-soft">{String(e.dedup_note ?? "").slice(0, 160)}</Td>
                <Td className="whitespace-nowrap">{s.status === "approved" && <SeriesEpisodeActions seriesId={s.id} backlogId={e.id} no={e.series_no as number} status={e.status} />}</Td>
              </tr>
            ))}
          </Table>
          <p className="px-4 py-2 text-[11px] text-ink-soft">게이트 1은 편마다 백로그에서 승인한다. 승인해도 k화 초안은 k-1화 초안이 끝난 뒤에 시작한다(spec/11 5.3). 반려·보류된 편은 [다시 기획]으로 같은 화 번호에 후보를 새로 만들거나, 반려를 [보류로] 되돌려 백로그에서 [보강]한다 — 반려된 편이 남아 있으면 뒤 편 초안이 시작되지 않는다. 시리즈 편에는 개별 [발행]이 없다 — 전 편이 패키지까지 끝나면 아래 [시리즈 발행]으로 한꺼번에 올린다(7장).{hidden > 0 && ` 다시 기획으로 대체된 반려 후보 ${hidden}건은 숨겼다(백로그 종료 탭에 있다).`}</p>
        </Panel>
      )}
      {s.length_profile === "short" && (
        <Panel title="짧은 판 시리즈 (KAN-296 실험)">
          <p className="text-[12.5px] leading-relaxed text-ink-soft">발행된 시리즈 <Link href={`/series/${s.remake_of}`} className="text-brand-ink underline">원본</Link>을 5~12분 편으로 다시 만든 시리즈다. 원본 편 하나를 개념 단위로 1~3편으로 나눈 설계안을 워커가 짠다 — 위 설계안의 원본 열이 각 편이 소스를 물려받는 원본 편이다. 설계안을 보고 [승인]하면 편 후보가 생기고 1화부터 순서대로 초안이 돈다. 새 앱 배포 뒤 가입한 사용자에게만 나가야 해서, 백엔드의 코호트 분리·변형 필드(KAN-298)가 생기기 전에는 [시리즈 발행]을 막아 둔다. 진행은 <Link href="/experiments" className="text-brand-ink underline">실험 탭</Link>에서도 본다.</p>
        </Panel>
      )}
      {["approved", "published"].includes(s.status) && s.total_episodes && s.length_profile !== "short" && (
        <SeriesPublish id={s.id} name={s.name} introLine={s.intro_line ?? ""} total={s.total_episodes} status={s.status} productSeriesId={s.published_series_id ?? null} publisherName={publicationOf(s.publication ?? null, publications)?.name ?? null} episodes={pubEps} />
      )}
    </div>
  );
}
