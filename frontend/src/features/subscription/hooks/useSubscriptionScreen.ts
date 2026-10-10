import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { getDevicePlatform } from '@/shared/lib/device-platform';
import { IS_SUBSCRIPTION_UI_ENABLED } from '@/shared/lib/feature-flags';

import { fetchMySubscription, subscriptionKeys } from '../api/subscription.api';
import { openStoreSubscriptionManagement } from '../services/subscription-sync';
import type { MySubscription, SubscriptionStore } from '../subscription.types';
import { toSubscriptionStatusVM } from './subscription-status';
import { usePlanCatalog } from './usePlanCatalog';
import { usePurchaseFlow } from './usePurchaseFlow';

const STORE_OF_PLATFORM: Record<'ios' | 'android', SubscriptionStore> = {
  ios: 'app_store',
  android: 'play_store',
};

/**
 * 요금제 관리 화면(SB 계열 — subscription-uiux.md)의 로직 소유자. 화면은 뷰만 담당한다.
 * 상태는 서버의 GET /users/me/subscription 이 정하고(만료·해지 판정 없음), 버튼은 요금제 목록의 action 이 정한다.
 */
export const useSubscriptionScreen = () => {
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const meQuery = useQuery<MySubscription>({
    queryKey: subscriptionKeys.me(),
    queryFn: fetchMySubscription,
    enabled: IS_SUBSCRIPTION_UI_ENABLED,
  });
  const catalog = usePlanCatalog();
  const flow = usePurchaseFlow({ entryPoint: 'settings', catalog });

  // 하위 화면(이메일 인증)·스토어 구독 관리에서 돌아오면 조용히 다시 받는다 — 해지·결제 수단 변경을 흡수한다
  useFocusEffect(
    useCallback(() => {
      if (queryClient.getQueryData(subscriptionKeys.me()) === undefined) return;
      void queryClient.invalidateQueries({ queryKey: subscriptionKeys.me() });
      void queryClient.invalidateQueries({ queryKey: subscriptionKeys.plans(getDevicePlatform()) });
    }, [queryClient]),
  );

  const subscription = meQuery.data ?? null;
  const status =
    subscription === null
      ? null
      : toSubscriptionStatusVM(subscription, STORE_OF_PLATFORM[getDevicePlatform()]);

  /** 현재 구독 상품 ID — Play 구독 관리 딥링크가 상품을 가리킬 때 쓴다 */
  const currentProductId =
    catalog.state.kind === 'ready'
      ? (catalog.state.cards.find((card) => card.plan.action === 'current')?.plan.storeProductId ??
        null)
      : null;

  return {
    isStatusError: meQuery.isError,
    status,
    catalog,
    flow,
    /** [구독 해지]·[구독 다시 시작]·[결제 수단 확인] — 해지 API 는 없다. 스토어로 보낸다(subscription.md 4.5) */
    openStoreManagement: () =>
      openStoreSubscriptionManagement(subscription?.store ?? null, currentProductId),
    goBack: () => {
      // 결제 진행 중에는 화면 이탈을 막는다(subscription.md 5장 "결제 진행 중 — 화면 이탈 차단")
      if (flow.isBusy) return;
      navigation.goBack();
    },
  };
};
