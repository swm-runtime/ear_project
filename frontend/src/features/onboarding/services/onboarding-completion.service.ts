import { isApiError } from '@/shared/api/api-error';
import { ERROR_CODES } from '@/shared/api/error-codes';
import { generateId } from '@/shared/lib/generate-id';
import { logger } from '@/shared/lib/logger';

import { completeOnboarding } from '../api/onboarding.api';
import { useOnboardingStore } from '../store/onboarding.store';

/**
 * 완료 요청 오케스트레이션(architecture.md 3.2 Domain Service).
 * - 요청은 [담기]/[건너뛰기] 시점에 나가고 결과는 store로 공유한다 — 화면 전환과 분리.
 * - 멱등키는 온보딩 세션당 1개를 재사용한다: 자동·수동 재시도가 편성을 중복 트리거하면 안 된다(onboarding-api.md 4.7).
 */
class OnboardingCompletionService {
  private idempotencyKey: string | null = null;

  /** 완료 요청을 발사한다. 이미 진행 중·성공이면 무시한다(중복 탭·재진입 방어) */
  request(): void {
    const store = useOnboardingStore.getState();
    if (store.completionStatus === 'pending' || store.completionStatus === 'success') return;

    this.idempotencyKey = this.idempotencyKey ?? generateId();
    store.setCompletion('pending');

    void completeOnboarding({ idempotencyKey: this.idempotencyKey })
      .then((result) => {
        useOnboardingStore.getState().setCompletion('success', result);
      })
      .catch((error: unknown) => {
        // 다른 멱등키로 완료가 이미 처리된 경우 — 성공과 동일하게 다룬다(onboarding-api.md 4.7)
        if (isApiError(error) && error.errorCode === ERROR_CODES.ONBOARDING_ALREADY_COMPLETED) {
          useOnboardingStore.getState().setCompletion('success', {
            onboardingCompleted: true,
            onboardingStep: 'done',
            pickedCount: 0,
            awaitsFirstDrip: false,
            firstDrip: null,
          });
          return;
        }
        logger.error('[onboarding] complete request failed', error);
        useOnboardingStore.getState().setCompletion('error', null);
      });
  }

  /** 온보딩 종료·이탈 시 초기화 — 다음 온보딩 세션은 새 멱등키를 쓴다 */
  reset(): void {
    this.idempotencyKey = null;
  }
}

export const onboardingCompletionService = new OnboardingCompletionService();
