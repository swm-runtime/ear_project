import { useQuery } from '@tanstack/react-query';

import { exploreKeys, fetchExploreFeed } from '../api/explore.api';

/** 섹션형 피드(explore-api.md 4.1) — 주제 필터가 없을 때만 쓴다 */
export const useExploreFeedQuery = (enabled: boolean) =>
  useQuery({
    queryKey: exploreKeys.feed(),
    queryFn: fetchExploreFeed,
    enabled,
    // 칩을 풀어 피드로 돌아올 때 다시 받지 않는다 — 꺼졌다 켜지면 바로 다시 받아, 응답이 오면 섹션이 한 번 더 바뀌며
    // 전환이 끊겼다(PM 2026-10-09). 당겨서 새로고침은 그대로 받는다
    staleTime: FEED_STALE_MS,
  });

/** 피드 캐시를 새것으로 보는 시간 */
const FEED_STALE_MS = 5 * 60 * 1000;
