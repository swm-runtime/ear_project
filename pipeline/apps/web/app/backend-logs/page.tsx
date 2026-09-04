import { PageHeader } from "@/components/ui";
import { BackendLogsViewer } from "@/components/backend-logs-viewer";

export const dynamic = "force-dynamic";

// 백엔드 로그 — 제품 API 서버(EC2)의 컨테이너 로그를 SSH 없이 본다.
// 경로: 백엔드 compose(awslogs 드라이버) → CloudWatch Logs → /api/backend-logs(tail 조회).
export default function BackendLogsPage() {
  return (
    <div>
      <PageHeader
        title="백엔드 로그"
        breadcrumb={["백엔드 로그"]}
        desc="제품 API 서버(EC2)의 api·caddy 컨테이너 로그 — CloudWatch Logs 경유(보관 7일). 전환 이전 로그와 전 기간 텍스트 검색은 지원하지 않는다."
      />
      <BackendLogsViewer />
    </div>
  );
}
