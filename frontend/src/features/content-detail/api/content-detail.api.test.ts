import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { fetchContentDetail } from './content-detail.api';
import type { ContentDetailContentDto, ContentDetailResponseDto } from './content-detail.dto';

// 실서버 경로의 변환을 본다 — 테스트 환경은 __DEV__ 라 mock 플래그를 끈다
jest.mock('../content-detail.constants', () => ({
  IS_CONTENT_DETAIL_API_MOCKED: false,
}));

const mockGet = jest.fn<(url: string) => Promise<{ data: unknown }>>();
jest.mock('@/shared/api/api-client', () => ({
  apiClient: { get: (url: string) => mockGet(url) },
}));

// mock 모듈이 끌어오는 공개 API — 재생·라이브러리 네이티브 의존을 끊는다(실서버 경로라 호출되지 않는다)
jest.mock('@/features/player', () => ({
  getMockSourceUrl: () => null,
  isMockAiGeneratedContent: () => false,
  isMockCountedToday: () => false,
}));
jest.mock('@/features/library', () => ({
  getMockLibraryItemByContentId: () => null,
}));

const content = (extra: Partial<ContentDetailContentDto> = {}): ContentDetailContentDto => ({
  id: 'c1',
  title: '몰입은 의지가 아니라 환경에서 온다',
  description: '소개',
  duration_sec: 908,
  published_at: '2026-08-18T00:00:00Z',
  thumbnail_url: 'https://example.com/t.jpg',
  content_version: 1,
  topics: [{ id: 't1', name: '몰입·습관' }],
  series: null,
  origin: 'ai_generated',
  author_name: null,
  source_name: '『딥 워크』(칼 뉴포트) 외 2건',
  source_url: null,
  ...extra,
});

const response = (dto: ContentDetailContentDto): ContentDetailResponseDto => ({
  content: dto,
  library_item: null,
  is_counted_today: false,
});

beforeEach(() => {
  mockGet.mockReset();
});

describe('content-detail.api — 참고 소스는 읽지 않는다(KAN-221)', () => {
  it('응답에 sources가 있어도 오류 없이 변환하고, 화면 모델에 싣지 않는다', async () => {
    mockGet.mockResolvedValue({
      data: response(
        content({
          sources: [
            { title: '딥 워크', author: '칼 뉴포트', url: null },
            { title: '몰입을 부르는 환경 설계', author: null, url: 'https://example.com/a' },
          ],
        }),
      ),
    });

    const detail = await fetchContentDetail({ contentId: 'c1' });

    expect(detail.content.title).toBe('몰입은 의지가 아니라 환경에서 온다');
    expect(detail.content).not.toHaveProperty('sources');
  });

  it('응답에 sources 필드가 없어도(누락) 오류 없이 열린다', async () => {
    mockGet.mockResolvedValue({ data: response(content()) });

    const detail = await fetchContentDetail({ contentId: 'c1' });

    expect(detail.content.id).toBe('c1');
    expect(detail.content).not.toHaveProperty('sources');
  });
});

describe('content-detail.api — 시리즈 줄의 데이터 출처(KAN-225 · content-detail.md 4.3-1)', () => {
  it('series 객체의 id·title 을 읽는다(KAN-134 1단계 모양 — series_id 가 함께 와도 id 가 먼저다)', async () => {
    mockGet.mockResolvedValue({
      data: response(
        content({
          series: {
            series_id: 's1',
            id: 's1',
            title: '키워드로 빠르게 배우는 CS 지식',
            episode_no: 3,
            total_episodes: 16,
          },
        }),
      ),
    });

    const detail = await fetchContentDetail({ contentId: 'c1' });

    expect(detail.content.series).toEqual({
      seriesId: 's1',
      title: '키워드로 빠르게 배우는 CS 지식',
      episodeNo: 3,
      totalEpisodes: 16,
    });
  });

  it('구버전 서버(series_id 만, 제목 없음)는 series_id 로 폴백하고 제목은 null 이다', async () => {
    mockGet.mockResolvedValue({
      data: response(content({ series: { series_id: 'old', episode_no: 1, total_episodes: 3 } })),
    });

    const detail = await fetchContentDetail({ contentId: 'c1' });

    expect(detail.content.series).toEqual({
      seriesId: 'old',
      title: null,
      episodeNo: 1,
      totalEpisodes: 3,
    });
  });
});
