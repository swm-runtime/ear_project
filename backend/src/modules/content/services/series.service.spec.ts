import { EntityManager } from 'typeorm';

import { ErrorCode } from '@/common/exceptions/error-code.enum';
import { UserMarket } from '@/modules/user/user.enum';

import { SeriesStatus } from '../content.enum';
import { Content } from '../entities/content.entity';
import { Series } from '../entities/series.entity';
import { ContentRepository } from '../repositories/content.repository';
import { ContentTopicRepository } from '../repositories/content-topic.repository';
import { SeriesRepository } from '../repositories/series.repository';
import {
  SeriesService,
  assertTotalNotBelowPublished,
  resolveSeriesCover,
} from './series.service';

const NOW = new Date('2026-10-17T05:00:00.000Z');
const SERIES_ID = '55555555-5555-4555-8555-555555555555';
const OTHER_SERIES_ID = '66666666-6666-4666-8666-666666666666';

function buildSeries(overrides: Partial<Series> = {}): Series {
  return {
    id: SERIES_ID,
    title: '키워드로 빠르게 배우는 CS 지식',
    description: '소개',
    totalEpisodes: 3,
    status: SeriesStatus.ONGOING,
    coverUrl: null,
    publisherName: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function buildEpisode(
  id: string,
  seriesId: string | null,
  episodeNo: number | null,
): Pick<Content, 'id' | 'seriesId' | 'episodeNo'> {
  return { id, seriesId, episodeNo };
}

describe('SeriesService', () => {
  let service: SeriesService;
  let seriesRepository: jest.Mocked<SeriesRepository>;
  let contentRepository: jest.Mocked<ContentRepository>;
  let contentTopicRepository: jest.Mocked<ContentTopicRepository>;
  const manager = {} as EntityManager;

  beforeEach(() => {
    seriesRepository = {
      findById: jest.fn().mockResolvedValue(buildSeries()),
      findByIdForUpdate: jest.fn().mockResolvedValue(buildSeries()),
      findAllByIds: jest.fn().mockResolvedValue([buildSeries()]),
      findAll: jest.fn().mockResolvedValue([buildSeries()]),
      save: jest.fn((series: Series) => Promise.resolve(series)),
      create: jest.fn((series: Partial<Series>) => series as Series),
    } as unknown as jest.Mocked<SeriesRepository>;
    contentRepository = {
      existsPublishedEpisode: jest.fn().mockResolvedValue(false),
      findMarketsBySeriesId: jest.fn().mockResolvedValue([]),
      countEpisodesBySeries: jest.fn().mockResolvedValue([]),
      findVisibleBySeriesId: jest.fn().mockResolvedValue([]),
      findVisibleBySeriesIds: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<ContentRepository>;

    contentTopicRepository = {
      findViewsByContentIds: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<ContentTopicRepository>;

    service = new SeriesService(
      seriesRepository,
      contentRepository,
      contentTopicRepository,
    );
  });

  describe('assertEpisodeUploadable — 업로드 검증(admin-api.md 4.6)', () => {
    const upload = (overrides = {}) => ({
      seriesId: SERIES_ID,
      episodeNo: 2,
      totalEpisodes: 3,
      market: UserMarket.KR,
      ...overrides,
    });

    it('시리즈가 있고 총 편수가 같고 번호가 범위 안이며 중복이 없으면 통과한다', async () => {
      // when
      const series = await service.assertEpisodeUploadable(upload());

      // then
      expect(series.id).toBe(SERIES_ID);
      // 사전 확인(트랜잭션 밖)은 잠그지 않는다
      expect(seriesRepository.findById).toHaveBeenCalledWith(SERIES_ID);
      expect(seriesRepository.findByIdForUpdate).not.toHaveBeenCalled();
    });

    it('트랜잭션 안에서는 시리즈 행을 잠그고 본다', async () => {
      // when
      await service.assertEpisodeUploadable(upload(), manager);

      // then
      expect(seriesRepository.findByIdForUpdate).toHaveBeenCalledWith(
        SERIES_ID,
        manager,
      );
      expect(contentRepository.existsPublishedEpisode).toHaveBeenCalledWith(
        SERIES_ID,
        2,
        null,
        manager,
      );
    });

    it('없는 시리즈면 400(series_id)이다', async () => {
      // given
      seriesRepository.findById.mockResolvedValue(null);

      // when
      const act = service.assertEpisodeUploadable(upload());

      // then
      await expect(act).rejects.toMatchObject({
        errorCode: ErrorCode.VALIDATION_FAILED,
        details: { field: 'series_id' },
      });
    });

    it('총 편수가 시리즈 편수와 다르면 400(total_episodes)이다 — 3편 시리즈에 4로 올리면 거부', async () => {
      // when
      const act = service.assertEpisodeUploadable(
        upload({ totalEpisodes: 4, episodeNo: 4 }),
      );

      // then
      await expect(act).rejects.toMatchObject({
        errorCode: ErrorCode.VALIDATION_FAILED,
        details: { field: 'total_episodes' },
      });
    });

    it.each([0, 4])(
      '편 번호 %i는 1~총 편수 밖이라 400(episode_no)이다',
      async (episodeNo) => {
        // when
        const act = service.assertEpisodeUploadable(upload({ episodeNo }));

        // then
        await expect(act).rejects.toMatchObject({
          errorCode: ErrorCode.VALIDATION_FAILED,
          details: { field: 'episode_no' },
        });
      },
    );

    it('같은 번호로 발행 중인 편이 있으면 400(episode_no)이다', async () => {
      // given
      contentRepository.existsPublishedEpisode.mockResolvedValue(true);

      // when
      const act = service.assertEpisodeUploadable(upload());

      // then
      await expect(act).rejects.toMatchObject({
        errorCode: ErrorCode.VALIDATION_FAILED,
        details: { field: 'episode_no' },
      });
    });

    it('시리즈에 다른 시장의 편이 있으면 400(series_id)이다 — 격리가 새지 않게', async () => {
      // given
      contentRepository.findMarketsBySeriesId.mockResolvedValue([
        UserMarket.GLOBAL,
      ]);

      // when
      const act = service.assertEpisodeUploadable(upload());

      // then
      await expect(act).rejects.toMatchObject({
        errorCode: ErrorCode.VALIDATION_FAILED,
        details: { field: 'series_id' },
      });
    });

    it('같은 시장의 편만 있으면 통과한다', async () => {
      // given
      contentRepository.findMarketsBySeriesId.mockResolvedValue([
        UserMarket.KR,
      ]);

      // when / then
      await expect(
        service.assertEpisodeUploadable(upload()),
      ).resolves.toBeDefined();
    });
  });

  describe('update — 총 편수 하한', () => {
    it('발행 중 최대 번호보다 작게 줄이면 400(total_episodes)이다', async () => {
      // given
      contentRepository.countEpisodesBySeries.mockResolvedValue([
        {
          seriesId: SERIES_ID,
          published: 3,
          withdrawn: 0,
          expired: 0,
          maxPublishedEpisodeNo: 3,
        },
      ]);

      // when
      const act = service.update(buildSeries(), { totalEpisodes: 2 }, manager);

      // then
      await expect(act).rejects.toMatchObject({
        errorCode: ErrorCode.VALIDATION_FAILED,
        details: { field: 'total_episodes' },
      });
      expect(seriesRepository.save).not.toHaveBeenCalled();
    });

    it('최대 번호와 같게 줄이거나 늘리는 것은 된다', async () => {
      // given
      contentRepository.countEpisodesBySeries.mockResolvedValue([
        {
          seriesId: SERIES_ID,
          published: 2,
          withdrawn: 1,
          expired: 0,
          maxPublishedEpisodeNo: 2,
        },
      ]);

      // when
      const shrunk = await service.update(
        buildSeries({ totalEpisodes: 5 }),
        { totalEpisodes: 2 },
        manager,
      );
      const grown = await service.update(
        buildSeries(),
        { totalEpisodes: 20 },
        manager,
      );

      // then
      expect(shrunk.totalEpisodes).toBe(2);
      expect(grown.totalEpisodes).toBe(20);
    });

    it('담긴 키만 바꾸고, 편수를 안 보내면 편 현황을 읽지 않는다', async () => {
      // when
      const updated = await service.update(
        buildSeries(),
        { status: SeriesStatus.COMPLETED, title: '새 제목' },
        manager,
      );

      // then
      expect(updated).toMatchObject({
        status: SeriesStatus.COMPLETED,
        title: '새 제목',
        totalEpisodes: 3,
        description: '소개',
      });
      expect(contentRepository.countEpisodesBySeries).not.toHaveBeenCalled();
    });

    it('발행 이름은 넣을 수 있고 null 이면 지우며, 안 보내면 그대로다', async () => {
      // when
      const named = await service.update(
        buildSeries(),
        { publisherName: '키워드' },
        manager,
      );
      const untouched = await service.update(
        buildSeries({ publisherName: '키워드' }),
        { title: '새 제목' },
        manager,
      );
      const cleared = await service.update(
        buildSeries({ publisherName: '키워드' }),
        { publisherName: null },
        manager,
      );

      // then
      expect(named.publisherName).toBe('키워드');
      expect(untouched.publisherName).toBe('키워드');
      expect(cleared.publisherName).toBeNull();
    });
  });

  describe('assertTotalNotBelowPublished', () => {
    it('발행된 편이 없으면 어떤 값이든 통과한다', () => {
      expect(() => assertTotalNotBelowPublished(1, null)).not.toThrow();
    });

    it('회수된 큰 번호는 하한에 들어가지 않는다 — 발행 중 최대값만 본다', () => {
      // 발행 중 최대 2(3화는 회수됨) → 2로 줄이는 것은 된다
      expect(() => assertTotalNotBelowPublished(2, 2)).not.toThrow();
      expect(() => assertTotalNotBelowPublished(1, 2)).toThrow();
    });
  });

  describe('findRefs — 응답의 series 객체', () => {
    it('시리즈 편에는 시리즈 표의 제목·총 편수를 싣고 단일 콘텐츠는 맵에 없다', async () => {
      // given — 편 사본(total_episodes)이 아니라 시리즈 표 값이 기준이다
      seriesRepository.findAllByIds.mockResolvedValue([
        buildSeries({ totalEpisodes: 16 }),
      ]);

      // when
      const refs = await service.findRefs([
        buildEpisode('c1', SERIES_ID, 2),
        buildEpisode('c2', null, null),
        buildEpisode('c3', SERIES_ID, 3),
      ]);

      // then
      expect(seriesRepository.findAllByIds).toHaveBeenCalledWith(
        [SERIES_ID],
        undefined,
      );
      expect(refs.get('c1')).toEqual({
        id: SERIES_ID,
        title: '키워드로 빠르게 배우는 CS 지식',
        episodeNo: 2,
        totalEpisodes: 16,
      });
      expect(refs.has('c2')).toBe(false);
      expect(refs.get('c3')?.episodeNo).toBe(3);
    });

    it('시리즈 행을 찾지 못한 편은 맵에 없다(응답 null)', async () => {
      // given
      seriesRepository.findAllByIds.mockResolvedValue([]);

      // when
      const refs = await service.findRefs([
        buildEpisode('c1', OTHER_SERIES_ID, 1),
      ]);

      // then
      expect(refs.size).toBe(0);
    });
  });

  describe('findCards — 탐색 시리즈 카드', () => {
    it('표지는 노출 중인 가장 앞 편, 편 수는 노출 편 수, 주제는 편들의 합집합이다', async () => {
      // given — 1화가 회수돼 2·3화만 노출 중
      contentRepository.findVisibleBySeriesIds.mockResolvedValue([
        { id: 'c2', seriesId: SERIES_ID, thumbnailUrl: 'https://cdn/2.webp' },
        { id: 'c3', seriesId: SERIES_ID, thumbnailUrl: 'https://cdn/3.webp' },
      ] as Content[]);
      contentTopicRepository.findViewsByContentIds.mockResolvedValue([
        { contentId: 'c2', topicId: 't1', name: 'a' },
        { contentId: 'c3', topicId: 't1', name: 'a' },
        { contentId: 'c3', topicId: 't2', name: 'b' },
      ]);

      // when
      const cards = await service.findCards(
        [SERIES_ID, SERIES_ID, OTHER_SERIES_ID],
        NOW,
        UserMarket.KR,
      );

      // then — 노출 편이 없는 시리즈는 맵에 없다
      expect(cards.size).toBe(1);
      expect(cards.get(SERIES_ID)).toMatchObject({
        coverThumbnailUrl: 'https://cdn/2.webp',
        episodeCount: 2,
        topicIds: ['t1', 't2'],
      });
      expect(contentRepository.findVisibleBySeriesIds).toHaveBeenCalledWith(
        [SERIES_ID, OTHER_SERIES_ID],
        NOW,
        UserMarket.KR,
        undefined,
      );
    });

    it('시리즈 표지를 올렸으면 가장 앞 편 썸네일 대신 그것이 표지다(KAN-234)', async () => {
      // given
      seriesRepository.findAllByIds.mockResolvedValue([
        buildSeries({ coverUrl: 'https://cdn/cover.webp' }),
      ]);
      contentRepository.findVisibleBySeriesIds.mockResolvedValue([
        { id: 'c1', seriesId: SERIES_ID, thumbnailUrl: 'https://cdn/1.webp' },
      ] as Content[]);

      // when
      const cards = await service.findCards([SERIES_ID], NOW, UserMarket.KR);

      // then
      expect(cards.get(SERIES_ID)?.coverThumbnailUrl).toBe(
        'https://cdn/cover.webp',
      );
    });
  });

  describe('resolveSeriesCover — 표지 해석(KAN-234)', () => {
    it('올린 표지가 있으면 그것을 쓴다', () => {
      expect(
        resolveSeriesCover(
          { coverUrl: 'https://cdn/cover.webp' },
          'https://cdn/1.webp',
        ),
      ).toBe('https://cdn/cover.webp');
    });

    it('표지가 없거나 빈 문자열이면 가장 앞 편 썸네일이다 — 종전 규칙 그대로', () => {
      expect(resolveSeriesCover({ coverUrl: null }, 'https://cdn/1.webp')).toBe(
        'https://cdn/1.webp',
      );
      expect(resolveSeriesCover({ coverUrl: '' }, 'https://cdn/1.webp')).toBe(
        'https://cdn/1.webp',
      );
    });
  });

  describe('updateCover — 표지 교체', () => {
    it('잠근 행에 새 URL을 넣고 같은 트랜잭션으로 저장한다', async () => {
      // given
      const series = buildSeries();

      // when
      const saved = await service.updateCover(
        series,
        'https://cdn/cover.webp',
        manager,
      );

      // then
      expect(saved.coverUrl).toBe('https://cdn/cover.webp');
      expect(seriesRepository.save).toHaveBeenCalledWith(series, manager);
    });
  });

  describe('getVisibleForUser — 시리즈 화면', () => {
    it('사용자 시장에 노출 중인 편이 없으면 404 — 다른 시장 시리즈는 존재를 드러내지 않는다', async () => {
      // given
      contentRepository.findVisibleBySeriesId.mockResolvedValue([]);

      // when
      const act = service.getVisibleForUser(SERIES_ID, NOW, UserMarket.GLOBAL);

      // then
      await expect(act).rejects.toMatchObject({
        errorCode: ErrorCode.NOT_FOUND,
      });
    });

    it('없는 시리즈는 편을 읽지 않고 404다', async () => {
      // given
      seriesRepository.findById.mockResolvedValue(null);

      // when
      const act = service.getVisibleForUser(SERIES_ID, NOW, UserMarket.KR);

      // then
      await expect(act).rejects.toMatchObject({
        errorCode: ErrorCode.NOT_FOUND,
      });
      expect(contentRepository.findVisibleBySeriesId).not.toHaveBeenCalled();
    });

    it('노출 중인 편을 돌려준다', async () => {
      // given
      const episodes = [{ id: 'c1' }, { id: 'c2' }] as Content[];
      contentRepository.findVisibleBySeriesId.mockResolvedValue(episodes);

      // when
      const result = await service.getVisibleForUser(
        SERIES_ID,
        NOW,
        UserMarket.KR,
      );

      // then
      expect(contentRepository.findVisibleBySeriesId).toHaveBeenCalledWith(
        SERIES_ID,
        NOW,
        UserMarket.KR,
        undefined,
      );
      expect(result.episodes).toBe(episodes);
    });
  });

  describe('assertRestorable — 회수 복구', () => {
    it('단일 콘텐츠는 아무것도 묻지 않고 통과한다', async () => {
      await service.assertRestorable(buildEpisode('c1', null, null), manager);

      expect(seriesRepository.findByIdForUpdate).not.toHaveBeenCalled();
    });

    it('같은 번호가 다른 편으로 발행 중이면 409다', async () => {
      // given
      contentRepository.existsPublishedEpisode.mockResolvedValue(true);

      // when
      const act = service.assertRestorable(
        buildEpisode('c1', SERIES_ID, 2),
        manager,
      );

      // then
      await expect(act).rejects.toMatchObject({
        errorCode: ErrorCode.CONFLICT,
      });
      // 자기 자신은 빼고 센다
      expect(contentRepository.existsPublishedEpisode).toHaveBeenCalledWith(
        SERIES_ID,
        2,
        'c1',
        manager,
      );
    });

    it('시리즈 편수가 그 번호보다 작게 줄었으면 409다', async () => {
      // when
      const act = service.assertRestorable(
        buildEpisode('c1', SERIES_ID, 5),
        manager,
      );

      // then
      await expect(act).rejects.toMatchObject({
        errorCode: ErrorCode.CONFLICT,
      });
    });

    it('번호가 비어 있고 범위 안이면 통과한다', async () => {
      await expect(
        service.assertRestorable(buildEpisode('c1', SERIES_ID, 2), manager),
      ).resolves.toBeUndefined();
    });
  });
});
