import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { ApiError } from '@/shared/api/api-error';
import { ERROR_CODES } from '@/shared/api/error-codes';
import { STORAGE_KEYS } from '@/shared/storage/storage-keys';

import {
  dismissContentReviewPrompt,
  fetchContentReview,
  fetchContentReviewPrompt,
  muteContentReviewPrompt,
  saveContentReview,
} from '../api/content-review.api';
import type { ContentReviewPrompt, SavedContentReview } from '../content-review.types';
import {
  CONTENT_REVIEW_OUTBOX_LIMIT,
  flushContentReviewOutbox,
  loadContentReviewState,
  notifyContentReviewPromptDismissed,
  notifyContentReviewPromptMuted,
  requestContentReviewPrompt,
  resetContentReviewServiceForTest,
  resetContentReviewSession,
  sendContentReview,
} from './content-review.service';
import { useContentReviewStore } from '../store/content-review.store';

jest.mock('../api/content-review.api', () => ({
  fetchContentReview: jest.fn(),
  saveContentReview: jest.fn(),
  fetchContentReviewPrompt: jest.fn(),
  dismissContentReviewPrompt: jest.fn(),
  muteContentReviewPrompt: jest.fn(),
}));

const mockMemory = new Map<string, string>();
jest.mock('@/shared/storage/secure-storage', () => ({
  secureStorage: {
    get: async (key: string) => mockMemory.get(key) ?? null,
    set: async (key: string, value: string) => {
      mockMemory.set(key, value);
    },
    remove: async (key: string) => {
      mockMemory.delete(key);
    },
  },
}));

