import { AppState } from 'react-native';

import { isApiError } from '@/shared/api/api-error';
import { ERROR_CODES } from '@/shared/api/error-codes';
import { logger } from '@/shared/lib/logger';
import { secureStorage } from '@/shared/storage/secure-storage';
import { STORAGE_KEYS } from '@/shared/storage/storage-keys';

import {
  dismissContentReviewPrompt,
  fetchContentReview,
  fetchContentReviewPrompt,
  muteContentReviewPrompt,
  saveContentReview,
} from '../api/content-review.api';
import type { ContentReviewState, SavedContentReview } from '../content-review.types';
import { useContentReviewStore } from '../store/content-review.store';

/**
 * 콘텐츠 후기(content-review.md · content-review-api.md — KAN-280)의 서버 호출과 미전송 보관.
 *
 * **판정은 서버다.** 이 모듈은 `enabled` · `show` · `reviewable`을 그대로 따르고, 기기 시각으로 아무것도 계산하지 않는다.
 *
 * 미전송 보관(오프라인 큐 — common-error-handling.md 4.5 · 추천 별점과 같은 규칙): 망이 끊겨 못 보낸 후기 · 먼저 묻는 시트의
 * 닫기 · 그만 보기를 계정별로 기기에 남겨 두고 다음 진입 · 포그라운드 복귀에 다시 보낸다. 셋 다 멱등이라(후기 upsert · 절대값
 * 저장 — api 2장) 겹쳐 가도 무해하다. SQLite 큐(architecture.md 5.4)가 아직 없어 SecureStore 에 작은 JSON 으로 둔다.
 * **프로모션 사용은 보관하지 않는다**(api 6장 — 지급 시작일이 보낸 날로 정해진다).
 */

/* ── 오류 분류 ── */

/** 서버에 닿지 못했다 — 오프라인이면 실패가 아니라 지연이다 */
const isUnreachable = (error: unknown): boolean =>
  isApiError(error) &&
  (error.errorCode === ERROR_CODES.NETWORK_ERROR || error.errorCode === ERROR_CODES.TIMEOUT);

/** 나중에 다시 보내면 될 수 있다 — 망 단절 · 타임아웃 · 5xx/429(ApiClient 가 retryable 로 정규화) */
const isWorthRetrying = (error: unknown): boolean =>
  isUnreachable(error) || (isApiError(error) && error.retryable);

/** 다시 보내도 같은 답 — 조용히 버린다(api 6장). 꺼짐이면 [후기]도 숨긴다 */
const DISCARD_CODES: readonly string[] = [
  ERROR_CODES.CONTENT_REVIEW_DISABLED,
  ERROR_CODES.CONTENT_REVIEW_NOT_PLAYED,
  ERROR_CODES.CONTENT_WITHDRAWN,
  ERROR_CODES.CONTENT_NOT_FOUND,
];

const discardCodeOf = (error: unknown): string | null =>
  isApiError(error) && DISCARD_CODES.includes(error.errorCode) ? error.errorCode : null;

const followDisabled = (error: unknown): void => {
  if (isApiError(error) && error.errorCode === ERROR_CODES.CONTENT_REVIEW_DISABLED) {
    useContentReviewStore.getState().setEnabled(false);
  }
};

/* ── 미전송 보관 ── */

export type ContentReviewOutboxEntry =
  | { type: 'review'; contentId: string; stars: number; text: string }
  | { type: 'dismiss' }
  | { type: 'mute' };

/** 보관 상한 — 넘치면 오래된 것부터 버린다(SecureStore 값 크기도 작게 유지) */
export const CONTENT_REVIEW_OUTBOX_LIMIT = 10;

const outboxKey = (userId: string): string => `${STORAGE_KEYS.CONTENT_REVIEW_OUTBOX}.${userId}`;

const isOutboxEntry = (value: unknown): value is ContentReviewOutboxEntry => {
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as { type?: unknown; contentId?: unknown; stars?: unknown; text?: unknown };
  if (entry.type === 'dismiss' || entry.type === 'mute') return true;
  return (
    entry.type === 'review' &&
    typeof entry.contentId === 'string' &&
    typeof entry.stars === 'number' &&
    typeof entry.text === 'string'
  );
};

const readOutbox = async (userId: string): Promise<ContentReviewOutboxEntry[]> => {
  try {
    const raw = await secureStorage.get(outboxKey(userId));
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isOutboxEntry) : [];
  } catch (error) {
    // 읽지 못하면 빈 것으로 본다 — 후기 하나를 잃는 것이 화면을 막는 것보다 낫다(architecture.md 7.2 비필수 저장)
    logger.warn('[content-review] outbox read failed', error);
    return [];
  }
};

