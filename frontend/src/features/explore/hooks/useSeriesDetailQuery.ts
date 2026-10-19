import { useQuery } from '@tanstack/react-query';

import { exploreKeys, fetchSeriesDetail } from '../api/explore.api';

/**
 * 시리즈 화면(explore-api.md 4.7) — 진입할 때마다 받는다(편의 담음·완청·재생 위치가 화면의 존재 이유다).
 * 키가 explore 아래라 탐색의 재생·담기 뒤 `exploreKeys.all` 무효화가 이 화면도 최신화한다
 */
export const useSeriesDetailQuery = (seriesId: string) =>
  useQuery({
    queryKey: exploreKeys.series(seriesId),
    queryFn: () => fetchSeriesDetail({ seriesId }),
  });
