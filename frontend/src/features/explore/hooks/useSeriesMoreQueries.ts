import { useQuery, useQueryClient } from '@tanstack/react-query';

import {
  exploreKeys,
  fetchExploreContents,
  fetchExploreFeed,
  fetchRelatedContents,
} from '../api/explore.api';
import { SERIES_MORE_LIMIT, pickOtherSeries, withoutSeriesEpisodes } from '../explore.series-more';
import type { ExploreEntry } from '../explore.types';

const seriesMoreKey = (seriesId: string, kind: 'other-series' | 'related') =>
  [...exploreKeys.all, 'series-more', seriesId, kind] as const;

/**
 * 시리즈 화면 아래 "다른 시리즈 더보기"(PM 2026-10-22 — 애플 뮤직 "○○의 다른 앨범" 자리). 새 API 없이 탐색 목록을 다시 쓴다 —
 * 같은 주제 목록(explore-api.md 4.2) 첫 페이지 → 탐색 피드 섹션(4.1, 캐시가 있으면 그대로)의 시리즈 카드 순. 하나가
 * 실패해도 나머지로 그린다 — 보조 목록이라 오류를 알리지 않고 비면 줄째 숨는다
 */
export const useOtherSeriesQuery = (seriesId: string, topicId: string | null, enabled: boolean) => {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: [...seriesMoreKey(seriesId, 'other-series'), topicId] as const,
    enabled,
    queryFn: async () => {
      const [byTopic, feed] = await Promise.allSettled([
        topicId ? fetchExploreContents({ topicIds: [topicId] }) : Promise.resolve(null),
        queryClient.ensureQueryData({ queryKey: exploreKeys.feed(), queryFn: fetchExploreFeed }),
      ]);
      const lists: ExploreEntry[][] = [];
      if (byTopic.status === 'fulfilled' && byTopic.value) lists.push(byTopic.value.items);
      if (feed.status === 'fulfilled') feed.value.sections.forEach((s) => lists.push(s.items));
      return pickOtherSeries(seriesId, lists);
    },
  });
};

/**
 * 시리즈 화면 아래 "좋아할 만한 다른 항목"(PM 2026-10-22). 관련 콘텐츠(player-api.md 4.8 — KAN-240)를 가장 앞 편 기준으로
 * 받고 이 시리즈 편은 뺀다. 실패(404 포함)는 빈 목록 — 줄째 숨는다
 */
export const useSeriesRelatedQuery = (
  seriesId: string,
  anchorContentId: string | null,
  episodeContentIds: string[],
) =>
  useQuery({
    queryKey: [...seriesMoreKey(seriesId, 'related'), anchorContentId] as const,
    enabled: anchorContentId !== null,
    queryFn: async () => {
      if (!anchorContentId) return [];
      try {
        const items = await fetchRelatedContents({
          contentId: anchorContentId,
          excludeIds: episodeContentIds,
          limit: SERIES_MORE_LIMIT,
        });
        return withoutSeriesEpisodes(seriesId, items);
      } catch {
        return [];
      }
    },
  });
