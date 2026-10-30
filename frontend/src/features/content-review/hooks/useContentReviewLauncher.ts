import { useNavigation } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';

import { logger } from '@/shared/lib/logger';
import { useToastStore } from '@/shared/ui/toast.store';

import { useSessionStore } from '@/features/auth';

import { contentReviewKeys } from '../api/content-review.api';
import type { ContentReviewSheetProps } from '../components/ContentReviewSheet';
import { CONTENT_REVIEW_COPY } from '../content-review.copy';
import type {
  ContentReviewState,
  ContentReviewTarget,
  Promotion,
  RewardProgress,
} from '../content-review.types';
import { reviewOutcomeToast, reviewStateAfterSave, unavailableToast } from './review-outcome';
import {
  loadContentReviewState,
  requestContentReviewPrompt,
  sendContentReview,
} from '../services/content-review.service';
import { selectIsContentReviewEnabled, useContentReviewStore } from '../store/content-review.store';

/**
 * 더보기 시트의 닫힘 콜백이 끝내 오지 않을 때(기기별 모달 동작 차이) 기다림을 거두는 시간 — 시트 퇴장 모션(0.24초) + 모달
 * 내림보다 넉넉하다. 정상 경로에서는 콜백이 먼저 와서 쓰이지 않는다
 */
const HOST_SHEET_CLOSE_FALLBACK_MS = 1200;

interface PendingRequest {
  target: ContentReviewTarget;
  /** 더보기 시트가 닫히는 중 — 닫힘이 끝나야 후기 시트를 연다(모달 둘을 겹치지 않는다) */
  isWaitingHost: boolean;
  state: ContentReviewState | null;
}

export interface ContentReviewLauncher {
  /** [후기] · "내 후기"를 그리는가 — 서버 `enabled`(받은 적 없거나 실패면 false) */
  isEnabled: boolean;
  /**
   * 후기 시트를 연다 — 서버에 쓸 수 있는 편인지 · 내 후기 · 진행을 묻고, 쓸 수 없으면 시트 대신 안내 토스트를 띄운다.
   * 더보기 시트에서 부를 때는 `afterHostSheetClosed: true` 로 두고 그 시트의 닫힘 콜백에 `handleHostSheetClosed`를 잇는다
   */
  request: (target: ContentReviewTarget, options?: { afterHostSheetClosed?: boolean }) => void;
  handleHostSheetClosed: () => void;
  /** `ContentReviewSheets`에 그대로 넘긴다 */
  sheetProps: Omit<ContentReviewSheetProps, 'variant' | 'onMuteThisWeek'>;
  issuedSheetProps: {
    promotion: Promotion | null;
    onUseNow: () => void;
    onLater: () => void;
    onClosed: () => void;
  };
}

/**
 * 상시 진입점(더보기 시트 L4 · E12 · PL7 [후기] · 콘텐츠 상세 "내 후기")의 후기 시트(L17)와 발급 안내(L19) — content-review.md 2.1.
 * 화면마다 하나 둔다 — 시트를 그 화면 안에 그려야 플레이어(네이티브 모달) 위에서도 같은 층에 뜬다.
 *
 * 순서: 더보기 시트 닫힘 → (시트 열기 조회와 나란히) → 후기 시트 → [보내기] → 후기 시트 닫힘 → 발급 안내 → 닫힘 → S12.
 * 어느 단계든 **앞 모달이 실제로 내려간 뒤** 다음을 연다.
 */
