import { useCallback, useEffect, useState } from 'react';

import { useSessionStore } from '@/features/auth';

import type { DripFeedbackRating } from '../library.types';
import {
  notifyDripFeedbackDismissed,
  notifyDripFeedbackMuted,
  sendDripFeedbackRatings,
} from '../services/drip-feedback.service';
import { useDripFeedbackStore } from '../store/drip-feedback.store';

/** 앞의 팝업이 사라지고 한 박자 쉰다 — 가입 체험 안내·알림 사전 안내와 같은 값. 곧바로 뜨면 같은 팝업의 연속으로 읽힌다 */
export const DRIP_FEEDBACK_REVEAL_DELAY_MS = 400;

/**
 * 추천 별점 팝업의 화면 상태(drip-feedback.md 5장 — KAN-224).
 *
 * - 띄울지는 서버 `show`가 정했다(`requestDripFeedbackPrompt`). 이 훅은 **언제 보일지**만 정한다 — 앞선 팝업이 없을 때
 *   (`isReady`, app 이 묶어 넘긴다) 한 박자 쉬고 연다. 한 번 뜬 뒤에는 `isReady`가 바뀌어도 닫지 않는다 — 보고 있던
 *   팝업이 사라지면 고르던 별점을 잃는다.
 * - [보내기]는 매긴 편만 `items` 순서대로 보낸다. 저장·보관(오프라인)·접수 기간 지남이면 닫고, 그 밖의 실패만 인라인 에러.
 * - 닫기는 dismiss(`placed_date` 그대로), [이번 주 그만 보기]는 mute — 둘 다 즉시 닫고 서버 실패는 알리지 않는다.
 */
export const useDripFeedbackDialog = (isReady: boolean) => {
  const userId = useSessionStore((s) => s.user?.id ?? null);
  const phase = useDripFeedbackStore((s) => s.phase);
  const prompt = useDripFeedbackStore((s) => s.prompt);
  const [starsByContentId, setStarsByContentId] = useState<Record<string, number>>({});
  const [isSending, setIsSending] = useState(false);
  const [hasSendError, setHasSendError] = useState(false);

  // 무엇과 동기화하나: 띄울 차례 + 앞선 팝업 없음 → 한 박자 쉬고 연다. 조건이 닫히면 지연을 처음부터 다시 센다
  useEffect(() => {
    if (phase !== 'pending' || !isReady) return;
    const timer = setTimeout(
      () => useDripFeedbackStore.getState().reveal(),
      DRIP_FEEDBACK_REVEAL_DELAY_MS,
    );
    return () => clearTimeout(timer);
  }, [phase, isReady]);

  const changeStars = useCallback((contentId: string, stars: number) => {
    setStarsByContentId((prev) => ({ ...prev, [contentId]: stars }));
    setHasSendError(false);
  }, []);

  const send = useCallback(async () => {
    if (isSending || prompt === null || userId === null) return;
    const ratings: DripFeedbackRating[] = prompt.items.flatMap((item) => {
      const stars = starsByContentId[item.contentId];
      return stars === undefined ? [] : [{ contentId: item.contentId, stars }];
    });
    if (ratings.length === 0) return;
    setIsSending(true);
    setHasSendError(false);
    const outcome = await sendDripFeedbackRatings(userId, ratings);
    setIsSending(false);
    if (outcome === 'failed') {
      setHasSendError(true);
      return;
    }
    useDripFeedbackStore.getState().finish();
  }, [isSending, prompt, starsByContentId, userId]);

  const close = useCallback(() => {
    // 보내는 중에는 닫지 않는다 — 결과(저장·보관)를 기다린다
    if (isSending) return;
    useDripFeedbackStore.getState().finish();
    if (userId !== null && prompt?.placedDate) {
      void notifyDripFeedbackDismissed(userId, prompt.placedDate);
    }
  }, [isSending, prompt, userId]);

  const muteThisWeek = useCallback(() => {
    if (isSending) return;
    // 즉시 닫는다 — 저장에 실패해도 이 세션은 닫아 둔다(drip-feedback.md 5장)
    useDripFeedbackStore.getState().finish();
    if (userId !== null) void notifyDripFeedbackMuted(userId);
  }, [isSending, userId]);

  return {
    isVisible: phase === 'visible',
    items: prompt?.items ?? [],
    starsByContentId,
    isSending,
    hasSendError,
    changeStars,
    send: () => void send(),
    close,
    muteThisWeek,
  };
};
