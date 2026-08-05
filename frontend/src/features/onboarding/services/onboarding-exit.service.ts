import { sessionService } from '@/features/auth';

import { onboardingCompletionService } from './onboarding-completion.service';
import { useOnboardingStore } from '../store/onboarding.store';

/**
 * 온보딩 종료 → 라이브러리 진입.
 * 세션 상태 갱신으로 RootNavigator가 스택을 통째로 교체하므로 뒤로가기로 복귀할 수 없다(architecture.md 6.3).
 * 서버 완료 처리는 3단계 종료 시점에 이미 끝났고, 여기서는 로컬 상태만 따라간다.
 */
export const exitOnboarding = (): void => {
  sessionService.markOnboardingCompleted();
  onboardingCompletionService.reset();
  useOnboardingStore.getState().reset();
};
