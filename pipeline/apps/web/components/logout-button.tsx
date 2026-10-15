"use client";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";
import type { SupabaseConfig } from "@/lib/supabase-config";

export function LogoutButton({ supabase }: { supabase: SupabaseConfig }) {
  const router = useRouter();
  return (
    <button className="rounded border border-line px-2 py-1 text-xs text-ink-soft transition hover:bg-[#f7f9fb] hover:text-ink"
      onClick={async () => { await supabaseBrowser(supabase).auth.signOut(); router.replace("/login"); router.refresh(); }}>
      로그아웃
    </button>
  );
}
