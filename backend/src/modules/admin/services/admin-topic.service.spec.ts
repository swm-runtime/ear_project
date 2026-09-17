import { DataSource, EntityManager } from 'typeorm';

import { ErrorCode } from '@/common/exceptions/error-code.enum';
import { ContentService } from '@/modules/content/services/content.service';
import { Topic } from '@/modules/interest/entities/topic.entity';
import { TopicService } from '@/modules/interest/services/topic.service';
import { AuditLogService } from '@/modules/partner/audit-log.service';

import { AdminTopicService } from './admin-topic.service';

const ACTOR_ID = '11111111-1111-4111-8111-111111111111';
const TOPIC_ID = '22222222-2222-4222-8222-222222222222';
const NOW = new Date('2026-09-17T03:00:00.000Z');

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
      getByIdForUpdate: jest.fn().mockResolvedValue(buildTopic()),
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
      countVisibleByTopicIds: jest.fn().mockResolvedValue(new Map()),
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
    it('숨긴 주제까지 전부 콘텐츠 건수와 노출 가능 건수를 함께 돌려준다', async () => {
      // given — 3건 중 1건만 발행 중(나머지는 회수·만료)
      contentService.countByTopicIds.mockResolvedValue(
        new Map([[TOPIC_ID, 3]]),
      );
      contentService.countVisibleByTopicIds.mockResolvedValue(
        new Map([[TOPIC_ID, 1]]),
      );

      // when
      const result = await service.findAll(NOW);

      // then
      expect(result).toEqual([
        { topic: buildTopic(), contentCount: 3, visibleContentCount: 1 },
      ]);
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
      // given — 발행 중 콘텐츠가 있다
      contentService.countVisibleByTopicIds.mockResolvedValue(
        new Map([[TOPIC_ID, 2]]),
      );

      // when
      const result = await service.update(
        ACTOR_ID,
        TOPIC_ID,
        { isVisible: true },
        NOW,
      );

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

    it('노출 가능 콘텐츠가 0건인 숨김 주제의 노출을 켜면 409로 거부하고 주제를 바꾸지 않는다', async () => {
      // given — 노출 가능 건수 0 (Map 에 없음)

      // when
      const act = service.update(ACTOR_ID, TOPIC_ID, { isVisible: true }, NOW);

      // then
      await expect(act).rejects.toMatchObject({
        errorCode: ErrorCode.ADMIN_TOPIC_HAS_NO_CONTENTS,
        retryable: false,
        details: { content_count: 0 },
      });
      expect(topicService.update).not.toHaveBeenCalled();
      expect(auditLogService.record).not.toHaveBeenCalled();
    });

    it('연결 행은 있지만 전부 회수·만료라 노출 가능 건수가 0이면 노출을 켤 수 없다', async () => {
      // given — 삭제 판정 기준(연결 행)으로는 3건이지만 앱에 보이는 것은 0건이다
      contentService.countByTopicIds.mockResolvedValue(
        new Map([[TOPIC_ID, 3]]),
      );

      // when
      const act = service.update(ACTOR_ID, TOPIC_ID, { isVisible: true }, NOW);

      // then
      await expect(act).rejects.toMatchObject({
        errorCode: ErrorCode.ADMIN_TOPIC_HAS_NO_CONTENTS,
      });
    });

    it('노출 가능 건수는 트랜잭션 안에서 판정 시각 기준으로 센다', async () => {
      // given
      contentService.countVisibleByTopicIds.mockResolvedValue(
        new Map([[TOPIC_ID, 1]]),
      );

      // when
      await service.update(ACTOR_ID, TOPIC_ID, { isVisible: true }, NOW);

      // then — 콘솔이 본 목록 건수가 아니라 지금 건수로 판정한다
      expect(contentService.countVisibleByTopicIds).toHaveBeenCalledWith(
        [TOPIC_ID],
        NOW,
        manager,
      );
    });

    it('판정 전에 주제 행을 잠그고 읽는다', async () => {
      // given — 동시 회수의 자동 숨김과 서로의 커밋 전 상태를 보지 않게 한다
      contentService.countVisibleByTopicIds.mockResolvedValue(
        new Map([[TOPIC_ID, 1]]),
      );

      // when
      await service.update(ACTOR_ID, TOPIC_ID, { isVisible: true }, NOW);

      // then
      expect(topicService.getByIdForUpdate).toHaveBeenCalledWith(
        TOPIC_ID,
        manager,
      );
      expect(
        topicService.getByIdForUpdate.mock.invocationCallOrder[0],
      ).toBeLessThan(
        contentService.countVisibleByTopicIds.mock.invocationCallOrder[0],
      );
    });

    it('이미 노출 중인 0건 주제의 이름만 바꾸면 통과한다', async () => {
      // given — 규칙 이전에 0건인 채 켜진 주제
      topicService.getByIdForUpdate.mockResolvedValue(
        buildTopic({ isVisible: true }),
      );

      // when
      const result = await service.update(
        ACTOR_ID,
        TOPIC_ID,
        { name: '이직 준비' },
        NOW,
      );

      // then
      expect(result.topic.name).toBe('이직 준비');
      expect(contentService.countVisibleByTopicIds).not.toHaveBeenCalledWith(
        [TOPIC_ID],
        NOW,
        manager,
      );
    });

    it('이미 노출 중인 0건 주제는 끌 수 있다', async () => {
      // given
      topicService.getByIdForUpdate.mockResolvedValue(
        buildTopic({ isVisible: true }),
      );

      // when
      const result = await service.update(
        ACTOR_ID,
        TOPIC_ID,
        { isVisible: false },
        NOW,
      );

      // then
      expect(result.topic.isVisible).toBe(false);
    });

    it('이미 노출 중인 주제에 노출 켜기를 다시 보내면 건수를 보지 않고 통과한다', async () => {
      // given — 콘솔 재전송 등. 숨김 → 노출 "전환"이 아니다
      topicService.getByIdForUpdate.mockResolvedValue(
        buildTopic({ isVisible: true }),
      );

      // when
      const act = service.update(ACTOR_ID, TOPIC_ID, { isVisible: true }, NOW);

      // then
      await expect(act).resolves.toBeDefined();
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
