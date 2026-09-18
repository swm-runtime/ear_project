import { EntityManager } from 'typeorm';

import { ContentService } from '@/modules/content/services/content.service';
import { Topic } from '@/modules/interest/entities/topic.entity';
import { TopicService } from '@/modules/interest/services/topic.service';
import { AuditLogService } from '@/modules/partner/audit-log.service';

import { TopicExposureService } from './topic-exposure.service';

const ACTOR_ID = '11111111-1111-4111-8111-111111111111';
const EMPTY_TOPIC_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const FILLED_TOPIC_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const HIDDEN_TOPIC_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const NOW = new Date('2026-09-17T03:00:00.000Z');

function buildTopic(id: string, isVisible: boolean): Topic {
  return { id, name: id.slice(0, 4), isVisible } as Topic;
}

describe('TopicExposureService', () => {
  let service: TopicExposureService;
  let contentService: jest.Mocked<ContentService>;
  let topicService: jest.Mocked<TopicService>;
  let auditLogService: jest.Mocked<AuditLogService>;
  let manager: EntityManager;

  beforeEach(() => {
    manager = {} as EntityManager;

    contentService = {
      // 노출 가능 콘텐츠가 있는 주제만 Map 에 들어 있다(0건은 행이 없다 — 저장소 동작과 같게)
      countVisibleByTopicIds: jest
        .fn()
        .mockResolvedValue(new Map([[FILLED_TOPIC_ID, 2]])),
    } as unknown as jest.Mocked<ContentService>;

    topicService = {
      findAllByIdsForUpdate: jest
        .fn()
        .mockResolvedValue([
          buildTopic(EMPTY_TOPIC_ID, true),
          buildTopic(FILLED_TOPIC_ID, true),
          buildTopic(HIDDEN_TOPIC_ID, false),
        ]),
      findAllVisible: jest
        .fn()
        .mockResolvedValue([
          buildTopic(EMPTY_TOPIC_ID, true),
          buildTopic(FILLED_TOPIC_ID, true),
        ]),
      hideAll: jest
        .fn()
        .mockImplementation((topics: Topic[]) =>
          Promise.resolve(
            topics.map((topic) => ({ ...topic, isVisible: false })),
          ),
        ),
    } as unknown as jest.Mocked<TopicService>;

    auditLogService = {
      record: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<AuditLogService>;

    service = new TopicExposureService(
      contentService,
      topicService,
      auditLogService,
    );
  });

  describe('hideEmptyTopics', () => {
    it('노출 중이면서 노출 가능 콘텐츠가 0건인 주제만 숨긴다', async () => {
      // when
      const hidden = await service.hideEmptyTopics(
        {
          topicIds: [EMPTY_TOPIC_ID, FILLED_TOPIC_ID, HIDDEN_TOPIC_ID],
          actor: ACTOR_ID,
          trigger: 'withdraw',
          now: NOW,
        },
        manager,
      );

      // then
      expect(hidden.map((topic) => topic.id)).toEqual([EMPTY_TOPIC_ID]);
      expect(topicService.hideAll).toHaveBeenCalledWith(
        [expect.objectContaining({ id: EMPTY_TOPIC_ID })],
        manager,
      );
    });

    it('이미 숨겨진 주제는 건수를 세지 않는다', async () => {
      // when
      await service.hideEmptyTopics(
        {
          topicIds: [EMPTY_TOPIC_ID, FILLED_TOPIC_ID, HIDDEN_TOPIC_ID],
          actor: ACTOR_ID,
          trigger: 'withdraw',
          now: NOW,
        },
        manager,
      );

      // then — 숨긴 주제는 이미 규칙을 만족하므로 조회 대상에서 뺀다
      expect(contentService.countVisibleByTopicIds).toHaveBeenCalledWith(
        [EMPTY_TOPIC_ID, FILLED_TOPIC_ID],
        NOW,
        manager,
      );
    });

    it('숨긴 주제마다 자동 숨김 감사 로그를 트리거와 함께 남긴다', async () => {
      // when
      await service.hideEmptyTopics(
        {
          topicIds: [EMPTY_TOPIC_ID],
          actor: ACTOR_ID,
          trigger: 'republish',
          now: NOW,
        },
        manager,
      );

      // then — 관리자 토글(topic.update)과 구분되는 액션이어야 "누가 숨겼나"에 답할 수 있다
      expect(auditLogService.record).toHaveBeenCalledTimes(1);
      expect(auditLogService.record).toHaveBeenCalledWith(
        {
          actor: ACTOR_ID,
          action: 'topic.auto_hide',
          target: `topic:${EMPTY_TOPIC_ID}`,
          before: { is_visible: true },
          after: {
            is_visible: false,
            trigger: 'republish',
            visible_content_count: 0,
          },
        },
        manager,
      );
    });

    it('배치가 숨기면 감사 로그 actor 가 system 이다', async () => {
      // when
      await service.hideEmptyTopics(
        {
          topicIds: [EMPTY_TOPIC_ID],
          actor: null,
          trigger: 'daily_sweep',
          now: NOW,
        },
        manager,
      );

      // then
      expect(auditLogService.record).toHaveBeenCalledWith(
        expect.objectContaining({ actor: 'system' }),
        manager,
      );
    });

    it('숨길 주제가 없으면 저장도 감사 로그도 하지 않는다', async () => {
      // given — 콘텐츠가 있는 주제만 넘어온다
      topicService.findAllByIdsForUpdate.mockResolvedValue([
        buildTopic(FILLED_TOPIC_ID, true),
      ]);
      topicService.hideAll.mockResolvedValue([]);

      // when
      const hidden = await service.hideEmptyTopics(
        {
          topicIds: [FILLED_TOPIC_ID],
          actor: ACTOR_ID,
          trigger: 'withdraw',
          now: NOW,
        },
        manager,
      );

      // then
      expect(hidden).toEqual([]);
      expect(auditLogService.record).not.toHaveBeenCalled();
    });

    it('주제 id 가 비어 있으면 아무것도 조회하지 않는다', async () => {
      // given — 주제가 하나도 없는 콘텐츠를 회수한 경우

      // when
      const hidden = await service.hideEmptyTopics(
        { topicIds: [], actor: ACTOR_ID, trigger: 'withdraw', now: NOW },
        manager,
      );

      // then
      expect(hidden).toEqual([]);
      expect(topicService.findAllByIdsForUpdate).not.toHaveBeenCalled();
    });

    it('넘겨받은 주제가 전부 숨겨져 있으면 건수를 세지 않는다', async () => {
      // given
      topicService.findAllByIdsForUpdate.mockResolvedValue([
        buildTopic(HIDDEN_TOPIC_ID, false),
      ]);

      // when
      await service.hideEmptyTopics(
        {
          topicIds: [HIDDEN_TOPIC_ID],
          actor: ACTOR_ID,
          trigger: 'withdraw',
          now: NOW,
        },
        manager,
      );

      // then
      expect(contentService.countVisibleByTopicIds).not.toHaveBeenCalled();
    });

    it('같은 주제 id 가 중복으로 와도 한 번만 조회한다', async () => {
      // given — 회수한 콘텐츠가 같은 주제를 두 번 가리키는 경우는 없지만 방어한다

      // when
      await service.hideEmptyTopics(
        {
          topicIds: [EMPTY_TOPIC_ID, EMPTY_TOPIC_ID],
          actor: ACTOR_ID,
          trigger: 'withdraw',
          now: NOW,
        },
        manager,
      );

      // then
      expect(topicService.findAllByIdsForUpdate).toHaveBeenCalledWith(
        [EMPTY_TOPIC_ID],
        manager,
      );
    });
  });

  describe('hideAllEmptyVisibleTopics', () => {
    it('노출 중인 모든 주제를 훑어 0건인 것을 system 으로 숨긴다', async () => {
      // given
      topicService.findAllByIdsForUpdate.mockResolvedValue([
        buildTopic(EMPTY_TOPIC_ID, true),
        buildTopic(FILLED_TOPIC_ID, true),
      ]);

      // when
      const hidden = await service.hideAllEmptyVisibleTopics(NOW, manager);

      // then
      expect(topicService.findAllByIdsForUpdate).toHaveBeenCalledWith(
        [EMPTY_TOPIC_ID, FILLED_TOPIC_ID],
        manager,
      );
      expect(hidden.map((topic) => topic.id)).toEqual([EMPTY_TOPIC_ID]);
      expect(auditLogService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          actor: 'system',
          after: expect.objectContaining({ trigger: 'daily_sweep' }) as unknown,
        }),
        manager,
      );
    });
  });
});
