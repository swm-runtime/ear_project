import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { startPlay, toServerEntryPoint } from './player.api';

// 실서버 경로의 요청 본문을 본다 — 테스트 환경은 __DEV__ 라 mock 플래그를 끈다
jest.mock('../player.constants', () => ({
  IS_PLAY_API_MOCKED: false,
  IS_PLAYER_API_MOCKED: false,
}));

const mockPost = jest.fn<(url: string, body: unknown) => Promise<{ data: unknown }>>();
jest.mock('@/shared/api/api-client', () => ({
  apiClient: { post: (url: string, body: unknown) => mockPost(url, body) },
}));
jest.mock('@/shared/lib/device-id', () => ({ getDeviceId: () => 'device-1' }));
// mock 모듈은 실서버 경로라 불리지 않는다 — 다른 feature 의존을 끊는다
jest.mock('./player.mock', () => ({}));

beforeEach(() => {
  mockPost.mockReset();
  mockPost.mockResolvedValue({
    data: {
      counted: true,
      library_item: null,
      progress: null,
      daily_play_limit: null,
      daily_play_count: null,
      service_date: '2026-10-29',
    },
  });
});

describe('toServerEntryPoint — 앱 진입점 → 서버 entry_point(library-api.md 4.4)', () => {
  it('온보딩 직후 연 첫 콘텐츠(KAN-295)는 서버 enum 에 없어 library 로 보낸다', () => {
    expect(toServerEntryPoint('onboarding')).toBe('library');
  });

  it('서버 enum 에 있는 값은 그대로 보낸다', () => {
    expect(toServerEntryPoint('push')).toBe('push');
    expect(toServerEntryPoint('explore')).toBe('explore');
    expect(toServerEntryPoint('share')).toBe('share');
  });
});

describe('startPlay — 재생 시작 요청 본문', () => {
  it('onboarding 진입점이어도 서버에는 library 를 실어 400 을 피한다', async () => {
    await startPlay({ contentId: 'content-1', entryPoint: 'onboarding' });

    expect(mockPost).toHaveBeenCalledWith('/contents/content-1/play', { entry_point: 'library' });
  });
});
