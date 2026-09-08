import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";
import { Badge, PageHeader, Panel, Table, Td } from "@/components/ui";
import { StageTrack, ProblemLine } from "@/components/stage-track";
import { computeStages, type JobRow } from "@/lib/stages";
import { fmtTime } from "@/lib/format";

/**
 * 에피소드 목록 — 상태·산출물 배지 대신 가로 진행 트래커(초안→QA→비평→판정→TTS→패키지→발행)로 보여준다 (2026-09-08).
 * 막힌 단계가 있으면 사유와 다음 행동을 한 줄로 붙인다. 계산은 lib/stages 의 순수 함수.
 */
export default async function EpisodesPage() {
  const sb = await supabaseServer();
  const [{ data: eps }, { data: bl }, { data: jobs }] = await Promise.all([
    sb.from("episodes").select("id,backlog_id,prompt_version,script_key,qa_report_key,critic_report_key,audio_dist_key,critic_verdicts,human_edits,created_at,regression,regression_kind").order("id", { ascending: false }),
    sb.from("backlog").select("id,title,mid_topic,status,published_content_ref"),
    sb.from("jobs").select("type,status,attempt,error,result,created_at,payload").in("type", ["draft", "qa", "critic", "tts", "package"]).order("created_at", { ascending: false }),
  ]);
  const b = new Map((bl ?? []).map((x) => [x.id, x]));
  const jobsOf = new Map<string, JobRow[]>();
  for (const j of (jobs ?? []) as JobRow[]) {
    const id = String(j.payload?.episode_id ?? "");
    if (!id) continue;
    jobsOf.set(id, [...(jobsOf.get(id) ?? []), j]);
  }
  const rows = eps ?? [];
  const blocked = rows.filter((e) => computeStages(e, b.get(e.backlog_id), jobsOf.get(e.id) ?? []).problem?.tone === "failed").length;

  return (
    <div>
      <PageHeader title="에피소드" breadcrumb={["파이프라인", "에피소드"]}
        desc={`초안 → QA → 비평 → 판정 → TTS → 패키지 → 발행. 막힌 단계는 빨간색, 사람 몫은 대기로 표시.${blocked ? ` 지금 막힌 에피소드 ${blocked}편.` : ""}`} />
      <Panel flush>
        <Table head={["에피소드", "진행", "막힌 곳 · 다음 행동", "생성"]} empty="에피소드가 없습니다">
          {rows.map((e) => {
            const k = b.get(e.backlog_id);
            const edits = Array.isArray(e.human_edits) ? e.human_edits.length : 0;
            const { stages, problem } = computeStages(e, k, jobsOf.get(e.id) ?? []);
            return (
              <tr key={e.id} className="hover:bg-[#f7f9fb]">
                <Td className="min-w-[260px]">
                  <div className="flex flex-col gap-0.5">
                    <Link href={`/episodes/${e.id}`} className="font-medium text-ink hover:underline">{k?.title ?? e.backlog_id}</Link>
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-ink-soft">
                      <Link href={`/episodes/${e.id}`} className="font-mono text-brand-ink">{e.id}</Link>
                      <span>·</span><span>{k?.mid_topic}</span>
                      <span>·</span><span>{e.prompt_version}</span>
                      {e.regression && <Badge tone="held">{e.regression_kind === "planted" ? "회귀·심은 오류" : e.regression_kind === "anchor_low" ? "회귀·저품질 앵커" : "회귀 세트"}</Badge>}
                      {edits > 0 && <Badge tone="approved">수정 {edits}</Badge>}
                    </div>
                  </div>
                </Td>
                <Td className="w-[44%]"><StageTrack stages={stages} /></Td>
                <Td className="max-w-[320px]"><ProblemLine p={problem} /></Td>
                <Td className="whitespace-nowrap text-xs text-ink-soft">{fmtTime(e.created_at)}</Td>
              </tr>
            );
          })}
        </Table>
      </Panel>
    </div>
  );
}
