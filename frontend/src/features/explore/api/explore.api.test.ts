import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import type { ExploreItem, ExploreSeriesItem } from '../explore.types';
import {
  fetchExploreFeed,
  fetchPublisherSeries,
  fetchSeriesDetail,
  toExploreEntry,
} from './explore.api';
import type { ExploreContentDto, ExploreEntryDto } from './explore.dto';

// 실서버 경로의 변환을 본다 — 테스트 환경은 __DEV__ 라 mock 플래그를 끈다
jest.mock('../explore.constants', () => ({ IS_EXPLORE_API_MOCKED: false }));

const mockGet = jest.fn<(url: string) => Promise<{ data: unknown }>>();
jest.mock('@/shared/api/api-client', () => ({
  apiClient: { get: (url: string) => mockGet(url) },
}));
jest.mock('@/shared/analytics', () => ({ track: jest.fn() }));
jest.mock('@/shared/lib/logger', () => ({ logger: { debug: jest.fn(), warn: jest.fn() } }));
// mock 모듈이 끌어오는 공개 API — 재생·라이브러리 네이티브 의존을 끊는다(실서버 경로라 호출되지 않는다)
jest.mock('@/features/player', () => ({
  getMockSourceUrl: () => null,
  isMockCountedToday: () => false,
  mockPlayLimitFields: () => ({}),
  toPlayLimitSnapshot: () => ({ dailyPlayLimit: null, dailyPlayCount: null, serviceDate: null }),
}));
jest.mock('@/features/library', () => ({
  getMockLibraryItemByContentId: () => null,
  mockSaveLibraryItemByContent: jest.fn(),
  mockUnsaveLibraryItemByContent: jest.fn(),
}));

const content = (extra: Partial<ExploreContentDto> = {}): ExploreContentDto => ({
  id: 'c1',
  title: '키워드로 빠르게 배우는 CS 지식 3 - 소프트웨어 설계',
  author_name: null,
  source_name: '이어 스튜디오',
  source_url: null,
  duration_sec: 1260,
  thumbnail_url: 'https://example.com/3.webp',
  content_version: 1,
  topic_ids: ['t1'],
  ...extra,
});

const seriesCard: ExploreEntryDto = {
  type: 'series',
  series: {
    id: 's1',
    title: '키워드로 빠르게 배우는 CS 지식',
    description: '소개',
    total_episodes: 16,
    episode_count: 10,
    status: 'ongoing',
    thumbnail_url: 'https://example.com/1.webp',
    topic_ids: ['t1', 't2'],
  },
};

/** 계약에 없는 종류 — 서버가 무배포로 더한 새 type 의 대역 */
const unknownEntry = { type: 'playlist', playlist: { id: 'p1' } } as unknown as ExploreEntryDto;

beforeEach(() => {
  mockGet.mockReset();
});

describe('toExploreEntry — 항목 종류(explore-api.md 4.1-1)', () => {
  it('type 키가 없으면(스위치 꺼짐) 콘텐츠 행으로 읽는다', () => {
    // given — 스위치가 꺼진 서버의 종전 모양
    const dto: ExploreEntryDto = { content: content(), library: null, is_counted_today: true };

    // when
    const entry = toExploreEntry(dto) as ExploreItem;

    // then
    expect(entry.type).toBe('content');
    expect(entry.content.id).toBe('c1');
    expect(entry.isCountedToday).toBe(true);
  });

  it('완청은 is_completed 를 따르고, 없으면(옛 서버) library.status 로 읽는다(KAN-249)', () => {
    // given — 담지 않고 끝까지 들은 편 · 옛 서버의 담아서 완청한 편
    const unsavedDone = toExploreEntry({
      content: content(),
      library: null,
      is_counted_today: false,
      is_completed: true,
    }) as ExploreItem;
    const legacyDone = toExploreEntry({
      content: content(),
      library: { item_id: 'i1', source: 'save', status: 'completed' },
      is_counted_today: false,
    }) as ExploreItem;
    const legacyNot = toExploreEntry({
      content: content(),
      library: null,
      is_counted_today: false,
    }) as ExploreItem;

    // then
    expect(unsavedDone.isCompleted).toBe(true);
    expect(legacyDone.isCompleted).toBe(true);
    expect(legacyNot.isCompleted).toBe(false);
  });

  it('content.series 가 없으면 null, 있으면 객체로 옮긴다', () => {
    // when
    const withoutField = toExploreEntry({
      type: 'content',
      content: content(),
      library: null,
      is_counted_today: false,
    }) as ExploreItem;
    const withSeries = toExploreEntry({
      type: 'content',
      content: content({
        series: {
          id: 's1',
          title: '키워드로 빠르게 배우는 CS 지식',
          episode_no: 3,
          total_episodes: 16,
        },
      }),
      library: null,
      is_counted_today: false,
    }) as ExploreItem;

    // then
    expect(withoutField.content.series).toBeNull();
    // author_name null(AI 생성 콘텐츠)은 빈 문자열로 읽는다
    expect(withoutField.content.authorName).toBe('');
    expect(withSeries.content.series).toEqual({
      id: 's1',
      title: '키워드로 빠르게 배우는 CS 지식',
      episodeNo: 3,
      totalEpisodes: 16,
    });
  });

  it('type "series" 는 시리즈 카드로 옮긴다 — 노출 편 수·계획 편수·표지·주제를 그대로', () => {
    const entry = toExploreEntry(seriesCard) as ExploreSeriesItem;

    expect(entry).toEqual({
      type: 'series',
      series: {
        id: 's1',
        title: '키워드로 빠르게 배우는 CS 지식',
        description: '소개',
        totalEpisodes: 16,
        episodeCount: 10,
        status: 'ongoing',
        thumbnailUrl: 'https://example.com/1.webp',
        topicIds: ['t1', 't2'],
      },
    });
  });

  it('모르는 type 은 버린다(null) — 목록이 깨지지 않게', () => {
    expect(toExploreEntry(unknownEntry)).toBeNull();
  });
});

