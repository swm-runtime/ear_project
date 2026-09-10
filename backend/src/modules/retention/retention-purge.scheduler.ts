import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { RETENTION_POLICIES, RetentionPolicy } from './retention.constant';
import { RetentionService } from './retention.service';

/**
 * `domain.md` 12.1의 보존 기간 배치 — 네 테이블을 **표 하나로 순회한다.**
 *
 * 문서가 표로 정한 것을 코드도 표로 두면(`RETENTION_POLICIES`) 대조가 눈으로 끝난다.
 * 테이블마다 스케줄러를 두면 기간이 어긋나도 네 파일을 다 열어 봐야 알 수 있다.
 *
 * **04:30 KST.** 서비스 날짜 경계(04:00) 이후이며, `content_stats` 집계(04:00)와
 * 라이선스 만료(04:10) 뒤, 드립 편성(05:00) 앞이다. 집계가 `user_signals` ·
 * `source_link_clicks`를 원천으로 읽으므로 **그것이 끝난 뒤에** 지운다.
 *
 * `@Interval`이 아니라 `@Cron`인 것은 주기가 하루이기 때문이다. 24시간 간격의 `@Interval`은
 * 기동 시점부터 세므로, 배포가 잦으면 그 시각에 닿기 전에 프로세스가 다시 떠 **영영 돌지 않는다**
 * (`IdempotencyPurgeScheduler`는 주기가 1시간이라 그 문제가 없다).
 *
 * **테이블 하나가 실패해도 나머지는 계속 지운다.** 한 테이블의 락 경합이 다른 세 테이블의
 * 보존 기간까지 멈추게 할 이유가 없다. 어떤 경우에도 던지지 않는다 — 던지면 스케줄러가 멈춘다.
 */
@Injectable()
export class RetentionPurgeScheduler {
  private readonly logger = new Logger(RetentionPurgeScheduler.name);

  constructor(private readonly retentionService: RetentionService) {}

  @Cron('30 4 * * *', {
    name: 'retention-purge',
    timeZone: 'Asia/Seoul',
  })
  async run(): Promise<void> {
    const now = new Date();

    for (const policy of RETENTION_POLICIES) {
      await this.purgeTable(policy, now);
    }
  }

  private async purgeTable(policy: RetentionPolicy, now: Date): Promise<void> {
    try {
      const outcome = await this.retentionService.purgeExpired(policy, now);

      if (outcome.deletedCount > 0) {
        this.logger.log('retention purged', {
          table: policy.table,
          retention_days: policy.retentionDays,
          deleted_count: outcome.deletedCount,
        });
      }

      if (outcome.hasRemaining) {
        // 한 번의 실행이 끝없이 도는 것을 막은 자리다. 남은 분량은 다음 실행이 이어서 지운다
        this.logger.warn('retention purge reached batch limit', {
          table: policy.table,
          deleted_count: outcome.deletedCount,
        });
      }
    } catch (error) {
      // 다음 주기가 다시 시도한다. 보존 기간은 하루 늦어도 회복되는 종류의 의무다
      this.logger.error(
        `failed to purge expired rows: ${policy.table}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
