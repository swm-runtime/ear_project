import { Injectable, Logger } from '@nestjs/common';

import { toServiceDayRange } from '@/common/utils/service-date.util';
import { DeviceToken } from '@/modules/user/entities/device-token.entity';
import { DeviceTokenService } from '@/modules/user/services/device-token.service';
import { UserSettingService } from '@/modules/user/services/user-setting.service';

import { NotificationLog } from '../entities/notification-log.entity';
import {
  buildContentDeepLink,
  buildDripArrivalTitle,
  DEEP_LINK_LIBRARY,
  EXPO_DEVICE_NOT_REGISTERED,
  EXPO_PUSH_SEND_CHUNK_SIZE,
  EXPO_PUSH_TOKEN_PATTERN,
} from '../notification.constant';
import {
  NotificationSkipReason,
  NotificationStatus,
  NotificationType,
} from '../notification.enum';
import {
  DripArrival,
  DripArrivalNotifySummary,
  PushMessage,
  PushTicket,
} from '../notification.types';
import { NotificationLogRepository } from '../repositories/notification-log.repository';
import { PushClient } from '../push/push.client';
import { PushReceiptService } from './push-receipt.service';

interface OutgoingMessage {
  userId: string;
  deviceTokenId: string;
  message: PushMessage;
}

/** 무효화 대상 — 보낸 토큰이 아직 그 행에 있을 때만 끈다(`DeviceTokenService.invalidateDeliveredTokens`) */
interface DeliveredToken {
  id: string;
  token: string;
}

/**
 * 드립 도착 알림(`notification.md` 4.2·4.3, FR-19). **대상 판정은 여기서 한다** — 편성 배치는 누구에게
 * 무엇이 적립됐는지만 넘긴다.
 *
 * 판정 순서(먼저 걸린 사유로 기록한다):
 * 1. 오늘(서비스 날짜) 이미 `sent`인 드립 도착 알림이 있다 → `skipped · daily_cap`
 * 2. "이어 PICK 알림" 앱 토글이 꺼져 있다 → `skipped · toggle_off`
 * 3. 보낼 수 있는 기기(OS 권한 허용 · 유효한 Expo 토큰)가 없다 → `skipped · no_permission`
 *    (Expo 형식이 아닌 토큰만 있는 경우 — 개발 스텁 — 도 여기로 센다. domain.md 9.1에 따로 둘 사유가 없고,
 *    운영 빌드는 Expo 토큰만 보내므로 지표를 흐릴 만큼 생기지 않는다)
 * 4. 기기마다 보내고, **한 대라도 접수되면 `sent`**, 전부 실패하면 `failed`
 *
 * **정규 + 탐험 편을 합쳐 1건이다**(결정 2026-09-17) — 호출부가 탐험 편성까지 끝낸 뒤 부른다.
 * 티어로 가르지 않고 방해금지도 없다.
 */
@Injectable()
export class DripArrivalNotificationService {
  private readonly logger = new Logger(DripArrivalNotificationService.name);

  constructor(
    private readonly notificationLogRepository: NotificationLogRepository,
    private readonly deviceTokenService: DeviceTokenService,
    private readonly userSettingService: UserSettingService,
    private readonly pushClient: PushClient,
    private readonly pushReceiptService: PushReceiptService,
  ) {}

