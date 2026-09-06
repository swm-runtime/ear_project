import { PageHeader } from "@/components/ui";
import { BackendStatus } from "@/components/backend-status";

export const dynamic = "force-dynamic";

// 서버 상태 — "지금 살아 있고, 에러가 나고 있는가"를 한 화면에서 본다.
export default function BackendStatusPage() {
  return (
    <div>
      <PageHeader
        title="서버 상태"
        breadcrumb={["백엔드 로그", "상태"]}
        desc="제품 API 서버의 health 응답, 로그 파이프 생존(마지막 이벤트 시각), 최근 1시간 ERROR 수. 전부 읽기 전용 조회다."
      />
      <BackendStatus />
    </div>
  );
}
