import { useQuery } from '@tanstack/react-query';

import { exploreKeys, fetchExploreFeed } from '../api/explore.api';

/** 섹션형 피드(explore-api.md 4.1) — 주제 필터가 없을 때만 쓴다 */
export const useExploreFeedQuery = (enabled: boolean) =>
  useQuery({
    queryKey: exploreKeys.feed(),
    queryFn: fetchExploreFeed,
    enabled,
  });
