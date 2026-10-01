import { PageHeader } from "@/components/ui";
import { SearchQueryLogs } from "@/components/search-query-logs";

export const dynamic = "force-dynamic";

/**
 * 검색 로그 — 제품 API 서버가 남긴 검색 질의 로그(domain.md 5.7, admin-api 4.21)의 요약. 다른 탭(CloudWatch 로그)과 달리
 * 백엔드 DB 를 관리자 API 로 읽는다. 매칭 방식(pg_trgm 부분 일치)을 재검토할지 판단하는 근거 화면이다(explore.md 4.5-5).
 */
export default function SearchQueryLogsPage() {
  return (
    <div className="space-y-3">
      <PageHeader
        title="검색 로그"
        breadcrumb={["백엔드 로그", "검색 로그"]}
        desc="앱 검색이 무엇을 찾았고 무엇을 못 찾았는가. 미스율(0건 비율)·0건 질의·많이 찾은 질의·일별 추이. 제품 API 의 관리자 계정으로 읽는 읽기 전용 조회다."
      />
      <SearchQueryLogs />
    </div>
  );
}
