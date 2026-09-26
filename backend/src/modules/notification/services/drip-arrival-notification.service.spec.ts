import { DeviceToken } from '@/modules/user/entities/device-token.entity';
import { DeviceTokenService } from '@/modules/user/services/device-token.service';
import { UserSettingService } from '@/modules/user/services/user-setting.service';

import { NotificationLog } from '../entities/notification-log.entity';
import {
  NotificationSkipReason,
  NotificationStatus,
  NotificationType,
} from '../notification.enum';
import { DripArrival, PushMessage } from '../notification.types';
import { PushClient } from '../push/push.client';
import { NotificationLogRepository } from '../repositories/notification-log.repository';
import { DripArrivalNotificationService } from './drip-arrival-notification.service';
import { PushReceiptService } from './push-receipt.service';

// 2026-09-17 05:00 KST
const NOW = new Date('2026-09-16T20:00:00.000Z');
const USER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_USER_ID = '22222222-2222-4222-8222-222222222222';
const TOKEN_A = 'ExponentPushToken[aaaa]';
const TOKEN_B = 'ExponentPushToken[bbbb]';

function buildArrival(overrides: Partial<DripArrival> = {}): DripArrival {
  return {
    userId: USER_ID,
    regular: [
      { contentId: 'r1', title: '연봉 협상의 기술' },
      { contentId: 'r2', title: '이직 타이밍' },
    ],
    discovery: [{ contentId: 'd1', title: '처음 듣는 주제' }],
    ...overrides,
  };
}

function buildDevice(
  id: string,
  token: string,
  userId: string = USER_ID,
): DeviceToken {
  return { id, userId, token } as DeviceToken;
}

