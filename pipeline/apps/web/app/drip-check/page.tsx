import { PageHeader } from "@/components/ui";
import { DripCheck } from "@/components/drip-check";
import { EarGate, EarSession, EarSnapshotDownload } from "../publish/ear-connect";

export const dynamic = "force-dynamic";

/**
 * 추천 검증 — "지금 데이터로 편성 배치를 돌리면 이 사용자에게 어떤 2편(정규)·1편(새 주제)이 가는가".
 * 제품 서버의 편성 미리보기(`GET /admin/drip/preview?user_id=`)를 새로고침마다 다시 불러 그대로 보인다.
 * 서버는 실제 배치와 같은 계산기를 저장 없이 돌리므로 여기서 보는 결과가 곧 오늘 배치의 결과다.
 *
 * 대상은 가명 `user_id`로만 고른다(2026-10-22) — 종전의 고정 이메일·이메일 입력칸은 없앴다(루트 CLAUDE.md 개인정보 원칙).
 * `?user_id=`로 들어오면(사용자별 추천 표의 링크) 그 사용자를 바로 계산한다.
 */
export default async function DripCheckPage({ searchParams }: { searchParams: Promise<{ user_id?: string }> }) {
  const { user_id: userId } = await searchParams;
  return (
    <div className="space-y-3">
      <PageHeader
        title="편성 미리보기 (실배포)"
        breadcrumb={["추천 검증", "편성 미리보기 (실배포)"]}
        desc="운영 서버의 실제 사용자·실제 신호로 계산한다. 사용자는 user_id 로만 고른다(이메일·닉네임은 서버가 싣지 않는다). 폰에서 완청·담기·관심 주제 변경을 한 뒤 [새로고침]을 누르면 지금 신호로 다시 계산한 점수와 편성분이 보인다. 사용자 상태는 바꾸지 않는다 — 열 때마다 서버가 열람 감사 로그 1행만 남긴다. 버튼으로 행동을 넣어 보며 실험하려면 [추천 테스트](개발계) 탭."
        actions={<><EarSnapshotDownload /><EarSession /></>}
      />
      <EarGate>
        <DripCheck initialUserId={userId ?? ""} />
      </EarGate>
    </div>
  );
}
