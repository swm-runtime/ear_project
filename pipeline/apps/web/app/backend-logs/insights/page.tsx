import { PageHeader } from "@/components/ui";
import { ServiceInsights } from "@/components/service-insights";

export const dynamic = "force-dynamic";

/**
 * 서비스 지표 — 제품 API 의 DB 를 관리자 API(`GET /admin/insights/summary`, admin-api 4.22)로 읽어 가입·탈퇴·청취·순위·
 * 리텐션을 한 화면에 모은다. 검색 로그 탭처럼 CloudWatch 가 아니라 운영 DB 가 원천이고, **열 때 1회 + [새로고침]**만 요청한다.
 */
export default function ServiceInsightsPage() {
  return (
    <div className="space-y-3">
      <PageHeader
        title="서비스 지표"
        breadcrumb={["백엔드 로그", "서비스 지표"]}
        desc="가입·탈퇴·활성 사용자·청취 시간·완청률·많이 들은 사용자와 콘텐츠·리텐션·탈퇴 사유. 운영 DB 를 관리자 API 로 읽는 읽기 전용 조회이며, 열 때 한 번만 가져오고 자동 갱신하지 않는다."
      />
      <ServiceInsights />
    </div>
  );
}