jest.mock('@/shared/lib/logger', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const fetchPromptMock = jest.mocked(fetchContentReviewPrompt);
const fetchReviewMock = jest.mocked(fetchContentReview);
const saveMock = jest.mocked(saveContentReview);
const dismissMock = jest.mocked(dismissContentReviewPrompt);
const muteMock = jest.mocked(muteContentReviewPrompt);

const USER = 'user-1';
const OUTBOX_KEY = `${STORAGE_KEYS.CONTENT_REVIEW_OUTBOX}.${USER}`;

const SHOWN: ContentReviewPrompt = {
  enabled: true,
  show: true,
  item: { contentId: 'c-9', title: '다 들은 편', thumbnailUrl: null },
  rewardProgress: { current: 1, required: 3 },
};

const SAVED: SavedContentReview = {
  review: { stars: 4, text: '좋았어요 정말로요', updatedAt: '2026-10-29T00:00:00Z' },
  rewardProgress: { current: 2, required: 3 },
  issuedPromotion: null,
};

const apiError = (errorCode: string, retryable = false) =>
  new ApiError(errorCode, 'x', retryable, null, null, null);

const readOutbox = (): unknown[] => JSON.parse(mockMemory.get(OUTBOX_KEY) ?? '[]') as unknown[];

beforeEach(() => {
  jest.clearAllMocks();
  mockMemory.clear();
  resetContentReviewServiceForTest();
  useContentReviewStore.getState().reset();
  dismissMock.mockResolvedValue(undefined);
  muteMock.mockResolvedValue({ mutedUntil: '2026-11-02' });
});

describe('requestContentReviewPrompt — 앱 실행 × 계정 단위 한 번', () => {
  it('show=true 면 켜짐을 적고 띄울 차례로 둔다', async () => {
    fetchPromptMock.mockResolvedValue(SHOWN);
    await requestContentReviewPrompt(USER);
    const state = useContentReviewStore.getState();
    expect(state.enabled).toBe(true);
    expect(state.promptPhase).toBe('pending');
    expect(state.prompt?.item?.contentId).toBe('c-9');
  });

  it('같은 세션 같은 계정의 두 번째 진입은 다시 조회하지 않는다(다른 화면이 켜짐 여부를 물어도 같다)', async () => {
    fetchPromptMock.mockResolvedValue(SHOWN);
    await requestContentReviewPrompt(USER);
    await requestContentReviewPrompt(USER);
    expect(fetchPromptMock).toHaveBeenCalledTimes(1);
  });

  it('로그아웃(세션 초기화) 뒤 다른 계정은 새로 묻는다', async () => {
    fetchPromptMock.mockResolvedValue(SHOWN);
    await requestContentReviewPrompt(USER);
    resetContentReviewSession();
    expect(useContentReviewStore.getState().enabled).toBe(false);
    await requestContentReviewPrompt('user-2');
    expect(fetchPromptMock).toHaveBeenCalledTimes(2);
  });

  it('스위치 꺼짐(enabled=false)이면 [후기]를 그리지 않고 시트도 끝낸다', async () => {
    fetchPromptMock.mockResolvedValue({ ...SHOWN, enabled: false, show: false, item: null });
    await requestContentReviewPrompt(USER);
    const state = useContentReviewStore.getState();
    expect(state.enabled).toBe(false);
    expect(state.promptPhase).toBe('done');
  });

  it('조회가 실패하면 조용히 끝낸다 — 켜짐은 안전한 기본값(false)', async () => {
    useContentReviewStore.getState().setEnabled(true);
    fetchPromptMock.mockRejectedValue(apiError(ERROR_CODES.NETWORK_ERROR));
    await requestContentReviewPrompt(USER);
    expect(useContentReviewStore.getState().enabled).toBe(false);
    expect(useContentReviewStore.getState().promptPhase).toBe('done');
  });

  it('판정 조회 직전에 못 보낸 후기부터 보낸다', async () => {
    mockMemory.set(
      OUTBOX_KEY,
      JSON.stringify([{ type: 'review', contentId: 'c-1', stars: 5, text: '좋아요' }]),
    );
    saveMock.mockResolvedValue(SAVED);
    fetchPromptMock.mockResolvedValue(SHOWN);
    await requestContentReviewPrompt(USER);
    expect(saveMock).toHaveBeenCalledWith({ contentId: 'c-1', stars: 5, text: '좋아요' });
    expect(saveMock.mock.invocationCallOrder[0]).toBeLessThan(
      fetchPromptMock.mock.invocationCallOrder[0] ?? 0,
    );
    expect(mockMemory.has(OUTBOX_KEY)).toBe(false);
  });
});

describe('sendContentReview — [보내기]의 결과와 오프라인 보관', () => {
  it('저장되면 sent 와 응답을 돌려준다', async () => {
    saveMock.mockResolvedValue(SAVED);
    const outcome = await sendContentReview(USER, { contentId: 'c-1', stars: 4, text: '좋아요' });
    expect(outcome).toEqual({ kind: 'sent', saved: SAVED });
  });

  it('망 단절 · 타임아웃이면 기기에 보관하고 queued — 같은 편은 마지막 값만 남는다', async () => {
    saveMock.mockRejectedValue(apiError(ERROR_CODES.NETWORK_ERROR));
    await sendContentReview(USER, { contentId: 'c-1', stars: 2, text: '' });
    saveMock.mockRejectedValue(apiError(ERROR_CODES.TIMEOUT));
    const outcome = await sendContentReview(USER, { contentId: 'c-1', stars: 5, text: '다시' });
    expect(outcome).toEqual({ kind: 'queued' });
    expect(readOutbox()).toEqual([{ type: 'review', contentId: 'c-1', stars: 5, text: '다시' }]);
  });

  it('안 들은 편 · 회수 · 없는 편은 버린다(discarded) — 보관하지 않는다', async () => {
    for (const code of [
      ERROR_CODES.CONTENT_REVIEW_NOT_PLAYED,
      ERROR_CODES.CONTENT_WITHDRAWN,
      ERROR_CODES.CONTENT_NOT_FOUND,
    ]) {
      saveMock.mockRejectedValueOnce(apiError(code));
      const outcome = await sendContentReview(USER, { contentId: 'c-1', stars: 4, text: '' });
      expect(outcome).toEqual({ kind: 'discarded', errorCode: code });
    }
    expect(mockMemory.has(OUTBOX_KEY)).toBe(false);
  });

  it('기능이 꺼졌으면(CONTENT_REVIEW_DISABLED) 버리고 [후기]를 숨긴다', async () => {
    useContentReviewStore.getState().setEnabled(true);
    saveMock.mockRejectedValue(apiError(ERROR_CODES.CONTENT_REVIEW_DISABLED));
    const outcome = await sendContentReview(USER, { contentId: 'c-1', stars: 4, text: '' });
    expect(outcome.kind).toBe('discarded');
    expect(useContentReviewStore.getState().enabled).toBe(false);
  });

  it('그 밖(5xx)은 failed — 시트의 인라인 에러 + [다시 시도]. 보관하지 않는다', async () => {
    saveMock.mockRejectedValue(apiError(ERROR_CODES.INTERNAL_ERROR, true));
    const outcome = await sendContentReview(USER, { contentId: 'c-1', stars: 4, text: '' });
    expect(outcome).toEqual({ kind: 'failed' });
    expect(mockMemory.has(OUTBOX_KEY)).toBe(false);
  });
});

describe('flushContentReviewOutbox — 연결 뒤 다시 보내기(포그라운드 복귀 · 다음 진입)', () => {
  it('망 단절 중 보낸 후기 · 닫기가 연결 뒤 순서대로 다시 보내지고 지워진다', async () => {
    saveMock.mockRejectedValueOnce(apiError(ERROR_CODES.NETWORK_ERROR));
    await sendContentReview(USER, { contentId: 'c-1', stars: 4, text: '좋아요' });
    dismissMock.mockRejectedValueOnce(apiError(ERROR_CODES.NETWORK_ERROR));
    await notifyContentReviewPromptDismissed(USER);
    expect(readOutbox()).toHaveLength(2);

    saveMock.mockResolvedValue(SAVED);
    await flushContentReviewOutbox(USER);
    expect(saveMock).toHaveBeenLastCalledWith({ contentId: 'c-1', stars: 4, text: '좋아요' });
    expect(dismissMock).toHaveBeenCalledTimes(2);
    expect(mockMemory.has(OUTBOX_KEY)).toBe(false);
  });

  it('아직 닿지 않으면(5xx) 거기서 멈추고 남은 것을 그대로 둔다', async () => {
    mockMemory.set(
      OUTBOX_KEY,
      JSON.stringify([{ type: 'review', contentId: 'c-1', stars: 4, text: '' }, { type: 'mute' }]),
    );
    saveMock.mockRejectedValue(apiError(ERROR_CODES.INTERNAL_ERROR, true));
    await flushContentReviewOutbox(USER);
    expect(muteMock).not.toHaveBeenCalled();
    expect(readOutbox()).toHaveLength(2);
  });

  it('다시 보내도 같은 답(안 들은 편)이면 버리고 다음 것을 보낸다', async () => {
    mockMemory.set(
      OUTBOX_KEY,
      JSON.stringify([{ type: 'review', contentId: 'c-1', stars: 4, text: '' }, { type: 'mute' }]),
    );
    saveMock.mockRejectedValue(apiError(ERROR_CODES.CONTENT_REVIEW_NOT_PLAYED));
    await flushContentReviewOutbox(USER);
    expect(muteMock).toHaveBeenCalledTimes(1);
    expect(mockMemory.has(OUTBOX_KEY)).toBe(false);
  });

  it(`보관은 최근 ${CONTENT_REVIEW_OUTBOX_LIMIT}건까지 — 오래된 것부터 버린다`, async () => {
    muteMock.mockRejectedValue(apiError(ERROR_CODES.NETWORK_ERROR));
    for (let index = 0; index < CONTENT_REVIEW_OUTBOX_LIMIT + 2; index += 1) {
      await notifyContentReviewPromptMuted(USER);
    }
    expect(readOutbox()).toHaveLength(CONTENT_REVIEW_OUTBOX_LIMIT);
  });

  it('계정별 보관함이다 — 다른 계정의 세션으로 보내지 않는다', async () => {
    mockMemory.set(OUTBOX_KEY, JSON.stringify([{ type: 'dismiss' }]));
    await flushContentReviewOutbox('user-2');
    expect(dismissMock).not.toHaveBeenCalled();
    expect(readOutbox()).toHaveLength(1);
  });
});

describe('loadContentReviewState — 시트 열기도 켜짐 여부를 따라간다', () => {
  it('응답의 enabled 로 [후기] 표시가 갱신된다', async () => {
    useContentReviewStore.getState().setEnabled(true);
    fetchReviewMock.mockResolvedValue({
      enabled: false,
      reviewable: false,
      reason: 'disabled',
      review: null,
      rewardProgress: null,
    });
    await loadContentReviewState('c-1');
    expect(useContentReviewStore.getState().enabled).toBe(false);
  });
});