describe('fetchExploreFeed — 섞인 섹션 항목', () => {
  it('섹션 안의 모르는 종류만 빠지고 콘텐츠 행·시리즈 카드는 순서대로 남는다', async () => {
    // given
    mockGet.mockResolvedValue({
      data: {
        sections: [
          {
            key: 'new',
            title: '새로 나온 콘텐츠',
            topic: null,
            items: [
              seriesCard,
              unknownEntry,
              {
                type: 'content',
                content: content({ id: 'c2' }),
                library: null,
                is_counted_today: false,
              },
            ],
          },
        ],
        daily_play_limit: null,
        daily_play_count: null,
      },
    });

    // when
    const feed = await fetchExploreFeed();

    // then
    expect(feed.sections[0].items.map((item) => item.type)).toEqual(['series', 'content']);
  });
});

describe('fetchSeriesDetail — GET /series/:series_id(explore-api.md 4.7)', () => {
  it('편을 서버 순서 그대로 옮기고 library·progress·is_counted_today 를 편마다 담는다', async () => {
    // given
    mockGet.mockResolvedValue({
      data: {
        series: {
          id: 's1',
          title: '키워드로 빠르게 배우는 CS 지식',
          description: '',
          total_episodes: 16,
          status: 'completed',
          thumbnail_url: 'https://example.com/1.webp',
        },
        episodes: [
          {
            episode_no: 1,
            content: content({ id: 'e1' }),
            library: { item_id: 'i1', source: 'save', status: 'completed' },
            progress: { position_sec: 372, max_reached_sec: 372 },
            is_counted_today: true,
          },
          {
            episode_no: 2,
            content: content({ id: 'e2' }),
            library: null,
            progress: null,
            is_counted_today: false,
          },
        ],
      },
    });

    // when
    const detail = await fetchSeriesDetail({ seriesId: 's1' });

    // then
    expect(mockGet).toHaveBeenCalledWith('/series/s1');
    expect(detail.series.totalEpisodes).toBe(16);
    expect(detail.episodes.map((episode) => episode.episodeNo)).toEqual([1, 2]);
    expect(detail.episodes[0].item).toMatchObject({
      type: 'content',
      library: { itemId: 'i1', source: 'save', status: 'completed' },
      isCountedToday: true,
    });
    expect(detail.episodes[0].progress).toEqual({ positionSec: 372, maxReachedSec: 372 });
    expect(detail.episodes[1].item.library).toBeNull();
    expect(detail.episodes[1].progress).toBeNull();
    // 대표 중분류를 안 보낸 응답(구버전·없는 시리즈) → null 로 읽는다(화면은 카테고리 줄 생략)
    expect(detail.series.topic).toBeNull();
    // 발행일자도 안 보낸 응답(구버전) → null(화면은 발행일 줄 생략)
    expect(detail.series.publishedAt).toBeNull();
    // 발행 이름도 안 보낸 응답(구버전) → null(화면은 제목 아래 줄 생략)
    expect(detail.series.publisherName).toBeNull();
  });

  it('대표 중분류(topic)를 보내면 그대로 옮긴다 — 제목 아래 카테고리 줄', async () => {
    // given
    mockGet.mockResolvedValue({
      data: {
        series: {
          id: 's1',
          title: '키워드로 빠르게 배우는 CS 지식',
          description: '',
          total_episodes: 16,
          status: 'completed',
          thumbnail_url: 'https://example.com/1.webp',
          topic: { id: 't1', name: 'IT·테크' },
          published_at: '2026-10-01T00:00:00.000Z',
          is_saved: true,
          publisher_name: '키워드',
        },
        episodes: [],
      },
    });

    // when
    const detail = await fetchSeriesDetail({ seriesId: 's1' });

    // then
    expect(detail.series.topic).toEqual({ id: 't1', name: 'IT·테크' });
    // 시리즈째 담김(KAN-246) — 버튼의 근거
    expect(detail.series.isSaved).toBe(true);
    // 발행일자(ISO 순간)를 그대로 옮긴다 — 화면에서 기기 시간대 날짜로 그린다
    expect(detail.series.publishedAt).toBe('2026-10-01T00:00:00.000Z');
    // 발행 이름 — 제목 아래 줄
    expect(detail.series.publisherName).toBe('키워드');
  });
});

