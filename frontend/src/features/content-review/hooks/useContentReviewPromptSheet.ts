import { useNavigation } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

import { useToastStore } from '@/shared/ui/toast.store';

import { useSessionStore } from '@/features/auth';

import { contentReviewKeys } from '../api/content-review.api';
import { CONTENT_REVIEW_PROMPT_REVEAL_DELAY_MS } from '../content-review.constants';
import type { Promotion } from '../content-review.types';
import { decideContentReviewPromptStep } from './prompt-gate';
import { reviewOutcomeToast, reviewStateAfterSave } from './review-outcome';
import {
  notifyContentReviewPromptDismissed,
  notifyContentReviewPromptMuted,
  sendContentReview,
} from '../services/content-review.service';
import { useContentReviewStore } from '../store/content-review.store';

export interface ContentReviewPromptSignals {
  /** 앞선 팝업 · 플레이어가 없다 — app(MainNavigator)이 묶어 넘긴다 */
  isReady: boolean;
  /** 추천 별점 팝업의 이 세션 판정이 끝났다 — library 소유 신호를 app 이 넘긴다 */
  isDripFeedbackSettled: boolean;
  /** 추천 별점 팝업이 이 세션에 떴다 */
  wasDripFeedbackShown: boolean;
}

/**
 * 먼저 묻는 시트(L18 — library-uiux.md 4.14 · content-review.md 4.3)의 화면 상태.
 *
 * - 띄울지는 서버 `show`(판정 조회는 라이브러리 진입 때 — `useContentReviewEntry`). 이 훅은 **언제 보일지**만 정한다
 *   (`decideContentReviewPromptStep`). 같은 세션에 추천 별점이 떴으면 띄우지 않고 서버에도 보내지 않는다.
 * - 한 번 뜬 뒤에는 신호가 바뀌어도 닫지 않는다 — 쓰던 글을 잃는다.
 * - 시트가 닫힐 때 `dismiss`나 `mute` 중 하나를 **반드시** 보낸다(api 6장) — 보낸 뒤 닫혀도 dismiss 다.
 * - 저장 결과의 발급 안내(L19)는 시트가 내려간 뒤 연다. [지금 쓰기]는 안내가 내려간 뒤 S12 로 간다.
 */
