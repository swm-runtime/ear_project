import { PageHeader } from "@/components/ui";
import { RecommendationInspector } from "@/components/recommendation-inspector";

export const dynamic = "force-dynamic";

/**
 * 추천 검증 › 사용자별 추천 — 가명 사용자 한 명의 청취·편성 이력과 지금 시점 추천 계산(`GET /admin/insights/recommendations/*`).
 * 운영(실배포) DB 를 관리자 API 로 읽는 읽기 전용 조회이고, 상세 열람은 서버가 감사 로그를 남긴다.
 * 처음엔 서비스 지표 탭에 뒀다가 추천 검증 콘솔로 옮겼다(2026-10-22 — 편성 미리보기·추천 테스트와 같은 자리에서 본다).
 */
export default function RecommendationInspectorPage() {
  return (
    <div className="space-y-3">
      <PageHeader
        title="사용자별 추천"
        breadcrumb={["추천 검증", "사용자별 추천 (실배포)"]}
        desc="사용자(user_id 앞 8자)를 골라 무엇을 들었고, 추천이 무엇을 보냈고, 지금 계산하면 어떤 점수로 무엇이 가는지 본다. 점수는 현재 시점 재계산이다 — 과거 편성 당시 점수와 다를 수 있다. 읽기 전용이며 열 때 한 번만 가져온다."
      />
      <RecommendationInspector />
    </div>
  );
}
