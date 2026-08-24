import { BusinessForbiddenException } from '@/common/exceptions/business-forbidden.exception';
import { BusinessException } from '@/common/exceptions/business.exception';
import { ErrorCode } from '@/common/exceptions/error-code.enum';
import { ContentOrigin, ContentStatus } from '@/modules/content/content.enum';
import { ContentSource } from '@/modules/content/entities/content-source.entity';
import { Content } from '@/modules/content/entities/content.entity';
import { ContentService } from '@/modules/content/services/content.service';
import { LibraryItem } from '@/modules/library/library-item.entity';
import {
  LibraryItemSource,
  LibraryItemStatus,
} from '@/modules/library/library.enum';
import { LibraryService } from '@/modules/library/library.service';
import { PlaybackService } from '@/modules/playback/services/playback.service';

import { ContentDetailOrchestrator } from './content-detail.orchestrator';

const NOW = new Date('2026-08-24T09:00:00.000Z');
const USER_ID = '11111111-1111-4111-8111-111111111111';
const CONTENT_ID = 'aaaaaaaa-1111-4111-8111-111111111111';
const TOPIC_ID = 'cccccccc-1111-4111-8111-111111111111';

function buildContent(overrides: Partial<Content> = {}): Content {
  return {
    id: CONTENT_ID,
    title: '몰입을 부르는 환경 설계',
    description: '딥 워크의 핵심 조건을 오디오로 정리했습니다.',
    authorName: '오세영',
    sourceName: '이어 오리지널',
    sourceUrl: 'https://example.com/mock/1',
    origin: ContentOrigin.AI_GENERATED,
    seriesId: null,
    episodeNo: null,
    totalEpisodes: null,
    durationSec: 861,
    thumbnailUrl: 'https://example.com/thumb.png',
    contentVersion: 1,
    status: ContentStatus.PUBLISHED,
    publishedAt: new Date('2026-08-21T05:00:00.000Z'),
    ...overrides,
  } as Content;
}

function buildSource(position: number): ContentSource {
  return {
    id: `source-${position}`,
    contentId: CONTENT_ID,
    position,
    title: `소스 ${position}`,
    author: null,
    url: null,
  } as ContentSource;
}

function buildLibraryItem(): LibraryItem {
  return {
    id: 'item-1',
    userId: USER_ID,
    contentId: CONTENT_ID,
    source: LibraryItemSource.SAVE,
    status: LibraryItemStatus.IN_PROGRESS,
    deletedAt: null,
  } as LibraryItem;
}

async function catchError(
  promise: Promise<unknown>,
): Promise<BusinessException> {
  try {
    await promise;
  } catch (error) {
    return error as BusinessException;
  }

  throw new Error('예외가 발생하지 않았다');
}

describe('ContentDetailOrchestrator', () => {
  let orchestrator: ContentDetailOrchestrator;
  let contentService: jest.Mocked<ContentService>;
  let libraryService: jest.Mocked<LibraryService>;
  let playbackService: jest.Mocked<PlaybackService>;

  beforeEach(() => {
    contentService = {
      getPublishedById: jest.fn().mockResolvedValue(buildContent()),
      findTopicViews: jest.fn().mockResolvedValue([]),
      findSourcesByContentId: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<ContentService>;

    libraryService = {
      findActiveItems: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<LibraryService>;

    playbackService = {
      findCountedContentIds: jest.fn().mockResolvedValue(new Set<string>()),
    } as unknown as jest.Mocked<PlaybackService>;

    orchestrator = new ContentDetailOrchestrator(
      contentService,
      libraryService,
      playbackService,
    );
  });

  describe('getContentDetail', () => {
    it('ai_generated면 content_sources 목록을 서버가 정한 순서 그대로 담는다', async () => {
      // given — 순서는 position이 소유하고 응답 조립은 재정렬하지 않는다 (domain.md 5.5)
      const sources = [buildSource(1), buildSource(2), buildSource(3)];
      contentService.findSourcesByContentId.mockResolvedValue(sources);

      // when
      const result = await orchestrator.getContentDetail(
        USER_ID,
        CONTENT_ID,
        NOW,
      );

      // then
      expect(result.sources).toEqual(sources);
      expect(contentService.findSourcesByContentId).toHaveBeenCalledWith(
        CONTENT_ID,
      );
    });

    it('partner면 소스를 조회하지 않고 sources가 null이다', async () => {
      // given — partner는 content_sources에 행이 없다 (확정 2026-08-24)
      contentService.getPublishedById.mockResolvedValue(
        buildContent({ origin: ContentOrigin.PARTNER }),
      );

      // when
      const result = await orchestrator.getContentDetail(
        USER_ID,
        CONTENT_ID,
        NOW,
      );

      // then
      expect(result.sources).toBeNull();
      expect(contentService.findSourcesByContentId).not.toHaveBeenCalled();
    });

    it('담기지 않은 콘텐츠면 libraryItem이 null이다', async () => {
      // given — null 하나로 [담기]/[삭제]를 가른다 (content-detail.md 4.4)

      // when
      const result = await orchestrator.getContentDetail(
        USER_ID,
        CONTENT_ID,
        NOW,
      );

      // then
      expect(result.libraryItem).toBeNull();
    });

    it('담긴 콘텐츠면 살아 있는 라이브러리 행을 담는다', async () => {
      // given
      const item = buildLibraryItem();
      libraryService.findActiveItems.mockResolvedValue([item]);

      // when
      const result = await orchestrator.getContentDetail(
        USER_ID,
        CONTENT_ID,
        NOW,
      );

      // then
      expect(result.libraryItem).toEqual(item);
      expect(libraryService.findActiveItems).toHaveBeenCalledWith(USER_ID, [
        CONTENT_ID,
      ]);
    });

    it('재청취 창 안이면 isCountedToday가 true다', async () => {
      // given — 목록 행과 같은 조립 경로를 쓴다 (paywall.md 4.3-1)
      playbackService.findCountedContentIds.mockResolvedValue(
        new Set([CONTENT_ID]),
      );

      // when
      const result = await orchestrator.getContentDetail(
        USER_ID,
        CONTENT_ID,
        NOW,
      );

      // then
      expect(result.isCountedToday).toBe(true);
    });

    it('주제를 {id, name} 객체로 매핑해 담는다', async () => {
      // given
      contentService.findTopicViews.mockResolvedValue([
        { contentId: CONTENT_ID, topicId: TOPIC_ID, name: '생산성' },
      ]);

      // when
      const result = await orchestrator.getContentDetail(
        USER_ID,
        CONTENT_ID,
        NOW,
      );

      // then
      expect(result.topics).toEqual([{ id: TOPIC_ID, name: '생산성' }]);
    });

    it('회수된 콘텐츠면 CONTENT_WITHDRAWN 예외가 그대로 전파되고 개인화 값을 조회하지 않는다', async () => {
      // given — 상세도 노출면이라 진입 시점의 status를 확인한다 (content-detail.md 4.1)
      contentService.getPublishedById.mockRejectedValue(
        new BusinessForbiddenException({
          errorCode: ErrorCode.CONTENT_WITHDRAWN,
          message: '제공이 종료된 콘텐츠예요',
        }),
      );

      // when
      const error = await catchError(
        orchestrator.getContentDetail(USER_ID, CONTENT_ID, NOW),
      );

      // then
      expect(error.errorCode).toBe(ErrorCode.CONTENT_WITHDRAWN);
      expect(libraryService.findActiveItems).not.toHaveBeenCalled();
      expect(playbackService.findCountedContentIds).not.toHaveBeenCalled();
    });
  });
});
