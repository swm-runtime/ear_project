import { PageHeader } from "@/components/ui";
import { RecommendTest } from "@/components/recommend-test";
import { EarGate, EarSession } from "../../publish/ear-connect";

export const dynamic = "force-dynamic";

/**
 * 추천 테스트 — **개발계** 제품 서버의 테스트 계정(서버 env `RECOMMEND_TEST_EMAIL`)에 추천에 영향을 주는 행동을
 * 버튼으로 실제 수행하고, 행동 직후 편성 미리보기(2+1)와 탐색 피드가 어떻게 바뀌는지 바로 본다(요청 2026-09-29).
 * 운영에는 붙이지 않는다 — 행동이 실제 신호·라이브러리를 쓰기 때문이다(admin.md 4.7).
 */
export default function RecommendTestPage() {
  return (
    <div className="space-y-3">
      <PageHeader
        title="추천 테스트"
        breadcrumb={["추천 검증", "추천 테스트 (개발계)"]}
        desc="개발계 서버의 테스트 계정으로 재생·완청·담기·제거·삭제·재청취·관심 주제·커리어를 버튼으로 수행한다. 각 버튼은 앱이 부르는 것과 같은 서버 경로를 타고, 행동 직후 취향 캐시를 다시 계산해 편성 미리보기(정규 2 · 새 주제 1)와 탐색 피드를 다시 불러 직전과의 차이를 표시한다."
        actions={<EarSession channel="dev" />}
      />
      <EarGate channel="dev">
        <RecommendTest />
      </EarGate>
    </div>
  );
}
