import { PageHeader } from "@/components/ui";
import { InsightsTabs } from "@/components/insights-tabs";
import { RecommendationInspector } from "@/components/recommendation-inspector";

export const dynamic = "force-dynamic";

/**
 * 서비스 지표 › 추천 검증 — 가명 사용자 한 명의 청취·편성 이력과 지금 시점 추천 계산(`GET /admin/insights/recommendations/*`,
 * 2026-10-22). 운영 DB 를 관리자 API 로 읽는 읽기 전용 조회이고, 상세 열람은 서버가 감사 로그를 남긴다.
 */
export default function RecommendationInspectorPage() {
  return (
    <div className="space-y-3">
      <PageHeader
        title="추천 검증"
        breadcrumb={["백엔드 로그", "서비스 지표", "추천 검증"]}
        actions={<InsightsTabs active="/backend-logs/insights/recommendations" />}
        desc="사용자(user_id 앞 8자)를 골라 무엇을 들었고, 추천이 무엇을 보냈고, 지금 계산하면 어떤 점수로 무엇이 가는지 본다. 점수는 현재 시점 재계산이다 — 과거 편성 당시 점수와 다를 수 있다. 읽기 전용이며 열 때 한 번만 가져온다."
      />
      <RecommendationInspector />
    </div>
  );
}
