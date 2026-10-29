import { ErrorCode } from '@/common/exceptions/error-code.enum';
import { toPreviousFinalMonthStart } from '@/common/utils/service-date.util';
import { UserMarket } from '@/modules/user/user.enum';

import { ContentService } from './content.service';
import { ContentLengthProfile, ContentStatus } from '../content.enum';
import { Content } from '../entities/content.entity';
import { ContentRepository } from '../repositories/content.repository';
import { ContentEmbeddingRepository } from '../repositories/content-embedding.repository';
import { ContentAudioRenditionRepository } from '../repositories/content-audio-rendition.repository';
import { ContentScriptRepository } from '../repositories/content-script.repository';
import { ContentSourceRepository } from '../repositories/content-source.repository';
import { ContentTopicRepository } from '../repositories/content-topic.repository';

const NOW = new Date('2026-09-09T05:00:00.000Z');
const CONTENT_ID = '33333333-3333-4333-8333-333333333333';

function buildContent(overrides: Partial<Content> = {}): Content {
  return {
    id: CONTENT_ID,
    status: ContentStatus.PUBLISHED,
    licenseExpiresAt: null,
    contentVersion: 1,
    market: UserMarket.KR,
    ...overrides,
  } as Content;
}

describe('ContentService', () => {
  let service: ContentService;
  let contentRepository: jest.Mocked<ContentRepository>;

  beforeEach(() => {
    contentRepository = {
      findById: jest.fn(),
      findVisibleById: jest.fn(),
      findRelated: jest.fn().mockResolvedValue([]),
      expireLicensed: jest.fn().mockResolvedValue(0),
      findWithdrawnSince: jest.fn().mockResolvedValue([]),
      findVisibleSeriesEpisodesForUser: jest.fn().mockResolvedValue([]),
      findSearchPage: jest.fn().mockResolvedValue([]),
      findHybridSearchPage: jest
        .fn()
        .mockResolvedValue({ items: [], keywordMatched: false }),
    } as unknown as jest.Mocked<ContentRepository>;

    service = new ContentService(
      contentRepository,
      {} as ContentTopicRepository,
      {} as ContentSourceRepository,
      {} as ContentEmbeddingRepository,
      {} as ContentScriptRepository,
      {} as ContentAudioRenditionRepository,
    );
  });

  describe('findSeriesEpisodeStates — 드립 다음 편 판정 입력(KAN-134 규칙 ②′)', () => {
    it('시리즈별로 묶고 중복 id는 한 번만 묻는다 — 순서는 저장소의 편 번호순 그대로', async () => {
      // given
      contentRepository.findVisibleSeriesEpisodesForUser.mockResolvedValue([
        {
          seriesId: 's1',
          contentId: 'c1',
          episodeNo: 1,
          received: true,
          held: false,
          excluded: false,
        },
        {
          seriesId: 's1',
          contentId: 'c3',
          episodeNo: 3,
          received: false,
          held: false,
          excluded: true,
        },
        {
          seriesId: 's2',
          contentId: 'c2',
          episodeNo: 2,
          received: true,
          held: true,
          excluded: false,
        },
      ]);

      // when
      const result = await service.findSeriesEpisodeStates(
        ['s1', 's2', 's1'],
        'u1',
        NOW,
        UserMarket.KR,
      );

      // then
      expect(
        contentRepository.findVisibleSeriesEpisodesForUser,
      ).toHaveBeenCalledWith(['s1', 's2'], 'u1', NOW, UserMarket.KR, undefined);
      expect(result.get('s1')).toEqual([
        {
          contentId: 'c1',
          episodeNo: 1,
          received: true,
          held: false,
          excluded: false,
        },
        {
          contentId: 'c3',
          episodeNo: 3,
          received: false,
          held: false,
          excluded: true,
        },
      ]);
      expect(result.get('s2')?.[0]).toMatchObject({ episodeNo: 2, held: true });
    });
  });

  describe('findRelatedContents — 관련 콘텐츠(KAN-240, player-api.md 4.8)', () => {
    const query = {
      baseContentId: CONTENT_ID,
      market: UserMarket.KR,
      lengthProfile: ContentLengthProfile.STANDARD,
      excludeIds: ['44444444-4444-4444-8444-444444444444'],
      limit: 5,
      now: NOW,
    };

    it('기준 편이 보이면 같은 조건으로 코사인 조회를 넘긴다', async () => {
      // given
      const related = [buildContent({ id: 'r1' })];
      contentRepository.findVisibleById.mockResolvedValue(buildContent());
      contentRepository.findRelated.mockResolvedValue(related);

      // when
      const result = await service.findRelatedContents(query);

      // then
      expect(contentRepository.findVisibleById).toHaveBeenCalledWith(
        CONTENT_ID,
        NOW,
        UserMarket.KR,
        undefined,
      );
      expect(contentRepository.findRelated).toHaveBeenCalledWith(
        query,
        undefined,
      );
      expect(result).toBe(related);
    });

    it('기준 편이 보이지 않으면(없음·다른 시장·회수·만료) 404 CONTENT_NOT_FOUND — 회수를 403으로 가르지 않는다', async () => {
      // given
      contentRepository.findVisibleById.mockResolvedValue(null);

      // when
      const finding = service.findRelatedContents(query);

      // then
      await expect(finding).rejects.toMatchObject({
        errorCode: ErrorCode.CONTENT_NOT_FOUND,
      });
      expect(contentRepository.findRelated).not.toHaveBeenCalled();
    });
  });

  describe('getPublishedById', () => {
    it('발행 상태이고 만료일이 남아 있으면 그대로 돌려준다', async () => {
      // given
      contentRepository.findById.mockResolvedValue(
        buildContent({
          licenseExpiresAt: new Date(NOW.getTime() + 86_400_000),
        }),
      );

      // when
      const content = await service.getPublishedById(
        CONTENT_ID,
        undefined,
        NOW,
      );

      // then
      expect(content.id).toBe(CONTENT_ID);
    });

    it('발행 상태여도 라이선스 만료일이 지났으면 회수와 같은 코드로 막는다 — FR-33', async () => {
      // given — 만료 배치(하루 1회)가 돌기 전 구간이다
      contentRepository.findById.mockResolvedValue(
        buildContent({ licenseExpiresAt: new Date(NOW.getTime() - 1000) }),
      );

      // when
      const getting = service.getPublishedById(CONTENT_ID, undefined, NOW);

      // then
      await expect(getting).rejects.toMatchObject({
        errorCode: ErrorCode.CONTENT_WITHDRAWN,
      });
    });

    it('회수·만료 상태는 막는다', async () => {
      // given
      contentRepository.findById.mockResolvedValue(
        buildContent({ status: ContentStatus.EXPIRED }),
      );

      // when
      const getting = service.getPublishedById(CONTENT_ID, undefined, NOW);

      // then
      await expect(getting).rejects.toMatchObject({
        errorCode: ErrorCode.CONTENT_WITHDRAWN,
      });
    });

    it('없는 콘텐츠는 찾을 수 없음이다 — 회수와 다른 코드로 가른다', async () => {
      // given
      contentRepository.findById.mockResolvedValue(null);

      // when
      const getting = service.getPublishedById(CONTENT_ID, undefined, NOW);

      // then
      await expect(getting).rejects.toMatchObject({
        errorCode: ErrorCode.CONTENT_NOT_FOUND,
      });
    });
  });

  describe('resolvePickTargets', () => {
    it('발행 상태여도 라이선스 만료일이 지난 콘텐츠는 담기 대상에서 빼고 회수 코드로 알린다', async () => {
      // given — 만료 배치(04:10)가 돌기 전, 재생·탐색 담기가 이미 막는 구간이다
      const expired = buildContent({
        id: CONTENT_ID,
        licenseExpiresAt: new Date(NOW.getTime() - 1000),
      });
      contentRepository.findAllByIds = jest.fn().mockResolvedValue([expired]);

      // when
      const resolution = await service.resolvePickTargets(
        [CONTENT_ID],
        NOW,
        UserMarket.KR,
      );

      // then — 다른 담기 경로(getPublishedById)와 같은 노출 조건이다
      expect(resolution.available).toEqual([]);
      expect(resolution.failed).toEqual([
        { contentId: CONTENT_ID, errorCode: ErrorCode.CONTENT_WITHDRAWN },
      ]);
    });

    it('만료일이 남은 발행 콘텐츠는 담기 대상이다', async () => {
      // given
      contentRepository.findAllByIds = jest.fn().mockResolvedValue([
        buildContent({
          licenseExpiresAt: new Date(NOW.getTime() + 86_400_000),
        }),
      ]);

      // when
      const resolution = await service.resolvePickTargets(
        [CONTENT_ID],
        NOW,
        UserMarket.KR,
      );

      // then
      expect(resolution.available.map((content) => content.id)).toEqual([
        CONTENT_ID,
      ]);
      expect(resolution.failed).toEqual([]);
    });
    it('다른 시장의 콘텐츠는 없는 콘텐츠와 같은 코드로 빼고 담지 않는다', async () => {
      // given — KR 콘텐츠를 GLOBAL 사용자가 담으려 한다
      contentRepository.findAllByIds = jest
        .fn()
        .mockResolvedValue([buildContent({ market: UserMarket.KR })]);

      // when
      const resolution = await service.resolvePickTargets(
        [CONTENT_ID],
        NOW,
        UserMarket.GLOBAL,
      );

      // then
      expect(resolution.available).toEqual([]);
      expect(resolution.failed).toEqual([
        { contentId: CONTENT_ID, errorCode: ErrorCode.CONTENT_NOT_FOUND },
      ]);
    });
  });

  describe('findHybridSearchPage — 질의 벡터가 없으면 종전 키워드 검색에 맡긴다(KAN-242)', () => {
    const OTHER_ID = '44444444-4444-4444-8444-444444444444';
    const PUBLISHED_AT = new Date('2026-09-01T00:00:00.000Z');
    const base = {
      market: UserMarket.KR,
      lengthProfile: ContentLengthProfile.STANDARD,
      normalizedQuery: '커리어',
      topicIds: ['t1'],
      limit: 1,
      now: NOW,
    };
    const keywordRow = (id: string, score: number) => ({
      content: buildContent({ id, publishedAt: PUBLISHED_AT }),
      score,
      titleSimilarity: 0.25,
      playCount: 3,
    });

    it('첫 페이지 — 종전 키워드 쿼리를 같은 입력으로 부르고 행을 키워드 순서 커서 위치·matchedBy keyword로 옮긴다', async () => {
      // given — limit + 1건이면 다음 페이지가 있다
      contentRepository.findSearchPage.mockResolvedValue([
        keywordRow(CONTENT_ID, 16),
        keywordRow(OTHER_ID, 8),
      ]);

      // when
      const page = await service.findHybridSearchPage({
        ...base,
        queryVector: null,
        matchSeriesTitle: true,
        seriesAnchorsOnly: true,
        cursor: null,
      });

      // then
      expect(contentRepository.findSearchPage).toHaveBeenCalledWith(
        {
          market: UserMarket.KR,
          lengthProfile: ContentLengthProfile.STANDARD,
          normalizedQuery: '커리어',
          tagOnly: false,
          matchSeriesTitle: true,
          seriesAnchorsOnly: true,
          topicIds: ['t1'],
          cursor: null,
          limit: 1,
          now: NOW,
        },
        toPreviousFinalMonthStart(NOW),
        undefined,
      );
      expect(contentRepository.findHybridSearchPage).not.toHaveBeenCalled();
      expect(page).toEqual({
        items: [
          {
            content: expect.objectContaining({ id: CONTENT_ID }) as Content,
            position: {
              order: 'keyword',
              score: 16,
              titleSimilarity: 0.25,
              playCount: 3,
              publishedAt: PUBLISHED_AT,
              id: CONTENT_ID,
            },
            matchedBy: ['keyword'],
          },
        ],
        hasNext: true,
        keywordMatched: true,
      });
    });

    it('첫 페이지가 비면 keywordMatched 거짓 — 교정어 탐색의 조건이다', async () => {
      // when
      const page = await service.findHybridSearchPage({
        ...base,
        queryVector: null,
        cursor: null,
      });

      // then
      expect(page).toEqual({
        items: [],
        hasNext: false,
        keywordMatched: false,
      });
    });

    it('키워드 순서 커서는 종전 키셋 다섯 키 그대로 넘기고, 빈 페이지여도 keywordMatched 참이다(목록의 끝)', async () => {
      // when
      const page = await service.findHybridSearchPage({
        ...base,
        queryVector: null,
        cursor: {
          order: 'keyword',
          score: 16,
          titleSimilarity: 0.25,
          playCount: 3,
          publishedAt: PUBLISHED_AT,
          id: CONTENT_ID,
        },
      });

      // then
      expect(contentRepository.findSearchPage).toHaveBeenCalledWith(
        expect.objectContaining({
          cursor: {
            score: 16,
            titleSimilarity: 0.25,
            playCount: 3,
            publishedAt: PUBLISHED_AT,
            id: CONTENT_ID,
          },
        }),
        toPreviousFinalMonthStart(NOW),
        undefined,
      );
      expect(page.keywordMatched).toBe(true);
    });

    it('RRF 커서(첫 페이지는 의미 엔진을 썼고 지금 결손)는 RRF 쿼리로 잇는다 — 페이지 중간에 정렬을 바꾸지 않는다', async () => {
      // given
      const cursor = {
        order: 'rrf' as const,
        rrf: 1 / 61,
        playCount: 3,
        publishedAt: PUBLISHED_AT,
        id: CONTENT_ID,
      };

      // when
      await service.findHybridSearchPage({
        ...base,
        queryVector: null,
        cursor,
      });

      // then
      expect(contentRepository.findSearchPage).not.toHaveBeenCalled();
      expect(contentRepository.findHybridSearchPage).toHaveBeenCalledWith(
        expect.objectContaining({ queryVector: null, cursor }),
        toPreviousFinalMonthStart(NOW),
        undefined,
      );
    });

    it('질의 벡터가 있으면 RRF 쿼리다', async () => {
      // when
      await service.findHybridSearchPage({
        ...base,
        queryVector: [0.1, 0.2],
        cursor: null,
      });

      // then
      expect(contentRepository.findSearchPage).not.toHaveBeenCalled();
      expect(contentRepository.findHybridSearchPage).toHaveBeenCalledWith(
        expect.objectContaining({ queryVector: [0.1, 0.2], cursor: null }),
        toPreviousFinalMonthStart(NOW),
        undefined,
      );
    });

    it('키워드 순서 커서에 질의 벡터가 함께 오면 조회하지 않고 실패한다 — 커서 디코더가 막는 조합이다', async () => {
      // when
      const run = service.findHybridSearchPage({
        ...base,
        queryVector: [0.1, 0.2],
        cursor: {
          order: 'keyword',
          score: 16,
          titleSimilarity: 0.25,
          playCount: 3,
          publishedAt: PUBLISHED_AT,
          id: CONTENT_ID,
        },
      });

      // then
      await expect(run).rejects.toThrow();
      expect(contentRepository.findSearchPage).not.toHaveBeenCalled();
      expect(contentRepository.findHybridSearchPage).not.toHaveBeenCalled();
    });
  });

  describe('findWithdrawnSince', () => {
    const SINCE = new Date('2026-09-01T00:00:00.000Z');
    const T1 = new Date('2026-09-02T00:00:00.000Z');
    const T2 = new Date('2026-09-03T00:00:00.000Z');

    function rows(spec: [string, Date][]): { id: string; withdrawnAt: Date }[] {
      return spec.map(([id, withdrawnAt]) => ({ id, withdrawnAt }));
    }

    it('상한 안이면 전부 돌려주고 커서를 발급하지 않는다', async () => {
      // given
      contentRepository.findWithdrawnSince.mockResolvedValue(
        rows([
          ['a', T1],
          ['b', T2],
        ]),
      );

      // when
      const page = await service.findWithdrawnSince(SINCE);

      // then
      expect(page).toEqual({ contentIds: ['a', 'b'], nextSince: null });
    });

    it('상한 경계에 같은 회수 시각이 걸치면 그 시각의 행을 통째로 다음 페이지로 넘긴다', async () => {
      // given — 상한(200) 바로 앞뒤가 같은 시각(일괄 회수)이다
      const before = Array.from({ length: 198 }, (_, index): [string, Date] => [
        `early-${index}`,
        T1,
      ]);
      contentRepository.findWithdrawnSince.mockResolvedValue(
        rows([...before, ['bulk-1', T2], ['bulk-2', T2], ['bulk-3', T2]]),
      );

      // when
      const page = await service.findWithdrawnSince(SINCE);

      // then — 경계 시각(T2)의 행은 하나도 내보내지 않고 커서는 그 앞 시각이다
      expect(page.contentIds).toHaveLength(198);
      expect(page.contentIds).not.toContain('bulk-1');
      expect(page.nextSince).toBe(T1.toISOString());
    });

    it('한 시각이 상한을 넘게 회수된 극단에서는 자를 자리가 없어 상한만큼 내보낸다', async () => {
      // given
      contentRepository.findWithdrawnSince.mockResolvedValue(
        rows(
          Array.from({ length: 201 }, (_, index): [string, Date] => [
            `bulk-${index}`,
            T2,
          ]),
        ),
      );

      // when
      const page = await service.findWithdrawnSince(SINCE);

      // then
      expect(page.contentIds).toHaveLength(200);
      expect(page.nextSince).toBe(T2.toISOString());
    });
  });

  describe('expireLicensed', () => {
    it('전환된 content_id 목록을 그대로 돌려준다', async () => {
      // given — 라이브러리 잔존분을 지우려면 어느 콘텐츠가 만료됐는지 알아야 한다
      // (partner-control.md 4.4 — 회수와 동일 처리, 확정 2026-09-10)
      const expiredIds = ['content-1', 'content-2', 'content-3'];
      contentRepository.expireLicensed.mockResolvedValue(expiredIds);

      // when
      const ids = await service.expireLicensed(NOW);

      // then
      expect(ids).toEqual(expiredIds);
      expect(contentRepository.expireLicensed).toHaveBeenCalledWith(
        NOW,
        undefined,
      );
    });
  });
});

