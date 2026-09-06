import { PageHeader } from "@/components/ui";
import { BackendTraffic } from "@/components/backend-traffic";

export const dynamic = "force-dynamic";

// 요청 통계 — 뭐가 많이·느리게·실패하며 불리고 있는가.
export default function BackendTrafficPage() {
  return (
    <div>
      <PageHeader
        title="요청 통계"
        breadcrumb={["백엔드 로그", "요청"]}
        desc="api 로그의 요청 완료 라인을 파싱해 경로별 건수·오류·소요를 요약한다. 불러온 창(최대 1,000줄) 안의 근사치이며 전 기간 통계가 아니다."
      />
      <BackendTraffic />
    </div>
  );
}
