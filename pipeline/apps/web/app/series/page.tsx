import Link from "next/link";
import { AutoRefresh } from "@/components/auto-refresh";
import { Badge, LinkBtn, PageHeader, Panel, Table, Td } from "@/components/ui";
import { supabaseServer } from "@/lib/supabase-server";
import { fmtTime } from "@/lib/format";
import { pipelineLocale } from "@/lib/locale";
import { SERIES_STATUS_LABEL, type SeriesRow } from "@/lib/series";
import { ProductSeriesCovers } from "./product-series-covers";
import { loadPublications } from "@/lib/publications-server";

/** 시리즈 목록 (spec/11 9장, KAN-136) — 설계안·승인·편별 진행 */
export default async function SeriesListPage() {
  const sb = await supabaseServer();
  const [{ data: rows }, { data: eps }] = await Promise.all([
    sb.from("series").select("*").order("created_at", { ascending: false }).limit(100),
    sb.from("backlog").select("series_id,status").not("series_id", "is", null),
  ]);
  const publications = await loadPublications();
  const prog = new Map<string, Record<string, number>>();
  for (const e of eps ?? []) { const m = prog.get(e.series_id) ?? {}; m[e.status] = (m[e.status] ?? 0) + 1; prog.set(e.series_id, m); }
  return (
    <div className="space-y-6">
      <AutoRefresh seconds={15} />
      <PageHeader title="시리즈" breadcrumb={["파이프라인", "시리즈"]} desc="처음부터 N편으로 기획한 주제 묶음(spec/11). 설계안을 고쳐 [승인]하면 편마다 주제 기획 후보가 생긴다. 발행은 전 편이 준비된 뒤 시리즈 단위로 한다."
        actions={<LinkBtn href="/sweep/topic" kind="primary">새 시리즈 (주제 기획)</LinkBtn>} />
      <Panel flush>
        <Table head={["시리즈", "주제", "편수", "상태", "편 진행", "만든 시각"]} empty="시리즈가 없다 — [주제 기획]에서 '시리즈'로 시작한다">
          {((rows ?? []) as SeriesRow[]).map((s) => {
            const p = prog.get(s.id) ?? {};
            const total = s.total_episodes ?? (Array.isArray(s.plan) ? s.plan.length : 0);
            return (
              <tr key={s.id} className="align-top hover:bg-[#f7f9fb]">
                <Td><Link className="font-medium underline-offset-2 hover:underline" href={`/series/${s.id}`}>{s.name}</Link>{s.intro_line && <div className="mt-0.5 max-w-xl text-xs text-ink-soft">{s.intro_line}</div>}</Td>
                <Td className="whitespace-nowrap text-xs">{s.mid_topic}</Td>
                <Td className="whitespace-nowrap text-xs">{total ? `${total}편` : "설계 중"}</Td>
                <Td><Badge tone={s.status === "approved" || s.status === "published" ? "done" : s.status === "cancelled" || s.status === "withdrawn" ? "rejected" : "queued"}>{SERIES_STATUS_LABEL[s.status]}</Badge></Td>
                <Td className="text-xs text-ink-soft">{Object.keys(p).length ? Object.entries(p).map(([k, n]) => `${k} ${n}`).join(" · ") : "-"}</Td>
                <Td className="whitespace-nowrap text-xs text-ink-soft">{fmtTime(s.created_at)}</Td>
              </tr>
            );
          })}
        </Table>
      </Panel>
      <ProductSeriesCovers locale={pipelineLocale()} publications={publications} />
    </div>
  );
}
