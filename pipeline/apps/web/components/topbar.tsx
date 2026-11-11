import Link from "next/link";
import { LogoutButton } from "./logout-button";
import { supabaseConfig } from "@/lib/supabase-config";

/** 워커 상태 — busy 작업 중(작업을 집어 처리 중) · idle 동작 중(켜져 있고 일감 대기) · off 중단(생존 신호 없음). 판정은 app/layout.tsx */
export type WorkerState = "busy" | "idle" | "off";
const WORKER: Record<WorkerState, { dot: string; text: string; label: string }> = {
  busy: { dot: "bg-emerald-500 animate-pulse", text: "font-medium text-emerald-700", label: "워커 작업 중" },
  idle: { dot: "bg-sky-500", text: "text-ink", label: "워커 동작 중" },
  off: { dot: "bg-rose-500", text: "font-medium text-rose-700", label: "워커 중단" },
};

/** 상단바 — 워커 상태(이 시스템의 핵심 신호)와 계정. 운영은 서버 워커뿐이라 누가 띄웠는지는 보이지 않는다(2026-11-11) */
export function Topbar({ email, worker, queuedAi }: { email: string | null; worker: WorkerState; queuedAi: number }) {
  const w = WORKER[worker];
  return (
    <header className="sticky top-0 z-10 flex h-14 items-center gap-4 border-b border-line bg-panel px-6">
      <div className="flex items-center gap-2 text-[13px]">
        <span className={`inline-flex h-2 w-2 rounded-full ${w.dot}`} />
        <span className={w.text}>{w.label}</span>
        {queuedAi > 0 && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-800 ring-1 ring-inset ring-amber-200">대기 {queuedAi}건</span>}
      </div>
      <div className="ml-auto flex items-center gap-3 text-xs text-ink-soft">
        <Link href="/settings" className="hover:text-ink">{email}</Link>
        <LogoutButton supabase={supabaseConfig()} />
      </div>
    </header>
  );
}
