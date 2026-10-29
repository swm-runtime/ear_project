import { useQuery } from '@tanstack/react-query';

import { isApiError } from '@/shared/api/api-error';

import { contentReviewKeys, fetchPromotions } from '../api/content-review.api';
import type { PromotionsOverview } from '../content-review.types';
import { useContentReviewStore } from '../store/content-review.store';

const fetchAndFollow = async (): Promise<PromotionsOverview> => {
  const overview = await fetchPromotions();
  // 같은 값을 싣는다(api 2.1) — 세션 중 스위치가 꺼지면 다음 호출에서 따라간다
  useContentReviewStore.getState().setEnabled(overview.enabled);
  return overview;
};

/**
 * S12 프로모션 화면과 설정 [프로모션] 행의 점 배지가 같은 캐시를 본다(api 4.6). 화면에 들어올 때마다 새로 받는다 —
 * 사용 · 발급 · 소멸은 서버가 정하고, 기기 시각으로 소멸을 판정하지 않는다.
 * 4xx(서버가 아직 이 경로를 모름 등)는 다시 묻지 않는다 — 코드 입력은 이 조회와 무관하게 동작한다.
 */
export const usePromotionsQuery = () =>
  useQuery<PromotionsOverview>({
    queryKey: contentReviewKeys.promotions(),
    queryFn: fetchAndFollow,
    refetchOnMount: 'always',
    retry: (failureCount, error) => failureCount < 1 && (!isApiError(error) || error.retryable),
  });

/** 설정 [프로모션] 행의 점 배지 — 쓰지 않은 프로모션이 있다(`has_unused`). 받지 못했으면 그리지 않는다 */
export const useHasUnusedPromotion = (): boolean => usePromotionsQuery().data?.hasUnused ?? false;
