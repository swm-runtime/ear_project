import { useQuery } from '@tanstack/react-query';

import { getMockQueue } from '../api/player.mock';
import { IS_PLAYER_API_MOCKED } from '../player.constants';
import type { QueueItem } from '../player.types';

/**
 * 다음 재생 목록 조회(2026-09-16 목업). **무엇이 "다음"인지 아직 정하지 않았다** — 편성 순서인지
 * 라이브러리 미청취 순서인지에 따라 계약이 갈린다. mock이 아닐 때는 null → 손잡이를 그리지 않는다.
 */
export const useQueueQuery = (contentId: string | null) =>
  useQuery({
    queryKey: ['player', 'queue', contentId] as const,
    queryFn: (): Promise<QueueItem[] | null> =>
      IS_PLAYER_API_MOCKED && contentId ? getMockQueue(contentId) : Promise.resolve(null),
    enabled: contentId !== null,
    staleTime: Infinity,
  });
