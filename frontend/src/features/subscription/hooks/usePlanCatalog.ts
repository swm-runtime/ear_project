import { useQuery } from '@tanstack/react-query';

import { getDevicePlatform } from '@/shared/lib/device-platform';
import { IS_SUBSCRIPTION_UI_ENABLED } from '@/shared/lib/feature-flags';

import { fetchPlans, subscriptionKeys } from '../api/subscription.api';
import { purchaseService } from '../services/subscription-sync';
import { SUBSCRIPTION_COPY } from '../subscription.copy';
import type { Plan, PlanCatalog } from '../subscription.types';
import { mergePlanPrices, type PlanCardVM } from './plan-catalog';

export type PlanCatalogState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready'; cards: PlanCardVM[]; isEmailVerified: boolean };

/**
 * 요금제 목록 + 스토어 현지 가격(subscription.md 4.2-1). 서버 목록을 받고, 상품 ID 로 스토어에서 가격을 받아
 * 합친다. **스토어 조회가 실패하면 price_krw 로 메우지 않고 "요금제를 불러올 수 없어요"다**(subscription-api.md 4.1).
 */
export const usePlanCatalog = () => {
  const platform = getDevicePlatform();
  const plansQuery = useQuery<PlanCatalog>({
    queryKey: subscriptionKeys.plans(platform),
    queryFn: () => fetchPlans(platform),
    enabled: IS_SUBSCRIPTION_UI_ENABLED,
  });

  const productIds = (plansQuery.data?.plans ?? [])
    .map((plan) => plan.storeProductId)
    .filter((id): id is string => id !== null)
    .sort();

  const productsQuery = useQuery({
    queryKey: subscriptionKeys.storeProducts(productIds),
    queryFn: () => purchaseService.fetchStoreProducts(productIds),
    enabled: IS_SUBSCRIPTION_UI_ENABLED && plansQuery.data !== undefined,
    // 현지 가격은 세션 중에 바뀌지 않는다 — 시트를 열 때마다 스토어를 다시 부르지 않는다
    staleTime: Infinity,
  });

  const state: PlanCatalogState = (() => {
    if (plansQuery.isError || productsQuery.isError) return { kind: 'error' };
    if (plansQuery.data === undefined || productsQuery.data === undefined)
      return { kind: 'loading' };
    const cards = mergePlanPrices(
      plansQuery.data.plans,
      productsQuery.data,
      SUBSCRIPTION_COPY.plans.freePrice,
    );
    if (cards === null) return { kind: 'error' };
    return { kind: 'ready', cards, isEmailVerified: plansQuery.data.isEmailVerified };
  })();

  const findPlan = (planId: string): Plan | null =>
    plansQuery.data?.plans.find((plan) => plan.planId === planId) ?? null;

  return {
    state,
    findPlan,
    isRetrying: plansQuery.isFetching || productsQuery.isFetching,
    retry: () => {
      if (plansQuery.isError) void plansQuery.refetch();
      if (productsQuery.isError) void productsQuery.refetch();
    },
    /** SUBSCRIPTION_PLAN_UNAVAILABLE — 요금제 목록을 다시 받는다(subscription-api.md 5장) */
    refetchPlans: () => void plansQuery.refetch(),
  };
};
