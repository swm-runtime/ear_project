import { PageHeader } from "@/components/ui";
import { ServiceInsightsV2 } from "@/components/service-insights-v2";

export const dynamic = "force-dynamic";

/**
 * 서비스 지표 v2 — 질문형(2026-10-28 멘토 피드백). `GET /admin/insights/v2` 한 번으로 세 질문(습관 사용자 · 가입 주 퍼널 · 안 듣는
 * 사람)에 답한다. 기존 "서비스 지표" 탭은 그대로 두고 옆에 둔다. 열 때 1회 + [새로고침]만 요청한다.
 */
export default function ServiceInsightsV2Page() {
  return (
    <div className="space-y-3">
      <PageHeader
        title="서비스 지표 v2"
        breadcrumb={["백엔드 로그", "서비스 지표 v2"]}
        desc="패널마다 질문 하나 — 습관이 된 사람은 늘었나, 가입한 사람은 어디서 새나, 안 듣는 사람은 누구인가. 서비스 주·가입 주 코호트로 비교하고 고칠 곳을 한 줄로 단다. 운영 DB 를 관리자 API 로 읽는 읽기 전용 조회이며 열 때 한 번만 가져온다."
      />
      <ServiceInsightsV2 />
    </div>
  );
}
