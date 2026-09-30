import { PageHeader } from "@/components/ui";
import { DripFeedbackVersions } from "@/components/drip-feedback-versions";

export const dynamic = "force-dynamic";

/**
 * 버전별 별점 — 실사용자가 "어제 추천 어떠셨나요?"에 매긴 별 1~5를 추천 알고리즘 버전별로 본다
 * (drip-feedback.md 4.5, admin-api 4.19, KAN-116). 배포 전 평가(편성 미리보기·평가 스냅샷)의 짝인 배포 후 평가다.
 */
export default function DripFeedbackVersionsPage() {
  return (
    <div className="space-y-3">
      <PageHeader
        title="알고리즘 버전별 별점"
        breadcrumb={["추천 검증", "버전별 별점"]}
        desc="편성분마다 남긴 알고리즘 버전(DRIP_ALGORITHM_VERSION)으로 실사용자 별점을 묶는다. 편성 결과가 달라지는 변경마다 버전이 올라가므로, 행 하나가 알고리즘 하나다. 별점은 추천에 반영되지 않는 순수 측정값이다."
      />
      <DripFeedbackVersions />
    </div>
  );
}
