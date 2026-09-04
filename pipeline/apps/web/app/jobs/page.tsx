import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";
import { AutoRefresh } from "@/components/auto-refresh";
import { Badge, PageHeader, Panel, Table, Td } from "@/components/ui";
import { fmtTime, fmtDuration, fmtTokens, fmtUsd, label } from "@/lib/format";

const PAGE = 50;
const TYPES = ["sweep", "cluster", "draft", "qa", "critic", "tts", "package"];
const STATUSES = ["queued", "claimed", "running", "done", "failed", "cancelled"];

// 작업 기록 — jobs(큐·소요) + runs(모델·토큰·비용)를 (backlog_id·phase·attempt)로 이어 한 표에 보인다.
// runs 만 모델·usage 를 남기므로(=계측의 원천, spec/04) job 에 붙여 소요와 함께 읽히게 한다.
export default async function JobsPage({ searchParams }: { searchParams: Promise<{ type?: string; status?: string; page?: string }> }) {
  const { type, status, page: pageStr } = await searchParams;
  const page = Math.max(1, Number(pageStr) || 1);
  const sb = await supabaseServer();

  let q = sb.from("jobs").select("id,type,status,attempt,requires_ai,payload,started_at,finished_at,heartbeat_at,created_at,claimed_by,error", { count: "exact" }).order("created_at", { ascending: false }).range((page - 1) * PAGE, page * PAGE - 1);
  if (type && TYPES.includes(type)) q = q.eq("type", type);
  if (status && STATUSES.includes(status)) q = q.eq("status", status);
  const { data: jobs, count } = await q;

  // 이 페이지 job 들이 가리키는 backlog 의 runs 만 가져와 (backlog_id|phase|attempt) 로 맵핑
  const backlogIds = Array.from(new Set((jobs ?? []).map((j) => j.payload?.backlog_id).filter(Boolean))) as string[];
  const runMap = new Map<string, { cost_usd: number | null; tokens: any; model: string | null }>();
  if (backlogIds.length) {
    const { data: runs } = await sb.from("runs").select("backlog_id,phase,attempt,cost_usd,tokens,model,executed_at").in("backlog_id", backlogIds).order("executed_at");
    for (const r of runs ?? []) runMap.set(`${r.backlog_id}|${r.phase}|${r.attempt}`, { cost_usd: r.cost_usd, tokens: r.tokens, model: r.model }); // 나중 실행이 앞을 덮어 최신치가 남는다
  }

  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const qs = (o: Record<string, string | undefined>) => "?" + new URLSearchParams(Object.entries({ type, status, page: String(page), ...o }).filter(([, v]) => v && v !== "1") as [string, string][]).toString();
  const chip = (active: boolean) => `rounded border px-2 py-1 text-xs ${active ? "border-ink bg-panel font-medium" : "border-line bg-panel text-ink-soft hover:text-ink"}`;

  return (
    <div>
      <AutoRefresh seconds={15} />
      <PageHeader title="작업 기록" breadcrumb={["파이프라인", "작업 기록"]} desc="큐에 올라간 모든 작업의 소요 시간·모델·토큰(TTS 는 글자수)·비용. 비용/토큰은 runs(계측 원천)에서 이어 붙였고, TTS 비용은 요율(TTS_USD_PER_1K_CHARS)이 설정된 경우에만 환산 참고값으로 표시된다." />

      <div className="mb-3 flex flex-wrap items-center gap-3 text-xs">
        <div className="flex flex-wrap gap-1">
          <Link href={qs({ type: undefined, page: undefined })} className={chip(!type)}>모든 작업</Link>
          {TYPES.map((t) => <Link key={t} href={qs({ type: t, page: undefined })} className={chip(type === t)}>{t}</Link>)}
        </div>
        <div className="flex flex-wrap gap-1">
          <Link href={qs({ status: undefined, page: undefined })} className={chip(!status)}>모든 상태</Link>
          {STATUSES.map((s) => <Link key={s} href={qs({ status: s, page: undefined })} className={chip(status === s)}>{label(s)}</Link>)}
        </div>
      </div>

      <Panel flush className="mb-3">
        <Table head={["상태", "작업", "대상", "소요", "모델", "토큰/글자", "비용", "시각"]} empty="해당 조건의 작업이 없습니다">
          {(jobs ?? []).map((j) => {
            const run = runMap.get(`${j.payload?.backlog_id}|${j.type}|${j.attempt}`);
            const target = j.payload?.episode_id ?? j.payload?.backlog_id ?? j.payload?.mid_topic ?? "-";
            return (
              <tr key={j.id} className="align-top hover:bg-[#f7f9fb]">
                <Td><Badge value={j.status} /></Td>
                <Td className="whitespace-nowrap font-medium">{j.type}{j.attempt > 1 ? ` · ${j.attempt}회차` : ""}</Td>
                <Td>
                  {j.payload?.episode_id ? <Link className="underline" href={`/episodes/${j.payload.episode_id}`}>{j.payload.episode_id}</Link> : target}
                  {j.status === "failed" && j.error && <div className="mt-0.5 max-w-md whitespace-normal text-xs text-rose-600" title={j.error}>{String(j.error).split("\n")[0].slice(0, 140)}</div>}
                </Td>
                <Td className="whitespace-nowrap text-xs text-ink-soft">{fmtDuration(j.started_at, j.finished_at ?? (["claimed", "running"].includes(j.status) ? j.heartbeat_at : null))}</Td>
                <Td className="whitespace-nowrap text-xs text-ink-soft">{run?.model ?? (j.requires_ai ? "-" : "—")}</Td>
                <Td className="whitespace-nowrap text-xs text-ink-soft">{fmtTokens(run?.tokens)}</Td>
                <Td className="whitespace-nowrap text-xs text-ink-soft">{fmtUsd(run?.cost_usd)}</Td>
                <Td className="whitespace-nowrap text-xs text-ink-soft">{fmtTime(j.created_at)}</Td>
              </tr>
            );
          })}
        </Table>
      </Panel>

      <div className="flex items-center justify-between text-xs text-ink-soft">
        <span>{total.toLocaleString("ko-KR")}건 중 {total ? (page - 1) * PAGE + 1 : 0}–{Math.min(page * PAGE, total)}</span>
        <div className="flex items-center gap-2">
          {page > 1 ? <Link href={qs({ page: String(page - 1) })} className={chip(false)}>‹ 이전</Link> : <span className={`${chip(false)} opacity-40`}>‹ 이전</span>}
          <span>{page} / {pages}</span>
          {page < pages ? <Link href={qs({ page: String(page + 1) })} className={chip(false)}>다음 ›</Link> : <span className={`${chip(false)} opacity-40`}>다음 ›</span>}
        </div>
      </div>
    </div>
  );
}
