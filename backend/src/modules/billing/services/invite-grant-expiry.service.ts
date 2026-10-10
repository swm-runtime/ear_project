import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { InviteCodeService } from '@/modules/subscription/services/invite-code.service';

import { BillingSyncService } from './billing-sync.service';

/** 한 번에 처리하는 지급 행 수 — 남으면 다음 회차가 이어 받는다 */
export const INVITE_GRANT_EXPIRY_BATCH_SIZE = 200;

/**
 * 끝난 초대 코드 지급의 `users.tier` 캐시 되돌리기(domain.md 8.6).
 *
 * 지급 기간은 서비스 날짜 경계에 끝나는데, 캐시는 누가 다시 맞춰야 내려간다 — 앱을 열지 않는 사용자도 드립·한도가
 * 지급 요금제로 계속 돌지 않게 배치가 맞춘다. 계정마다 한 트랜잭션: 캐시를 다시 고르고(`syncUserTier` — 남은 구독이
 * 있으면 그 티어) `tier_released_at`을 찍는다. 한 계정이 실패해도 나머지는 진행한다.
 */
@Injectable()
export class InviteGrantExpiryService {
  private readonly logger = new Logger(InviteGrantExpiryService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly inviteCodeService: InviteCodeService,
    private readonly billingSyncService: BillingSyncService,
  ) {}

  /** 되돌린 행 수를 돌려준다 */
  async releaseEnded(now: Date): Promise<number> {
    const ended = await this.inviteCodeService.findEndedUnreleased(
      now,
      INVITE_GRANT_EXPIRY_BATCH_SIZE,
    );
    let released = 0;

    for (const redemption of ended) {
      try {
        await this.dataSource.transaction(async (manager) => {
          await this.billingSyncService.syncUserTier(
            redemption.userId,
            manager,
            now,
          );
          await this.inviteCodeService.markReleased(redemption, now, manager);
        });
        released += 1;
      } catch (error) {
        this.logger.error(
          'invite grant release failed',
          error instanceof Error ? error.stack : String(error),
          { user_id: redemption.userId, redemption_id: redemption.id },
        );
      }
    }

    return released;
  }
}
