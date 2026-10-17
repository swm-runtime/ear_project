import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import {
  dismissDripFeedback,
  fetchDripFeedbackPrompt,
  muteDripFeedback,
  submitDripFeedback,
} from './drip-feedback.api';
import { MOCK_DRIP_FEEDBACK_HIDDEN, MOCK_DRIP_FEEDBACK_SHOWN } from './drip-feedback.mock';

// 실서버 경로의 변환을 본다 — 테스트 환경은 __DEV__ 라 mock 플래그를 끈다
jest.mock('../library.constants', () => ({
  ...jest.requireActual<object>('../library.constants'),
  IS_LIBRARY_API_MOCKED: false,
}));

const mockGet = jest.fn<(url: string) => Promise<{ data: unknown }>>();
const mockPost = jest.fn<(url: string, body?: unknown) => Promise<{ data: unknown }>>();
jest.mock('@/shared/api/api-client', () => ({
  apiClient: {
    get: (url: string) => mockGet(url),
    post: (url: string, body?: unknown) => mockPost(url, body),
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockPost.mockResolvedValue({ data: undefined });
});

describe('drip-feedback.api — 계약(drip-feedback-api.md)', () => {
  it('4.1 응답을 도메인 모델로 옮기고 items 순서를 지킨다', async () => {
    mockGet.mockResolvedValue({ data: MOCK_DRIP_FEEDBACK_SHOWN });
    const prompt = await fetchDripFeedbackPrompt();
    expect(mockGet).toHaveBeenCalledWith('/users/me/drip-feedback/prompt');
    expect(prompt.show).toBe(true);
    expect(prompt.placedDate).toBe('2026-10-16');
    expect(prompt.items.map((item) => item.contentId)).toEqual([
      'mock-drip-feedback-1',
      'mock-drip-feedback-2',
    ]);
    expect(prompt.items[0]).toEqual({
      contentId: 'mock-drip-feedback-1',
      title: '관세는 외국이 내는 세금이 아니다',
      thumbnailUrl: 'https://picsum.photos/seed/mock-drip-feedback-1/200',
      language: 'ko',
      source: 'drip',
      placedDate: '2026-10-16',
      libraryStatus: 'unplayed',
    });
  });

  it('show=false 응답은 빈 목록·null 날짜 그대로다', async () => {
    mockGet.mockResolvedValue({ data: MOCK_DRIP_FEEDBACK_HIDDEN });
    await expect(fetchDripFeedbackPrompt()).resolves.toEqual({
      show: false,
      placedDate: null,
      mutedUntil: null,
      items: [],
    });
  });

  it('4.2 별점은 { ratings: [{ content_id, stars }] } 로 보낸다', async () => {
    await submitDripFeedback({ ratings: [{ contentId: 'c1', stars: 4 }] });
    expect(mockPost).toHaveBeenCalledWith('/users/me/drip-feedback', {
      ratings: [{ content_id: 'c1', stars: 4 }],
    });
  });

  it('4.3 닫기는 { placed_date } 를 보낸다', async () => {
    await dismissDripFeedback({ placedDate: '2026-10-16' });
    expect(mockPost).toHaveBeenCalledWith('/users/me/drip-feedback/dismiss', {
      placed_date: '2026-10-16',
    });
  });

  it('4.4 그만 보기는 본문 없이 보내고 muted_until 을 받는다', async () => {
    mockPost.mockResolvedValue({ data: { muted_until: '2026-10-19' } });
    await expect(muteDripFeedback()).resolves.toEqual({ mutedUntil: '2026-10-19' });
    expect(mockPost).toHaveBeenCalledWith('/users/me/drip-feedback/mute', undefined);
  });
});