const writeOutbox = async (userId: string, entries: ContentReviewOutboxEntry[]): Promise<void> => {
  try {
    if (entries.length === 0) {
      await secureStorage.remove(outboxKey(userId));
      return;
    }
    await secureStorage.set(
      outboxKey(userId),
      JSON.stringify(entries.slice(-CONTENT_REVIEW_OUTBOX_LIMIT)),
    );
  } catch (error) {
    logger.warn('[content-review] outbox write failed', error);
  }
};

/** 보관함을 읽고 쓰는 일은 한 줄로 세운다 — 적재와 재전송이 겹쳐 서로의 결과를 덮어쓰지 않게 */
let outboxChain: Promise<unknown> = Promise.resolve();
const serialize = <T>(task: () => Promise<T>): Promise<T> => {
  const next = outboxChain.then(task, task);
  outboxChain = next.catch(() => undefined);
  return next;
};

/** 같은 편의 후기는 마지막 값만 남긴다 — 서버도 마지막 값이 이긴다(4.2 덮어쓰기) */
const enqueue = (userId: string, entry: ContentReviewOutboxEntry): Promise<void> =>
  serialize(async () => {
    const entries = await readOutbox(userId);
    const kept =
      entry.type === 'review'
        ? entries.filter((item) => item.type !== 'review' || item.contentId !== entry.contentId)
        : entries;
    await writeOutbox(userId, [...kept, entry]);
  });

const sendEntry = async (entry: ContentReviewOutboxEntry): Promise<void> => {
  if (entry.type === 'review') {
    await saveContentReview({ contentId: entry.contentId, stars: entry.stars, text: entry.text });
    return;
  }
  if (entry.type === 'dismiss') return dismissContentReviewPrompt();
  await muteContentReviewPrompt();
};

/**
 * 보관한 요청을 순서대로 다시 보낸다. 보낸 것 · 버릴 것(다시 보내도 같은 답)은 지우고, 아직 닿지 않으면(망 · 5xx) 거기서 멈춰
 * 남은 것을 그대로 둔다. **실패를 알리지 않는다**(사용자가 시작하지 않은 실패). 재전송으로 발급된 프로모션은 안내하지 않는다 —
 * S12 와 설정 배지에 있다(api 4.2 "응답이 유실된 뒤의 재전송은 null")
 */
export const flushContentReviewOutbox = (userId: string): Promise<void> =>
  serialize(async () => {
    const entries = await readOutbox(userId);
    if (entries.length === 0) return;
    let sentCount = 0;
    for (const entry of entries) {
      try {
        await sendEntry(entry);
      } catch (error) {
        if (isWorthRetrying(error)) break;
        followDisabled(error);
        logger.warn('[content-review] outbox entry dropped', error);
      }
      sentCount += 1;
    }
    await writeOutbox(userId, entries.slice(sentCount));
  });

/* ── 켜짐 여부 · 먼저 묻기 판정 ── */

/** 이 세션에 이미 판정을 받은(받는 중인) 계정 — 앱 실행 × 계정 단위로 한 번(추천 별점과 같은 규칙) */
let promptedUserId: string | null = null;

/**
 * 먼저 묻기 판정(4.3)을 이 세션에 한 번 받는다 — 같은 응답이 켜짐 여부(`enabled`)의 노출 위치다(api 2.1).
 * 라이브러리 진입이 기본 호출 지점이고, 라이브러리를 거치지 않고 다른 탭에서 시작한 세션도 [후기]를 그리려고 진입점 화면이 같은
 * 함수를 부른다(두 번째부터는 아무것도 하지 않는다). 띄울지는 라이브러리 진입 · 추천 별점 · 앞선 팝업을 보고 화면이 정한다.
 * 실패는 조용히 넘긴다 — 켜짐 false · 시트 없음 · 에러 화면 없음(다음 실행에 다시).
 */
export const requestContentReviewPrompt = async (userId: string): Promise<void> => {
  if (promptedUserId === userId) return;
  promptedUserId = userId;
  useContentReviewStore.getState().startPromptLoading();
  // 못 보낸 후기 · 닫기부터 보낸다 — 서버에 닿아야 같은 편을 다시 묻지 않는다
  await flushContentReviewOutbox(userId);
  try {
    const prompt = await fetchContentReviewPrompt();
    // 받는 사이 계정이 바뀌었으면(로그아웃) 앞 계정의 값을 남기지 않는다
    if (promptedUserId !== userId) return;
    const store = useContentReviewStore.getState();
    store.setEnabled(prompt.enabled);
    if (prompt.show) store.holdPrompt(prompt);
    else store.finishPrompt();
  } catch (error) {
    logger.warn('[content-review] prompt failed', error);
    if (promptedUserId !== userId) return;
    const store = useContentReviewStore.getState();
    store.setEnabled(false);
    store.finishPrompt();
  }
};

