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
        desc="API 응답·로그 파이프·최근 1시간 ERROR·DB 캐시 적중률(옛 서버 상태 탭)과 요청 수·4xx/5xx·응답시간(p50/p95) 시간축 그래프, CPU·메모리·DB 연결 이력을 한 화면에서 본다. 연 시점 기준 스냅샷이며 자동 갱신하지 않는다 — 요청 그래프는 불러온 창(1,500건) 안의 근사치."
      />
      <BackendDashboard />
    </div>
  );
}
