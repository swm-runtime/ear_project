import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { ApiError } from '@/shared/api/api-error';
import { ERROR_CODES } from '@/shared/api/error-codes';
import { STORAGE_KEYS } from '@/shared/storage/storage-keys';

import {
  dismissDripFeedback,
  fetchDripFeedbackPrompt,
  muteDripFeedback,
  submitDripFeedback,
} from '../api/drip-feedback.api';
import type { DripFeedbackPrompt } from '../library.types';
import {
  flushDripFeedbackOutbox,
  notifyDripFeedbackDismissed,
  notifyDripFeedbackMuted,
  requestDripFeedbackPrompt,
  resetDripFeedbackServiceForTest,
  sendDripFeedbackRatings,
} from './drip-feedback.service';
import { useDripFeedbackStore } from '../store/drip-feedback.store';

jest.mock('../api/drip-feedback.api', () => ({
  fetchDripFeedbackPrompt: jest.fn(),
  submitDripFeedback: jest.fn(),
  dismissDripFeedback: jest.fn(),
  muteDripFeedback: jest.fn(),
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

// 실패 경로의 경고 로그가 테스트 출력을 덮지 않게 한다
jest.mock('@/shared/lib/logger', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const fetchMock = jest.mocked(fetchDripFeedbackPrompt);
const submitMock = jest.mocked(submitDripFeedback);
const dismissMock = jest.mocked(dismissDripFeedback);
const muteMock = jest.mocked(muteDripFeedback);

const USER = 'user-1';
const OUTBOX_KEY = `${STORAGE_KEYS.LIBRARY_DRIP_FEEDBACK_OUTBOX}.${USER}`;

const SHOWN: DripFeedbackPrompt = {
  show: true,
  placedDate: '2026-10-16',
  mutedUntil: null,
  items: [
    {
      contentId: 'c1',
      title: '첫 편',
      thumbnailUrl: 'https://example.com/1.jpg',
      language: 'ko',
      source: 'drip',
      placedDate: '2026-10-16',
      libraryStatus: 'unplayed',
    },
    {
      contentId: 'c2',
      title: '둘째 편',
      thumbnailUrl: null,
      language: 'en',
      source: 'drip',
      placedDate: '2026-10-16',
      libraryStatus: 'completed',
    },
  ],
};
const HIDDEN: DripFeedbackPrompt = { show: false, placedDate: null, mutedUntil: null, items: [] };

const apiError = (errorCode: string, retryable: boolean, httpStatus: number | null) =>
  new ApiError(errorCode, 'x', retryable, null, null, httpStatus);
const NETWORK = () => apiError(ERROR_CODES.NETWORK_ERROR, true, null);
const NOT_RATEABLE = () => apiError(ERROR_CODES.DRIP_FEEDBACK_NOT_RATEABLE, false, 400);
const SERVER = () => apiError(ERROR_CODES.INTERNAL_ERROR, true, 500);

const readOutbox = (): unknown => JSON.parse(mockMemory.get(OUTBOX_KEY) ?? '[]');

beforeEach(() => {
  jest.clearAllMocks();
  mockMemory.clear();
  resetDripFeedbackServiceForTest();
  useDripFeedbackStore.getState().reset();
  submitMock.mockResolvedValue(undefined);
  dismissMock.mockResolvedValue(undefined);
  muteMock.mockResolvedValue({ mutedUntil: '2026-10-19' });
});

describe('requestDripFeedbackPrompt — 라이브러리 진입 시 노출 판정', () => {
  it('show=true 이고 편이 있으면 팝업 차례로 두고 받은 편을 그대로 들고 있다', async () => {
    // given
    fetchMock.mockResolvedValue(SHOWN);
    // when
    await requestDripFeedbackPrompt(USER);
    // then
    const state = useDripFeedbackStore.getState();
    expect(state.phase).toBe('pending');
    expect(state.prompt).toEqual(SHOWN);
  });

  it('show=false 면 팝업 없이 끝난다', async () => {
    fetchMock.mockResolvedValue(HIDDEN);
    await requestDripFeedbackPrompt(USER);
    expect(useDripFeedbackStore.getState().phase).toBe('done');
    expect(useDripFeedbackStore.getState().prompt).toBeNull();
  });

  it('조회가 실패하면 조용히 끝난다 — 팝업도 에러도 없다', async () => {
    fetchMock.mockRejectedValue(NETWORK());
    await expect(requestDripFeedbackPrompt(USER)).resolves.toBeUndefined();
    expect(useDripFeedbackStore.getState().phase).toBe('done');
    expect(useDripFeedbackStore.getState().prompt).toBeNull();
  });

  it('같은 세션에 다시 들어와도 다시 조회하지 않는다 — 한 세션에 한 번', async () => {
    fetchMock.mockResolvedValue(SHOWN);
    await requestDripFeedbackPrompt(USER);
    useDripFeedbackStore.getState().finish();
    await requestDripFeedbackPrompt(USER);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(useDripFeedbackStore.getState().phase).toBe('done');
  });

  it('보관해 둔 별점을 판정 조회보다 먼저 다시 보낸다', async () => {
    // given — 지난 세션에 오프라인으로 못 보낸 별점
    mockMemory.set(
      OUTBOX_KEY,
      JSON.stringify([{ type: 'ratings', ratings: [{ contentId: 'c9', stars: 3 }] }]),
    );
    const order: string[] = [];
    submitMock.mockImplementation(async () => {
      order.push('submit');
    });
    fetchMock.mockImplementation(async () => {
      order.push('fetch');
      return HIDDEN;
    });
    // when
    await requestDripFeedbackPrompt(USER);
    // then
    expect(order).toEqual(['submit', 'fetch']);
    expect(mockMemory.has(OUTBOX_KEY)).toBe(false);
  });
});

describe('sendDripFeedbackRatings — [보내기]', () => {
  it('매긴 편만 그대로 보내고 sent 를 돌려준다', async () => {
    const outcome = await sendDripFeedbackRatings(USER, [{ contentId: 'c1', stars: 4 }]);
    expect(outcome).toBe('sent');
    expect(submitMock).toHaveBeenCalledWith({ ratings: [{ contentId: 'c1', stars: 4 }] });
  });

  it('DRIP_FEEDBACK_NOT_RATEABLE 이면 조용히 버린다 — 보관하지도 않는다', async () => {
    submitMock.mockRejectedValue(NOT_RATEABLE());
    const outcome = await sendDripFeedbackRatings(USER, [{ contentId: 'c1', stars: 4 }]);
    expect(outcome).toBe('discarded');
    expect(mockMemory.has(OUTBOX_KEY)).toBe(false);
  });

  it('오프라인이면 보관하고 queued 를 돌려준다(팝업은 닫힌다)', async () => {
    submitMock.mockRejectedValue(NETWORK());
    const outcome = await sendDripFeedbackRatings(USER, [{ contentId: 'c1', stars: 4 }]);
    expect(outcome).toBe('queued');
    expect(readOutbox()).toEqual([{ type: 'ratings', ratings: [{ contentId: 'c1', stars: 4 }] }]);
  });

  it('서버 오류(5xx)는 보관하지 않고 failed — 팝업 안 인라인 에러로 다시 시도한다', async () => {
    submitMock.mockRejectedValue(SERVER());
    const outcome = await sendDripFeedbackRatings(USER, [{ contentId: 'c1', stars: 4 }]);
    expect(outcome).toBe('failed');
    expect(mockMemory.has(OUTBOX_KEY)).toBe(false);
  });
});

describe('닫기·이번 주 그만 보기', () => {
  it('닫기는 응답에 받은 placed_date 그대로 dismiss 를 보낸다', async () => {
    await notifyDripFeedbackDismissed(USER, '2026-10-16');
    expect(dismissMock).toHaveBeenCalledWith({ placedDate: '2026-10-16' });
  });

  it('오프라인에서 닫으면 dismiss 를 보관한다', async () => {
    dismissMock.mockRejectedValue(NETWORK());
    await notifyDripFeedbackDismissed(USER, '2026-10-16');
    expect(readOutbox()).toEqual([{ type: 'dismiss', placedDate: '2026-10-16' }]);
  });

  it('그만 보기가 실패해도 던지지 않고, 서버 오류면 다음 기회를 위해 보관한다', async () => {
    muteMock.mockRejectedValue(SERVER());
    await expect(notifyDripFeedbackMuted(USER)).resolves.toBeUndefined();
    expect(readOutbox()).toEqual([{ type: 'mute' }]);
  });
});

describe('flushDripFeedbackOutbox — 보관함 재전송', () => {
  it('접수 기간이 지난 별점(NOT_RATEABLE)은 버리고 다음 항목을 보낸다', async () => {
    mockMemory.set(
      OUTBOX_KEY,
      JSON.stringify([
        { type: 'ratings', ratings: [{ contentId: 'old', stars: 2 }] },
        { type: 'mute' },
      ]),
    );
    submitMock.mockRejectedValue(NOT_RATEABLE());
    await flushDripFeedbackOutbox(USER);
    expect(muteMock).toHaveBeenCalledTimes(1);
    expect(mockMemory.has(OUTBOX_KEY)).toBe(false);
  });

  it('아직 닿지 않으면 거기서 멈추고 남은 것을 그대로 둔다', async () => {
    const entries = [
      { type: 'dismiss', placedDate: '2026-10-16' },
      { type: 'ratings', ratings: [{ contentId: 'c1', stars: 5 }] },
    ];
    mockMemory.set(OUTBOX_KEY, JSON.stringify(entries));
    dismissMock.mockRejectedValue(NETWORK());
    await flushDripFeedbackOutbox(USER);
    expect(submitMock).not.toHaveBeenCalled();
    expect(readOutbox()).toEqual(entries);
  });

  it('다른 계정의 보관함은 보내지 않는다 — 계정별로 둔다', async () => {
    mockMemory.set(OUTBOX_KEY, JSON.stringify([{ type: 'mute' }]));
    await flushDripFeedbackOutbox('user-2');
    expect(muteMock).not.toHaveBeenCalled();
    expect(readOutbox()).toEqual([{ type: 'mute' }]);
  });
});