/** 로그아웃 · 탈퇴 · 세션 만료 — 다음 계정은 새로 묻는다. 보관함은 계정별이라 지우지 않는다 */
export const resetContentReviewSession = (): void => {
  promptedUserId = null;
  useContentReviewStore.getState().reset();
};

/* ── 후기 시트 ── */

/** 시트 열기(4.1) — 응답의 `enabled`를 따라간다(세션 중 스위치가 꺼지면 다음 호출에서 숨는다) */
export const loadContentReviewState = async (contentId: string): Promise<ContentReviewState> => {
  const state = await fetchContentReview(contentId);
  useContentReviewStore.getState().setEnabled(state.enabled);
  return state;
};

/**
 * [보내기]의 결과.
 * - `sent`      저장됐다 — 토스트 "후기 고마워요". `saved.issuedPromotion`이 있으면 발급 안내 시트
 * - `queued`    서버에 닿지 못해 보관했다 — 닫고 다음 기회에 다시 보낸다(토스트는 같다)
 * - `discarded` 다시 보내도 같은 답(안 들은 편 · 회수 · 꺼짐 · 없는 편) — 조용히 닫는다. 안 들은 편이면 안내를 띄운다
 * - `failed`    그 밖의 실패(5xx 등) — 시트 안에 인라인 에러 + [다시 시도]
 */
export type ContentReviewSendOutcome =
  | { kind: 'sent'; saved: SavedContentReview }
  | { kind: 'queued' }
  | { kind: 'discarded'; errorCode: string }
  | { kind: 'failed' };

export const sendContentReview = async (
  userId: string,
  input: { contentId: string; stars: number; text: string },
): Promise<ContentReviewSendOutcome> => {
  try {
    const saved = await saveContentReview(input);
    return { kind: 'sent', saved };
  } catch (error) {
    const discardCode = discardCodeOf(error);
    if (discardCode !== null) {
      followDisabled(error);
      return { kind: 'discarded', errorCode: discardCode };
    }
    if (isUnreachable(error)) {
      await enqueue(userId, { type: 'review', ...input });
      return { kind: 'queued' };
    }
    logger.warn('[content-review] save failed', error);
    return { kind: 'failed' };
  }
};

/** 실패하면 다시 보낼 만한 것만 보관한다 — 닫기 · 그만 보기는 사용자가 기다리지 않는 알림이라 화면에 알리지 않는다 */
const notifyOrEnqueue = async (
  userId: string,
  entry: ContentReviewOutboxEntry,
  label: string,
): Promise<void> => {
  try {
    await sendEntry(entry);
  } catch (error) {
    if (isWorthRetrying(error)) {
      await enqueue(userId, entry);
      return;
    }
    logger.warn(`[content-review] prompt ${label} failed`, error);
  }
};

/** 먼저 묻는 시트가 닫혔다(닫기 · 보낸 뒤 닫힘 모두 — api 4.4) */
export const notifyContentReviewPromptDismissed = (userId: string): Promise<void> =>
  notifyOrEnqueue(userId, { type: 'dismiss' }, 'dismiss');

/** [이번 주 그만 보기] — "물었다"도 함께 적어 dismiss 를 따로 보내지 않는다(api 4.5) */
export const notifyContentReviewPromptMuted = (userId: string): Promise<void> =>
  notifyOrEnqueue(userId, { type: 'mute' }, 'mute');

/**
 * 포그라운드 복귀마다 보관함을 다시 보낸다(architecture.md 5.5 — 망 상태 구독이 없어 복귀를 신호로 삼는다).
 * 로그인한 계정 id 는 app 이 주입한다. 한 번만 건다.
 */
let isOutboxSyncStarted = false;

export const startContentReviewOutboxSync = (getUserId: () => string | null): void => {
  if (isOutboxSyncStarted) return;
  isOutboxSyncStarted = true;
  AppState.addEventListener('change', (appState) => {
    if (appState !== 'active') return;
    const userId = getUserId();
    if (userId !== null) void flushContentReviewOutbox(userId);
  });
};

/** 테스트 전용 — 모듈 상태를 처음으로 되돌린다 */
export const resetContentReviewServiceForTest = (): void => {
  promptedUserId = null;
  outboxChain = Promise.resolve();
};
