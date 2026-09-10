import {
  AUDIO_ACCESS_LOG_RETENTION_DAYS,
  NOTIFICATION_LOG_RETENTION_DAYS,
  RETENTION_POLICIES,
  RETENTION_PURGE_BATCH_SIZE,
  RETENTION_PURGE_MAX_BATCHES,
  RetentionPolicy,
  SOURCE_LINK_CLICK_RETENTION_DAYS,
  USER_SIGNAL_RETENTION_DAYS,
} from './retention.constant';
import { RetentionRepository } from './retention.repository';
import { RetentionService } from './retention.service';

const NOW = new Date('2026-09-10T19:30:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;

const USER_SIGNAL_POLICY: RetentionPolicy = {
  table: 'user_signals',
  retentionDays: USER_SIGNAL_RETENTION_DAYS,
};

describe('RetentionService', () => {
  let service: RetentionService;
  let repository: jest.Mocked<RetentionRepository>;

  beforeEach(() => {
    repository = {
      deleteCreatedBefore: jest.fn(),
    } as unknown as jest.Mocked<RetentionRepository>;

    service = new RetentionService(repository);
  });

  describe('purgeExpired', () => {
    it('보존 기간이 지난 시각을 경계로 삭제한다', async () => {
      // given
      repository.deleteCreatedBefore.mockResolvedValue(3);

      // when
      const outcome = await service.purgeExpired(USER_SIGNAL_POLICY, NOW);

      // then
      const expectedCutoff = new Date(
        NOW.getTime() - USER_SIGNAL_RETENTION_DAYS * DAY_MS,
      );
      expect(outcome.cutoff).toEqual(expectedCutoff);
      expect(repository.deleteCreatedBefore).toHaveBeenCalledWith(
        'user_signals',
        expectedCutoff,
        RETENTION_PURGE_BATCH_SIZE,
      );
    });

    it('배치가 가득 차면 다음 배치를 이어서 지운다', async () => {
      // given
      repository.deleteCreatedBefore
        .mockResolvedValueOnce(RETENTION_PURGE_BATCH_SIZE)
        .mockResolvedValueOnce(RETENTION_PURGE_BATCH_SIZE)
        .mockResolvedValueOnce(12);

      // when
      const outcome = await service.purgeExpired(USER_SIGNAL_POLICY, NOW);

      // then
      // 한 문장으로 다 지우지 않는다 — 큰 DELETE 하나는 락과 WAL을 오래 잡는다
      expect(repository.deleteCreatedBefore).toHaveBeenCalledTimes(3);
      expect(outcome.deletedCount).toBe(RETENTION_PURGE_BATCH_SIZE * 2 + 12);
      expect(outcome.hasRemaining).toBe(false);
    });

    it('배치가 다 차지 않으면 더 지울 것이 없다고 보고 멈춘다', async () => {
      // given
      repository.deleteCreatedBefore.mockResolvedValue(
        RETENTION_PURGE_BATCH_SIZE - 1,
      );

      // when
      await service.purgeExpired(USER_SIGNAL_POLICY, NOW);

      // then
      expect(repository.deleteCreatedBefore).toHaveBeenCalledTimes(1);
    });

    it('두 번 연속 돌면 두 번째 실행은 아무것도 지우지 않는다', async () => {
      // given
      repository.deleteCreatedBefore
        .mockResolvedValueOnce(42)
        .mockResolvedValueOnce(0);

      // when
      const first = await service.purgeExpired(USER_SIGNAL_POLICY, NOW);
      const second = await service.purgeExpired(USER_SIGNAL_POLICY, NOW);

      // then
      expect(first.deletedCount).toBe(42);
      expect(second.deletedCount).toBe(0);
    });

    it('상한만큼 돌고도 남아 있으면 남았다고 알리고 멈춘다', async () => {
      // given
      repository.deleteCreatedBefore.mockResolvedValue(
        RETENTION_PURGE_BATCH_SIZE,
      );

      // when
      const outcome = await service.purgeExpired(USER_SIGNAL_POLICY, NOW);

      // then
      // 한 번의 실행이 끝없이 도는 것을 막는다. 남은 분량은 다음 실행이 이어서 지운다
      expect(repository.deleteCreatedBefore).toHaveBeenCalledTimes(
        RETENTION_PURGE_MAX_BATCHES,
      );
      expect(outcome.hasRemaining).toBe(true);
    });
  });

  describe('RETENTION_POLICIES', () => {
    it('코드의 기간 표가 domain.md 12.1 표와 일치한다', () => {
      // given
      // domain.md 12.1 (확정 2026-09-10)

      // when
      const policies = Object.fromEntries(
        RETENTION_POLICIES.map((policy) => [
          policy.table,
          policy.retentionDays,
        ]),
      );

      // then
      expect(policies).toEqual({
        user_signals: 180,
        source_link_clicks: 180,
        audio_access_logs: 90,
        notification_logs: 90,
      });
      expect(USER_SIGNAL_RETENTION_DAYS).toBe(180);
      expect(SOURCE_LINK_CLICK_RETENTION_DAYS).toBe(180);
      expect(AUDIO_ACCESS_LOG_RETENTION_DAYS).toBe(90);
      expect(NOTIFICATION_LOG_RETENTION_DAYS).toBe(90);
    });

    it('삭제하지 않기로 한 테이블은 표에 없다', () => {
      // given
      // audit_logs는 증적이라 삭제하지 않고, play_records는 보류다 (domain.md 12.1)
      const tables = RETENTION_POLICIES.map((policy) => policy.table);

      // when
      const forbidden = tables.filter((table) =>
        ['audit_logs', 'play_records'].includes(table),
      );

      // then
      expect(forbidden).toEqual([]);
    });
  });
});