describe('fetchPublisherSeries — GET /series/:series_id/publisher-series(explore-api.md 4.7-1)', () => {
  it('발행 이름과 시리즈 카드만 옮긴다 — 모르는 종류는 버린다', async () => {
    // given
    mockGet.mockResolvedValue({
      data: { publisher_name: '키워드', items: [seriesCard, unknownEntry] },
    });

    // when
    const result = await fetchPublisherSeries({ seriesId: 's0' });

    // then
    expect(mockGet).toHaveBeenCalledWith('/series/s0/publisher-series');
    expect(result.publisherName).toBe('키워드');
    expect(result.series.map((series) => series.id)).toEqual(['s1']);
    expect(result.series[0]).toMatchObject({ totalEpisodes: 16, episodeCount: 10 });
  });

  it('발행 이름이 없으면 null 이다', async () => {
    // given
    mockGet.mockResolvedValue({ data: { publisher_name: null, items: [] } });

    // when
    const result = await fetchPublisherSeries({ seriesId: 's0' });

    // then
    expect(result).toEqual({ publisherName: null, series: [] });
  });
});

describe('잠긴 편 is_locked(experiments-api.md 4.2-2 — KAN-294)', () => {
  it('콘텐츠 행의 is_locked 가 true 면 잠금, 없거나(옛 서버) false 면 잠기지 않은 것으로 읽는다', () => {
    // given
    const locked: ExploreEntryDto = {
      content: content({ is_locked: true }),
      library: null,
      is_counted_today: false,
    };
    const absent: ExploreEntryDto = { content: content(), library: null, is_counted_today: false };
    const open: ExploreEntryDto = {
      content: content({ is_locked: false }),
      library: null,
      is_counted_today: false,
    };

    // when · then
    expect((toExploreEntry(locked) as ExploreItem).content.isLocked).toBe(true);
    expect((toExploreEntry(absent) as ExploreItem).content.isLocked).toBe(false);
    expect((toExploreEntry(open) as ExploreItem).content.isLocked).toBe(false);
  });

  it('시리즈 편 목록은 편마다 서버 값 그대로 옮긴다 — 화수로 다시 계산하지 않는다', async () => {
    // given — 4화가 잠기지 않고 3화가 잠긴, 화수 규칙과 어긋난 응답이라도 서버 값이 이긴다
    mockGet.mockResolvedValue({
      data: {
        series: {
          id: 's1',
          title: '시리즈',
          description: '',
          total_episodes: 4,
          status: 'completed',
          thumbnail_url: 'https://example.com/1.webp',
        },
        episodes: [3, 4].map((no) => ({
          episode_no: no,
          content: content({ id: `e${no}`, is_locked: no === 3 }),
          library: null,
          progress: null,
          is_counted_today: false,
        })),
      },
    });

    // when
    const detail = await fetchSeriesDetail({ seriesId: 's1' });

    // then
    expect(detail.episodes.map((episode) => episode.item.content.isLocked)).toEqual([true, false]);
  });
});
