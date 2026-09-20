import { useQuery } from '@tanstack/react-query';

import type { QueueItem } from '../player.types';
import { getPlayerLibraryBridge } from '../services/player-library.bridge';
import { migrateLocalQueueOrder } from '../services/queue-order-sync.service';

/** player가 소유하는 키 — library의 키를 쓰면 필터·커서가 걸린 목록 캐시와 섞인다 */
export const queueKeys = {
  all: ['player', 'queue'] as const,
};

/**
 * 재생 목록 패널의 목록 = 필터를 걸지 않은 라이브러리 첫 페이지(브리지 주입 — architecture.md 4.3).
 * 순서는 서버가 입힌다(`sort=queue` — 새로 담긴 것이 맨 위, 그 아래 사용자가 정한 순서).
 * **패널을 열었을 때만 조회한다**(`enabled`) — 플레이어는 목록 없이도 제 몫을 하는 화면이라, 진입마다
 * 한 번씩 더 부르면 안 쓰는 사용자에게 값을 물린다. 열 때마다 새로 받는다(staleTime 0) — 라이브러리에서
 * 삭제·담기가 일어난 뒤 낡은 목록을 보이지 않게.
 *
 * 브리지가 아직 주입되지 않았으면(부트스트랩 전) 빈 목록으로 둔다 — 던지면 패널이 에러로 뜨는데,
 * 원인은 서버가 아니라 기동 순서다.
 */
export const fetchQueueItems = async (): Promise<QueueItem[]> => {
  // 기기 저장 시절의 순서가 남아 있으면 조회 **전에** 올린다 — 그래야 첫 조회부터 그 순서로 온다
  await migrateLocalQueueOrder();
  return (await getPlayerLibraryBridge()?.fetchQueue()) ?? [];
};

export const useQueueQuery = (enabled: boolean) =>
  useQuery<QueueItem[]>({
    queryKey: queueKeys.all,
    queryFn: fetchQueueItems,
    enabled,
    staleTime: 0,
  });
