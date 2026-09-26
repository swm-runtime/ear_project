import { supabaseServer } from "@/lib/supabase-server";
import { fmtTime } from "@/lib/format";
import { JobProgress } from "@/components/job-progress";
import { Badge, Panel } from "@/components/ui";

/** 스윕 · 군집화 · 주제 기획 세 화면(2026-09-26 분리)이 같이 쓰는 데이터 로더와 작업 패널 */
export type SweepKind = "sweep" | "cluster" | "topic";

export async function loadSweepData(kind: SweepKind) {
  const sb = await supabaseServer();
  const types = kind === "cluster" ? ["cluster"] : ["sweep"];
  const [{ data: topics }, { data: jobs }, { data: runs }] = await Promise.all([
    sb.from("topics").select("*"),
    sb.from("jobs").select("id,type,status,attempt,payload,progress,claimed_by,created_at,finished_at,result,error").in("type", types).order("created_at", { ascending: false }).limit(60),
    sb.from("runs").select("phase,result,executed_at,executed_by").in("phase", types).order("executed_at", { ascending: false }).limit(30),
  ]);
  const mids = (topics ?? []).filter((t: any) => t.ai_generation && t.active !== false).map((t: any) => t.mid as string).sort();
  const majorOfMid: Record<string, string> = Object.fromEntries((topics ?? []).map((t: any) => [t.mid as string, t.major as string]));
  // sweep 작업은 모드로 갈린다: 모드 A(피드)·B-①(보강)은 스윕 화면, B-②(주제 기획)은 주제 기획 화면
  const isTopic = (j: any) => j.payload?.mode === "B2";
  const filteredJobs = (jobs ?? []).filter((j: any) => kind === "cluster" ? true : kind === "topic" ? isTopic(j) : !isTopic(j)).slice(0, 30);
  const filteredRuns = (runs ?? []).filter((r: any) => kind === "cluster" ? true : kind === "topic" ? String(r.result).includes("B-②") : !String(r.result).includes("B-②")).slice(0, 10);
  return { mids, majorOfMid, jobs: filteredJobs, runs: filteredRuns };
}

export function SweepJobsPanel({ jobs, runs }: { jobs: any[]; runs: any[] }) {
  return (
    <>
      <Panel title="작업" flush>
        <div className="divide-y divide-line text-[13px]">
          {jobs.length === 0 && <div className="px-4 py-6 text-center text-xs text-ink-soft">아직 작업이 없습니다.</div>}
          {jobs.map((j) => (
            <div key={j.id} className="px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge value={j.status} />
                <span className="font-medium">{j.type}{j.payload?.cluster_version === "v2" ? " v2" : ""}{j.payload?.mode === "B" ? " 보강" : j.payload?.mode === "B2" ? " 주제 기획" : ""}</span>
                <span className="text-ink-soft">{j.payload?.mode === "B2" ? `${j.payload.mid_topic} · "${String(j.payload.topic ?? "").slice(0, 60)}"` : j.payload?.major_topic ? `${j.payload.major_topic} (대분류)` : j.payload?.backlog_id ?? j.payload?.mid_topic}</span>
                <span className="ml-auto text-[11px] text-ink-soft">{j.claimed_by ?? ""} · {fmtTime(j.created_at)}</span>
              </div>
              {["running", "claimed"].includes(j.status) && <JobProgress job={j} />}
              {j.status === "done" && j.result && (
                <div className="mt-1 text-xs text-ink-soft">
                  {j.payload?.mode === "B2" ? `후보 ${j.result.backlog_id} · ${j.result.status === "proposed" ? "성립 — 승인 대기" : `보강 필요 (빈 역할 ${(j.result.gaps ?? []).join("·") || "없음"})`} · 소스 ${j.result.added}건${j.result.new_domains?.length ? ` · 새 도메인 ${j.result.new_domains.length}` : ""}`
                    : j.type === "sweep" ? (j.payload?.mode === "B" ? `후보 ${j.result.backlog_id} → ${j.result.status} · 새 소스 ${j.result.added}건` : `피드 ${j.result.feeds_ok}/${j.result.feeds_total} · 적재 ${j.result.items}건${j.result.failures?.length ? ` · 실패 ${j.result.failures.length}` : ""}`)
                    : `후보 ${j.result.inserted ?? j.result.candidates ?? "?"}건`}
                </div>
              )}
              {j.status === "failed" && <div className="mt-1 text-xs text-rose-600">{String(j.error).slice(0, 200)}</div>}
            </div>
          ))}
        </div>
      </Panel>
      <Panel title="실행 기록" flush>
        <div className="divide-y divide-line text-xs">{runs.map((r, i) => <div key={i} className="px-4 py-3"><Badge tone="done">{r.phase}</Badge><span className="ml-2 text-[11px] text-ink-soft">{fmtTime(r.executed_at)} · {r.executed_by}</span><div className="mt-1 text-ink">{r.result}</div></div>)}</div>
      </Panel>
    </>
  );
}
