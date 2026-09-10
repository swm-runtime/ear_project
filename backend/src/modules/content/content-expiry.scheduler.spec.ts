import { DataSource, EntityManager } from 'typeorm';

import { LibraryService } from '@/modules/library/library.service';

import { ContentExpiryScheduler } from './content-expiry.scheduler';
import { ContentService } from './services/content.service';

describe('ContentExpiryScheduler', () => {
  let scheduler: ContentExpiryScheduler;
  let contentService: jest.Mocked<ContentService>;
  let libraryService: jest.Mocked<LibraryService>;
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

    contentService = {
      expireLicensed: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<ContentService>;

    libraryService = {
      removeAllByWithdrawnContent: jest.fn().mockResolvedValue(2),
    } as unknown as jest.Mocked<LibraryService>;

    scheduler = new ContentExpiryScheduler(
      contentService,
      libraryService,
      dataSource,
    );
  });

  it('만료된 콘텐츠의 라이브러리 잔존분을 같은 트랜잭션에서 지운다', async () => {
    // given — 목록에 남겨 두면 제공이 끝난 콘텐츠가 계속 노출된다(4.4 확정 2026-09-10)
    contentService.expireLicensed.mockResolvedValue(['content-1', 'content-2']);

    // when
    await scheduler.run();

    // then
    expect(libraryService.removeAllByWithdrawnContent).toHaveBeenCalledTimes(2);
    expect(libraryService.removeAllByWithdrawnContent).toHaveBeenCalledWith(
      'content-1',
      expect.any(Date),
      manager,
    );
  });

  it('만료된 콘텐츠가 없으면 라이브러리를 건드리지 않는다', async () => {
    // given — 두 번째 실행은 이미 expired라 조건에 걸리지 않아 빈 목록을 받는다
    contentService.expireLicensed.mockResolvedValue([]);

    // when
    await scheduler.run();

    // then
    expect(libraryService.removeAllByWithdrawnContent).not.toHaveBeenCalled();
  });

  it('실패해도 던지지 않는다 — 던지면 스케줄러가 멈춘다', async () => {
    // given
    contentService.expireLicensed.mockRejectedValue(new Error('db down'));

    // when
    const run = scheduler.run();

    // then — 다음 날 다시 시도하고, 그 사이는 조회 필터의 만료 조건이 막는다
    await expect(run).resolves.toBeUndefined();
  });
});
