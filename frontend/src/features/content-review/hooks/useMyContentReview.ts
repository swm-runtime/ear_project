import { useQuery } from '@tanstack/react-query';

import { contentReviewKeys } from '../api/content-review.api';
import type { ContentReviewState } from '../content-review.types';
import { loadContentReviewState } from '../services/content-review.service';
import { selectIsContentReviewEnabled, useContentReviewStore } from '../store/content-review.store';

/**
 * 콘텐츠 상세 "내 후기" 줄의 값 — 후기 시트 열기(api 4.1)와 **같은 조회 · 같은 캐시**다. 후기 기능이 켜져 있을 때만 받는다.
 * 저장하면 시트가 응답으로 이 캐시를 바로 맞춘다(useContentReviewLauncher).
 */
export const useMyContentReview = (contentId: string | null) => {
  const isEnabled = useContentReviewStore(selectIsContentReviewEnabled);
  return useQuery<ContentReviewState>({
    queryKey: contentReviewKeys.review(contentId ?? ''),
    queryFn: () => loadContentReviewState(contentId ?? ''),
    enabled: isEnabled && contentId !== null,
  });
};
