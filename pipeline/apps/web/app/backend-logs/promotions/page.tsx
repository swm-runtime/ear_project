import { PageHeader } from "@/components/ui";
import { PromotionInsights } from "@/components/promotion-insights";

export const dynamic = "force-dynamic";

/**
 * 프로모션 — 초대 코드(예: SANKUN)를 입력한 사람만 코드별로 묶어 활성·청취·결제를 본다(`GET /admin/insights/invite-codes`,
 * 2026-10-28). 서비스 지표 탭에 넣지 않고 따로 둔 이유: 그 탭은 이미 정보가 많고, 프로모션은 묶음이 작아 따로 읽는 편이 낫다.
 */
export default function PromotionInsightsPage() {
  return (
    <div className="space-y-3">
      <PageHeader
        title="프로모션"
        breadcrumb={["백엔드 로그", "프로모션"]}
        desc="초대 코드를 입력한 사람만 코드별로 묶어, 코드를 입력하지 않은 사람과 활성·청취·결제를 비교한다. 운영 DB 를 관리자 API 로 읽는 읽기 전용 조회이며, 열 때 한 번만 가져온다."
      />
      <PromotionInsights />
    </div>
  );
}
