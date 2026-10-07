import { Injectable, Logger } from '@nestjs/common';

import { SlackAlertService } from '@/modules/alert/slack-alert.service';
import { SubscriptionStore } from '@/modules/subscription/subscription.enum';

/** 알림 종류 — 종류별로 묶음 창을 따로 센다 */
export type BillingAlertKind =
  | 'receipt-rejected'
  | 'notification-rejected'
  | 'reconcile-failed'
  | 'forced-expiry';

/** 같은 종류의 알림을 묶는 창 — 위조 시도 수십 건이 채널을 덮지 않게. 창 안의 건수는 로그로만 */
export const BILLING_ALERT_WINDOW_MS = 10 * 60 * 1000;

const STORE_LABEL: Record<SubscriptionStore, string> = {
  [SubscriptionStore.APP_STORE]: 'App Store',
  [SubscriptionStore.PLAY_STORE]: 'Google Play',
};

const KST_TIME = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/**
 * 결제·스토어 알림 실패를 Slack 으로(`infra/runbook.md` 4-1 알림 표 — KAN-132, 2026-10-06).
 *
 * 결제 경로의 실패는 전부 `warn` 로그라 Slack ERROR 감시(`log-watch`)에 걸리지 않았다. 그런데 셋은 사람이 봐야 한다:
 * - **영수증·구매 토큰 검증 거부** — 사용자가 돈을 냈는데 권한을 못 받았을 수 있다(설정 오류·키 만료면 전원이 막힌다)
 * - **스토어 알림(S2S·RTDN) 거부** — 서명·OIDC 검증 실패. 환불·갱신이 반영되지 않는다
 * - **구독 보정 실패** — 04:45 배치가 스토어에 묻지 못했다
 *
 * **종류별로 10분 창에 한 번만 보낸다.** 위조 시도나 잘못된 클라이언트가 같은 거부를 수십 번 만들 수 있다 — 첫 건을
 * 보내고 창 안의 나머지는 건수만 세어 로그로 남긴다. 사유는 내부 코드 문자열이고, 사용자·거래 식별자는 싣지 않는다.
 * 던지지 않는다 — 알림이 결제 흐름을 깨지 않게.
 */
@Injectable()
export class BillingAlertService {
  private readonly logger = new Logger(BillingAlertService.name);
  private readonly windows = new Map<
    string,
    { openedAt: number; suppressed: number }
  >();

  constructor(private readonly slackAlertService: SlackAlertService) {}

  /** 구매 제출·복원에서 영수증(JWS)·구매 토큰이 거부됨 */
  receiptRejected(store: SubscriptionStore, reason: string, now = new Date()) {
    this.send(
      'receipt-rejected',
      store,
      `:credit_card: 결제 검증 거부 · ${STORE_LABEL[store]} · ${reason}`,
      now,
    );
  }

  /** 스토어 서버 알림(App Store S2S · Play RTDN)의 서명·주소 검증이 거부됨 */
  notificationRejected(
    store: SubscriptionStore,
    kind: string,
    reason: string,
    now = new Date(),
  ) {
    this.send(
      'notification-rejected',
      store,
      `:warning: 스토어 알림 거부 · ${STORE_LABEL[store]} · ${kind}: ${reason}`,
      now,
    );
  }

  /** 04:45 구독 보정에서 스토어에 묻지 못했거나 작업 자체가 실패함 */
  reconcileFailed(detail: string, now = new Date()) {
    this.send(
      'reconcile-failed',
      null,
      `:hourglass: 구독 보정 실패 · ${detail}`,
      now,
    );
  }

  /**
   * 구독 보정이 스토어에 7일 넘게 확인하지 못한 구독을 만료로 내림(`subscription-api.md` 4.2 상한). 드물어야 한다 —
   * 잦으면 조회 키·받는 환경 설정이 빠진 것이고, 실제 결제 사용자가 내려갔을 수 있다
   */
  forcedExpiry(
    store: SubscriptionStore,
    environment: string,
    now = new Date(),
  ) {
    this.send(
      'forced-expiry',
      store,
      `:hourglass: 구독 강제 만료 · ${STORE_LABEL[store]} · ${environment} · 스토어에 7일 넘게 확인 못 함 — 조회 키·환경 설정 확인`,
      now,
    );
  }

  private send(
    kind: BillingAlertKind,
    store: SubscriptionStore | null,
    text: string,
    now: Date,
  ): void {
    const key = `${kind}:${store ?? '-'}`;
    const window = this.windows.get(key);

    if (window && now.getTime() - window.openedAt < BILLING_ALERT_WINDOW_MS) {
      window.suppressed += 1;
      this.logger.warn('billing alert suppressed within window', {
        kind,
        store,
        suppressed_count: window.suppressed,
      });
      return;
    }

    this.windows.set(key, { openedAt: now.getTime(), suppressed: 0 });
    const suffix =
      window && window.suppressed > 0
        ? ` (직전 10분 ${window.suppressed}건 더 있었음)`
        : '';
    this.slackAlertService.notify(
      `billing-${kind}`,
      `${text}${suffix} · ${KST_TIME.format(now)}`,
    );
  }
}
