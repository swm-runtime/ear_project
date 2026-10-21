import { useQuery } from '@tanstack/react-query';

import type { QueueEntry } from '../player.types';
import { getPlayerLibraryBridge } from '../services/player-library.bridge';

export const upNextKeys = {
  all: ['player', 'upNext'] as const,
  of: (contentId: string, excludeIds: string[]) =>
    [...upNextKeys.all, contentId, [...excludeIds].sort().join(',')] as const,
};

/**
 * "다음에 들어볼 만한"(player.md 4.2-2, KAN-241) — 탐색 맥락의 재생 목록 아래 추천 블록. 소스는 브리지가 정한다
 * (related → interest 폴백). **열었을 때만**, 지금 듣는 편이 바뀌면 다시 받는다. 같은 편이면 패널을 닫았다 열어도
 * 다시 받지 않는다(staleTime). 실패는 빈 배열이다 — 추천은 없어도 되는 블록이라 패널에 오류를 그리지 않는다
 */
export const useUpNextQuery = (contentId: string | null, excludeIds: string[], enabled: boolean) =>
  useQuery<QueueEntry[]>({
    queryKey: upNextKeys.of(contentId ?? '', excludeIds),
    queryFn: async () => {
      if (contentId === null) return [];
      try {
        return (await getPlayerLibraryBridge()?.fetchUpNext(contentId, excludeIds)) ?? [];
      } catch {
        return [];
      }
    },
    enabled: enabled && contentId !== null,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
