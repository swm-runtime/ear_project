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
      findWithdrawnSince: jest.fn().mockResolvedValue([]),
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
