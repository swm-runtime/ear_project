import { ago } from "@/lib/format";

/** 실행 중 작업의 진행 상황 (jobs.progress — 워커가 claude 스트림 이벤트를 요약해 기록) */
export function JobProgress({ job, compact }: { job: any; compact?: boolean }) {
  const p = job.progress;
  if (!p) return job.status === "running" ? <p className="mt-1 text-xs text-ink-soft">진행 정보 대기 중…</p> : null;
  const mins = Math.round((p.elapsedMs ?? p.elapsed_ms ?? 0) / 60000);
  const counts: Record<string, number> = p.toolCounts ?? p.tool_counts ?? {};
  const rl = p.rateLimit ?? p.rate_limit;
  const m = /(\d+)\s*\/\s*(\d+)/.exec(p.detail ?? "");
  const pct = m ? Math.round((Number(m[1]) / Math.max(1, Number(m[2]))) * 100) : null;
  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-center gap-2 text-[13px]">
        <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand opacity-60" /><span className="relative inline-flex h-2 w-2 rounded-full bg-brand" /></span>
        <span className="font-medium text-brand-ink">{p.phase}</span>
        <span className="text-ink">{p.detail}</span>
        <span className="ml-auto text-xs tabular-nums text-ink-soft">{mins}분 · {p.turns ?? 0}턴{rl?.fiveHour != null ? ` · 구독 ${Math.round(rl.fiveHour * 100)}%` : ""}</span>
      </div>
      {pct !== null && (
        <div className="mt-1.5 h-1 w-full overflow-hidden rounded bg-[#e8edf3]">
          <div className="h-full rounded bg-brand transition-all" style={{ width: `${pct}%` }} />
        </div>
      )}
      {!compact && (
        <div className="mt-1 space-y-0.5 text-xs text-ink-soft">
          {(p.lastTool ?? p.last_tool) && <div>↳ {p.lastTool ?? p.last_tool}</div>}
          {Object.keys(counts).length > 0 && <div className="text-[11px]">{Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(" · ")}{p.updated_at ? ` · 갱신 ${ago(p.updated_at)}` : ""}</div>}
        </div>
      )}
    </div>
  );
}
