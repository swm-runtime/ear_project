import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";
import { PageHeader, Panel, Table } from "@/components/ui";
import { AddDomainForm } from "./add-form";
import { DomainRows } from "./domain-rows";
import { CheckButton } from "./check-button";

const TIERS: [string, string][] = [["candidate", "판정 대기"], ["allow_open", "1군"], ["allow_support", "2군"], ["hold", "보류"], ["blocked", "차단"], ["all", "전체"]];

export default async function DomainsPage({ searchParams }: { searchParams: Promise<{ tier?: string; topic?: string; q?: string }> }) {
  const { tier = "candidate", topic, q } = await searchParams;
  const sb = await supabaseServer();
  const [{ data: all }, { data: statRows }] = await Promise.all([
    sb.from("domains").select("id,domain,publisher,tier,category,feed_url,topic_coverage,decided_by,decided_at,license_basis,note,evidence").order("domain"),
    sb.from("domain_stats").select("domain_id,source_count,last_swept"),
  ]);
  const stats = Object.fromEntries((statRows ?? []).map((s: any) => [s.domain_id, s]));
  const rows = (all ?? []).filter((r) => (tier === "all" || r.tier === tier) && (!topic || (r.topic_coverage ?? []).includes(topic)) && (!q || `${r.domain} ${r.publisher} ${r.note ?? ""}`.toLowerCase().includes(q.toLowerCase())));
  const topics = Array.from(new Set((all ?? []).flatMap((r) => r.topic_coverage ?? []))).sort();
  const counts = Object.fromEntries(TIERS.map(([t]) => [t, t === "all" ? (all ?? []).length : (all ?? []).filter((r) => r.tier === t).length]));
  // 중분류 탭 개수는 현재 티어 기준 — 티어를 고른 뒤 주제를 좁힐 때 "이 티어에 몇 개"가 보이게 (검색어 q 는 무시)
  const inTier = (all ?? []).filter((r) => tier === "all" || r.tier === tier);
  const topicCounts = Object.fromEntries(topics.map((t) => [t, inTier.filter((r) => (r.topic_coverage ?? []).includes(t)).length]));
  const qs = (o: Record<string, string | undefined>) => "?" + new URLSearchParams(Object.entries({ tier, topic, q, ...o }).filter(([, v]) => v) as [string, string][]).toString();

  return (
    <div>
      <PageHeader title="소스 풀" breadcrumb={["파이프라인", "소스 풀"]} desc="계층 판정은 사람만 한다 (spec/01 4장). 행을 클릭하면 판정 보조 증거와 판정 폼이 그 자리에서 열리고, 계층을 저장하면 판정자·시각이 자동 기록된다." />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <nav className="flex flex-wrap gap-1">
          {TIERS.map(([t, name]) => (
            <Link key={t} href={qs({ tier: t })} className={`rounded px-2.5 py-1.5 text-xs font-medium transition ${tier === t ? "bg-brand text-white" : "border border-line bg-panel text-ink hover:bg-[#f7f9fb]"}`}>
              {name} <span className="opacity-70">{counts[t]}</span>
            </Link>
          ))}
        </nav>
        <CheckButton unchecked={(all ?? []).filter((r) => r.tier === "candidate" && !r.evidence).length} total={(all ?? []).filter((r) => r.tier === "candidate").length} />
        <form className="ml-auto flex gap-2">
          <input type="hidden" name="tier" value={tier} />
          {topic && <input type="hidden" name="topic" value={topic} />}
          <input name="q" defaultValue={q ?? ""} placeholder="도메인·발행처·증거 검색" className="w-64 rounded border border-line bg-panel px-3 py-1.5 text-[13px] outline-none focus:border-brand" />
        </form>
      </div>
      <nav className="mb-3 flex flex-wrap gap-1 text-xs">
        <Link href={qs({ topic: undefined })} className={`rounded border px-2 py-1 ${!topic ? "border-ink bg-panel font-medium" : "border-line bg-panel text-ink-soft hover:text-ink"}`}>모든 중분류 <span className="opacity-60">{inTier.length}</span></Link>
        {topics.map((t) => <Link key={t} href={qs({ topic: t })} className={`rounded border px-2 py-1 ${topic === t ? "border-ink bg-panel font-medium" : "border-line bg-panel text-ink-soft hover:text-ink"}`}>{t} <span className="opacity-60">{topicCounts[t]}</span></Link>)}
      </nav>

      <Panel flush className="mb-4">
        <Table head={["", "계층", "도메인", "발행 주체", "중분류", "수집", "판정"]} empty="해당 조건의 도메인이 없습니다">
          <DomainRows rows={rows} stats={stats} />
        </Table>
      </Panel>
      <AddDomainForm topics={topics} />
    </div>
  );
}
