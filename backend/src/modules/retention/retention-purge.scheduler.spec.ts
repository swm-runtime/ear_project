import { Logger } from '@nestjs/common';

import { RetentionPurgeScheduler } from './retention-purge.scheduler';
import { RETENTION_POLICIES } from './retention.constant';
import { RetentionService } from './retention.service';

describe('RetentionPurgeScheduler', () => {
  let scheduler: RetentionPurgeScheduler;
  let service: jest.Mocked<RetentionService>;
  let logSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    service = {
      purgeExpired: jest.fn().mockResolvedValue({
        deletedCount: 0,
        cutoff: new Date('2026-03-14T00:00:00.000Z'),
        hasRemaining: false,
      }),
    } as unknown as jest.Mocked<RetentionService>;

    scheduler = new RetentionPurgeScheduler(service);
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('run', () => {
    it('기간 표의 테이블을 모두 순회한다', async () => {
      // given
      const tables = RETENTION_POLICIES.map((policy) => policy.table);

      // when
      await scheduler.run();

      // then
      expect(service.purgeExpired).toHaveBeenCalledTimes(tables.length);
      expect(
        service.purgeExpired.mock.calls.map(([policy]) => policy.table),
      ).toEqual(tables);
    });

    it('지운 행이 있으면 테이블 이름과 건수를 로그로 남긴다', async () => {
      // given
      service.purgeExpired.mockResolvedValue({
        deletedCount: 7,
        cutoff: new Date('2026-03-14T00:00:00.000Z'),
        hasRemaining: false,
      });

      // when
      await scheduler.run();

      // then
      expect(logSpy).toHaveBeenCalledWith(
        'retention purged',
        expect.objectContaining({
          table: 'audio_access_logs',
          deleted_count: 7,
        }),
      );
    });

    it('지운 행이 없으면 로그를 남기지 않는다', async () => {
      // given
      // 기본 mock이 0건을 돌려준다

      // when
      await scheduler.run();

      // then
      expect(logSpy).not.toHaveBeenCalled();
    });

    it('상한에 걸려 남은 분량이 있으면 경고를 남긴다', async () => {
      // given
      service.purgeExpired.mockResolvedValue({
        deletedCount: 10_000_000,
        cutoff: new Date('2026-03-14T00:00:00.000Z'),
        hasRemaining: true,
      });

      // when
      await scheduler.run();

      // then
      expect(warnSpy).toHaveBeenCalledWith(
        'retention purge reached batch limit',
        expect.objectContaining({ table: 'audio_access_logs' }),
      );
    });

    it('한 테이블이 실패해도 나머지 테이블은 계속 지운다', async () => {
      // given
      service.purgeExpired.mockRejectedValueOnce(new Error('deadlock'));

      // when
      const running = scheduler.run();

      // then
      // 던지면 스케줄러가 멈춘다 — 에러만 남기고 다음 테이블로 넘어간다
      await expect(running).resolves.toBeUndefined();
      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(service.purgeExpired).toHaveBeenCalledTimes(
        RETENTION_POLICIES.length,
      );
    });
  });
});
