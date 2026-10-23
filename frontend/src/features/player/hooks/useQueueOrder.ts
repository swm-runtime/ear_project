import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { queueKeys } from './useQueueQuery';
import type { QueueItem } from '../player.types';
import { reorderSubset } from '../services/queue-order';
import { saveQueueOrder } from '../services/queue-order-sync.service';

/**
 * 재생 목록의 순서 바꾸기. 순서는 서버가 입혀 준 그대로 그린다(`sort=queue`) — 여기서 다시 정렬하지
 * 않는다. 끌면 화면(쿼리 캐시)을 먼저 옮기고 목록을 통째로 서버에 저장한다(library-api.md 4.8).
 */
export const useQueueOrder = (items: QueueItem[]) => {
  const queryClient = useQueryClient();

  /**
   * 패널이 보여 준 순서(줄 키 = 라이브러리 항목 id)를 캐시 목록에 입히고 저장한다 — 옮겼으면 true, 옮길 게 없었으면 false.
   * **인덱스가 아니라 키로, 렌더 시점 목록이 아니라 지금 캐시로 계산한다**(KAN-254·255) — 연달아 끌면 앞 끌기의 캐시 반영이
   * 아직 렌더되지 않은 채 다음 끌기가 확정된다. 렌더 시점 목록으로 옮기면 앞 끌기가 지워지거나 엉뚱한 줄이 옮겨졌다.
   * 진행 중인 목록 조회는 먼저 취소한다(KAN-254 원인 4) — 삭제 확정 뒤 무효화로 나간 GET 이 PUT 보다 늦게 와 옛 순서로 덮었다
   */
  const reorder = useCallback(
    (shownKeys: readonly string[]): boolean => {
      const current = queryClient.getQueryData<QueueItem[]>(queueKeys.all);
      if (current === undefined) return false;
      const next = reorderSubset(current, (item) => item.itemId, shownKeys);
      if (next === null) return false;
      void queryClient.cancelQueries({ queryKey: queueKeys.all });
      queryClient.setQueryData<QueueItem[]>(queueKeys.all, next);
      saveQueueOrder(next.map((item) => item.itemId));
      return true;
    },
    [queryClient],
  );

  return { orderedItems: items, reorder };
};
