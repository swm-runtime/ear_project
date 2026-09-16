import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";
import { Badge, PageHeader, Panel, Table, Td } from "@/components/ui";
import { fmtTime } from "@/lib/format";
import { GateButtons } from "./gate-buttons";

const GROUPS: [string, string[], string][] = [
  ["에피소드 승인 대기", ["proposed", "held"], "사람이 주제+소스 묶음을 승인한다. 승인하면 워커가 대본 생성을 시작한다"],
  ["사람 검토 필요", ["review_required"], "QA 3회 실패 — 사람이 수정하거나 반려한다"],
  ["제작 중", ["approved", "claimed", "drafted"], ""],
  ["QA 통과 · 판정 대기", ["qa_passed", "packaged"], ""],
  ["종료", ["published", "rejected", "expired"], ""],
];

const PAGE = 10; // 묶음마다 한 번에 보이는 행 (2026-09-09 박수헌: 묶음이 쌓이면 스크롤이 너무 길다)

export default async function BacklogPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const q = sp.q;
  // 묶음별 페이지는 URL 의 p0..p4 — 다른 묶음의 페이지와 검색어를 보존한 채 한 묶음만 넘긴다
  const pageOf = (i: number) => Math.max(1, Number(sp[`p${i}`] ?? 1) || 1);
  const hrefFor = (i: number, page: number) => {
    const u = new URLSearchParams();
    if (q) u.set("q", q);
    GROUPS.forEach((_, j) => { const pj = j === i ? page : pageOf(j); if (pj > 1) u.set(`p${j}`, String(pj)); });
    const qs = u.toString();
    return `/backlog${qs ? `?${qs}` : ""}#g${i}`;
  };
  const sb = await supabaseServer();
  const [{ data: rows }, { data: eps }, { data: rjobs }] = await Promise.all([
    sb.from("backlog").select("id,mid_topic,title,target_fit,angle,sources,status,dedup_note,approved_by,approved_at,axis,axis_type,gaps,cluster_version,reinforced_at,reinforce_note").order("id", { ascending: false }),
    sb.from("episodes").select("id,backlog_id,regression_kind"),
    sb.from("jobs").select("payload").eq("type", "sweep").in("status", ["queued", "claimed", "running"]).eq("payload->>mode", "B"), // 보강 스윕 진행 중 (0019)
  ]);
  const reinforcing = new Set((rjobs ?? []).map((j) => String((j.payload as { backlog_id?: string } | null)?.backlog_id ?? "")));
  const epOf = new Map((eps ?? []).map((e) => [e.backlog_id, e.id]));
  // 회귀 세트 실험용(심은 오류본·저품질 앵커)의 백로그 행은 게이트 1 대상이 아니다 — 비평 워커가 요구하는 제목·중분류 자리일 뿐. 여기서는 숨기고 에피소드 목록의 회귀 배지로만 본다 (2026-09-07)
  const experimental = new Set((eps ?? []).filter((e) => e.regression_kind === "planted" || e.regression_kind === "anchor_low").map((e) => e.backlog_id));
  const idNum = (id: string) => Number(id.replace(/\D/g, "")) || 0; // DB 의 order("id") 는 문자열 정렬이라 C100 이 C99 앞이 아니라 뒤로 간다 — 숫자로 내림차순 (2026-09-10)
  const filtered = (rows ?? []).filter((r) => !experimental.has(r.id)).filter((r) => !q || `${r.id} ${r.title} ${r.mid_topic} ${r.angle ?? ""}`.toLowerCase().includes(q.toLowerCase())).sort((a, b) => idNum(b.id) - idNum(a.id));

  return (
    <div>
      <PageHeader title="백로그" breadcrumb={["파이프라인", "백로그"]} desc="AI가 소스 군집에서 뽑은 에피소드 후보. 승인(게이트 1)은 사람만 하며, 승인 즉시 워커가 대본 생성을 시작한다." />
      <form className="mb-4 flex gap-2">
        <input name="q" defaultValue={q ?? ""} placeholder="제목·축·중분류 검색" className="w-72 rounded border border-line bg-panel px-3 py-1.5 text-[13px] outline-none focus:border-brand" />
      </form>

      <div className="space-y-5">
        {GROUPS.map(([name, statuses, desc], gi) => {
          const all = filtered.filter((r) => statuses.includes(r.status));
          if (!all.length) return null;
          const pages = Math.ceil(all.length / PAGE);
          const page = Math.min(pageOf(gi), pages);
          const items = all.slice((page - 1) * PAGE, page * PAGE);
          const pager = pages > 1 && (
            <span className="flex items-center gap-2 text-[11px] text-ink-soft">
              {page > 1 ? <Link href={hrefFor(gi, page - 1)} className="rounded border border-line bg-white px-2 py-0.5 text-ink hover:bg-[#f7f9fb]">이전</Link> : <span className="rounded border border-line px-2 py-0.5 opacity-40">이전</span>}
              <span className="tabular-nums">{page} / {pages}</span>
              {page < pages ? <Link href={hrefFor(gi, page + 1)} className="rounded border border-line bg-white px-2 py-0.5 text-ink hover:bg-[#f7f9fb]">다음</Link> : <span className="rounded border border-line px-2 py-0.5 opacity-40">다음</span>}
            </span>
          );
          return (
            <div key={name} id={`g${gi}`}>
            <Panel title={`${name} (${all.length})`} right={<span className="flex items-center gap-3">{desc ? <span className="text-[11px] text-ink-soft">{desc}</span> : null}{pager}</span>} flush>
              <Table head={["ID", "제목 · 축", "중분류", "소스", "상태", "액션"]}>
                {items.map((r) => (
                  <tr key={r.id} className="align-top hover:bg-[#f7f9fb]">
                    <Td className="whitespace-nowrap font-mono text-xs text-ink-soft">{r.id}</Td>
                    <Td>
                      <div className="font-medium">{r.title}</div>
                      {r.axis && <p className="mt-0.5 max-w-2xl text-xs leading-relaxed text-ink"><span className="mr-1 rounded bg-brand/10 px-1 py-0.5 text-[10px] font-semibold text-brand-ink">{r.axis_type}</span>{r.axis}</p>}
                      {Array.isArray(r.gaps) && r.gaps.length > 0 && <p className="mt-0.5 text-[11px] text-amber-700">빈 역할: {r.gaps.join(" · ")}{r.status === "held" && !r.reinforced_at ? " — [보강]으로 웹 검색해 채울 수 있다" : ""}</p>}
                      {r.reinforce_note && <p className="mt-0.5 text-[11px] text-sky-700">{r.reinforce_note}</p>}
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
                              {Array.isArray(s.roles) && s.roles.length > 0 && <span className="mr-1 rounded bg-slate-100 px-1 text-[10px] text-slate-600" title={s.role_why ?? ""}>{s.roles.join("·")}</span>}
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
                        <GateButtons id={r.id} status={r.status} reinforce={{ eligible: (r.status === "held" || r.status === "proposed") && !r.reinforced_at, running: reinforcing.has(r.id) }} />
                        {epOf.get(r.id) && <Link href={`/episodes/${epOf.get(r.id)}`} className="whitespace-nowrap text-[11px] underline">{epOf.get(r.id)} →</Link>}
                      </div>
                    </Td>
                  </tr>
                ))}
              </Table>
              {pages > 1 && <div className="flex justify-end border-t border-line px-4 py-2">{pager}</div>}
            </Panel>
            </div>
          );
        })}
      </div>
    </div>
  );
}