export const useContentReviewLauncher = (): ContentReviewLauncher => {
  const userId = useSessionStore((s) => s.user?.id ?? null);
  const isEnabled = useContentReviewStore(selectIsContentReviewEnabled);
  const queryClient = useQueryClient();
  const navigation = useNavigation();
  const showToast = useToastStore((s) => s.show);

  // 무엇과 동기화하나: 로그인한 계정 → 이 세션의 켜짐 여부. 라이브러리를 거치지 않고 시작한 세션도 [후기]를 그리게 한다
  // (서비스가 세션 × 계정 한 번으로 막는다 — 라이브러리 진입과 같은 조회 하나다)
  useEffect(() => {
    if (userId !== null) void requestContentReviewPrompt(userId);
  }, [userId]);

  const [target, setTarget] = useState<ContentReviewTarget | null>(null);
  const [isSheetVisible, setIsSheetVisible] = useState(false);
  const [stars, setStars] = useState<number | null>(null);
  const [text, setText] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [rewardProgress, setRewardProgress] = useState<RewardProgress | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [hasSendError, setHasSendError] = useState(false);
  const [issuedPromotion, setIssuedPromotion] = useState<Promotion | null>(null);

  const pendingRef = useRef<PendingRequest | null>(null);
  /** 시트를 열었거나 여는 중 — 닫히기 전 두 번째 요청을 받지 않는다 */
  const isBusyRef = useRef(false);
  const isSheetOpenRef = useRef(false);
  const isSendingRef = useRef(false);
  /** 후기 시트 모달이 화면에 남아 있다(열림부터 실제로 내려갈 때까지) — 발급 안내를 겹쳐 띄우지 않으려고 따로 센다 */
  const isSheetPresentRef = useRef(false);
  const pendingIssuedRef = useRef<Promotion | null>(null);
  const shouldOpenPromotionsRef = useRef(false);
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (fallbackTimerRef.current !== null) clearTimeout(fallbackTimerRef.current);
    },
    [],
  );

  const openIfReady = useCallback(() => {
    const pending = pendingRef.current;
    if (pending === null || pending.state === null || pending.isWaitingHost) return;
    pendingRef.current = null;
    if (fallbackTimerRef.current !== null) clearTimeout(fallbackTimerRef.current);
    const { state } = pending;
    // 꺼짐 — 시트도 안내도 없다. 진입점은 store 의 enabled 를 따라 사라진다
    if (!state.enabled || !state.reviewable) {
      isBusyRef.current = false;
      const message = state.enabled ? unavailableToast(state.reason) : null;
      if (message !== null) showToast(message);
      return;
    }
    setTarget(pending.target);
    setStars(state.review?.stars ?? null);
    setText(state.review?.text ?? '');
    setIsEditing(state.review !== null);
    setRewardProgress(state.rewardProgress);
    setHasSendError(false);
    isSheetOpenRef.current = true;
    isSheetPresentRef.current = true;
    setIsSheetVisible(true);
  }, [showToast]);

  const request = useCallback(
    (nextTarget: ContentReviewTarget, options?: { afterHostSheetClosed?: boolean }) => {
      if (isBusyRef.current) return;
      isBusyRef.current = true;
      const pending: PendingRequest = {
        target: nextTarget,
        isWaitingHost: options?.afterHostSheetClosed ?? false,
        state: null,
      };
      pendingRef.current = pending;
      if (pending.isWaitingHost) {
        fallbackTimerRef.current = setTimeout(() => {
          if (pendingRef.current !== pending) return;
          pending.isWaitingHost = false;
          openIfReady();
        }, HOST_SHEET_CLOSE_FALLBACK_MS);
      }
      // 같은 캐시를 상세 "내 후기"가 본다 — 늘 새로 받는다(시트를 열 때 쓸 수 있는지를 서버에 다시 묻는다)
      queryClient
        .fetchQuery({
          queryKey: contentReviewKeys.review(nextTarget.contentId),
          queryFn: () => loadContentReviewState(nextTarget.contentId),
          staleTime: 0,
        })
        .then((state) => {
          if (pendingRef.current !== pending) return;
          pending.state = state;
          openIfReady();
        })
        .catch((error: unknown) => {
          if (pendingRef.current !== pending) return;
          pendingRef.current = null;
          isBusyRef.current = false;
          logger.warn('[content-review] load failed', error);
          showToast(CONTENT_REVIEW_COPY.toast.loadFailed);
        });
    },
    [openIfReady, queryClient, showToast],
  );

  const handleHostSheetClosed = useCallback(() => {
    const pending = pendingRef.current;
    if (pending === null || !pending.isWaitingHost) return;
    pending.isWaitingHost = false;
    openIfReady();
  }, [openIfReady]);

  const closeSheet = () => {
    isSheetOpenRef.current = false;
    setIsSheetVisible(false);
  };

  const send = async () => {
    if (isSendingRef.current || target === null || stars === null || userId === null) return;
    isSendingRef.current = true;
    setIsSending(true);
    setHasSendError(false);
    const outcome = await sendContentReview(userId, {
      contentId: target.contentId,
      stars,
      text,
    });
    isSendingRef.current = false;
    setIsSending(false);
    const isOpen = isSheetOpenRef.current;
    const message = reviewOutcomeToast(outcome, isOpen);
    if (outcome.kind === 'failed' && isOpen) {
      setHasSendError(true);
      return;
    }
    if (outcome.kind === 'sent') {
      queryClient.setQueryData(
        contentReviewKeys.review(target.contentId),
        reviewStateAfterSave(outcome),
      );
      // 진행 · 발급이 바뀌었다 — S12 와 설정 배지가 다시 받는다
      void queryClient.invalidateQueries({ queryKey: contentReviewKeys.promotions() });
      const issued = outcome.saved.issuedPromotion;
      if (issued !== null) {
        // 시트가 아직 화면에 있으면(열림 · 내려가는 중) 내려간 뒤 연다. 이미 내려갔으면(보내는 중에 닫음) 바로 연다
        if (isSheetPresentRef.current) pendingIssuedRef.current = issued;
        else setIssuedPromotion(issued);
      }
    }
    if (message !== null) showToast(message);
    if (isOpen) {
      closeSheet();
      return;
    }
    // 보내는 중에 시트가 이미 내려갔다 — 발급 안내가 없으면 이 흐름은 여기서 끝이다
    if (outcome.kind !== 'sent' || outcome.saved.issuedPromotion === null) {
      isBusyRef.current = false;
    }
  };

  const handleSheetClosed = () => {
    isSheetPresentRef.current = false;
    const issued = pendingIssuedRef.current;
    pendingIssuedRef.current = null;
    if (issued !== null) {
      setIssuedPromotion(issued);
      return;
    }
    // 보내는 중에 닫았으면 결과가 흐름을 끝낸다(send)
    if (!isSendingRef.current) isBusyRef.current = false;
  };

  const handleIssuedClosed = () => {
    isBusyRef.current = false;
    if (!shouldOpenPromotionsRef.current) return;
    shouldOpenPromotionsRef.current = false;
    navigation.navigate('Main', { screen: 'Promotions' });
  };

  return {
    isEnabled,
    request,
    handleHostSheetClosed,
    sheetProps: {
      isVisible: isSheetVisible,
      target,
      stars,
      text,
      isEditing,
      rewardProgress,
      isSending,
      hasSendError,
      onStarsChange: (value) => {
        setStars(value);
        setHasSendError(false);
      },
      onTextChange: setText,
      onSend: () => void send(),
      onClose: closeSheet,
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
