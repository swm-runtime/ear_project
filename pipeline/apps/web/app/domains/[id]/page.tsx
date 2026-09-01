import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { fmtTime } from "@/lib/format";
import { DecideForm } from "@/components/decide-form";
import { PageHeader, Panel } from "@/components/ui";

export default async function DomainPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await supabaseServer();
  const { data: d } = await sb.from("domains").select("*").eq("id", id).single();
  if (!d) notFound();
  const { count } = await sb.from("sources").select("id", { count: "exact", head: true }).eq("domain_id", id);
  return (
    <div>
      <PageHeader title={d.domain} breadcrumb={["파이프라인", "소스 풀", d.domain]} desc={`${d.publisher} · ${d.category}`} />
      <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="원천 정보">
      <div className="text-[13px]">
        <dl className="grid grid-cols-[6rem_1fr] gap-y-1.5 text-xs">
          <dt className="text-ink-soft">피드</dt><dd>{d.feed_url ? <a className="underline" href={d.feed_url} target="_blank" rel="noreferrer">{d.feed_url}</a> : "없음 (모드 B 전용)"}</dd>
          <dt className="text-ink-soft">중분류</dt><dd>{(d.topic_coverage ?? []).join(" · ")}</dd>
          <dt className="text-ink-soft">적재 소스</dt><dd>{count ?? 0}건</dd>
          <dt className="text-ink-soft">판정</dt><dd>{d.decided_by ? `${d.decided_by} · ${fmtTime(d.decided_at)}` : "미판정"}</dd>
          <dt className="text-ink-soft">근거</dt><dd>{d.license_basis ?? "-"}</dd>
        </dl>
        <h2 className="mt-4 text-[11px] font-semibold uppercase tracking-wide text-ink-soft">판정 보조 증거</h2>
        <div className="mt-1 whitespace-pre-wrap rounded bg-[#f7f9fb] p-2.5 text-xs leading-relaxed">{(d.note ?? "").split(" | ").join("\n• ")}</div>
        <div className="mt-2 text-xs text-ink-soft">확인 링크: <a className="underline" href={`https://${d.domain.split("/")[0]}/robots.txt`} target="_blank" rel="noreferrer">robots.txt</a> · <a className="underline" href={`https://${d.domain}`} target="_blank" rel="noreferrer">사이트</a></div>
      </div>
      </Panel>
      <DecideForm d={d} />
      </div>
    </div>
  );
}
