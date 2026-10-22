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
import { DripExclusionReason } from '@/modules/drip/drip.enum';
import { DripExclusionService } from '@/modules/drip/services/drip-exclusion.service';
import { LibrarySeriesService } from '@/modules/library/library-series.service';
import { LibraryService } from '@/modules/library/library.service';
import { UserSignalAction } from '@/modules/playback/playback.enum';
import { PlaybackService } from '@/modules/playback/services/playback.service';
import { UserMarket } from '@/modules/user/user.enum';
import { ContentStatus } from '@/modules/content/content.enum';
import { DataSource, EntityManager } from 'typeorm';

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
  let librarySeriesService: jest.Mocked<LibrarySeriesService>;
  let dripExclusionService: jest.Mocked<DripExclusionService>;
  const manager = {} as EntityManager;
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

    librarySeriesService = {
      isFollowing: jest.fn().mockResolvedValue(true),
      follow: jest.fn().mockResolvedValue(undefined),
      unfollow: jest.fn().mockResolvedValue(true),
      restoreFollow: jest.fn().mockResolvedValue(true),
    } as unknown as jest.Mocked<LibrarySeriesService>;
    dripExclusionService = {
      exclude: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<DripExclusionService>;
    const dataSource = {
      transaction: jest
        .fn()
        .mockImplementation((run: (m: EntityManager) => Promise<unknown>) =>
          run(manager),
        ),
    } as unknown as DataSource;

    orchestrator = new SeriesDetailOrchestrator(
      seriesService,
      contentService,
      libraryService,
      playbackService,
      librarySeriesService,
      dripExclusionService,
      dataSource,
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
    // 대표 중분류 — 편에 걸린 주제가 하나뿐이면 그게 대표다(제목 아래 카테고리 줄)
    expect(view.topic).toEqual({ id: 't1', name: 'CS' });
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

  it('대표 중분류는 가장 많은 편에 걸린 주제다', async () => {
    // given — t2(개발)는 두 편, t1(CS)은 한 편(topicViews 는 display_order ASC 순서로 온다)
    contentService.findTopicViews.mockResolvedValue([
      { contentId: 'c1', topicId: 't1', name: 'CS' },
      { contentId: 'c1', topicId: 't2', name: '개발' },
      { contentId: 'c3', topicId: 't2', name: '개발' },
    ]);

    // when
    const view = await orchestrator.getSeries(
      USER_ID,
      SERIES_ID,
      NOW,
      UserMarket.KR,
    );

    // then
    expect(view.topic).toEqual({ id: 't2', name: '개발' });
  });

  it('편수가 같으면 display_order 가 앞선(먼저 온) 주제가 대표다', async () => {
    // given — t1·t2 각 한 편. topicViews 는 display_order ASC 라 먼저 온 t1 이 이긴다
    contentService.findTopicViews.mockResolvedValue([
      { contentId: 'c1', topicId: 't1', name: 'CS' },
      { contentId: 'c3', topicId: 't2', name: '개발' },
    ]);

    // when
    const view = await orchestrator.getSeries(
      USER_ID,
      SERIES_ID,
      NOW,
      UserMarket.KR,
    );

    // then
    expect(view.topic).toEqual({ id: 't1', name: 'CS' });
  });

  it('노출 편에 주제가 하나도 없으면 대표 중분류는 null 이다', async () => {
    // given
    contentService.findTopicViews.mockResolvedValue([]);

    // when
    const view = await orchestrator.getSeries(
      USER_ID,
      SERIES_ID,
      NOW,
      UserMarket.KR,
    );

    // then
    expect(view.topic).toBeNull();
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
  it('is_saved 는 시리즈째 담기 기록(library_series)에서 읽는다 — 편이 다 담겼는지가 아니다(KAN-245)', async () => {
    // given
    librarySeriesService.isFollowing.mockResolvedValue(false);

    // when
    const view = await orchestrator.getSeries(
      USER_ID,
      SERIES_ID,
      NOW,
      UserMarket.KR,
    );

    // then
    expect(view.isSaved).toBe(false);
    expect(librarySeriesService.isFollowing).toHaveBeenCalledWith(
      USER_ID,
      SERIES_ID,
    );
  });

  describe('saveSeries(KAN-245)', () => {
    beforeEach(() => {
      libraryService.save = jest
        .fn()
        // c1 은 이미 담겨 있다(그대로), c3 은 새로 생긴다
        .mockResolvedValueOnce({
          item: { id: 'item-1' },
          created: false,
          reactivated: false,
        })
        .mockResolvedValueOnce({
          item: { id: 'item-3' },
          created: true,
          reactivated: false,
        });
      playbackService.recordSignal = jest.fn().mockResolvedValue(undefined);
    });

    it('노출 편을 사용자 시장으로 읽고, 기록을 남긴 뒤 편마다 편 담기 규칙을 부른다 — 상태가 바뀐 편만 세고 신호를 남긴다', async () => {
      // when
      const result = await orchestrator.saveSeries(
        USER_ID,
        SERIES_ID,
        NOW,
        UserMarket.KR,
      );

      // then
      expect(result).toEqual({ seriesId: SERIES_ID, addedCount: 1 });
      expect(seriesService.getVisibleForUser).toHaveBeenCalledWith(
        SERIES_ID,
        NOW,
        UserMarket.KR,
        manager,
      );
      expect(librarySeriesService.follow).toHaveBeenCalledWith(
        USER_ID,
        SERIES_ID,
        NOW,
        manager,
      );
      expect(libraryService.save).toHaveBeenNthCalledWith(
        1,
        USER_ID,
        'c1',
        NOW,
        manager,
      );
      expect(libraryService.save).toHaveBeenNthCalledWith(
        2,
        USER_ID,
        'c3',
        NOW,
        manager,
      );
      expect(playbackService.recordSignal).toHaveBeenCalledTimes(1);
      expect(playbackService.recordSignal).toHaveBeenCalledWith(
        USER_ID,
        'c3',
        UserSignalAction.SAVE,
        manager,
      );
    });

    it('볼 수 없는 시리즈(없음·다른 시장·노출 편 0)는 404 이고 아무것도 기록하지 않는다', async () => {
      // given
      seriesService.getVisibleForUser.mockRejectedValueOnce(
        new BusinessNotFoundException({
          errorCode: ErrorCode.NOT_FOUND,
          message: '시리즈를 찾을 수 없어요',
        }),
      );

      // when
      const act = orchestrator.saveSeries(
        USER_ID,
        SERIES_ID,
        NOW,
        UserMarket.KR,
      );

      // then
      await expect(act).rejects.toMatchObject({
        errorCode: ErrorCode.NOT_FOUND,
      });
      expect(librarySeriesService.follow).not.toHaveBeenCalled();
    });
  });

  describe('unsaveSeries(KAN-245)', () => {
    beforeEach(() => {
      seriesService.getById = jest.fn().mockResolvedValue(series);
      libraryService.findActiveItemsInSeries = jest
        .fn()
        .mockResolvedValue([
          { id: 'item-1', contentId: 'c1', deletedAt: null } as LibraryItem,
          { id: 'item-3', contentId: 'c3', deletedAt: null } as LibraryItem,
        ]);
      // item-3 은 동시 해제에서 졌다
      libraryService.softDelete = jest
        .fn()
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);
      playbackService.recordSignal = jest.fn().mockResolvedValue(undefined);
    });

    it('기록을 지우고 살아 있는 편마다 편 해제 규칙(영구 제외 unsave·신호 unsave)을 따른다 — 실제로 뺀 편만 돌려준다', async () => {
      // when
      const result = await orchestrator.unsaveSeries(USER_ID, SERIES_ID, NOW);

      // then
      expect(result).toEqual({
        seriesId: SERIES_ID,
        removedItemIds: ['item-1'],
      });
      expect(librarySeriesService.unfollow).toHaveBeenCalledWith(
        USER_ID,
        SERIES_ID,
        NOW,
        manager,
      );
      expect(dripExclusionService.exclude).toHaveBeenCalledTimes(1);
      expect(dripExclusionService.exclude).toHaveBeenCalledWith(
        USER_ID,
        'c1',
        DripExclusionReason.UNSAVE,
        NOW,
        manager,
      );
      expect(playbackService.recordSignal).toHaveBeenCalledTimes(1);
      expect(playbackService.recordSignal).toHaveBeenCalledWith(
        USER_ID,
        'c1',
        UserSignalAction.UNSAVE,
        manager,
      );
    });
  });

  describe('restoreSeries(KAN-245)', () => {
    beforeEach(() => {
      seriesService.getById = jest.fn().mockResolvedValue(series);
      libraryService.findOwnedItemsInSeriesWithDeleted = jest
        .fn()
        .mockResolvedValue([
          {
            id: 'item-1',
            deletedAt: NOW,
            content: {
              status: ContentStatus.PUBLISHED,
              licenseExpiresAt: null,
            },
          } as LibraryItem,
          // 빼 둔 사이 회수됐다 — 건너뛴다
          {
            id: 'item-3',
            deletedAt: NOW,
            content: {
              status: ContentStatus.WITHDRAWN,
              licenseExpiresAt: null,
            },
          } as LibraryItem,
        ]);
      libraryService.restore = jest
        .fn()
        .mockImplementation((item: LibraryItem) => Promise.resolve(item));
    });

    it('기록을 되살리고 넘긴 항목 중 노출 중인 내 그 시리즈 편만 편 복구 규칙으로 되살린다', async () => {
      // when
      const result = await orchestrator.restoreSeries(
        USER_ID,
        SERIES_ID,
        ['item-1', 'item-3', 'item-1'],
        NOW,
      );

      // then
      expect(result).toEqual({
        seriesId: SERIES_ID,
        restoredItemIds: ['item-1'],
        isSaved: true,
      });
      expect(librarySeriesService.restoreFollow).toHaveBeenCalledWith(
        USER_ID,
        SERIES_ID,
        manager,
      );
      // 중복 id 는 한 번만 묻는다
      expect(
        libraryService.findOwnedItemsInSeriesWithDeleted,
      ).toHaveBeenCalledWith(USER_ID, SERIES_ID, ['item-1', 'item-3'], manager);
      expect(libraryService.restore).toHaveBeenCalledTimes(1);
    });
  });
});
