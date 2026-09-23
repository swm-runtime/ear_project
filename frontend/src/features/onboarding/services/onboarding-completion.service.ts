import { setAnalyticsUserProperties, track } from '@/shared/analytics';
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
 * - `onboarding_complete` 이벤트(analytics.md 3.4)의 재료(주제 수·커리어 입력 여부·시작 시각)는 각 단계가
 *   여기 적어 두고, 완료 응답이 오면 한 번에 보낸다 — 화면은 서로의 값을 모른다.
 */
class OnboardingCompletionService {
  private idempotencyKey: string | null = null;
  private funnel = { startedAt: null as number | null, topicCount: 0, careerFilled: false };
  private hasReportedComplete = false;

  /** 1단계 화면이 뜬 시각 — 처음 한 번만 기록한다(뒤로 가기·재진입은 시작이 아니다) */
  noteStarted(): void {
    this.funnel.startedAt ??= Date.now();
  }

  noteTopics(count: number): void {
    this.funnel.topicCount = count;
  }

  noteCareer(isFilled: boolean): void {
    this.funnel.careerFilled = isFilled;
  }

  /** 완료 요청을 발사한다. 이미 진행 중·성공이면 무시한다(중복 탭·재진입 방어) */
  request(): void {
    const store = useOnboardingStore.getState();
    if (store.completionStatus === 'pending' || store.completionStatus === 'success') return;

    this.idempotencyKey = this.idempotencyKey ?? generateId();
    store.setCompletion('pending');

    void completeOnboarding({ idempotencyKey: this.idempotencyKey })
      .then((result) => {
        useOnboardingStore.getState().setCompletion('success', result);
        this.reportComplete(result.pickedCount);
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

  /** 완료 응답 성공에 한 번 — 재시도 성공도 같은 완료다. 주제 수는 사용자 속성으로도 올린다(analytics.md 3.2) */
  private reportComplete(pickedCount: number): void {
    if (this.hasReportedComplete) return;
    this.hasReportedComplete = true;
    const { startedAt, topicCount, careerFilled } = this.funnel;
    track('onboarding_complete', {
      topic_count: topicCount,
      career_filled: careerFilled,
      picked_count: pickedCount,
      elapsed_sec: startedAt === null ? 0 : Math.round((Date.now() - startedAt) / 1000),
    });
    setAnalyticsUserProperties({ topic_count: topicCount });
  }

  /** 온보딩 종료·이탈 시 초기화 — 다음 온보딩 세션은 새 멱등키를 쓴다 */
  reset(): void {
    this.idempotencyKey = null;
    this.funnel = { startedAt: null, topicCount: 0, careerFilled: false };
    this.hasReportedComplete = false;
  }
}

export const onboardingCompletionService = new OnboardingCompletionService();
