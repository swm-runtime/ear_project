import { ErrorCode } from '@/common/exceptions/error-code.enum';
import { BusinessNotFoundException } from '@/common/exceptions/business-not-found.exception';
import { SeriesStatus } from '@/modules/content/content.enum';
import { Content } from '@/modules/content/entities/content.entity';
import { Series } from '@/modules/content/entities/series.entity';
import { ContentService } from '@/modules/content/services/content.service';
import { SeriesService } from '@/modules/content/services/series.service';
import { LibraryItem } from '@/modules/library/library-item.entity';
import {
  LibraryItemSource,
  LibraryItemStatus,
} from '@/modules/library/library.enum';
import { LibraryService } from '@/modules/library/library.service';
import { PlaybackService } from '@/modules/playback/services/playback.service';
import { UserMarket } from '@/modules/user/user.enum';

import { SeriesDetailOrchestrator } from './series-detail.orchestrator';

const NOW = new Date('2026-10-17T09:00:00.000Z');
const USER_ID = '11111111-1111-4111-8111-111111111111';
const SERIES_ID = '55555555-5555-4555-8555-555555555555';

function buildEpisode(id: string, episodeNo: number): Content {
  return {
    id,
    seriesId: SERIES_ID,
    episodeNo,
    thumbnailUrl: `https://cdn.example/${id}.webp`,
  } as Content;
}

describe('SeriesDetailOrchestrator', () => {
  let orchestrator: SeriesDetailOrchestrator;
  let seriesService: jest.Mocked<SeriesService>;
  let contentService: jest.Mocked<ContentService>;
  let libraryService: jest.Mocked<LibraryService>;
  let playbackService: jest.Mocked<PlaybackService>;
  const series = {
    id: SERIES_ID,
    title: '키워드로 빠르게 배우는 CS 지식',
    description: '소개',
    totalEpisodes: 16,
    status: SeriesStatus.COMPLETED,
  } as Series;

  beforeEach(() => {
    seriesService = {
      // 2화가 회수돼 1·3화만 노출 중이다
      getVisibleForUser: jest.fn().mockResolvedValue({
        series,
        episodes: [buildEpisode('c1', 1), buildEpisode('c3', 3)],
      }),
    } as unknown as jest.Mocked<SeriesService>;
    contentService = {
      findTopicViews: jest
        .fn()
        .mockResolvedValue([{ contentId: 'c1', topicId: 't1', name: 'CS' }]),
    } as unknown as jest.Mocked<ContentService>;
    libraryService = {
      findActiveItems: jest.fn().mockResolvedValue([
        {
          id: 'item-1',
          contentId: 'c1',
          source: LibraryItemSource.SAVE,
          status: LibraryItemStatus.COMPLETED,
        } as LibraryItem,
      ]),
    } as unknown as jest.Mocked<LibraryService>;
    playbackService = {
      findProgresses: jest
        .fn()
        .mockResolvedValue([
          { contentId: 'c3', positionSec: 120, maxReachedSec: 150 },
        ]),
      findCountedContentIds: jest.fn().mockResolvedValue(new Set(['c3'])),
    } as unknown as jest.Mocked<PlaybackService>;

    orchestrator = new SeriesDetailOrchestrator(
      seriesService,
      contentService,
      libraryService,
      playbackService,
    );
  });

  it('편마다 번호·주제·내 상태(담음·완청·재생 위치)를 붙이고 표지는 노출 중인 가장 앞 편의 썸네일이다', async () => {
    // when
    const view = await orchestrator.getSeries(
      USER_ID,
      SERIES_ID,
      NOW,
      UserMarket.KR,
    );

    // then
    expect(seriesService.getVisibleForUser).toHaveBeenCalledWith(
      SERIES_ID,
      NOW,
      UserMarket.KR,
    );
    expect(view.coverThumbnailUrl).toBe('https://cdn.example/c1.webp');
    expect(view.episodes.map((episode) => episode.series.episodeNo)).toEqual([
      1, 3,
    ]);
    expect(view.episodes[0]).toMatchObject({
      topicIds: ['t1'],
      libraryItem: { status: LibraryItemStatus.COMPLETED },
      progress: null,
      isCountedToday: false,
      series: { id: SERIES_ID, totalEpisodes: 16 },
    });
    expect(view.episodes[1]).toMatchObject({
      topicIds: [],
      libraryItem: null,
      progress: { positionSec: 120, maxReachedSec: 150 },
      isCountedToday: true,
    });
    // 편 수만큼 묻지 않는다
    expect(libraryService.findActiveItems).toHaveBeenCalledWith(USER_ID, [
      'c1',
      'c3',
    ]);
    expect(playbackService.findProgresses).toHaveBeenCalledWith(USER_ID, [
      'c1',
      'c3',
    ]);
  });

  it('시리즈를 볼 수 없으면(없음·다른 시장) 404를 그대로 올린다', async () => {
    // given
    seriesService.getVisibleForUser.mockRejectedValue(
      new BusinessNotFoundException({
        errorCode: ErrorCode.NOT_FOUND,
        message: '시리즈를 찾을 수 없어요',
      }),
    );

    // when
    const act = orchestrator.getSeries(
      USER_ID,
      SERIES_ID,
      NOW,
      UserMarket.GLOBAL,
    );

    // then
    await expect(act).rejects.toMatchObject({ errorCode: ErrorCode.NOT_FOUND });
    expect(libraryService.findActiveItems).not.toHaveBeenCalled();
  });
});
