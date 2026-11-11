import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/sidebar";
import { pipelineLocale } from "@/lib/locale";
import { Topbar } from "@/components/topbar";
import { DeployBanner } from "@/components/deploy-banner";
import { currentUser, supabaseServer } from "@/lib/supabase-server";

/** 탭 제목으로도 두 인스턴스를 가른다 — 한국판·글로벌판 콘솔을 나란히 열어 둘 때 */
export async function generateMetadata(): Promise<Metadata> {
  return { title: pipelineLocale() === "en" ? "ear GLOBAL 파이프라인" : "ear 파이프라인", description: "이어 콘텐츠 파이프라인 관리" };
}
export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser().catch(() => null);
  let workerOn = false;
  let queuedAi = 0;
  let pending = { backlog: 0, review: 0 };
  if (user) {
    const sb = await supabaseServer();
    const [{ data: jobs }, { data: bl }, { data: alive }] = await Promise.all([
      sb.from("jobs").select("status,requires_ai,claimed_by,heartbeat_at").in("status", ["queued", "claimed", "running"]),
      sb.from("backlog").select("status").in("status", ["proposed", "review_required"]),
      sb.from("settings").select("updated_at").eq("key", "worker.alive").maybeSingle(),
    ]);
    // 워커 동작 여부 (2026-11-11 — 운영은 서버 워커뿐이라 누가 띄웠는지는 보이지 않는다): 워커가 30초마다 찍는 생존 신호(settings worker.alive)가 2분 안이면 동작 중.
    // 작업 heartbeat(3분 안)도 함께 본다 — 생존 신호를 찍기 전 버전의 워커가 일하는 중에도 꺼짐으로 보이지 않게
    const fresh = (at: string | null | undefined, ms: number) => !!at && Date.now() - new Date(at).getTime() < ms;
    workerOn = fresh(alive?.updated_at, 2 * 60_000) || (jobs ?? []).some((j) => j.claimed_by && fresh(j.heartbeat_at, 3 * 60_000));
    queuedAi = (jobs ?? []).filter((j) => j.status === "queued" && j.requires_ai).length;
    pending = { backlog: (bl ?? []).filter((b) => b.status === "proposed").length, review: (bl ?? []).filter((b) => b.status === "review_required").length };
  }
  return (
    // data-market: 브라우저 코드(제품 API 호출)가 이 인스턴스의 시장을 읽는 자리 — lib/ear.ts consoleMarket (2026-10-15)
    <html lang="ko" data-market={pipelineLocale() === "en" ? "global" : "kr"} suppressHydrationWarning>
      <body className="min-h-screen">
        {user ? (
          <>
            <Sidebar pending={pending} locale={pipelineLocale()} />
            <div className="pl-[188px]">
              <DeployBanner />
              <Topbar email={user.email ?? null} workerOn={workerOn} queuedAi={queuedAi} />
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
