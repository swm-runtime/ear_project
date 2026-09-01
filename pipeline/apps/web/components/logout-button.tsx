"use client";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";

export function LogoutButton() {
  const router = useRouter();
  return (
    <button className="rounded border border-line px-2 py-1 text-xs text-ink-soft transition hover:bg-[#f7f9fb] hover:text-ink"
      onClick={async () => { await supabaseBrowser().auth.signOut(); router.replace("/login"); router.refresh(); }}>
      로그아웃
    </button>
  );
}
