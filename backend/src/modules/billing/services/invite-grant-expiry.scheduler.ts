import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { InviteGrantExpiryService } from './invite-grant-expiry.service';

/**
 * 초대 코드 지급 만료(domain.md 8.6) — **10분마다** 끝난 지급의 티어 캐시를 되돌린다.
 *
 * 하루 1회가 아닌 이유: 지급은 서비스 날짜 경계(04:00, 전환 뒤 05:00)에 끝나는데 경계가 바뀌는 날이 있어 고정 시각
 * 하나로는 맞출 수 없고, 늦게 돌면 그만큼 지급 요금제가 더 열려 있다. 10분이면 경계 뒤 최대 10분이다.
 * 다중 인스턴스에서도 안전하다 — 같은 계정을 두 번 맞춰도 같은 값을 쓴다.
 */
@Injectable()
export class InviteGrantExpiryScheduler {
  private readonly logger = new Logger(InviteGrantExpiryScheduler.name);

  constructor(
    private readonly inviteGrantExpiryService: InviteGrantExpiryService,
  ) {}

  @Cron('0 */10 * * * *', {
    name: 'invite-grant-expiry',
    timeZone: 'Asia/Seoul',
  })
  async run(): Promise<void> {
    try {
      const released = await this.inviteGrantExpiryService.releaseEnded(
        new Date(),
      );
      if (released > 0) {
        this.logger.log('invite grants released', {
          released_count: released,
        });
      }
    } catch (error) {
      // 실패해도 10분 뒤 다시 돈다 — 던지면 스케줄러가 멈춘다
      this.logger.error(
        'invite grant expiry failed',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
