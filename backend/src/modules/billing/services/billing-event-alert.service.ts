import { Injectable, Logger } from '@nestjs/common';

import { SlackAlertService } from '@/modules/alert/slack-alert.service';
import { UserService } from '@/modules/user/services/user.service';
import { UserMarket } from '@/modules/user/user.enum';

import {
  SubscriptionTransition,
  SubscriptionTransitionKind,
} from '../billing.types';
import { formatBillingEventAlert } from './billing-event-alert.format';
import { SyncOutcome } from './billing-sync.service';

/**
 * 결제가 일어났을 때 Slack 으로 한 줄(`features/backend-monitoring.md` 3-7 · `infra/runbook.md` 4-1 — 2026-10-18).
 *
 * 실패 알림(`BillingAlertService`)과 서비스를 나눈 이유: 그쪽은 **종류별 10분 묶음 창**이 핵심이다(위조 시도 수십 건이
 * 채널을 덮지 않게). 결제는 건마다 의미가 있어 묶지 않는다 — 같은 서비스에 두면 창을 타는지 아닌지가 메서드마다 갈린다.
 *
 * **한 결제에 한 번**은 이 서비스가 아니라 `BillingSyncService`가 보장한다 — 구독 행을 실제로 바꾼 반영에만
 * 전이(`SubscriptionTransition`)가 붙는다. 같은 구매의 재제출·복원·알림 재전송은 행이 이미 그 상태라 전이가 없다.
 * 호출부는 **커밋 뒤에** `report`를 부르고, 복원·만료 보정은 부르지 않는다(사용자가 지금 결제한 것이 아니다).
 *
 * **보내지 않는 것**: 갱신(구독자 수에 비례해 매달 늘어 채널을 덮는다) · 만료 · 변경 예약 · 결제 실패 복구(갱신이다).
 *
 * 던지지 않고 `await` 하지 않는다 — 시장 조회·Slack 이 실패해도 결제 응답은 그대로다.
 */
@Injectable()
export class BillingEventAlertService {
  private readonly logger = new Logger(BillingEventAlertService.name);

  constructor(
    private readonly slackAlertService: SlackAlertService,
    private readonly userService: UserService,
  ) {}

  /**
   * 반영 결과에 결제 전이가 있으면 알린다. `kinds`는 그 경로가 올릴 전이다 — 예: Play 알림은 구매 알림(`PURCHASED`)일
   * 때만 `started`를 올린다(결제 보류에서의 복구도 행이 되살아나지만 갱신이다).
   */
  report(
    outcome: SyncOutcome,
    kinds: readonly SubscriptionTransitionKind[],
    now: Date = new Date(),
  ): void {
    if (outcome.kind !== 'applied' || outcome.transition === undefined) {
      return;
    }

    const { transition } = outcome;

    if (!kinds.includes(transition.kind)) {
      return;
    }

    // 끝난 행이 갱신 거래로 되살아난 것은 결제 실패 복구다(App Store `transactionReason = RENEWAL`) — 새 구독이 아니다
    if (
      transition.kind === 'started' &&
      transition.detail?.isRenewal === true
    ) {
      return;
    }

    if (!this.slackAlertService.enabled) {
      return;
    }

    void this.send(transition, now).catch((error: unknown) => {
      this.logger.warn('billing event alert failed', {
        kind: transition.kind,
        reason: error instanceof Error ? error.message : 'unknown',
      });
    });
  }

  private async send(
    transition: SubscriptionTransition,
    now: Date,
  ): Promise<void> {
    const market = await this.findMarket(transition.userId);

    this.slackAlertService.notify(
      `billing-${transition.kind}`,
      formatBillingEventAlert({
        kind: transition.kind,
        isResubscribe: transition.isResubscribe,
        store: transition.store,
        environment: transition.environment,
        tier: transition.tier,
        market,
        detail: transition.detail,
        at: now,
      }),
    );
  }

  /** 시장을 모르면 그 칸만 뺀다 — 조회 실패로 알림 자체를 잃지 않는다 */
  private async findMarket(userId: string): Promise<UserMarket | null> {
    try {
      return (await this.userService.getById(userId)).market ?? null;
    } catch {
      return null;
    }
  }
}
