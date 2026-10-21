import { AppState } from 'react-native';

import { isApiError } from '@/shared/api/api-error';
import { ERROR_CODES } from '@/shared/api/error-codes';
import { logger } from '@/shared/lib/logger';
import { secureStorage } from '@/shared/storage/secure-storage';
import { STORAGE_KEYS } from '@/shared/storage/storage-keys';

import {
  dismissDripFeedback,
  fetchDripFeedbackPrompt,
  muteDripFeedback,
  submitDripFeedback,
} from '../api/drip-feedback.api';
import type { DripFeedbackRating } from '../library.types';
import { useDripFeedbackStore } from '../store/drip-feedback.store';

/**
 * 추천 별점 팝업(drip-feedback.md · drip-feedback-api.md — KAN-224)의 서버 호출과 미전송 보관.
 *
 * **판정은 서버다.** 이 모듈은 `show`를 그대로 따르고, 편성 날짜·이번 주·가입 며칠째를 기기 시각으로 계산하지 않는다.
 *
 * 미전송 보관(오프라인 큐 — common-error-handling.md 4.5): 망이 끊겨 못 보낸 별점·닫기·그만 보기를 계정별로 기기에 남겨 두고
 * 다음 진입·포그라운드 복귀에 다시 보낸다. 세 요청 모두 멱등이라(별점 upsert · 절대값 저장 — api 2장) 겹쳐 가도 무해하다.
 * SQLite 큐(architecture.md 5.4)는 아직 없어 SecureStore 에 작은 JSON 으로 둔다 — 큐가 생기면 그쪽으로 옮긴다.
 */

/* ── 오류 분류 ── */

/** 서버에 닿지 못했다 — 오프라인이면 실패가 아니라 지연이다 */
const isUnreachable = (error: unknown): boolean =>
  isApiError(error) &&
  (error.errorCode === ERROR_CODES.NETWORK_ERROR || error.errorCode === ERROR_CODES.TIMEOUT);

/** 나중에 다시 보내면 될 수 있다 — 망 단절·타임아웃·5xx/429(ApiClient 가 retryable 로 정규화) */
const isWorthRetrying = (error: unknown): boolean =>
  isUnreachable(error) || (isApiError(error) && error.retryable);

/** 접수 기간(7일)이 지났거나 내 편성분이 아니다 — 재시도 대상이 아니라 조용히 버린다(api 6장) */
const isNotRateable = (error: unknown): boolean =>
  isApiError(error) && error.errorCode === ERROR_CODES.DRIP_FEEDBACK_NOT_RATEABLE;

/* ── 미전송 보관 ── */

export type DripFeedbackOutboxEntry =
  | { type: 'ratings'; ratings: DripFeedbackRating[] }
  | { type: 'dismiss'; placedDate: string }
  | { type: 'mute' };

/** 보관 상한 — 팝업은 세션당 한 번이라 보통 1건이다. 넘치면 오래된 것부터 버린다(SecureStore 값 크기도 작게 유지) */
export const DRIP_FEEDBACK_OUTBOX_LIMIT = 10;

const outboxKey = (userId: string): string =>
  `${STORAGE_KEYS.LIBRARY_DRIP_FEEDBACK_OUTBOX}.${userId}`;

const isOutboxEntry = (value: unknown): value is DripFeedbackOutboxEntry => {
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as { type?: unknown; ratings?: unknown; placedDate?: unknown };
  if (entry.type === 'mute') return true;
  if (entry.type === 'dismiss') return typeof entry.placedDate === 'string';
  if (entry.type === 'ratings') return Array.isArray(entry.ratings) && entry.ratings.length > 0;
  return false;
};

const readOutbox = async (userId: string): Promise<DripFeedbackOutboxEntry[]> => {
  try {
    const raw = await secureStorage.get(outboxKey(userId));
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isOutboxEntry) : [];
  } catch (error) {
    // 읽지 못하면 빈 것으로 본다 — 별점 하나를 잃는 것이 화면을 막는 것보다 낫다(architecture.md 7.2 비필수 저장)
    logger.warn('[library] drip feedback outbox read failed', error);
    return [];
  }
};

