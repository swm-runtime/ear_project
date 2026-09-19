import { isApiError } from '@/shared/api/api-error';
import { ERROR_CODES } from '@/shared/api/error-codes';
import { logger } from '@/shared/lib/logger';
import { secureStorage } from '@/shared/storage/secure-storage';
import { STORAGE_KEYS } from '@/shared/storage/storage-keys';

import { getPlayerLibraryBridge } from './player-library.bridge';
import { parseQueueOrder, toQueueOrderPayload } from './queue-order';

/**
 * 재생 목록 순서의 서버 저장(library-api.md 4.8).
 *
 * **실패는 조용히 넘긴다** — 재생·목록에 영향이 없고, 끌 때마다 목록을 통째로 보내므로 다음 끌기가
 * 곧 재시도다. 연달아 끌면 **마지막 상태만** 보낸다: 요청이 도는 동안 들어온 것은 하나로 접고,
 * 앞 요청이 끝난 뒤에 보낸다 — 두 PUT 이 뒤바뀌어 도착하면 옛 순서가 이긴다.
 */
let inFlight = false;
let queued: string[] | null = null;

const flush = async (itemIds: string[]): Promise<void> => {
  inFlight = true;
  try {
    await getPlayerLibraryBridge()?.saveQueueOrder(itemIds);
  } catch (error) {
    logger.warn('[player] queue order save failed', error);
  }
  inFlight = false;
  if (queued !== null) {
    const next = queued;
    queued = null;
    void flush(next);
  }
};

export const saveQueueOrder = (itemIds: readonly string[]): void => {
  const payload = toQueueOrderPayload(itemIds);
  if (payload.length === 0) return;
  if (inFlight) {
    queued = payload;
    return;
  }
  void flush(payload);
};

/**
 * 기기 저장 시절의 순서(`player.queue_order`, 2026-09-18)를 서버로 **한 번** 올린다. 서버 규칙이 그때의
 * 로컬 규칙과 같아(새 항목 맨 위 · 저장한 순서는 아래) 그대로 올리면 같은 목록이 된다.
 *
 * 올라간 뒤에 로컬 값을 지운다 — 실패했으면 남겨 두고 다음에 다시 시도한다. 형식 오류(400)만은
 * 지운다: 다시 보내도 같은 답이라 영영 재시도하게 된다.
 */
let isMigrated = false;

export const migrateLocalQueueOrder = async (): Promise<void> => {
  if (isMigrated) return;
  const bridge = getPlayerLibraryBridge();
  if (!bridge) return;
  try {
    const raw = await secureStorage.get(STORAGE_KEYS.PLAYER_QUEUE_ORDER);
    if (raw === null) {
      isMigrated = true;
      return;
    }
    const payload = toQueueOrderPayload(parseQueueOrder(raw));
    try {
      if (payload.length > 0) await bridge.saveQueueOrder(payload);
    } catch (error) {
      const isFormatError = isApiError(error) && error.errorCode === ERROR_CODES.VALIDATION_FAILED;
      if (!isFormatError) throw error;
    }
    await secureStorage.remove(STORAGE_KEYS.PLAYER_QUEUE_ORDER);
    isMigrated = true;
  } catch (error) {
    logger.warn('[player] queue order migration failed', error);
  }
};
