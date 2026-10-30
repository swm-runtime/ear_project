import { useNavigation } from '@react-navigation/native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert } from 'react-native';

import { isApiError } from '@/shared/api/api-error';
import { ERROR_CODES } from '@/shared/api/error-codes';
import { useToastStore } from '@/shared/ui/toast.store';

import {
  formatPlanGrantLine,
  grantStartedMessage,
  inviteSuccessMessage,
  notifySubscriptionChanged,
  subscriptionKeys,
  type MySubscription,
} from '@/features/subscription';

import { contentReviewKeys, fetchPromotions, redeemPromotion } from '../api/content-review.api';
import { CONTENT_REVIEW_COPY } from '../content-review.copy';
import type {
  Promotion,
  PromotionUnusableReason,
  PromotionsOverview,
} from '../content-review.types';
import { usePromotionsQuery } from './usePromotionsQuery';

const COPY = CONTENT_REVIEW_COPY.promotions;

/** 쓸 수 없음의 사유 줄(S12) — 서버 사유 그대로 옮긴다. 요금제 이름은 그 프로모션의 `plan_name`(티어 이름을 박지 않는다) */
export const promotionReasonLine = (
  reason: PromotionUnusableReason | null,
  planName: string,
): string | null => {
  if (reason === null) return null;
  if (reason === 'pro_subscribed') return COPY.reasonProSubscribed(planName);
  if (reason === 'grant_active') return COPY.reasonGrantActive;
  return COPY.reasonUnknown;
};

/**
 * 사용 실패 → 처리(content-review-api.md 5장 · 4.7).
 * - `reload`    S12 를 다시 받는다(목록이 바뀌었다 — 사라짐 · 사유 생김)
 * - `message`   카드 밑 빨간 문구. null 이면 없다
 * - `checkUsed` `PROMOTION_ALREADY_USED` — 응답 유실 뒤 재전송일 수 있다. 다시 받은 S12 에 `grant`가 있으면 성공으로 그린다
 */
export const redeemErrorAction = (
  error: unknown,
  planName: string,
): { reload: boolean; message: string | null; checkUsed: boolean } => {
  if (!isApiError(error)) return { reload: false, message: COPY.errorUnknown, checkUsed: false };
  switch (error.errorCode) {
    case ERROR_CODES.PROMOTION_NOT_FOUND:
      return { reload: true, message: null, checkUsed: false };
    case ERROR_CODES.PROMOTION_ALREADY_USED:
      return { reload: true, message: null, checkUsed: true };
    case ERROR_CODES.PROMOTION_EXPIRED:
      return { reload: true, message: COPY.errorExpired, checkUsed: false };
    case ERROR_CODES.PROMOTION_PRO_SUBSCRIBED:
      return { reload: true, message: COPY.reasonProSubscribed(planName), checkUsed: false };
    case ERROR_CODES.INVITE_GRANT_ALREADY_ACTIVE:
      return { reload: true, message: COPY.reasonGrantActive, checkUsed: false };
    case ERROR_CODES.NETWORK_ERROR:
    case ERROR_CODES.TIMEOUT:
      return { reload: false, message: COPY.errorNetwork, checkUsed: false };
    default:
      return { reload: false, message: COPY.errorUnknown, checkUsed: false };
  }
};

/** 사용 확인 팝업(S13)의 본문 — 끝나는 날짜는 서버의 `redeem_preview.last_date`. 체험 중이면 한 줄 더 */
export const redeemConfirmMessage = (promotion: Promotion): string => {
  const body = COPY.confirmBody(
    promotion.planName,
    promotion.grantDays,
    promotion.redeemPreviewLastDate,
  );
  return promotion.overlapsTrial ? `${body}\n\n${COPY.confirmTrialNote}` : body;
};

