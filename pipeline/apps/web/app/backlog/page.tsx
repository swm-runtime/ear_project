import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";
import { Badge, PageHeader, Panel, Table, Td } from "@/components/ui";
import { fmtTime } from "@/lib/format";
import { GateButtons } from "./gate-buttons";

const GROUPS: [string, string[], string][] = [
  ["게이트 1 대기", ["proposed", "held"], "사람이 주제+소스 묶음을 승인한다. 승인하면 워커가 대본 생성을 시작한다"],
  ["사람 검토 필요", ["review_required"], "QA 3회 실패 — 사람이 수정하거나 반려한다"],
  ["제작 중", ["approved", "claimed", "drafted"], ""],
  ["QA 통과 · 판정 대기", ["qa_passed", "packaged"], ""],
  ["종료", ["published", "rejected", "expired"], ""],
];

export default async function BacklogPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const sb = await supabaseServer();
  const [{ data: rows }, { data: eps }] = await Promise.all([
    sb.from("backlog").select("id,mid_topic,title,target_fit,angle,sources,status,dedup_note,approved_by,approved_at").order("id", { ascending: false }),
    sb.from("episodes").select("id,backlog_id"),
  ]);
  const epOf = new Map((eps ?? []).map((e) => [e.backlog_id, e.id]));
  const filtered = (rows ?? []).filter((r) => !q || `${r.id} ${r.title} ${r.mid_topic} ${r.angle ?? ""}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div>
      <PageHeader title="백로그" breadcrumb={["파이프라인", "백로그"]} desc="AI가 소스 군집에서 뽑은 에피소드 후보. 승인(게이트 1)은 사람만 하며, 승인 즉시 워커가 대본 생성을 시작한다." />
      <form className="mb-4 flex gap-2">
        <input name="q" defaultValue={q ?? ""} placeholder="제목·축·중분류 검색" className="w-72 rounded border border-line bg-panel px-3 py-1.5 text-[13px] outline-none focus:border-brand" />
      </form>

      <div className="space-y-5">
        {GROUPS.map(([name, statuses, desc]) => {
          const items = filtered.filter((r) => statuses.includes(r.status));
          if (!items.length) return null;
          return (
            <Panel key={name} title={`${name} (${items.length})`} right={desc ? <span className="text-[11px] text-ink-soft">{desc}</span> : null} flush>
              <Table head={["ID", "제목 · 축", "중분류", "소스", "상태", "액션"]}>
                {items.map((r) => (
                  <tr key={r.id} className="align-top hover:bg-[#f7f9fb]">
                    <Td className="whitespace-nowrap font-mono text-xs text-ink-soft">{r.id}</Td>
                    <Td>
                      <div className="font-medium">{r.title}</div>
                      {r.angle && <p className="mt-0.5 line-clamp-2 max-w-2xl text-xs leading-relaxed text-ink-soft" title={r.angle}>{r.angle}</p>}
                      {r.target_fit && <p className="mt-0.5 text-[11px] text-ink-soft">타깃: {r.target_fit}</p>}
                      {r.dedup_note?.includes("⚠️") && <p className="mt-1 text-[11px] text-amber-700">{r.dedup_note.split(" | ")[0]}</p>}
                      <details className="mt-1">
                        <summary className="cursor-pointer text-[11px] text-ink-soft">소스 목록</summary>
                        <ul className="mt-1 space-y-0.5">
                          {(r.sources ?? []).map((s: any, i: number) => (
                            <li key={i} className="text-[11px]">
                              <Badge value={s.tier} />{" "}
                              {s.backbone && <span className="text-amber-600">★</span>}{" "}
                              <a className="underline" href={s.url} target="_blank" rel="noreferrer">{s.title}</a>{" "}
                              <span className="text-ink-soft">{s.publisher}</span>
                            </li>
                          ))}
                        </ul>
                      </details>
                    </Td>
                    <Td className="whitespace-nowrap text-xs text-ink-soft">{r.mid_topic}</Td>
                    <Td className="text-center tabular-nums">{Array.isArray(r.sources) ? r.sources.length : 0}</Td>
                    <Td>
                      <Badge value={r.status} />
                      {r.approved_by && <div className="mt-0.5 whitespace-nowrap text-[11px] text-ink-soft">{r.approved_by} · {fmtTime(r.approved_at)}</div>}
                    </Td>
                    <Td className="whitespace-nowrap">
                      <div className="flex flex-col items-start gap-1">
                        <GateButtons id={r.id} status={r.status} />
                        {epOf.get(r.id) && <Link href={`/episodes/${epOf.get(r.id)}`} className="whitespace-nowrap text-[11px] underline">{epOf.get(r.id)} →</Link>}
                      </div>
                    </Td>
                  </tr>
                ))}
              </Table>
            </Panel>
          );
        })}
      </div>
    </div>
  );
}
