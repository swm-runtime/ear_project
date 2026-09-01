import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/sidebar";
import { Topbar } from "@/components/topbar";
import { currentUser, supabaseServer } from "@/lib/supabase-server";

export const metadata: Metadata = { title: "ear 파이프라인", description: "이어 콘텐츠 파이프라인 관리" };
export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser().catch(() => null);
  let workers: [string, string][] = [];
  let queuedAi = 0;
  let pending = { backlog: 0, review: 0 };
  if (user) {
    const sb = await supabaseServer();
    const [{ data: jobs }, { data: bl }] = await Promise.all([
      sb.from("jobs").select("status,requires_ai,claimed_by,heartbeat_at").in("status", ["queued", "claimed", "running"]),
      sb.from("backlog").select("status").in("status", ["proposed", "review_required"]),
    ]);
    const seen = new Map<string, string>();
    for (const j of jobs ?? []) if (j.claimed_by && j.heartbeat_at && Date.now() - new Date(j.heartbeat_at).getTime() < 3 * 60_000) {
      const prev = seen.get(j.claimed_by);
      if (!prev || prev < j.heartbeat_at) seen.set(j.claimed_by, j.heartbeat_at);
    }
    workers = [...seen];
    queuedAi = (jobs ?? []).filter((j) => j.status === "queued" && j.requires_ai).length;
    pending = { backlog: (bl ?? []).filter((b) => b.status === "proposed").length, review: (bl ?? []).filter((b) => b.status === "review_required").length };
  }
  return (
    <html lang="ko" suppressHydrationWarning>
      <body className="min-h-screen">
        {user ? (
          <>
            <Sidebar pending={pending} />
            <div className="pl-[188px]">
              <Topbar email={user.email ?? null} workers={workers} queuedAi={queuedAi} />
              <main className="px-6 py-6">{children}</main>
            </div>
          </>
        ) : (
          <main>{children}</main>
        )}
      </body>
    </html>
  );
}
