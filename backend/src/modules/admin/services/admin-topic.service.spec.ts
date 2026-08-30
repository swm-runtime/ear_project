import { DataSource, EntityManager } from 'typeorm';

import { ErrorCode } from '@/common/exceptions/error-code.enum';
import { ContentService } from '@/modules/content/services/content.service';
import { Topic } from '@/modules/interest/entities/topic.entity';
import { TopicService } from '@/modules/interest/services/topic.service';
import { AuditLogService } from '@/modules/partner/audit-log.service';

import { AdminTopicService } from './admin-topic.service';

const ACTOR_ID = '11111111-1111-4111-8111-111111111111';
const TOPIC_ID = '22222222-2222-4222-8222-222222222222';

/** `expect.objectContaining`은 any라 lint에 걸린다 — unknown으로 좁힌다 */
const containing = (o: Record<string, unknown>): unknown =>
  expect.objectContaining(o);

function buildTopic(overrides: Partial<Topic> = {}): Topic {
  return {
    id: TOPIC_ID,
    name: '이직',
    parentCategory: '커리어',
    isVisible: false,
    displayOrder: 1,
    ...overrides,
  } as Topic;
}

describe('AdminTopicService', () => {
  let service: AdminTopicService;
  let topicService: jest.Mocked<TopicService>;
  let contentService: jest.Mocked<ContentService>;
  let auditLogService: jest.Mocked<AuditLogService>;
  let manager: EntityManager;

  beforeEach(() => {
    manager = {} as EntityManager;
    const dataSource = {
      transaction: jest
        .fn()
        .mockImplementation((run: (m: EntityManager) => Promise<unknown>) =>
          run(manager),
        ),
    } as unknown as DataSource;

    topicService = {
      findAll: jest.fn().mockResolvedValue([buildTopic()]),
      getById: jest.fn().mockResolvedValue(buildTopic()),
      create: jest.fn().mockResolvedValue(buildTopic()),
      update: jest
        .fn()
        .mockImplementation((topic: Topic, command: Partial<Topic>) =>
          Promise.resolve({ ...topic, ...command }),
        ),
      remove: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<TopicService>;

    contentService = {
      countByTopicIds: jest.fn().mockResolvedValue(new Map()),
    } as unknown as jest.Mocked<ContentService>;

    auditLogService = {
      record: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<AuditLogService>;

    service = new AdminTopicService(
      dataSource,
      topicService,
      contentService,
      auditLogService,
    );
  });

  describe('findAll', () => {
    it('숨긴 주제까지 전부 콘텐츠 건수와 함께 돌려준다', async () => {
      // given
      contentService.countByTopicIds.mockResolvedValue(
        new Map([[TOPIC_ID, 3]]),
      );

      // when
      const result = await service.findAll();

      // then
      expect(result).toEqual([{ topic: buildTopic(), contentCount: 3 }]);
    });
  });

  describe('create', () => {
    it('주제를 만들면 감사 로그가 함께 남는다', async () => {
      // when
      const result = await service.create(ACTOR_ID, {
        name: '이직',
        parentCategory: '커리어',
        displayOrder: null,
      });

      // then
      expect(result.contentCount).toBe(0);
      expect(auditLogService.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'topic.create', actor: ACTOR_ID }),
        manager,
      );
    });
  });

  describe('update', () => {
    it('노출을 켜면 before/after가 감사 로그에 남는다', async () => {
      // when
      const result = await service.update(ACTOR_ID, TOPIC_ID, {
        isVisible: true,
      });

      // then
      expect(result.topic.isVisible).toBe(true);
      expect(auditLogService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'topic.update',
          before: containing({ is_visible: false }),
          after: containing({ is_visible: true }),
        }),
        manager,
      );
    });
  });

  describe('remove', () => {
    it('콘텐츠가 배정된 주제는 삭제하지 않고 건수를 알려준다', async () => {
      // given
      contentService.countByTopicIds.mockResolvedValue(
        new Map([[TOPIC_ID, 3]]),
      );

      // when
      const act = service.remove(ACTOR_ID, TOPIC_ID);

      // then
      await expect(act).rejects.toMatchObject({
        errorCode: ErrorCode.ADMIN_TOPIC_HAS_CONTENTS,
        details: { content_count: 3 },
      });
      expect(topicService.remove).not.toHaveBeenCalled();
    });

    it('콘텐츠가 없는 주제는 감사 로그를 남기고 삭제한다', async () => {
      // when
      await service.remove(ACTOR_ID, TOPIC_ID);

      // then
      expect(auditLogService.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'topic.delete' }),
        manager,
      );
      expect(topicService.remove).toHaveBeenCalled();
    });
  });
});
