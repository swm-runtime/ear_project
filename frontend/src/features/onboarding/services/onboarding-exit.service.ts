import { clearReonboardingAfterMarketChange, sessionService } from '@/features/auth';

import { onboardingCompletionService } from './onboarding-completion.service';
import { useOnboardingLandingStore } from '../store/onboarding-landing.store';
import { useOnboardingStore } from '../store/onboarding.store';

/**
 * 온보딩 종료 → 라이브러리 진입.
 * 세션 상태 갱신으로 RootNavigator가 스택을 통째로 교체하므로 뒤로가기로 복귀할 수 없다(architecture.md 6.3).
 * 서버 완료 처리는 완료 대기 화면에서 이미 끝났고, 여기서는 로컬 상태만 따라간다.
 *
 * 첫 드립이 열 편을 정해 줬으면(KAN-295) 착지 store 에 옮겨 둔다 — Main 이 집어 멈춘 플레이어로 연다. 온보딩 store 는
 * 아래에서 초기화되므로 **초기화 전에**, 또 Main 이 뜨기 전에(세션 갱신 전에) 적는다. 없으면 종전대로 탐색에 착지한다.
 */
export const exitOnboarding = (): void => {
  const { firstContentId } = useOnboardingStore.getState();
  if (firstContentId !== null) {
    useOnboardingLandingStore.getState().setPendingFirstContentId(firstContentId);
  }
  sessionService.markOnboardingCompleted();
  // 시장 전환 뒤 재온보딩이었다면 여기서 끝난다 — [되돌리기]·완료 GA 거르기 표시를 지운다(KAN-228)
  clearReonboardingAfterMarketChange();
  onboardingCompletionService.reset();
  useOnboardingStore.getState().reset();
};