describe('ContentService.republish — content_version(KAN-236)', () => {
  const manager = {} as never;
  let contentRepository: jest.Mocked<ContentRepository>;
  let service: ContentService;

  beforeEach(() => {
    contentRepository = {
      saveAll: jest.fn((contents: Content[]) => Promise.resolve(contents)),
    } as unknown as jest.Mocked<ContentRepository>;

    service = new ContentService(
      contentRepository,
      {} as ContentTopicRepository,
      {} as ContentSourceRepository,
      {} as ContentEmbeddingRepository,
      {} as ContentScriptRepository,
      {} as ContentAudioRenditionRepository,
    );
  });

  it('오디오 없이 썸네일만 바꾸면 버전을 올리지 않는다 — 임베딩도 현재 버전과 일치한 채 남는다', async () => {
    const saved = await service.republish(
      buildContent({ contentVersion: 3 }),
      { thumbnailUrl: 'https://cdn.example/thumb.webp' },
      manager,
    );

    expect(saved.contentVersion).toBe(3);
    expect(saved.thumbnailUrl).toBe('https://cdn.example/thumb.webp');
  });

  it('제목만 바꿔도 버전을 올리지 않는다', async () => {
    const saved = await service.republish(
      buildContent({ contentVersion: 3 }),
      { title: '새 제목' },
      manager,
    );

    expect(saved.contentVersion).toBe(3);
  });

  it('오디오를 바꾸면 버전을 1 올린다 — 대본·임베딩이 바뀌었을 수 있다', async () => {
    const saved = await service.republish(
      buildContent({ contentVersion: 3 }),
      { audioPath: 'contents/new.m4a', durationSec: 600 },
      manager,
    );

    expect(saved.contentVersion).toBe(4);
  });
});
