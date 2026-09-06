import { PageHeader } from "@/components/ui";
import { BackendErrorSummary } from "@/components/backend-error-summary";

export const dynamic = "force-dynamic";

// 에러 모아보기 — 같은 유형의 ERROR(·WARN)를 묶어 건수·최근 발생 순으로 본다.
export default function BackendLogErrorsPage() {
  return (
    <div>
      <PageHeader
        title="에러 모아보기"
        breadcrumb={["백엔드 로그", "에러"]}
        desc="제품 API 서버 로그에서 ERROR(선택 시 WARN 포함)만 걷어 같은 유형끼리 묶는다. 유형 구분은 가변값(숫자·id)을 지운 근사이며, 원문 전체는 실시간 로그에서 확인한다. 보관 7일."
      />
      <BackendErrorSummary />
    </div>
  );
}
