import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { fetchLibraryItems } from './library.api';
import type { LibraryItemDto, LibraryItemsResponseDto } from './library.dto';

// 실서버 경로의 변환을 본다 — 테스트 환경은 __DEV__ 라 mock 플래그를 끈다
jest.mock('../library.constants', () => ({
  ...jest.requireActual<object>('../library.constants'),
  IS_LIBRARY_API_MOCKED: false,
}));

const mockGet = jest.fn<(url: string, config?: unknown) => Promise<{ data: unknown }>>();
jest.mock('@/shared/api/api-client', () => ({
  apiClient: { get: (url: string, config?: unknown) => mockGet(url, config) },
}));

// player 공개 API 는 재생 네이티브 의존을 끌어온다 — 잔여 재생 표시값 변환과 mock 브리지 등록만 흉내 낸다
jest.mock('@/features/player', () => ({
  toPlayLimitSnapshot: () => null,
  registerPlayMockLibraryBridge: () => undefined,
}));

const item = (id: string, language?: string | null): LibraryItemDto => ({
  id: `li-${id}`,
  source: 'drip',
  status: 'unplayed',
  added_at: '2026-10-15T00:00:00Z',
  last_played_at: null,
  completed_at: null,
  is_counted_today: false,
  content: {
    id,
    title: id,
    author_name: null,
    source_name: '이어',
    source_url: null,
    duration_sec: 600,
    thumbnail_url: 'https://example.com/t.jpg',
    content_version: 1,
    topic_ids: [],
    ...(language === undefined ? {} : { language }),
  },
  progress: null,
});

beforeEach(() => {
  mockGet.mockReset();
});

describe('library.api — 콘텐츠 language(global-api.md 4.7 · KAN-196)', () => {
  it('language 를 그대로 옮기고, 없거나 null 이면 null 이다', async () => {
    // given
    const dto: LibraryItemsResponseDto = {
      items: [item('en-1', 'en'), item('ko-1', 'ko'), item('old-1'), item('null-1', null)],
      next_cursor: null,
      has_next: false,
      daily_play_limit: 2,
      daily_play_count: 0,
      service_date: '2026-10-15',
    };
    mockGet.mockResolvedValue({ data: dto });

    // when
    const page = await fetchLibraryItems({ filter: 'all', topicIds: [], sourceFilter: null });

    // then — 표시 전용이라 어떤 언어도 거르지 않는다(행 수·순서 그대로)
    expect(page.items.map((row) => [row.content.id, row.content.language])).toEqual([
      ['en-1', 'en'],
      ['ko-1', 'ko'],
      ['old-1', null],
      ['null-1', null],
    ]);
  });
});

describe('library.api — 잠긴 편 is_locked(experiments-api.md 4.2-2 · KAN-294)', () => {
  it('항목 콘텐츠의 is_locked 가 true 면 잠금, 없거나(옛 서버) false 면 잠기지 않은 것으로 읽는다', async () => {
    // given
    const locked = item('locked-1');
    locked.content.is_locked = true;
    const open = item('open-1');
    open.content.is_locked = false;
    const dto: LibraryItemsResponseDto = {
      items: [locked, open, item('old-1')],
      next_cursor: null,
      has_next: false,
      daily_play_limit: 2,
      daily_play_count: 0,
      service_date: '2026-10-29',
    };
    mockGet.mockResolvedValue({ data: dto });

    // when
    const page = await fetchLibraryItems({ filter: 'all', topicIds: [], sourceFilter: null });

    // then
    expect(page.items.map((row) => row.content.isLocked)).toEqual([true, false, false]);
  });
});