describe('DripArrivalNotificationService', () => {
  let service: DripArrivalNotificationService;
  let notificationLogRepository: jest.Mocked<NotificationLogRepository>;
  let deviceTokenService: jest.Mocked<DeviceTokenService>;
  let userSettingService: jest.Mocked<UserSettingService>;
  let pushClient: jest.Mocked<PushClient>;
  let pushReceiptService: jest.Mocked<PushReceiptService>;

  const insertedLogs = (): Partial<NotificationLog>[] =>
    notificationLogRepository.insertAll.mock.calls[0][0];
  const sentMessages = (): PushMessage[] =>
    pushClient.send.mock.calls.flatMap(([messages]) => messages);

  beforeEach(() => {
    notificationLogRepository = {
      findUserIdsWithStatusBetween: jest.fn().mockResolvedValue([]),
      insertAll: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<NotificationLogRepository>;

    deviceTokenService = {
      findDeliverableByUserIds: jest
        .fn()
        .mockResolvedValue([buildDevice('device-a', TOKEN_A)]),
      invalidateDeliveredTokens: jest
        .fn()
        .mockImplementation((targets: unknown[]) =>
          Promise.resolve(targets.length),
        ),
    } as unknown as jest.Mocked<DeviceTokenService>;

    userSettingService = {
      findDripNotificationDisabledUserIds: jest
        .fn()
        .mockResolvedValue(new Set()),
    } as unknown as jest.Mocked<UserSettingService>;

    pushClient = {
      send: jest.fn().mockImplementation((messages: PushMessage[]) =>
        Promise.resolve(
          messages.map((_, index) => ({
            status: 'ok' as const,
            id: `ticket-${index}`,
          })),
        ),
      ),
      getReceipts: jest.fn(),
    };

    pushReceiptService = {
      track: jest.fn(),
    } as unknown as jest.Mocked<PushReceiptService>;

    service = new DripArrivalNotificationService(
      notificationLogRepository,
      deviceTokenService,
      userSettingService,
      pushClient,
      pushReceiptService,
    );
  });

  it('정규 2편과 탐험 1편이 적립되면 "3편 도착" 알림 1건을 보내고 sent 로 기록한다', async () => {
    // when
    const summary = await service.notify([buildArrival()], NOW);

    // then — 대표 제목은 정규 첫 편, 2편 이상이라 라이브러리로 간다(notification.md 4.3)
    expect(sentMessages()).toEqual([
      {
        to: TOKEN_A,
        title: '오늘의 콘텐츠 3편이 도착했어요',
        body: '연봉 협상의 기술',
        data: {
          type: 'drip_arrival',
          deep_link: 'ear://library',
          content_count: 3,
        },
        // NOW = 05:00 KST 정각 → 다음 05:00 KST까지 24시간(notification.md 4.3 — 결정 2026-09-26)
        ttl: 24 * 60 * 60,
      },
    ]);
    expect(insertedLogs()).toEqual([
      expect.objectContaining({
        userId: USER_ID,
        type: NotificationType.DRIP_ARRIVAL,
        status: NotificationStatus.SENT,
        skipReason: null,
        deepLink: 'ear://library',
        scheduledAt: NOW,
        sentAt: NOW,
      }),
    ]);
    expect(summary.sentCount).toBe(1);
  });

  it('탐험 편만 1편 적립되면 그 콘텐츠를 대표로 삼고 콘텐츠로 이동한다', async () => {
    // given — 정규 후보가 고갈됐다
    const arrival = buildArrival({ regular: [] });

    // when
    await service.notify([arrival], NOW);

    // then
    expect(sentMessages()[0]).toMatchObject({
      title: '오늘의 콘텐츠 1편이 도착했어요',
      body: '처음 듣는 주제',
      data: { deep_link: 'ear://contents/d1', content_count: 1 },
    });
  });

  it('오늘 이미 보낸 사용자는 보내지 않고 daily_cap 으로 기록한다', async () => {
    // given
    notificationLogRepository.findUserIdsWithStatusBetween.mockResolvedValue([
      USER_ID,
    ]);

    // when
    await service.notify([buildArrival()], NOW);

    // then — 판정 창은 서비스 날짜(04:00 KST 경계)다
    expect(
      notificationLogRepository.findUserIdsWithStatusBetween,
    ).toHaveBeenCalledWith(
      [USER_ID],
      NotificationType.DRIP_ARRIVAL,
      NotificationStatus.SENT,
      new Date('2026-09-16T19:00:00.000Z'),
      new Date('2026-09-17T19:00:00.000Z'),
    );
    expect(pushClient.send).not.toHaveBeenCalled();
    expect(insertedLogs()).toEqual([
      expect.objectContaining({
        status: NotificationStatus.SKIPPED,
        skipReason: NotificationSkipReason.DAILY_CAP,
      }),
    ]);
  });

  it('앱 알림 토글을 끈 사용자는 보내지 않고 toggle_off 로 기록한다', async () => {
    // given
    userSettingService.findDripNotificationDisabledUserIds.mockResolvedValue(
      new Set([USER_ID]),
    );

    // when
    await service.notify([buildArrival()], NOW);

    // then
    expect(pushClient.send).not.toHaveBeenCalled();
    expect(insertedLogs()[0]).toMatchObject({
      status: NotificationStatus.SKIPPED,
      skipReason: NotificationSkipReason.TOGGLE_OFF,
    });
  });

  it('보낼 수 있는 기기가 없으면 no_permission 으로 기록한다', async () => {
    // given — 권한 거부·토큰 없음·무효화된 기기는 조회 단계에서 빠진다
    deviceTokenService.findDeliverableByUserIds.mockResolvedValue([]);

    // when
    await service.notify([buildArrival()], NOW);

    // then
    expect(pushClient.send).not.toHaveBeenCalled();
    expect(insertedLogs()[0]).toMatchObject({
      status: NotificationStatus.SKIPPED,
      skipReason: NotificationSkipReason.NO_PERMISSION,
    });
  });

  it('Expo 형식이 아닌 토큰(개발 스텁)은 보내지 않는다', async () => {
    // given
    deviceTokenService.findDeliverableByUserIds.mockResolvedValue([
      buildDevice('device-dev', 'dev-push-token'),
    ]);

    // when
    await service.notify([buildArrival()], NOW);

    // then
    expect(pushClient.send).not.toHaveBeenCalled();
    expect(insertedLogs()[0]).toMatchObject({
      skipReason: NotificationSkipReason.NO_PERMISSION,
    });
  });

  it('토글이 꺼진 사용자의 기기는 조회하지 않는다', async () => {
    // given
    userSettingService.findDripNotificationDisabledUserIds.mockResolvedValue(
      new Set([USER_ID]),
    );

    // when
    await service.notify(
      [buildArrival(), buildArrival({ userId: OTHER_USER_ID })],
      NOW,
    );

    // then
    expect(deviceTokenService.findDeliverableByUserIds).toHaveBeenCalledWith([
      OTHER_USER_ID,
    ]);
  });

  it('여러 기기를 가진 사용자는 모든 기기로 보내고 기록은 1행이다', async () => {
    // given
    deviceTokenService.findDeliverableByUserIds.mockResolvedValue([
      buildDevice('device-a', TOKEN_A),
      buildDevice('device-b', TOKEN_B),
    ]);

    // when
    await service.notify([buildArrival()], NOW);

    // then
    expect(sentMessages().map((message) => message.to)).toEqual([
      TOKEN_A,
      TOKEN_B,
    ]);
    expect(insertedLogs()).toHaveLength(1);
  });

  it('발송 서비스가 DeviceNotRegistered 로 거부한 기기는 무효화하고, 전부 거부되면 failed 로 기록한다', async () => {
    // given
    pushClient.send.mockResolvedValue([
      { status: 'error', error: 'DeviceNotRegistered', message: 'gone' },
    ]);

    // when
    const summary = await service.notify([buildArrival()], NOW);

    // then
    expect(deviceTokenService.invalidateDeliveredTokens).toHaveBeenCalledWith(
      [{ id: 'device-a', token: TOKEN_A }],
      NOW,
    );
    expect(insertedLogs()[0]).toMatchObject({
      status: NotificationStatus.FAILED,
      sentAt: null,
    });
    expect(summary).toMatchObject({
      failedCount: 1,
      invalidatedDeviceCount: 1,
    });
  });

  it('한 대라도 접수되면 sent 다', async () => {
    // given
    deviceTokenService.findDeliverableByUserIds.mockResolvedValue([
      buildDevice('device-a', TOKEN_A),
      buildDevice('device-b', TOKEN_B),
    ]);
    pushClient.send.mockResolvedValue([
      { status: 'error', error: 'MessageRateExceeded', message: 'slow down' },
      { status: 'ok', id: 'ticket-b' },
    ]);

    // when
    await service.notify([buildArrival()], NOW);

    // then — 무효 토큰이 아닌 오류는 토큰을 건드리지 않는다
    expect(insertedLogs()[0]).toMatchObject({
      status: NotificationStatus.SENT,
    });
    expect(deviceTokenService.invalidateDeliveredTokens).toHaveBeenCalledWith(
      [],
      NOW,
    );
  });

  it('발송 요청 자체가 실패하면 failed 로 기록하고 던지지 않는다', async () => {
    // given
    pushClient.send.mockRejectedValue(new Error('network down'));

    // when
    const summary = await service.notify([buildArrival()], NOW);

    // then
    expect(insertedLogs()[0]).toMatchObject({
      status: NotificationStatus.FAILED,
    });
    expect(summary.failedCount).toBe(1);
  });

  it('접수된 ticket 은 receipt 확인 대기에 올린다', async () => {
    // when
    await service.notify([buildArrival()], NOW);

    // then
    expect(pushReceiptService.track).toHaveBeenCalledWith(
      [{ ticketId: 'ticket-0', deviceTokenId: 'device-a', token: TOKEN_A }],
      NOW,
    );
  });

  it('같은 토큰이 여러 행에 있어도 한 번만 보낸다', async () => {
    // given — 기기 id 가 바뀐 재설치로 같은 토큰이 두 행에 남았다
    deviceTokenService.findDeliverableByUserIds.mockResolvedValue([
      buildDevice('device-old', TOKEN_A),
      buildDevice('device-new', TOKEN_A),
    ]);

    // when
    await service.notify([buildArrival()], NOW);

    // then
    expect(sentMessages()).toHaveLength(1);
  });

  it('토큰 무효화가 실패해도 발송 기록은 남는다 — 기록이 없으면 하루 1건 판정이 다시 보낸다', async () => {
    // given
    pushClient.send.mockResolvedValue([
      { status: 'error', error: 'DeviceNotRegistered', message: 'gone' },
    ]);
    deviceTokenService.invalidateDeliveredTokens.mockRejectedValue(
      new Error('db blip'),
    );

    // when
    const act = service.notify([buildArrival()], NOW);

    // then
    await expect(act).resolves.toBeDefined();
    expect(notificationLogRepository.insertAll).toHaveBeenCalled();
  });

  it('메시지는 100건씩 나눠 보낸다', async () => {
    // given — 기기 101대
    deviceTokenService.findDeliverableByUserIds.mockResolvedValue(
      Array.from({ length: 101 }, (_, index) =>
        buildDevice(`device-${index}`, `ExponentPushToken[${index}]`),
      ),
    );

    // when
    await service.notify([buildArrival()], NOW);

    // then
    expect(
      pushClient.send.mock.calls.map(([messages]) => messages.length),
    ).toEqual([100, 1]);
  });

  it('적립이 없는 입력은 아무것도 조회하지 않는다', async () => {
    // when
    await service.notify([buildArrival({ regular: [], discovery: [] })], NOW);

    // then
    expect(
      notificationLogRepository.findUserIdsWithStatusBetween,
    ).not.toHaveBeenCalled();
    expect(notificationLogRepository.insertAll).not.toHaveBeenCalled();
  });
});
