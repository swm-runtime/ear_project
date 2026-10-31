import { Injectable, Logger } from '@nestjs/common';

import { DeviceToken } from '@/modules/user/entities/device-token.entity';
import { DeviceTokenService } from '@/modules/user/services/device-token.service';

import { NotificationLog } from '../entities/notification-log.entity';
import {
  EXPO_DEVICE_NOT_REGISTERED,
  EXPO_PUSH_SEND_CHUNK_SIZE,
  EXPO_PUSH_TOKEN_PATTERN,
} from '../notification.constant';
import { NotificationStatus } from '../notification.enum';
import { PushMessage, PushTicket } from '../notification.types';
import { PushClient } from '../push/push.client';
import { NotificationLogRepository } from '../repositories/notification-log.repository';
import { PushReceiptService } from './push-receipt.service';
import { UninstallEstimateService } from './uninstall-estimate.service';

/** 사용자 한 명에게 보낼 알림 — 무엇을 누구에게 보낼지는 호출부가 이미 정했다 */
export interface TargetedPush {
  userId: string;
  /** `notification_logs.type` 그대로 남는 값 */
  type: `retention.${string}`;
  title: string;
  body: string;
  deepLink: string;
  /** 보관 시한(초, Expo `ttl`) */
  ttl: number;
}

export interface TargetedPushSummary {
  sent: number;
  failed: number;
  /** 보낼 기기가 없어 건너뛴 사용자 — 기록을 남기지 않는다(대상 판정 단계에서 걸렀어야 할 몫) */
  noDevice: number;
}

/**
 * 호출부가 대상·문구를 정한 알림을 보낸다 — 저녁 리텐션 알림(`notification.md` 4.6)이 쓴다.
 * 드립 도착 알림(`DripArrivalNotificationService`)과 같은 발송 규칙을 따른다: 기기마다 보내고 한 대라도 접수되면 `sent`,
 * 같은 토큰은 한 번만, `DeviceNotRegistered`는 토큰 무효화, 그 밖의 거절은 사유별 error 로그, receipt 는 나중에 조회.
 *
 * 앱 토글("이어 PICK 알림")은 보지 않는다 — 그 토글은 드립 도착 알림의 수신 설정이다. 광고성 알림의 수신 여부는 호출부가
 * 마케팅 수신 동의로 이미 걸렀다.
 */
@Injectable()
export class TargetedPushService {
  private readonly logger = new Logger(TargetedPushService.name);

  constructor(
    private readonly notificationLogRepository: NotificationLogRepository,
    private readonly deviceTokenService: DeviceTokenService,
    private readonly pushClient: PushClient,
    private readonly pushReceiptService: PushReceiptService,
    private readonly uninstallEstimateService: UninstallEstimateService,
  ) {}

  /** 보낼 수 있는 기기(OS 권한 허용 · 유효한 Expo 토큰)가 있는 사용자만 남긴다 */
  async filterDeliverableUserIds(userIds: string[]): Promise<Set<string>> {
    return new Set(
      groupByUserId(
        await this.deviceTokenService.findDeliverableByUserIds(userIds),
      ).keys(),
    );
  }

  /** `since` 이후 보낸 기록 중 종류가 `typePrefix`로 시작하는 것 — 호출부의 빈도 판정 원천 */
  async findSentHistory(
    userIds: string[],
    typePrefix: string,
    since: Date,
  ): Promise<{ userId: string; type: string; sentAt: Date }[]> {
    return this.notificationLogRepository.findSentByTypePrefixSince(
      userIds,
      typePrefix,
      since,
    );
  }

  /**
   * 보낼 대상이었지만 보내지 않은 건을 `skipped`로 남긴다 — 실험 비교 그룹(아침 알림 2026-10-31)의 재료다. 사유 칸은 비운다
   * (`skip_reason`은 수신 설정·권한 사유 enum 이고 실험은 그 사유가 아니다 — 종류(`type`)가 비교 그룹임을 말한다)
   */
  async recordSkipped(
    entries: {
      userId: string;
      type: `retention.${string}`;
      deepLink: string;
    }[],
    now: Date,
  ): Promise<void> {
    await this.notificationLogRepository.insertAll(
      entries.map((entry) => ({
        userId: entry.userId,
        type: entry.type,
        deepLink: entry.deepLink,
        scheduledAt: now,
        sentAt: null,
        status: NotificationStatus.SKIPPED,
        skipReason: null,
        openedAt: null,
      })),
    );
  }

  /** `since` 이후 종류가 `type`이고 상태가 `status`인 기록이 있는 사용자 */
  async findLoggedUserIds(
    userIds: string[],
    type: string,
    status: NotificationStatus,
    since: Date,
  ): Promise<Set<string>> {
    return new Set(
      await this.notificationLogRepository.findUserIdsByTypeAndStatusSince(
        userIds,
        type,
        status,
        since,
      ),
    );
  }

