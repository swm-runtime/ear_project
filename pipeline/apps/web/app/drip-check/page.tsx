import { PageHeader } from "@/components/ui";
import { DripCheck } from "@/components/drip-check";
import { EarGate, EarSession } from "../publish/ear-connect";

export const dynamic = "force-dynamic";

/** 검증 대상 사용자 — 한 명으로 고정해 쓴다(결정 2026-09-18). 입력칸에서 바꿀 수는 있다 */
const DEFAULT_PREVIEW_EMAIL = "githubbruny@gmail.com";

/**
 * 추천 검증 — "지금 데이터로 편성 배치를 돌리면 이 사용자에게 어떤 2편(정규)·1편(새 주제)이 가는가".
 * 제품 서버의 편성 미리보기(`GET /admin/drip/preview`)를 새로고침마다 다시 불러 그대로 보인다.
 * 서버는 실제 배치와 같은 계산기를 저장 없이 돌리므로 여기서 보는 결과가 곧 오늘 배치의 결과다.
 */
export default function DripCheckPage() {
  return (
    <div className="space-y-3">
      <PageHeader
        title="편성 미리보기"
        breadcrumb={["추천 검증", "편성 미리보기"]}
        desc="폰에서 완청·담기·관심 주제 변경을 한 뒤 [새로고침]을 누르면 지금 신호로 다시 계산한 점수와 편성분이 보인다. 읽기 전용 — 취향 캐시·라이브러리·배치 기록 어느 것도 바꾸지 않는다."
        actions={<EarSession />}
      />
      <EarGate>
        <DripCheck defaultEmail={DEFAULT_PREVIEW_EMAIL} />
      </EarGate>
    </div>
  );
}