export const useContentReviewPromptSheet = ({
  isReady,
  isDripFeedbackSettled,
  wasDripFeedbackShown,
}: ContentReviewPromptSignals) => {
  const userId = useSessionStore((s) => s.user?.id ?? null);
  const phase = useContentReviewStore((s) => s.promptPhase);
  const prompt = useContentReviewStore((s) => s.prompt);
  const isLibraryEntered = useContentReviewStore((s) => s.isLibraryEntered);
  const queryClient = useQueryClient();
  const navigation = useNavigation();
  const showToast = useToastStore((s) => s.show);

  const [stars, setStars] = useState<number | null>(null);
  const [text, setText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [hasSendError, setHasSendError] = useState(false);
  const [issuedPromotion, setIssuedPromotion] = useState<Promotion | null>(null);
  const isSendingRef = useRef(false);
  const pendingIssuedRef = useRef<Promotion | null>(null);
  const shouldOpenPromotionsRef = useRef(false);
  /** 시트 모달이 화면에 남아 있다(뜬 뒤 실제로 내려갈 때까지) — 발급 안내를 겹쳐 띄우지 않는다 */
  const isSheetPresentRef = useRef(false);

  const step = decideContentReviewPromptStep({
    phase,
    isLibraryEntered,
    isDripFeedbackSettled,
    wasDripFeedbackShown,
    isReady,
  });

  // 무엇과 동기화하나: 띄울 차례 + 앞선 팝업 없음 → 한 박자 쉬고 연다 / 추천 별점이 이미 떴다 → 이 세션은 건너뛴다
  useEffect(() => {
    if (step === 'skip') {
      useContentReviewStore.getState().finishPrompt();
      return;
    }
    if (step !== 'reveal') return;
    const timer = setTimeout(
      () => useContentReviewStore.getState().revealPrompt(),
      CONTENT_REVIEW_PROMPT_REVEAL_DELAY_MS,
    );
    return () => clearTimeout(timer);
  }, [step]);

  const isVisible = phase === 'visible';
  // 무엇과 동기화하나: 시트가 뜸 → "화면에 있다". 내려감은 닫힘 콜백(handleSheetClosed)이 적는다
  useEffect(() => {
    if (isVisible) isSheetPresentRef.current = true;
  }, [isVisible]);

  const finish = (notify: 'dismiss' | 'mute') => {
    useContentReviewStore.getState().finishPrompt();
    if (userId === null) return;
    if (notify === 'mute') void notifyContentReviewPromptMuted(userId);
    else void notifyContentReviewPromptDismissed(userId);
  };

  const send = async () => {
    const item = prompt?.item ?? null;
    if (isSendingRef.current || item === null || stars === null || userId === null) return;
    isSendingRef.current = true;
    setIsSending(true);
    setHasSendError(false);
    const outcome = await sendContentReview(userId, { contentId: item.contentId, stars, text });
    isSendingRef.current = false;
    setIsSending(false);
    const isOpen = useContentReviewStore.getState().promptPhase === 'visible';
    if (outcome.kind === 'failed' && isOpen) {
      setHasSendError(true);
      return;
    }
    if (outcome.kind === 'sent') {
      queryClient.setQueryData(
        contentReviewKeys.review(item.contentId),
        reviewStateAfterSave(outcome),
      );
      void queryClient.invalidateQueries({ queryKey: contentReviewKeys.promotions() });
      const issued = outcome.saved.issuedPromotion;
      if (issued !== null) {
        if (isSheetPresentRef.current) {
          pendingIssuedRef.current = issued;
        } else {
          useContentReviewStore.getState().setPromptIssuedVisible(true);
          setIssuedPromotion(issued);
        }
      }
    }
    const message = reviewOutcomeToast(outcome, isOpen);
    if (message !== null) showToast(message);
    // 보냈든 버렸든 시트를 닫는다 — 닫힘은 곧 dismiss 다(api 4.4 "닫든 보내든 물었다")
    if (isOpen) finish('dismiss');
  };

  const handleSheetClosed = () => {
    isSheetPresentRef.current = false;
    const issued = pendingIssuedRef.current;
    pendingIssuedRef.current = null;
    if (issued === null) return;
    useContentReviewStore.getState().setPromptIssuedVisible(true);
    setIssuedPromotion(issued);
  };

  const handleIssuedClosed = () => {
    useContentReviewStore.getState().setPromptIssuedVisible(false);
    if (!shouldOpenPromotionsRef.current) return;
    shouldOpenPromotionsRef.current = false;
    navigation.navigate('Main', { screen: 'Promotions' });
  };

  return {
    hasContent: prompt?.item !== null && prompt?.item !== undefined,
    sheetProps: {
      isVisible,
      target: prompt?.item ?? null,
      stars,
      text,
      isEditing: false,
      rewardProgress: prompt?.rewardProgress ?? null,
      isSending,
      hasSendError,
      onStarsChange: (value: number) => {
        setStars(value);
        setHasSendError(false);
      },
      onTextChange: setText,
      onSend: () => void send(),
      // 보내는 중에 닫아도 결과는 그대로 처리한다(저장되면 토스트) — 닫기는 dismiss
      onClose: () => {
        if (useContentReviewStore.getState().promptPhase === 'visible') finish('dismiss');
      },
      onMuteThisWeek: () => {
        if (useContentReviewStore.getState().promptPhase === 'visible') finish('mute');
      },
      onClosed: handleSheetClosed,
    },
    issuedSheetProps: {
      promotion: issuedPromotion,
      onUseNow: () => {
        shouldOpenPromotionsRef.current = true;
        setIssuedPromotion(null);
      },
      onLater: () => setIssuedPromotion(null),
      onClosed: handleIssuedClosed,
    },
  };
};
