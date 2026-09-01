import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";
import { Badge, PageHeader, Panel, Table, Td } from "@/components/ui";
import { fmtTime, label } from "@/lib/format";

export default async function EpisodesPage() {
  const sb = await supabaseServer();
  const [{ data: eps }, { data: bl }] = await Promise.all([
    sb.from("episodes").select("id,backlog_id,prompt_version,script_key,qa_report_key,critic_report_key,audio_dist_key,critic_verdicts,human_edits,created_at").order("id", { ascending: false }),
    sb.from("backlog").select("id,title,mid_topic,status"),
  ]);
  const b = new Map((bl ?? []).map((x) => [x.id, x]));
  return (
    <div>
      <PageHeader title="에피소드" breadcrumb={["파이프라인", "에피소드"]} desc="대본·발췌·claims·QA·비평 리포트를 열람하고, 대본을 직접 수정하거나 비평 판정을 남긴다." />
      <Panel flush>
        <Table head={["ID", "제목", "중분류", "상태", "산출물", "프롬프트", "생성"]} empty="에피소드가 없습니다">
          {(eps ?? []).map((e) => {
            const k = b.get(e.backlog_id);
            const edits = Array.isArray(e.human_edits) ? e.human_edits.length : 0;
            return (
              <tr key={e.id} className="hover:bg-[#f7f9fb]">
                <Td className="whitespace-nowrap font-mono text-xs"><Link href={`/episodes/${e.id}`} className="text-brand-ink underline">{e.id}</Link></Td>
                <Td className="font-medium"><Link href={`/episodes/${e.id}`}>{k?.title ?? e.backlog_id}</Link></Td>
                <Td className="whitespace-nowrap text-xs text-ink-soft">{k?.mid_topic}</Td>
                <Td><Badge value={k?.status} /></Td>
                <Td>
                  <div className="flex flex-wrap gap-1">
                    {e.qa_report_key && <Badge tone="done">QA</Badge>}
                    {e.critic_report_key && <Badge tone={e.critic_verdicts ? "done" : "proposed"}>{e.critic_verdicts ? "판정 완료" : "판정 대기"}</Badge>}
                    {edits > 0 && <Badge tone="approved">수정 {edits}</Badge>}
                    {e.audio_dist_key && <Badge tone="done">오디오</Badge>}
                  </div>
                </Td>
                <Td className="whitespace-nowrap text-xs text-ink-soft">{e.prompt_version}</Td>
                <Td className="whitespace-nowrap text-xs text-ink-soft">{fmtTime(e.created_at)}</Td>
              </tr>
            );
          })}
        </Table>
      </Panel>
    </div>
  );
}
