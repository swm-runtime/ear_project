import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { parseCriticReport, parseCriticScores, parseScript, readArtifact } from "@/lib/artifacts";
import { fmtTime, label } from "@/lib/format";
import { JudgeView } from "./judge-view";
import { VerdictForm } from "./verdict-form";
import { TtsButton } from "./tts-button";
import { PackageButton } from "./package-button";
import { listObjects, presignGet } from "@/lib/storage";
import { ScriptEditor } from "./script-editor";
import { AutoRefresh } from "@/components/auto-refresh";
import { JobProgress } from "@/components/job-progress";
import { Badge, PageHeader, Panel } from "@/components/ui";

const TABS = [["script", "대본"], ["sources", "발췌"], ["claims", "claims"], ["qa", "QA"], ["critic", "비평·판정"], ["audio", "오디오"], ["meta", "메타"], ["runs", "실행 기록"]] as const;

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
  const pkgJob = (jobs ?? []).find((j) => j.type === "package" && ["queued", "claimed", "running"].includes(j.status));
  const audioFiles = tab === "audio" ? await listAudioFiles(ep.id) : null;
  const uploadMeta = tab === "meta" ? await readUploadMeta(ep.id) : null; // 패키지 산출물 (spec/07 2장) — 게이트 2 검수 항목 5(제목·설명)의 근거
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
          <PackageButton episodeId={ep.id} backlogId={ep.backlog_id} enabled={["qa_passed", "packaged"].includes(bl?.status ?? "")} pending={!!pkgJob} />
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
      {tab !== "runs" && tab !== "audio" && tab !== "meta" && content == null && <p className="rounded-md border border-line bg-panel p-6 text-center text-[13px] text-ink-soft">아직 산출물이 없습니다{keyOf[tab] ? ` (키: ${keyOf[tab]} — 서버에서 읽을 수 없음. s3: 키면 PIPELINE_BUCKET·AWS 자격증명(인스턴스 역할 / 로컬 AWS_PROFILE), local: 키면 WORK_ROOT 확인)` : ""}.</p>}
      {tab === "script" && content && (criticMd
        ? (() => { const parsed = parseCriticReport(criticMd); const sc = parseCriticScores(criticMd); return <JudgeView episodeId={ep.id} backlogId={ep.backlog_id} turns={parseScript(content)} flags={parsed.flags} stars={parsed.stars} scores={sc.rows} total={sc.total} saved={ep.critic_verdicts} edits={ep.human_edits ?? []} />; })()
        : <ScriptEditor episodeId={ep.id} backlogId={ep.backlog_id} turns={parseScript(content)} edits={ep.human_edits ?? []} editable />)}
      {(tab === "sources" || tab === "claims" || tab === "qa") && content && <Panel className="min-w-0"><pre className="whitespace-pre-wrap break-words font-mono text-[12px] leading-relaxed text-ink">{content}</pre></Panel>}
      {tab === "audio" && (
        audioFiles?.length ? (
          <Panel title="오디오 — 청취 확인 (spec/06 8장) · 서명 URL 1시간(만료 시 새로고침)" className="text-[13px]">
            <div className="space-y-4">
              {audioFiles.map((f) => (
                <div key={f.name}>
                  <div className="mb-1 font-medium">
                    {f.name} <span className="font-normal text-ink-soft">{f.mb}MB</span>
                    {f.name === "sample.mp3" && <span className="ml-2 text-[11px] text-amber-700">청취 확인용 샘플 — 발행 경로 아님</span>}
                  </div>
                  {f.mp3 ? <audio controls preload="none" src={f.url} className="w-full" /> : <a className="text-brand underline" href={f.url}>내려받기 (무손실 마스터)</a>}
                </div>
              ))}
            </div>
          </Panel>
        ) : (
          <p className="rounded-md border border-line bg-panel p-6 text-center text-[13px] text-ink-soft">
            {audioFiles ? "아직 오디오가 없습니다 — 상단 TTS 변환으로 생성합니다 (qa_passed 이후)." : "오디오 목록을 읽을 수 없습니다 (서버 S3 설정 확인)."}
          </p>
        )
      )}
      {tab === "meta" && (
        uploadMeta ? (
          <Panel title="upload-meta.json — 패키지 산출물 (제목·설명은 초안, 확정은 게이트 2 검수자)" className="min-w-0">
            <pre className="whitespace-pre-wrap break-words font-mono text-[12px] leading-relaxed text-ink">{uploadMeta}</pre>
          </Panel>
        ) : (
          <p className="rounded-md border border-line bg-panel p-6 text-center text-[13px] text-ink-soft">아직 패키지 전입니다 — 상단 패키지 버튼으로 생성합니다 (qa_passed 이후).</p>
        )
      )}
      {tab === "critic" && content && (
        <div className="grid min-w-0 gap-4 lg:grid-cols-2">
          <Panel className="min-w-0" title="비평 리포트 (AI 스냅샷 — 수정하지 않음)"><pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-ink">{content}</pre></Panel>
          <VerdictForm episodeId={ep.id} parsed={parseCriticReport(content)} saved={ep.critic_verdicts} />
        </div>
      )}
    </div>
  );
}

async function listAudioFiles(id: string) {
  try {
    const objs = await listObjects(`episodes/${id}/audio/`);
    return await Promise.all(
      objs.filter((o) => /\.(mp3|wav)$/.test(o.key) && !o.key.includes("/.tmp")).map(async (o) => ({
        name: o.key.split("/").pop()!,
        mb: (o.size / 1048576).toFixed(1),
        mp3: o.key.endsWith(".mp3"),
        url: await presignGet(o.key, 3600),
      })),
    );
  } catch (e) {
    console.error(`[audio] 목록 실패: ${(e as Error)?.message}`);
    return null;
  }
}

async function readUploadMeta(id: string): Promise<string | null> {
  try {
    const { getText } = await import("@/lib/storage");
    const raw = await getText(`episodes/${id}/upload-meta.json`);
    return raw ? JSON.stringify(JSON.parse(raw), null, 2) : null;
  } catch (e) {
    console.error(`[meta] 읽기 실패: ${(e as Error)?.message}`);
    return null;
  }
}
