import { Injectable, Logger } from '@nestjs/common';

import { SlackAlertService } from '@/modules/alert/slack-alert.service';
import { InvalidatedDeviceToken } from '@/modules/user/repositories/device-token.repository';
import { DeviceTokenService } from '@/modules/user/services/device-token.service';
import { DevicePlatform } from '@/modules/user/user.enum';

/** 플랫폼별 "마지막 활성 토큰이 죽은 사용자" 수 — 순수 함수 `countLastTokenLosses`의 결과 */
export type UninstallEstimate = Partial<Record<DevicePlatform, number>>;

const PLATFORM_LABEL: Record<DevicePlatform, string> = {
  [DevicePlatform.IOS]: 'iOS',
  [DevicePlatform.ANDROID]: 'Android',
};

/**
 * 앱 삭제 **추정** 알림 — 푸시 토큰 무효화로(`features/backend-monitoring.md` 3-5, 2026-10-06).
 *
 * iOS 는 Apple 이 삭제 이벤트를 주지 않는다. 대신 앱을 지우면 APNs 가 그 토큰을 거부하고, 드립 알림을 보낼 때
 * ticket 또는 receipt 로 `DeviceNotRegistered`가 돌아와 `device_tokens.invalidated_at`이 찍힌다. **그 사용자의 활성
 * 토큰이 그것으로 0이 되면** 앱을 지웠다고 본다 — 기기를 바꿨거나 초기화했을 때도 같은 신호라 "추정"이다
 * (새 기기로 다시 들어오면 토큰이 다시 등록된다). 알림 권한을 끈 사용자는 토큰이 없어 잡히지 않는다.
 *
 * **Slack 에는 iOS 만 올린다.** Android 는 GA4 `app_remove`(`voc/app-remove-alert.service.ts`)가 삭제를 정확히 세고
 * 있어 같은 삭제가 두 번 울린다 — Android 건수는 로그에만 남긴다. 사용자 식별자는 싣지 않는다(CLAUDE.md).
 *
 * 호출부는 토큰을 무효화한 두 곳(ticket 단계 `DripArrivalNotificationService`, receipt 단계 `PushReceiptService`)이다.
 * 던지지 않는다 — 알림 실패가 발송·정리 흐름을 깨지 않게.
 */
@Injectable()
export class UninstallAlertService {
  private readonly logger = new Logger(UninstallAlertService.name);

  constructor(
    private readonly deviceTokenService: DeviceTokenService,
    private readonly slackAlertService: SlackAlertService,
  ) {}

  async notifyIfLastToken(
    invalidated: readonly InvalidatedDeviceToken[],
    now: Date,
  ): Promise<UninstallEstimate> {
    if (invalidated.length === 0) {
      return {};
    }

    try {
      const userIds = [...new Set(invalidated.map((row) => row.userId))];
      const activeCounts =
        await this.deviceTokenService.countActiveByUserIds(userIds);
      const estimate = countLastTokenLosses(invalidated, activeCounts);
      const total = Object.values(estimate).reduce((sum, n) => sum + n, 0);

      if (total === 0) {
        return estimate;
      }

      this.logger.log('uninstall estimated from invalidated push tokens', {
        by_platform: estimate,
        invalidated_count: invalidated.length,
      });

      const ios = estimate[DevicePlatform.IOS] ?? 0;
      if (ios > 0) {
        this.slackAlertService.notify(
          'uninstall-estimate',
          formatUninstallText(ios, DevicePlatform.IOS, now),
        );
      }

      return estimate;
    } catch (error) {
      this.logger.warn('uninstall estimate failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return {};
    }
  }
}

/**
 * 무효화된 행 중 **그 사용자의 활성 토큰이 0이 된** 것만 플랫폼별로 센다. 사용자당 한 번 — 한 사용자의 토큰
 * 두 개가 같은 주기에 죽어도 1이다(플랫폼은 먼저 나온 행을 따른다). 순수 함수라 서비스 없이 검증한다.
 */
export function countLastTokenLosses(
  invalidated: readonly InvalidatedDeviceToken[],
  activeCounts: ReadonlyMap<string, number>,
): UninstallEstimate {
  const estimate: UninstallEstimate = {};
  const seen = new Set<string>();

  for (const row of invalidated) {
    if (seen.has(row.userId)) continue;
    seen.add(row.userId);

    if ((activeCounts.get(row.userId) ?? 0) > 0) continue;

    estimate[row.platform] = (estimate[row.platform] ?? 0) + 1;
  }

  return estimate;
}

const KST_TIME = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/** 한 줄: `:iphone: 앱 삭제 추정 N건 · iOS · 푸시 토큰 무효화(활성 기기 0) · MM. DD. HH:mm` */
export function formatUninstallText(
  count: number,
  platform: DevicePlatform,
  now: Date,
): string {
  return `:iphone: 앱 삭제 추정 ${count}건 · ${PLATFORM_LABEL[platform]} · 푸시 토큰 무효화(활성 기기 0) · ${KST_TIME.format(now)}`;
}
