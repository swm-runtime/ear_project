import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { parseCriticReport, parseCriticScores, parseScript, readArtifact } from "@/lib/artifacts";
import { fmtTime, label } from "@/lib/format";
import { JudgeView } from "./judge-view";
import { VerdictForm } from "./verdict-form";
import { TtsButton } from "./tts-button";
import { ScriptEditor } from "./script-editor";
import { AutoRefresh } from "@/components/auto-refresh";
import { JobProgress } from "@/components/job-progress";
import { Badge, PageHeader, Panel } from "@/components/ui";

const TABS = [["script", "대본"], ["sources", "발췌"], ["claims", "claims"], ["qa", "QA"], ["critic", "비평·판정"], ["runs", "실행 기록"]] as const;

export default async function EpisodePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params; const { tab = "script" } = await searchParams;
  const sb = await supabaseServer();
  const { data: ep } = await sb.from("episodes").select("*").eq("id", id).single();
  if (!ep) notFound();
  const [{ data: bl }, { data: runs }, { data: jobs }] = await Promise.all([
    sb.from("backlog").select("id,title,mid_topic,status,angle").eq("id", ep.backlog_id).single(),
    sb.from("runs").select("phase,attempt,result,model,executed_by,executed_at,prompt_version").eq("backlog_id", ep.backlog_id).order("executed_at"),
    sb.from("jobs").select("id,type,status,attempt,progress,claimed_by,created_at").eq("payload->>episode_id", id).order("created_at"),
  ]);
  const keyOf: Record<string, string | null> = { script: ep.script_key, sources: ep.sources_key, claims: ep.claims_key, qa: ep.qa_report_key, critic: ep.critic_report_key };
  const content = tab in keyOf ? await readArtifact(keyOf[tab]) : null;
  const criticMd = tab === "script" ? await readArtifact(ep.critic_report_key) : null; // 대본 탭에서 리포트를 대본 위에 얹어 판정한다
  const ttsJob = (jobs ?? []).find((j) => j.type === "tts" && ["queued", "claimed", "running"].includes(j.status));
  const activeJobs = (jobs ?? []).filter((j) => ["queued", "claimed", "running"].includes(j.status));

  return (
    <div className="space-y-4">
      {activeJobs.length > 0 && <AutoRefresh seconds={8} />}
      <PageHeader
        title={bl?.title ?? ep.id}
        breadcrumb={["파이프라인", "에피소드", ep.id]}
        desc={bl?.angle ?? undefined}
        actions={<>
          <Badge value={bl?.status} />
          <span className="text-xs text-ink-soft">{bl?.mid_topic} · {ep.prompt_version}</span>
          <TtsButton episodeId={ep.id} backlogId={ep.backlog_id} enabled={["qa_passed", "packaged"].includes(bl?.status ?? "")} pending={!!ttsJob} />
        </>}
      />
      {activeJobs.map((j) => (
        <div key={j.id} className="rounded-md border border-line bg-panel px-4 py-3">
          <div className="text-[13px] font-medium">{j.type}{j.attempt > 1 ? ` · ${j.attempt}회차` : ""} {j.status === "queued" ? "— AI 워커 대기 중" : "실행 중"} <span className="font-normal text-ink-soft">{j.claimed_by ?? ""}</span></div>
          <JobProgress job={j} />
        </div>
      ))}
      <nav className="flex gap-1 border-b border-line text-[13px]">
        {TABS.map(([k, name]) => (
          <Link key={k} href={`?tab=${k}`} className={`-mb-px border-b-2 px-3 py-2 transition ${tab === k ? "border-brand font-semibold text-brand-ink" : "border-transparent text-ink-soft hover:text-ink"}`}>
            {name}{k !== "runs" && k !== "script" && !keyOf[k] ? <span className="ml-1 text-[10px] text-ink-soft">없음</span> : null}
          </Link>
        ))}
      </nav>

      {tab === "runs" && (
        <Panel flush>
          <div className="divide-y divide-line text-[13px]">
            {(runs ?? []).map((r, i) => (
              <div key={i} className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="done">{r.phase}{r.attempt > 1 ? ` #${r.attempt}` : ""}</Badge>
                  <span className="text-[11px] text-ink-soft">{fmtTime(r.executed_at)} · {r.model ?? "-"} · {r.executed_by} · {r.prompt_version}</span>
                </div>
                <p className="mt-1 leading-relaxed text-ink-soft">{r.result}</p>
              </div>
            ))}
          </div>
        </Panel>
      )}
      {tab !== "runs" && content == null && <p className="rounded-md border border-line bg-panel p-6 text-center text-[13px] text-ink-soft">아직 산출물이 없습니다{keyOf[tab] ? ` (키: ${keyOf[tab]} — 서버에서 읽을 수 없음. s3: 키면 PIPELINE_BUCKET·AWS 자격증명(인스턴스 역할 / 로컬 AWS_PROFILE), local: 키면 WORK_ROOT 확인)` : ""}.</p>}
      {tab === "script" && content && (criticMd
        ? (() => { const parsed = parseCriticReport(criticMd); const sc = parseCriticScores(criticMd); return <JudgeView episodeId={ep.id} backlogId={ep.backlog_id} turns={parseScript(content)} flags={parsed.flags} stars={parsed.stars} scores={sc.rows} total={sc.total} saved={ep.critic_verdicts} edits={ep.human_edits ?? []} />; })()
        : <ScriptEditor episodeId={ep.id} backlogId={ep.backlog_id} turns={parseScript(content)} edits={ep.human_edits ?? []} editable />)}
      {(tab === "sources" || tab === "claims" || tab === "qa") && content && <Panel className="min-w-0"><pre className="whitespace-pre-wrap break-words font-mono text-[12px] leading-relaxed text-ink">{content}</pre></Panel>}
      {tab === "critic" && content && (
        <div className="grid min-w-0 gap-4 lg:grid-cols-2">
          <Panel className="min-w-0" title="비평 리포트 (AI 스냅샷 — 수정하지 않음)"><pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-ink">{content}</pre></Panel>
          <VerdictForm episodeId={ep.id} parsed={parseCriticReport(content)} saved={ep.critic_verdicts} />
        </div>
      )}
    </div>
  );
}
