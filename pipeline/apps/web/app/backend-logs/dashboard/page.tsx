import { PageHeader } from "@/components/ui";
import { BackendDashboard } from "@/components/backend-dashboard";

export const dynamic = "force-dynamic";

// 대시보드 — 요청·오류·응답시간을 시간축 그래프로, 자원/DB를 게이지로 본다.
export default function BackendDashboardPage() {
  return (
    <div>
      <PageHeader
        title="대시보드"
        breadcrumb={["백엔드 로그", "대시보드"]}
        desc="요청 수·오류·응답시간(p50/p95)을 시간축 그래프로, CPU·메모리·DB 연결을 게이지로 본다. 연 시점 기준 스냅샷이며 자동 갱신하지 않는다 — 불러온 창(최대 1,000줄) 안의 근사치."
      />
      <BackendDashboard />
    </div>
  );
}