/**
 * S12 프로모션 화면(settings-uiux.md 4.8 — KAN-280)의 로직 소유자. 쓸 수 있는지 · 사유 · 날짜는 전부 서버 값이다 — 앱은 표시만 한다.
 *
 * 구성: 이용 중(`grant`) / 사용 가능한 프로모션(카드 + [사용하기]) / 받을 수 있는 프로모션(진행) / 프로모션 코드(즉시 적용).
 * [사용하기] → 확인(S13) → 사용. 성공하면 응답(구독 조회 본문)으로 결제와 같은 배선을 타고(`notifySubscriptionChanged`)
 * 종전 코드 입력 성공 토스트와 같은 문자열을 띄운 뒤 화면을 다시 받는다. **사용은 오프라인 큐에 넣지 않는다.**
 */
export const usePromotionsScreen = () => {
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const showToast = useToastStore((s) => s.show);
  const query = usePromotionsQuery();
  const [redeemError, setRedeemError] = useState<{ promotionId: string; message: string } | null>(
    null,
  );

  const reload = () => queryClient.invalidateQueries({ queryKey: contentReviewKeys.promotions() });

  const succeed = (subscription: MySubscription) => {
    notifySubscriptionChanged(subscription);
    showToast(inviteSuccessMessage(subscription));
    void reload();
  };

  const mutation = useMutation({
    mutationFn: (promotion: Promotion) => redeemPromotion(promotion.id),
    onSuccess: succeed,
    onError: async (error, promotion) => {
      const action = redeemErrorAction(error, promotion.planName);
      if (action.message !== null) {
        setRedeemError({ promotionId: promotion.id, message: action.message });
      }
      if (!action.reload) return;
      if (!action.checkUsed) {
        void reload();
        return;
      }
      // 이미 사용함 — 두 기기 동시 요청의 늦은 쪽이거나, 응답이 유실된 뒤의 재전송이다. 다시 받아 지급이 보이면 성공으로 그린다
      try {
        const overview = await queryClient.fetchQuery<PromotionsOverview>({
          queryKey: contentReviewKeys.promotions(),
          queryFn: fetchPromotions,
          staleTime: 0,
        });
        if (overview.grant !== null) {
          showToast(grantStartedMessage(overview.grant));
          // 지급 응답 본문을 잃었다 — 구독 조회를 다시 받아 세 곳(설정 · 프로필 · 요금제 관리)을 맞춘다
          void queryClient.invalidateQueries({ queryKey: subscriptionKeys.me() });
        }
      } catch {
        // 다시 받지 못해도 화면은 그대로다 — 다음 진입에 맞는다
      }
    },
  });

  const requestRedeem = (promotion: Promotion) => {
    if (!promotion.redeemable || mutation.isPending) return;
    setRedeemError(null);
    Alert.alert(
      COPY.confirmTitle(promotion.name),
      redeemConfirmMessage(promotion),
      [
        { text: COPY.confirmCancel, style: 'cancel' },
        { text: COPY.confirmOk, onPress: () => mutation.mutate(promotion) },
      ],
      { cancelable: true },
    );
  };

  const overview = query.data;
  // 4xx(서버가 이 경로를 아직 모름 등)는 조용히 — 코드 입력만 남는다. 망 · 5xx 만 다시 시도를 보인다
  const isLoadFailed =
    query.isError &&
    overview === undefined &&
    (!isApiError(query.error) ||
      query.error.retryable ||
      query.error.errorCode === ERROR_CODES.NETWORK_ERROR ||
      query.error.errorCode === ERROR_CODES.TIMEOUT);

  return {
    grantLine: formatPlanGrantLine(overview?.grant ?? null),
    promotions: overview?.promotions ?? [],
    rewardProgress: overview?.rewardProgress ?? null,
    isLoading: query.isPending,
    isLoadFailed,
    isRetrying: query.isFetching,
    retry: () => void query.refetch(),
    redeemingId: mutation.isPending ? (mutation.variables?.id ?? null) : null,
    redeemError,
    requestRedeem,
    /** 코드 적용 — 이용 중 섹션 · 사유가 바뀐다 */
    handleCodeApplied: () => void reload(),
    goBack: () => navigation.goBack(),
  };
};
