import { PageHeader } from "@/components/ui";
import { PerformanceCard } from "@/components/performance-card";

export const dynamic = "force-dynamic";

/**
 * 성과 카드 — 서비스 지표 요약(`GET /admin/insights/summary`)을 주(월~일) 단위로 묶어, 핵심 지표가 가장 좋았던 한 주를
 * 900×650 카드로 그린다(2026-11-06). 지표마다 다른 시기를 고르지 않고 **모든 지표를 같은 주**로 맞춘다.
 */
export default function PerformanceCardPage() {
  return (
    <div className="space-y-3">
      <PageHeader
        title="성과 카드"
        breadcrumb={["백엔드 로그", "성과 카드"]}
        desc="핵심 지표(가입·접속·청취·완청·리텐션)를 같은 주 기준으로 묶어, 종합 점수가 가장 높았던 주를 발표·포트폴리오용 카드로 보여준다. 운영 DB 를 관리자 API 로 읽는 읽기 전용 조회다."
      />
      <PerformanceCard />
    </div>
  );
}
