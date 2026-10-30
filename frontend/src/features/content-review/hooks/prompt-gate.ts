import type { ContentReviewPromptPhase } from '../store/content-review.store';

/**
 * 먼저 묻는 시트(L18)의 다음 걸음 — 띄울지는 서버 `show`가 이미 정했고(`pending`), 여기서는 **이 세션에 언제 · 띄워도 되는지**만 본다.
 *
 * - `wait`   아직 — 라이브러리에 들어오지 않았거나, 추천 별점 판정이 끝나지 않았거나(뜰 수도 있다), 앞선 팝업 · 플레이어가 있다
 * - `skip`   이 세션에는 띄우지 않는다 — **같은 세션에 추천 별점 팝업(L16)이 떴다**(한 세션에 하나 · 추천 별점 우선, content-review.md 4.3-5).
 *            서버에는 아무것도 보내지 않는다 — 다음 진입(다음 실행)에 다시 묻는다(api 4.3)
 * - `reveal` 띄운다(한 박자 쉬고)
 */
export type ContentReviewPromptStep = 'wait' | 'skip' | 'reveal';

export const decideContentReviewPromptStep = (signals: {
  phase: ContentReviewPromptPhase;
  isLibraryEntered: boolean;
  /** 추천 별점 팝업의 이 세션 판정이 끝났다(보냄 · 닫음 · show=false · 실패) */
  isDripFeedbackSettled: boolean;
  /** 추천 별점 팝업이 이 세션에 떴다 */
  wasDripFeedbackShown: boolean;
  /** 앞선 팝업(알림 사전 안내 · 권장 업데이트 · 푸시 재생 확인 · 한도 안내 · 가입 체험 안내)과 플레이어가 없다 — app 이 묶어 넘긴다 */
  isReady: boolean;
}): ContentReviewPromptStep => {
  if (signals.phase !== 'pending' || !signals.isLibraryEntered) return 'wait';
  if (signals.wasDripFeedbackShown) return 'skip';
  if (!signals.isDripFeedbackSettled || !signals.isReady) return 'wait';
  return 'reveal';
};
