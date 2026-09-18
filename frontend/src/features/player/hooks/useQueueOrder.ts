import { useCallback, useEffect, useMemo, useState } from 'react';

import { logger } from '@/shared/lib/logger';
import { secureStorage } from '@/shared/storage/secure-storage';
import { STORAGE_KEYS } from '@/shared/storage/storage-keys';

import type { QueueItem } from '../player.types';
import {
  applyQueueOrder,
  moveInArray,
  parseQueueOrder,
  serializeQueueOrder,
} from '../services/queue-order';

/**
 * 재생 목록의 사용자 지정 순서 — 기기에 저장해 두고 받아 온 목록 위에 입힌다(services/queue-order.ts).
 * 저장 실패는 조용히 넘긴다 — 순서가 이번 실행에만 유지될 뿐 재생에는 영향이 없다.
 */
export const useQueueOrder = (items: QueueItem[]) => {
  const [savedIds, setSavedIds] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    secureStorage
      .get(STORAGE_KEYS.PLAYER_QUEUE_ORDER)
      .then((raw) => {
        if (!cancelled) setSavedIds(parseQueueOrder(raw));
      })
      .catch((error: unknown) => logger.warn('queue order load failed', error));
    return () => {
      cancelled = true;
    };
  }, []);

  const orderedItems = useMemo(() => applyQueueOrder(items, savedIds), [items, savedIds]);

  /** 보이는 목록에서 `from` 줄을 `to` 줄로 옮긴다 — 지금 보이는 전체 순서를 그대로 저장한다 */
  const move = useCallback(
    (from: number, to: number) => {
      const nextIds = moveInArray(
        orderedItems.map((item) => item.itemId),
        from,
        to,
      );
      setSavedIds(nextIds);
      secureStorage
        .set(STORAGE_KEYS.PLAYER_QUEUE_ORDER, serializeQueueOrder(nextIds))
        .catch((error: unknown) => logger.warn('queue order save failed', error));
    },
    [orderedItems],
  );

  return { orderedItems, move };
};
