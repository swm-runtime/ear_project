import { Logger } from '@nestjs/common';

import { DeviceToken } from '@/modules/user/entities/device-token.entity';
import { DeviceTokenService } from '@/modules/user/services/device-token.service';
import { UserService } from '@/modules/user/services/user.service';
import { UserSettingService } from '@/modules/user/services/user-setting.service';
import { UserMarket } from '@/modules/user/user.enum';

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
import { UninstallEstimateService } from './uninstall-estimate.service';

// 2026-09-17 05:00 KST
const NOW = new Date('2026-09-16T20:00:00.000Z');
/** 그룹의 다음 배치 — NOW 의 24시간 뒤(호출부가 정해 넘긴다) */
const NEXT_BATCH_AT = new Date('2026-09-17T20:00:00.000Z');
const USER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_USER_ID = '22222222-2222-4222-8222-222222222222';
const TOKEN_A = 'ExponentPushToken[aaaa]';
const TOKEN_B = 'ExponentPushToken[bbbb]';

function buildArrival(overrides: Partial<DripArrival> = {}): DripArrival {
  return {
    userId: USER_ID,
    regular: [
      { contentId: 'r1', title: '연봉 협상의 기술', market: UserMarket.KR },
      { contentId: 'r2', title: '이직 타이밍', market: UserMarket.KR },
    ],
    discovery: [
      { contentId: 'd1', title: '처음 듣는 주제', market: UserMarket.KR },
    ],
    ...overrides,
  };
}

