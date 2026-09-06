import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";
import { AutoRefresh } from "@/components/auto-refresh";
import { JobProgress } from "@/components/job-progress";
import { Badge, LinkBtn, PageHeader, Panel, Stat, Table, Td } from "@/components/ui";
import { fmtTime, fmtDuration, fmtTokens, fmtUsd, label } from "@/lib/format";

export default async function Dashboard() {
  const sb = await supabaseServer();
  const [{ data: jobs }, { data: runs }, { data: backlog }, { data: eps }] = await Promise.all([
    sb.from("jobs").select("id,type,status,attempt,requires_ai,payload,progress,claimed_by,heartbeat_at,started_at,created_at,finished_at,error").order("created_at", { ascending: false }).limit(25),
    sb.from("runs").select("phase,attempt,backlog_id,result,model,executed_by,executed_at,cost_usd,tokens").order("executed_at", { ascending: false }).limit(6),
    sb.from("backlog").select("id,title,status"),
    sb.from("episodes").select("id,backlog_id,critic_report_key,critic_verdicts"),
  ]);
  const active = (jobs ?? []).filter((j) => ["queued", "claimed", "running"].includes(j.status));
  const st = (s: string) => (backlog ?? []).filter((b) => b.status === s).length;
  const awaitingVerdict = (eps ?? []).filter((e) => e.critic_report_key && !e.critic_verdicts).length;

  return (
    <div>
      <AutoRefresh seconds={10} />
      <PageHeader title="대시보드" breadcrumb={["파이프라인", "대시보드"]} />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="게이트 1 대기" value={st("proposed")} sub={<Link className="underline" href="/backlog">후보 승인하기</Link>} tone={st("proposed") ? "text-amber-600" : "text-ink"} />
        <Stat label="제작 중" value={st("approved") + st("claimed") + st("drafted")} sub="승인 → 대본 → QA" />
        <Stat label="판정 대기" value={awaitingVerdict} sub={<Link className="underline" href="/episodes">비평 리포트 판정</Link>} tone={awaitingVerdict ? "text-violet-600" : "text-ink"} />
        <Stat label="사람 검토 필요" value={st("review_required")} sub="QA 3회 실패" tone={st("review_required") ? "text-rose-600" : "text-ink"} />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-5">
          <Panel title="진행 중" right={<LinkBtn href="/sweep">스윕 요청</LinkBtn>} flush>
            {active.length === 0 ? (
              <p className="px-4 py-8 text-center text-[13px] text-ink-soft">진행 중인 작업이 없습니다</p>
            ) : (
              <div className="divide-y divide-line">
                {active.map((j) => (
                  <div key={j.id} className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2 text-[13px]">
                      <Badge value={j.status} />
                      <span className="font-medium">{j.type}{j.attempt > 1 ? ` · ${j.attempt}회차` : ""}</span>
                      <span className="text-ink-soft">{j.payload?.episode_id ?? j.payload?.backlog_id ?? j.payload?.mid_topic ?? ""}</span>
                      <span className="ml-auto text-xs text-ink-soft">{j.claimed_by ?? (j.requires_ai ? "AI 워커 대기" : "")}</span>
                    </div>
                    <JobProgress job={j} />
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="최근 작업" right={<Link href="/jobs" className="text-xs underline text-ink-soft hover:text-ink">전체 보기 →</Link>} flush>
            <Table head={["상태", "작업", "대상", "소요", "실행자", "시각"]} empty="작업 기록이 없습니다">
              {(jobs ?? []).slice(0, 12).map((j) => (
                <tr key={j.id} className="hover:bg-[#f7f9fb]">
                  <Td><Badge value={j.status} /></Td>
                  <Td className="font-medium">{j.type}{j.attempt > 1 ? ` · ${j.attempt}회차` : ""}</Td>
                  <Td>
                    {j.payload?.episode_id ? <Link className="underline" href={`/episodes/${j.payload.episode_id}`}>{j.payload.episode_id}</Link> : (j.payload?.backlog_id ?? j.payload?.mid_topic ?? "-")}
                    {j.status === "failed" && <div className="mt-0.5 max-w-md truncate text-xs text-rose-600" title={j.error}>{String(j.error).split("\n")[0].slice(0, 90)}</div>}
                  </Td>
                  <Td className="whitespace-nowrap text-xs text-ink-soft">{fmtDuration(j.started_at, j.finished_at ?? (["claimed", "running"].includes(j.status) ? j.heartbeat_at : null))}</Td>
                  <Td className="text-xs text-ink-soft">{j.claimed_by ?? "-"}</Td>
                  <Td className="whitespace-nowrap text-xs text-ink-soft">{fmtTime(j.created_at)}</Td>
                </tr>
              ))}
            </Table>
          </Panel>
        </div>

        <Panel title="실행 기록 (runs)" flush>
          <div className="divide-y divide-line">
            {(runs ?? []).map((r, i) => (
              <div key={i} className="px-4 py-3 text-[13px]">
                <div className="flex items-center gap-2">
                  <Badge tone="done">{r.phase}{r.attempt > 1 ? ` #${r.attempt}` : ""}</Badge>
                  <span className="text-ink-soft">{r.backlog_id ?? ""}</span>
                  <span className="ml-auto text-[11px] text-ink-soft">{fmtTime(r.executed_at)}</span>
                </div>
                <p className="mt-1 line-clamp-3 text-ink-soft">{r.result}</p>
                <p className="mt-1 text-[11px] text-ink-soft">{r.model ?? "-"} · {fmtTokens(r.tokens)}{r.cost_usd != null ? ` · ${fmtUsd(r.cost_usd)}` : ""} · {r.executed_by}</p>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}