const writeOutbox = async (userId: string, entries: DripFeedbackOutboxEntry[]): Promise<void> => {
  try {
    if (entries.length === 0) {
      await secureStorage.remove(outboxKey(userId));
      return;
    }
    await secureStorage.set(
      outboxKey(userId),
      JSON.stringify(entries.slice(-DRIP_FEEDBACK_OUTBOX_LIMIT)),
    );
  } catch (error) {
    logger.warn('[library] drip feedback outbox write failed', error);
  }
};

/** 보관함을 읽고 쓰는 일은 한 줄로 세운다 — 적재와 재전송이 겹쳐 서로의 결과를 덮어쓰지 않게 */
let outboxChain: Promise<unknown> = Promise.resolve();
const serialize = <T>(task: () => Promise<T>): Promise<T> => {
  const next = outboxChain.then(task, task);
  outboxChain = next.catch(() => undefined);
  return next;
};

const enqueue = (userId: string, entry: DripFeedbackOutboxEntry): Promise<void> =>
  serialize(async () => {
    const entries = await readOutbox(userId);
    await writeOutbox(userId, [...entries, entry]);
  });

const sendEntry = async (entry: DripFeedbackOutboxEntry): Promise<void> => {
  if (entry.type === 'ratings') return submitDripFeedback({ ratings: entry.ratings });
  if (entry.type === 'dismiss') return dismissDripFeedback({ placedDate: entry.placedDate });
  await muteDripFeedback();
};

/**
 * 보관한 요청을 순서대로 다시 보낸다. 보낸 것·버릴 것(`DRIP_FEEDBACK_NOT_RATEABLE`·형식 오류 등 다시 보내도 같은 답)은 지우고,
 * 아직 닿지 않으면(망·5xx) 거기서 멈춰 남은 것을 그대로 둔다. **실패를 알리지 않는다**(사용자가 시작하지 않은 실패 — 4.3).
 */
export const flushDripFeedbackOutbox = (userId: string): Promise<void> =>
  serialize(async () => {
    const entries = await readOutbox(userId);
    if (entries.length === 0) return;
    let sentCount = 0;
    for (const entry of entries) {
      try {
        await sendEntry(entry);
      } catch (error) {
        if (isWorthRetrying(error)) break;
        logger.warn('[library] drip feedback outbox entry dropped', error);
      }
      sentCount += 1;
    }
    await writeOutbox(userId, entries.slice(sentCount));
  });

/* ── 팝업 ── */

/** 이 세션에 이미 물은 계정 — 같은 세션 재진입은 다시 조회하지 않는다(티켓 KAN-224 "한 세션에 한 번") */
let promptedUserId: string | null = null;

/**
 * 라이브러리 진입 시 노출 판정을 받는다(drip-feedback.md 2장). **한 세션에 한 번** — 다시 들어와도 묻지 않는다.
 * `show=true`이고 편이 있을 때만 팝업 차례로 둔다. 실패는 조용히 넘긴다(팝업 없음, 에러 화면 없음).
 */
export const requestDripFeedbackPrompt = async (userId: string): Promise<void> => {
  if (promptedUserId === userId) return;
  promptedUserId = userId;
  const store = useDripFeedbackStore.getState();
  store.startLoading();
  // 못 보낸 별점부터 보낸다 — 서버에 닿아야 같은 편성분을 다시 묻지 않는다
  await flushDripFeedbackOutbox(userId);
  try {
    const prompt = await fetchDripFeedbackPrompt();
    // 받는 사이 계정이 바뀌었으면(로그아웃) 앞 계정의 팝업을 띄우지 않는다
    if (promptedUserId !== userId) return;
    if (prompt.show && prompt.items.length > 0) {
      useDripFeedbackStore.getState().hold(prompt);
    } else {
      useDripFeedbackStore.getState().finish();
    }
  } catch (error) {
    logger.warn('[library] drip feedback prompt failed', error);
    if (promptedUserId === userId) useDripFeedbackStore.getState().finish();
  }
};

