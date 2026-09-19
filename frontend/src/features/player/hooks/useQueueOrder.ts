import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { queueKeys } from './useQueueQuery';
import type { QueueItem } from '../player.types';
import { moveInArray } from '../services/queue-order';
import { saveQueueOrder } from '../services/queue-order-sync.service';

/**
 * 재생 목록의 순서 바꾸기. 순서는 서버가 입혀 준 그대로 그린다(`sort=queue`) — 여기서 다시 정렬하지
 * 않는다. 끌면 화면(쿼리 캐시)을 먼저 옮기고 목록을 통째로 서버에 저장한다(library-api.md 4.8).
 */
export const useQueueOrder = (items: QueueItem[]) => {
  const queryClient = useQueryClient();

  /** 보이는 목록에서 `from` 줄을 `to` 줄로 옮긴다 — 지금 보이는 전체 순서를 그대로 저장한다 */
  const move = useCallback(
    (from: number, to: number) => {
      const next = moveInArray(items, from, to);
      queryClient.setQueryData<QueueItem[]>(queueKeys.all, next);
      saveQueueOrder(next.map((item) => item.itemId));
    },
    [items, queryClient],
  );

  return { orderedItems: items, move };
};