  async notify(
    arrivals: DripArrival[],
    now: Date,
  ): Promise<DripArrivalNotifySummary> {
    const summary: DripArrivalNotifySummary = {
      sentCount: 0,
      failedCount: 0,
      skippedCount: 0,
      invalidatedDeviceCount: 0,
    };
    const targets = arrivals.filter(
      (arrival) => arrival.regular.length + arrival.discovery.length > 0,
    );

    if (targets.length === 0) {
      return summary;
    }

    const userIds = targets.map((arrival) => arrival.userId);
    const { start, end } = toServiceDayRange(now);
    const [alreadySent, disabled] = await Promise.all([
      this.notificationLogRepository
        .findUserIdsWithStatusBetween(
          userIds,
          NotificationType.DRIP_ARRIVAL,
          NotificationStatus.SENT,
          start,
          end,
        )
        .then((ids) => new Set(ids)),
      this.userSettingService.findDripNotificationDisabledUserIds(userIds),
    ]);
    const devicesByUserId = groupByUserId(
      await this.deviceTokenService.findDeliverableByUserIds(
        userIds.filter((id) => !alreadySent.has(id) && !disabled.has(id)),
      ),
    );

    const logs: Partial<NotificationLog>[] = [];
    const outgoing: OutgoingMessage[] = [];
    const deepLinkByUserId = new Map<string, string>();

    for (const arrival of targets) {
      const deepLink = resolveDeepLink(arrival);
      const skipReason = alreadySent.has(arrival.userId)
        ? NotificationSkipReason.DAILY_CAP
        : disabled.has(arrival.userId)
          ? NotificationSkipReason.TOGGLE_OFF
          : (devicesByUserId.get(arrival.userId)?.length ?? 0) === 0
            ? NotificationSkipReason.NO_PERMISSION
            : null;

      if (skipReason) {
        logs.push(buildLog(arrival.userId, deepLink, now, skipReason));
        summary.skippedCount += 1;
        continue;
      }

      deepLinkByUserId.set(arrival.userId, deepLink);
      const message = buildMessage(arrival, deepLink);
      const sentTokens = new Set<string>();

      for (const device of devicesByUserId.get(arrival.userId) ?? []) {
        // 같은 토큰이 여러 행에 남아 있으면(기기 id 가 바뀐 재설치 등) 한 번만 보낸다
        if (sentTokens.has(device.token as string)) {
          continue;
        }
        sentTokens.add(device.token as string);
        outgoing.push({
          userId: arrival.userId,
          deviceTokenId: device.id,
          message: { ...message, to: device.token as string },
        });
      }
    }

    const { acceptedUserIds, invalidTokens } = await this.send(outgoing, now);

    for (const [userId, deepLink] of deepLinkByUserId) {
      const accepted = acceptedUserIds.has(userId);
      logs.push({
        ...buildLog(userId, deepLink, now, null),
        status: accepted ? NotificationStatus.SENT : NotificationStatus.FAILED,
        sentAt: accepted ? now : null,
      });

      if (accepted) {
        summary.sentCount += 1;
      } else {
        summary.failedCount += 1;
      }
    }

    /**
     * **기록을 먼저 남긴다.** 알림은 이미 나갔다 — 무효화가 실패해 기록까지 건너뛰면 `sent` 행이 없어
     * 하루 1건 판정이 다음 실행에서 같은 사용자에게 다시 보낸다. 토큰 정리는 실패해도 다음 발송이 다시 잡는다.
     */
    await this.notificationLogRepository.insertAll(logs);

    try {
      summary.invalidatedDeviceCount =
        await this.deviceTokenService.invalidateDeliveredTokens(
          invalidTokens,
          now,
        );
    } catch (error) {
      this.logger.warn('push token invalidation failed', {
        device_count: invalidTokens.length,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // 건당 로그를 남기지 않고 묶음 결과를 한 번 남긴다(convention.md 8.3)
    this.logger.log('drip arrival notifications processed', {
      sent_count: summary.sentCount,
      failed_count: summary.failedCount,
      skipped_count: summary.skippedCount,
      invalidated_device_count: summary.invalidatedDeviceCount,
    });

    return summary;
  }

  /**
   * 청크 단위로 보낸다. 한 청크의 요청이 실패해도 다음 청크는 계속한다 — 그 청크의 기기는 접수되지
   * 않은 것으로 센다(같은 사용자의 다른 기기가 다른 청크에서 접수되면 그 사용자는 `sent`다).
   */
  private async send(
    outgoing: OutgoingMessage[],
    now: Date,
  ): Promise<{
    acceptedUserIds: Set<string>;
    invalidTokens: DeliveredToken[];
  }> {
    const acceptedUserIds = new Set<string>();
    const invalidTokens: DeliveredToken[] = [];
    const receipts: {
      ticketId: string;
      deviceTokenId: string;
      token: string;
    }[] = [];

    for (let i = 0; i < outgoing.length; i += EXPO_PUSH_SEND_CHUNK_SIZE) {
      const chunk = outgoing.slice(i, i + EXPO_PUSH_SEND_CHUNK_SIZE);
      let tickets: PushTicket[];

      try {
        tickets = await this.pushClient.send(chunk.map((item) => item.message));
      } catch (error) {
        this.logger.warn('push send request failed', {
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
        }
      });
    }

    this.pushReceiptService.track(receipts, now);

    return { acceptedUserIds, invalidTokens };
  }
}

/** 1편이면 그 콘텐츠, 2편 이상이면 라이브러리(`notification.md` 4.3) */
function resolveDeepLink(arrival: DripArrival): string {
  const contents = [...arrival.regular, ...arrival.discovery];

  return contents.length === 1
    ? buildContentDeepLink(contents[0].contentId)
    : DEEP_LINK_LIBRARY;
}

/** 대표 콘텐츠는 정규 첫 편, 정규가 없으면 탐험 편 */
function buildMessage(
  arrival: DripArrival,
  deepLink: string,
): Omit<PushMessage, 'to'> {
  const contents = [...arrival.regular, ...arrival.discovery];

  return {
    title: buildDripArrivalTitle(contents.length),
    body: contents[0].title,
    data: {
      type: NotificationType.DRIP_ARRIVAL,
      deep_link: deepLink,
      content_count: contents.length,
    },
  };
}

function buildLog(
  userId: string,
  deepLink: string,
  now: Date,
  skipReason: NotificationSkipReason | null,
): Partial<NotificationLog> {
  return {
    userId,
    type: NotificationType.DRIP_ARRIVAL,
    deepLink,
    scheduledAt: now,
    sentAt: null,
    status: NotificationStatus.SKIPPED,
    skipReason,
    openedAt: null,
  };
}

/** 개발 스텁 토큰(`dev-push-token`) 같은 Expo 형식이 아닌 값은 보내지 않는다 — 발송 서비스가 요청 전체를 거절한다 */
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