/** 로그아웃·탈퇴·세션 만료 — 다음 계정은 새로 묻는다. 보관함은 계정별이라 지우지 않는다 */
export const resetDripFeedbackSession = (): void => {
  promptedUserId = null;
  useDripFeedbackStore.getState().reset();
};

/**
 * [보내기]의 결과.
 * - `sent`      저장됐다 — 팝업을 닫는다(토스트 없음)
 * - `queued`    서버에 닿지 못해 보관했다 — 팝업을 닫고 다음 기회에 다시 보낸다
 * - `discarded` `DRIP_FEEDBACK_NOT_RATEABLE` — 접수 기간이 지났다. 조용히 닫는다
 * - `failed`    그 밖의 실패 — 팝업 안에 인라인 에러와 재시도(drip-feedback.md 5장)
 */
export type DripFeedbackSendOutcome = 'sent' | 'queued' | 'discarded' | 'failed';

export const sendDripFeedbackRatings = async (
  userId: string,
  ratings: readonly DripFeedbackRating[],
): Promise<DripFeedbackSendOutcome> => {
  try {
    await submitDripFeedback({ ratings });
    return 'sent';
  } catch (error) {
    if (isNotRateable(error)) return 'discarded';
    if (isUnreachable(error)) {
      await enqueue(userId, { type: 'ratings', ratings: [...ratings] });
      return 'queued';
    }
    logger.warn('[library] drip feedback submit failed', error);
    return 'failed';
  }
};

/** 실패하면 다시 보낼 만한 것만 보관한다 — 닫기·그만 보기는 사용자가 기다리지 않는 알림이라 화면에 알리지 않는다 */
const notifyOrEnqueue = async (
  userId: string,
  entry: DripFeedbackOutboxEntry,
  label: string,
): Promise<void> => {
  try {
    await sendEntry(entry);
  } catch (error) {
    if (isWorthRetrying(error)) {
      await enqueue(userId, entry);
      return;
    }
    logger.warn(`[library] drip feedback ${label} failed`, error);
  }
};

/** 닫기(X·바깥 탭·뒤로가기) — 응답에 받은 `placed_date` 그대로(api 4.3) */
export const notifyDripFeedbackDismissed = (userId: string, placedDate: string): Promise<void> =>
  notifyOrEnqueue(userId, { type: 'dismiss', placedDate }, 'dismiss');

/** [이번 주 그만 보기] — 팝업은 이미 닫혔다. 실패해도 이 세션은 닫아 두고 다음 기회에 다시 보낸다(5장) */
export const notifyDripFeedbackMuted = (userId: string): Promise<void> =>
  notifyOrEnqueue(userId, { type: 'mute' }, 'mute');

/**
 * 포그라운드 복귀마다 보관함을 다시 보낸다(architecture.md 5.5 "온라인 복귀 시 오프라인 큐 재전송" — 망 상태 구독이 없어
 * 복귀를 신호로 삼는다). 로그인한 계정 id 는 app 이 주입한다. 한 번만 건다.
 */
let isOutboxSyncStarted = false;

export const startDripFeedbackOutboxSync = (getUserId: () => string | null): void => {
  if (isOutboxSyncStarted) return;
  isOutboxSyncStarted = true;
  AppState.addEventListener('change', (state) => {
    if (state !== 'active') return;
    const userId = getUserId();
    if (userId !== null) void flushDripFeedbackOutbox(userId);
  });
};

/** 테스트 전용 — 모듈 상태를 처음으로 되돌린다 */
export const resetDripFeedbackServiceForTest = (): void => {
  promptedUserId = null;
  outboxChain = Promise.resolve();
};
