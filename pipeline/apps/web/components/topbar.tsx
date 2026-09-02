import Link from "next/link";
import { LogoutButton } from "./logout-button";
import { ago } from "@/lib/format";

/** 상단바 — 워커 상태(이 시스템의 핵심 신호)와 계정 */
export function Topbar({ email, workers, queuedAi }: { email: string | null; workers: [string, string][]; queuedAi: number }) {
  const online = workers.length > 0;
  return (
    <header className="sticky top-0 z-10 flex h-14 items-center gap-4 border-b border-line bg-panel px-6">
      <div className="flex items-center gap-2 text-[13px]">
        <span className={`inline-flex h-2 w-2 rounded-full ${online ? "bg-emerald-500" : "bg-slate-300"}`} />
        {online ? (
          <span className="text-ink">
            AI 워커 <b className="font-semibold">{workers.length}대</b>
            <span className="ml-1.5 text-ink-soft">{workers.map(([w, hb]) => `${w.split("@")[0]} (${ago(hb)})`).join(" · ")}</span>
          </span>
        ) : (
          <span className="text-ink-soft">AI 워커 없음 — 팀원 Mac에서 <code className="rounded bg-[#f2f5f8] px-1 py-0.5 text-[11px]">npm run worker</code></span>
        )}
        {queuedAi > 0 && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-800 ring-1 ring-inset ring-amber-200">대기 {queuedAi}건</span>}
      </div>
      <div className="ml-auto flex items-center gap-3 text-xs text-ink-soft">
        <Link href="/settings" className="hover:text-ink">{email}</Link>
        <LogoutButton />
      </div>
    </header>
  );
}
