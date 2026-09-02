import { supabaseServer } from "@/lib/supabase-server";
import { fmtTime, label } from "@/lib/format";
import { SweepForm } from "./sweep-form";
import { AutoRefresh } from "@/components/auto-refresh";
import { JobProgress } from "@/components/job-progress";
import { Badge, PageHeader, Panel, Table, Td } from "@/components/ui";

export default async function SweepPage() {
  const sb = await supabaseServer();
  const [{ data: topics }, { data: jobs }, { data: runs }] = await Promise.all([
    sb.from("topics").select("*"),
    sb.from("jobs").select("id,type,status,attempt,payload,progress,claimed_by,created_at,finished_at,result,error").in("type", ["sweep", "cluster"]).order("created_at", { ascending: false }).limit(30),
    sb.from("runs").select("phase,result,executed_at,executed_by").in("phase", ["sweep", "cluster"]).order("executed_at", { ascending: false }).limit(10),
  ]);
  const mids = (topics ?? []).filter((t: any) => t.ai_generation && t.active !== false).map((t: any) => t.mid as string).sort();
  return (
    <div className="space-y-6">
      <AutoRefresh seconds={10} />
      <PageHeader title="스윕 · 군집화" breadcrumb={["파이프라인", "스윕"]} desc="풀 안 원천의 RSS 메타데이터만 수집(spec/02)하고, 끝나면 군집화가 자동으로 이어져 백로그에 후보가 올라온다. 군집화는 AI 작업이라 워커가 떠 있어야 진행된다." />
      <SweepForm mids={mids} />
      <Panel title="작업" flush>
        <div className="divide-y divide-line text-[13px]">
          {(jobs ?? []).map((j) => (
            <div key={j.id} className="px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge value={j.status} />
                <span className="font-medium">{j.type}</span><span className="text-ink-soft">{j.payload?.mid_topic}</span>
                <span className="ml-auto text-[11px] text-ink-soft">{j.claimed_by ?? ""} · {fmtTime(j.created_at)}</span>
              </div>
              {["running","claimed"].includes(j.status) && <JobProgress job={j} />}
              {j.status === "done" && j.result && <div className="mt-1 text-xs text-ink-soft">{j.type === "sweep" ? `피드 ${j.result.feeds_ok}/${j.result.feeds_total} · 적재 ${j.result.items}건${j.result.failures?.length ? ` · 실패: ${j.result.failures.join("; ")}` : ""}` : `후보 ${j.result.candidates?.length ?? 0}건: ${(j.result.candidates ?? []).join(" / ")}`}</div>}
              {j.status === "failed" && <div className="mt-1 text-xs text-rose-600">{String(j.error).slice(0, 200)}</div>}
            </div>
          ))}
        </div>
      </Panel>
      <Panel title="실행 기록" flush>
        <div className="divide-y divide-line text-xs">{(runs ?? []).map((r, i) => <div key={i} className="px-4 py-3"><Badge tone="done">{r.phase}</Badge><span className="ml-2 text-[11px] text-ink-soft">{fmtTime(r.executed_at)} · {r.executed_by}</span><div className="mt-1 text-ink-soft">{r.result}</div></div>)}</div>
      </Panel>
    </div>
  );
}
