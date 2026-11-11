import Link from "next/link";
import { LogoutButton } from "./logout-button";
import { supabaseConfig } from "@/lib/supabase-config";

/** 상단바 — 워커 동작 여부(이 시스템의 핵심 신호)와 계정. 운영은 서버 워커뿐이라 켜짐·꺼짐만 보인다(2026-11-11) */
export function Topbar({ email, workerOn, queuedAi }: { email: string | null; workerOn: boolean; queuedAi: number }) {
  return (
    <header className="sticky top-0 z-10 flex h-14 items-center gap-4 border-b border-line bg-panel px-6">
      <div className="flex items-center gap-2 text-[13px]">
        <span className={`inline-flex h-2 w-2 rounded-full ${workerOn ? "bg-emerald-500" : "bg-rose-500"}`} />
        {workerOn ? <span className="text-ink">워커 동작 중</span> : <span className="font-medium text-rose-700">워커 멈춤</span>}
        {queuedAi > 0 && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-800 ring-1 ring-inset ring-amber-200">대기 {queuedAi}건</span>}
      </div>
      <div className="ml-auto flex items-center gap-3 text-xs text-ink-soft">
        <Link href="/settings" className="hover:text-ink">{email}</Link>
        <LogoutButton supabase={supabaseConfig()} />
      </div>
    </header>
  );
}