  async send(pushes: TargetedPush[], now: Date): Promise<TargetedPushSummary> {
    const summary: TargetedPushSummary = { sent: 0, failed: 0, noDevice: 0 };

    if (pushes.length === 0) {
      return summary;
    }

    const devicesByUserId = groupByUserId(
      await this.deviceTokenService.findDeliverableByUserIds(
        pushes.map((push) => push.userId),
      ),
    );
    const outgoing: {
      userId: string;
      deviceTokenId: string;
      message: PushMessage;
    }[] = [];
    const targets: TargetedPush[] = [];

    for (const push of pushes) {
      const devices = devicesByUserId.get(push.userId) ?? [];

      if (devices.length === 0) {
        summary.noDevice += 1;
        continue;
      }

      targets.push(push);
      const sentTokens = new Set<string>();

      for (const device of devices) {
        const token = device.token as string;

        // 같은 토큰이 여러 행에 남아 있으면(기기 id 가 바뀐 재설치 등) 한 번만 보낸다
        if (sentTokens.has(token)) {
          continue;
        }

        sentTokens.add(token);
        outgoing.push({
          userId: push.userId,
          deviceTokenId: device.id,
          message: {
            to: token,
            title: push.title,
            body: push.body,
            ttl: push.ttl,
            data: { type: push.type, deep_link: push.deepLink },
          },
        });
      }
    }

    const { acceptedUserIds, invalidTokens } = await this.dispatch(
      outgoing,
      now,
    );
    const logs: Partial<NotificationLog>[] = targets.map((push) => {
      const accepted = acceptedUserIds.has(push.userId);

      if (accepted) {
        summary.sent += 1;
      } else {
        summary.failed += 1;
      }

      return {
        userId: push.userId,
        type: push.type,
        deepLink: push.deepLink,
        scheduledAt: now,
        sentAt: accepted ? now : null,
        status: accepted ? NotificationStatus.SENT : NotificationStatus.FAILED,
        skipReason: null,
        openedAt: null,
      };
    });

    // 기록을 먼저 남긴다 — 알림은 이미 나갔고, 기록이 없으면 빈도 판정이 다음 실행에서 다시 보낸다
    await this.notificationLogRepository.insertAll(logs);

    try {
      const invalidatedRows =
        await this.deviceTokenService.invalidateDeliveredTokensDetailed(
          invalidTokens,
          now,
        );
      await this.uninstallEstimateService.recordIfLastToken(invalidatedRows);
    } catch (error) {
      this.logger.warn('push token invalidation failed', {
        device_count: invalidTokens.length,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return summary;
  }

  /** 청크 단위로 보낸다 — 한 청크의 요청 실패는 그 청크의 기기만 미접수로 센다 */
  private async dispatch(
    outgoing: { userId: string; deviceTokenId: string; message: PushMessage }[],
    now: Date,
  ): Promise<{
    acceptedUserIds: Set<string>;
    invalidTokens: { id: string; token: string }[];
  }> {
    const acceptedUserIds = new Set<string>();
    const invalidTokens: { id: string; token: string }[] = [];
    const receipts: {
      ticketId: string;
      deviceTokenId: string;
      token: string;
    }[] = [];
    const rejectedByReason: Record<string, number> = {};

    for (let i = 0; i < outgoing.length; i += EXPO_PUSH_SEND_CHUNK_SIZE) {
      const chunk = outgoing.slice(i, i + EXPO_PUSH_SEND_CHUNK_SIZE);
      let tickets: PushTicket[];

      try {
        tickets = await this.pushClient.send(chunk.map((item) => item.message));
      } catch (error) {
        this.logger.error('push send request failed', {
          message_count: chunk.length,
          error: error instanceof Error ? error.message : String(error),
        });
        continue;
      }

      chunk.forEach((item, index) => {
        const ticket = tickets[index];

        if (ticket.status === 'ok') {
          acceptedUserIds.add(item.userId);

          if (ticket.id) {
            receipts.push({
              ticketId: ticket.id,
              deviceTokenId: item.deviceTokenId,
              token: item.message.to,
            });
          }
        } else if (ticket.error === EXPO_DEVICE_NOT_REGISTERED) {
          invalidTokens.push({
            id: item.deviceTokenId,
            token: item.message.to,
          });
        } else {
          const reason = ticket.error ?? 'unknown';
          rejectedByReason[reason] = (rejectedByReason[reason] ?? 0) + 1;
        }
      });
    }

    const rejectedCount = Object.values(rejectedByReason).reduce(
      (sum, count) => sum + count,
      0,
    );

    if (rejectedCount > 0) {
      // 무효 토큰 외의 거절은 사람이 봐야 하는 오류다 — Slack ERROR 감시가 받는다(드립 도착 알림과 같다)
      this.logger.error('push tickets rejected', {
        rejected_count: rejectedCount,
        reasons: rejectedByReason,
      });
    }

    this.pushReceiptService.track(receipts, now);

    return { acceptedUserIds, invalidTokens };
  }
}

/** Expo 형식이 아닌 토큰(개발 스텁 등)은 보내지 않는다 — 발송 서비스가 요청 전체를 거절한다 */
function groupByUserId(devices: DeviceToken[]): Map<string, DeviceToken[]> {
  const grouped = new Map<string, DeviceToken[]>();

  for (const device of devices) {
    if (!device.token || !EXPO_PUSH_TOKEN_PATTERN.test(device.token)) {
      continue;
    }

    grouped.set(device.userId, [...(grouped.get(device.userId) ?? []), device]);
  }

  return grouped;
}
