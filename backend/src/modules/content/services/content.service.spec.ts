import { ErrorCode } from '@/common/exceptions/error-code.enum';

import { ContentService } from './content.service';
import { ContentStatus } from '../content.enum';
import { Content } from '../entities/content.entity';
import { ContentRepository } from '../repositories/content.repository';
import { ContentEmbeddingRepository } from '../repositories/content-embedding.repository';
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
    ...overrides,
  } as Content;
}

describe('ContentService', () => {
  let service: ContentService;
  let contentRepository: jest.Mocked<ContentRepository>;

  beforeEach(() => {
    contentRepository = {
      findById: jest.fn(),
      expireLicensed: jest.fn().mockResolvedValue(0),
    } as unknown as jest.Mocked<ContentRepository>;

    service = new ContentService(
      contentRepository,
      {} as ContentTopicRepository,
      {} as ContentSourceRepository,
      {} as ContentEmbeddingRepository,
    );
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

  describe('expireLicensed', () => {
    it('만료 전환 건수를 그대로 돌려준다', async () => {
      // given
      contentRepository.expireLicensed.mockResolvedValue(3);

      // when
      const count = await service.expireLicensed(NOW);

      // then
      expect(count).toBe(3);
      expect(contentRepository.expireLicensed).toHaveBeenCalledWith(NOW);
    });
  });
});