/** GLOBAL 사용자의 적립분 — 콘텐츠도 GLOBAL 이다(시장이 다른 편은 알리지 않는다) */
function globalArrival(): DripArrival {
  return buildArrival({
    regular: [
      { contentId: 'r1', title: '연봉 협상의 기술', market: UserMarket.GLOBAL },
      { contentId: 'r2', title: '이직 타이밍', market: UserMarket.GLOBAL },
    ],
    discovery: [
      { contentId: 'd1', title: '처음 듣는 주제', market: UserMarket.GLOBAL },
    ],
  });
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
  let userService: jest.Mocked<UserService>;
  let uninstallEstimateService: jest.Mocked<UninstallEstimateService>;

  const insertedLogs = (): Partial<NotificationLog>[] =>
    notificationLogRepository.insertAll.mock.calls[0][0];
  const sentMessages = (): PushMessage[] =>
    pushClient.send.mock.calls.flatMap(([messages]) => messages);

  beforeEach(() => {
    notificationLogRepository = {
      findUserIdsWithTypePrefixStatusBetween: jest.fn().mockResolvedValue([]),
      insertAll: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<NotificationLogRepository>;

    deviceTokenService = {
      findDeliverableByUserIds: jest
        .fn()
        .mockResolvedValue([buildDevice('device-a', TOKEN_A)]),
      invalidateDeliveredTokensDetailed: jest
        .fn()
        .mockImplementation((targets: { id: string }[]) =>
          Promise.resolve(
            targets.map((target) => ({
              userId: `user-${target.id}`,
              platform: 'ios',
            })),
          ),
        ),
    } as unknown as jest.Mocked<DeviceTokenService>;

    userSettingService = {
      findDripNotificationDisabledUserIds: jest
        .fn()
        .mockResolvedValue(new Set()),
    } as unknown as jest.Mocked<UserSettingService>;

    userService = {
      findMarketsByIds: jest.fn().mockResolvedValue(new Map()),
    } as unknown as jest.Mocked<UserService>;

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

    uninstallEstimateService = {
      recordIfLastToken: jest.fn().mockResolvedValue({}),
    } as unknown as jest.Mocked<UninstallEstimateService>;

    service = new DripArrivalNotificationService(
      notificationLogRepository,
      deviceTokenService,
      userSettingService,
      userService,
      pushClient,
      pushReceiptService,
      uninstallEstimateService,
    );
  });

  it('GLOBAL 사용자에게는 영어 제목으로 보낸다 — 본문은 콘텐츠 제목 그대로다(global-api 2.3)', async () => {
    // given
    userService.findMarketsByIds.mockResolvedValue(
      new Map([[USER_ID, UserMarket.GLOBAL]]),
    );

    // when
    await service.notify([globalArrival()], NOW, NEXT_BATCH_AT);

    // then
    expect(sentMessages()[0]).toMatchObject({
      title: 'Your 3 episodes for today are here',
      body: '연봉 협상의 기술',
    });
  });

  it('GLOBAL 사용자에게 1편이면 단수 영어 제목으로 보낸다', async () => {
    // given
    userService.findMarketsByIds.mockResolvedValue(
      new Map([[USER_ID, UserMarket.GLOBAL]]),
    );

    // when
    await service.notify(
      [
        buildArrival({
          regular: [
            {
              contentId: 'r1',
              title: 'Negotiating a raise',
              market: UserMarket.GLOBAL,
            },
          ],
          discovery: [],
        }),
      ],
      NOW,
      NEXT_BATCH_AT,
    );

    // then
    expect(sentMessages()[0].title).toBe('Your episode for today is here');
  });

  it('적립 뒤 시장을 바꾼 사용자에게는 이전 시장 편을 알리지 않는다(global-api 4.11)', async () => {
    // given — KR 편 3개가 적립된 뒤 GLOBAL 로 옮겼다
    userService.findMarketsByIds.mockResolvedValue(
      new Map([[USER_ID, UserMarket.GLOBAL]]),
    );

    // when
    const summary = await service.notify([buildArrival()], NOW, NEXT_BATCH_AT);

    // then — 알릴 편이 남지 않아 보내지도 기록하지도 않는다
    expect(pushClient.send).not.toHaveBeenCalled();
    expect(summary.sentCount).toBe(0);
  });

  it('섞여 있으면 현재 시장 편만 세고 그 편을 대표로 알린다', async () => {
    // given
    userService.findMarketsByIds.mockResolvedValue(
      new Map([[USER_ID, UserMarket.GLOBAL]]),
    );

    // when
    await service.notify(
      [
        buildArrival({
          regular: [
            {
              contentId: 'r1',
              title: '연봉 협상의 기술',
              market: UserMarket.KR,
            },
            { contentId: 'g1', title: 'K-Pop 101', market: UserMarket.GLOBAL },
          ],
          discovery: [],
        }),
      ],
      NOW,
      NEXT_BATCH_AT,
    );

    // then
    expect(sentMessages()[0]).toMatchObject({
      title: 'Your episode for today is here',
      body: 'K-Pop 101',
    });
  });

  it('언어를 모르는 사용자(조회 결과에 없음)는 종전처럼 한국어로 보낸다', async () => {
    // when — 기본 mock 은 빈 Map 이다
    await service.notify([buildArrival()], NOW, NEXT_BATCH_AT);

    // then
    expect(sentMessages()[0].title).toBe('오늘의 콘텐츠 3편이 도착했어요');
  });

  it('정규 2편과 탐험 1편이 적립되면 "3편 도착" 알림 1건을 보내고 sent 로 기록한다', async () => {
    // when
    const summary = await service.notify([buildArrival()], NOW, NEXT_BATCH_AT);

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
        // 다음 배치(NEXT_BATCH_AT)까지 24시간(notification.md 4.3 — 결정 2026-09-26)
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

  it('시각 A/B 그룹(variant)이 있으면 기록 종류에만 붙고 앱으로 가는 data.type 은 drip_arrival 그대로다(KAN-289)', async () => {
    // when
    await service.notify([buildArrival()], NOW, NEXT_BATCH_AT, 'b');

    // then
    expect(sentMessages()[0].data.type).toBe('drip_arrival');
    expect(insertedLogs()).toEqual([
      expect.objectContaining({
        type: 'drip_arrival.b',
        status: NotificationStatus.SENT,
      }),
    ]);
  });

  it('건너뛴 기록에도 그룹이 남는다', async () => {
    // given
    userSettingService.findDripNotificationDisabledUserIds.mockResolvedValue(
      new Set([USER_ID]),
    );

    // when
    await service.notify([buildArrival()], NOW, NEXT_BATCH_AT, 'a');

    // then
    expect(insertedLogs()).toEqual([
      expect.objectContaining({
        type: 'drip_arrival.a',
        skipReason: NotificationSkipReason.TOGGLE_OFF,
      }),
    ]);
  });

  it('탐험 편만 1편 적립되면 그 콘텐츠를 대표로 삼고 콘텐츠로 이동한다', async () => {
    // given — 정규 후보가 고갈됐다
    const arrival = buildArrival({ regular: [] });

    // when
    await service.notify([arrival], NOW, NEXT_BATCH_AT);

    // then
    expect(sentMessages()[0]).toMatchObject({
      title: '오늘의 콘텐츠 1편이 도착했어요',
      body: '처음 듣는 주제',
      data: { deep_link: 'ear://contents/d1', content_count: 1 },
    });
  });

  it('오늘 이미 보낸 사용자는 보내지 않고 daily_cap 으로 기록한다', async () => {
    // given
    notificationLogRepository.findUserIdsWithTypePrefixStatusBetween.mockResolvedValue(
      [USER_ID],
    );

    // when
    await service.notify([buildArrival()], NOW, NEXT_BATCH_AT);

    // then — 판정 창은 서비스 날짜(04:00 KST 경계)다
    expect(
      notificationLogRepository.findUserIdsWithTypePrefixStatusBetween,
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
    await service.notify([buildArrival()], NOW, NEXT_BATCH_AT);

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
    await service.notify([buildArrival()], NOW, NEXT_BATCH_AT);

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
    await service.notify([buildArrival()], NOW, NEXT_BATCH_AT);

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
      NEXT_BATCH_AT,
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
    await service.notify([buildArrival()], NOW, NEXT_BATCH_AT);

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
    const summary = await service.notify([buildArrival()], NOW, NEXT_BATCH_AT);

    // then
    expect(
      deviceTokenService.invalidateDeliveredTokensDetailed,
    ).toHaveBeenCalledWith([{ id: 'device-a', token: TOKEN_A }], NOW);
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
    await service.notify([buildArrival()], NOW, NEXT_BATCH_AT);

    // then — 무효 토큰이 아닌 오류는 토큰을 건드리지 않는다
    expect(insertedLogs()[0]).toMatchObject({
      status: NotificationStatus.SENT,
    });
    expect(
      deviceTokenService.invalidateDeliveredTokensDetailed,
    ).toHaveBeenCalledWith([], NOW);
  });

  it('발송 요청 자체가 실패하면 failed 로 기록하고 던지지 않는다', async () => {
    // given
    pushClient.send.mockRejectedValue(new Error('network down'));

    // when
    const summary = await service.notify([buildArrival()], NOW, NEXT_BATCH_AT);

    // then
    expect(insertedLogs()[0]).toMatchObject({
      status: NotificationStatus.FAILED,
    });
    expect(summary.failedCount).toBe(1);
  });

  it('접수된 ticket 은 receipt 확인 대기에 올린다', async () => {
    // when
    await service.notify([buildArrival()], NOW, NEXT_BATCH_AT);

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
    await service.notify([buildArrival()], NOW, NEXT_BATCH_AT);

    // then
    expect(sentMessages()).toHaveLength(1);
  });

  it('토큰 무효화가 실패해도 발송 기록은 남는다 — 기록이 없으면 하루 1건 판정이 다시 보낸다', async () => {
    // given
    pushClient.send.mockResolvedValue([
      { status: 'error', error: 'DeviceNotRegistered', message: 'gone' },
    ]);
    deviceTokenService.invalidateDeliveredTokensDetailed.mockRejectedValue(
      new Error('db blip'),
    );

    // when
    const act = service.notify([buildArrival()], NOW, NEXT_BATCH_AT);

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
    await service.notify([buildArrival()], NOW, NEXT_BATCH_AT);

    // then
    expect(
      pushClient.send.mock.calls.map(([messages]) => messages.length),
    ).toEqual([100, 1]);
  });

  it('적립이 없는 입력은 아무것도 조회하지 않는다', async () => {
    // when
    await service.notify(
      [buildArrival({ regular: [], discovery: [] })],
      NOW,
      NEXT_BATCH_AT,
    );

    // then
    expect(
      notificationLogRepository.findUserIdsWithTypePrefixStatusBetween,
    ).not.toHaveBeenCalled();
    expect(notificationLogRepository.insertAll).not.toHaveBeenCalled();
  });

  it('DeviceNotRegistered 가 아닌 접수 거절은 사유별 건수를 error 로 남긴다 — 자격 증명 불량이 조용히 묻히지 않는다', async () => {
    // given
    const errorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    pushClient.send.mockResolvedValue([
      { status: 'error', error: 'InvalidCredentials', message: 'bad apns key' },
    ]);

    try {
      // when
      await service.notify([buildArrival()], NOW, NEXT_BATCH_AT);

      // then
      expect(errorSpy).toHaveBeenCalledWith(
        'push tickets rejected',
        expect.objectContaining({
          rejected_count: 1,
          reasons: { InvalidCredentials: 1 },
        }),
      );
      // 토큰은 무효화하지 않는다 — 기기가 아니라 자격 증명의 문제다
      expect(
        deviceTokenService.invalidateDeliveredTokensDetailed,
      ).toHaveBeenCalledWith([], NOW);
    } finally {
      errorSpy.mockRestore();
    }
  });
});
