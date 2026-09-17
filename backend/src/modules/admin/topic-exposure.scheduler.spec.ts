import { DataSource, EntityManager } from 'typeorm';

import { TopicExposureService } from './services/topic-exposure.service';
import { TopicExposureScheduler } from './topic-exposure.scheduler';

describe('TopicExposureScheduler', () => {
  let scheduler: TopicExposureScheduler;
  let topicExposureService: jest.Mocked<TopicExposureService>;
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

    topicExposureService = {
      hideAllEmptyVisibleTopics: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<TopicExposureService>;

    scheduler = new TopicExposureScheduler(topicExposureService, dataSource);
  });

  it('노출 중인 주제 전체를 트랜잭션 안에서 판정한다', async () => {
    // when
    await scheduler.run();

    // then — 행 잠금이 트랜잭션 안에서만 의미가 있다
    expect(topicExposureService.hideAllEmptyVisibleTopics).toHaveBeenCalledWith(
      expect.any(Date),
      manager,
    );
  });

  it('실패해도 던지지 않는다 — 던지면 스케줄러가 멈춘다', async () => {
    // given
    topicExposureService.hideAllEmptyVisibleTopics.mockRejectedValue(
      new Error('db down'),
    );

    // when
    const run = scheduler.run();

    // then
    await expect(run).resolves.toBeUndefined();
  });
});
