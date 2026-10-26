import { DeviceToken } from '@/modules/user/entities/device-token.entity';
import { DeviceTokenService } from '@/modules/user/services/device-token.service';

import { NotificationStatus } from '../notification.enum';
import { PushMessage } from '../notification.types';
import { PushClient } from '../push/push.client';
import { NotificationLogRepository } from '../repositories/notification-log.repository';
import { PushReceiptService } from './push-receipt.service';
import { TargetedPush, TargetedPushService } from './targeted-push.service';
import { UninstallEstimateService } from './uninstall-estimate.service';

const NOW = new Date('2026-10-27T09:00:00.000Z');
const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';

const device = (id: string, userId: string, token: string): DeviceToken =>
  ({ id, userId, token }) as DeviceToken;

const push = (userId: string): TargetedPush => ({
  userId,
  type: 'retention.streak_keep.a',
  title: '(광고) 2일 연속으로 듣고 있어요',
  body: '오늘도 이어 가면 3일째예요\n수신거부: 설정 > 알림',
  deepLink: 'ear://library',
  ttl: 10_800,
});

describe('TargetedPushService', () => {
  let service: TargetedPushService;
  let notificationLogRepository: jest.Mocked<NotificationLogRepository>;
  let deviceTokenService: jest.Mocked<DeviceTokenService>;
  let pushClient: jest.Mocked<PushClient>;

  beforeEach(() => {
    notificationLogRepository = {
      insertAll: jest.fn().mockResolvedValue(undefined),
      findSentByTypePrefixSince: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<NotificationLogRepository>;
    deviceTokenService = {
      findDeliverableByUserIds: jest
        .fn()
        .mockResolvedValue([
          device('d1', USER_A, 'ExponentPushToken[a1]'),
          device('d2', USER_A, 'ExponentPushToken[a1]'),
          device('d3', USER_B, 'ExponentPushToken[b1]'),
          device('d4', USER_B, 'dev-push-token'),
        ]),
      invalidateDeliveredTokensDetailed: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<DeviceTokenService>;
    pushClient = {
      send: jest.fn().mockImplementation((messages: PushMessage[]) =>
        Promise.resolve(
          messages.map((message) =>
            message.to === 'ExponentPushToken[b1]'
              ? {
                  status: 'error' as const,
                  error: 'DeviceNotRegistered',
                  message: 'gone',
                }
              : { status: 'ok' as const, id: 'ticket' },
          ),
        ),
      ),
      getReceipts: jest.fn(),
    };

    service = new TargetedPushService(
      notificationLogRepository,
      deviceTokenService,
      pushClient,
      { track: jest.fn() } as unknown as PushReceiptService,
      {
        recordIfLastToken: jest.fn().mockResolvedValue({}),
      } as unknown as UninstallEstimateService,
    );
  });

  it('같은 토큰은 한 번만, Expo 형식이 아닌 토큰은 보내지 않는다', async () => {
    // when
    await service.send([push(USER_A), push(USER_B)], NOW);

    // then
    const messages = pushClient.send.mock.calls.flatMap(([batch]) => batch);
    expect(messages.map((message) => message.to)).toEqual([
      'ExponentPushToken[a1]',
      'ExponentPushToken[b1]',
    ]);
    expect(messages[0]).toMatchObject({
      ttl: 10_800,
      data: { type: 'retention.streak_keep.a', deep_link: 'ear://library' },
    });
  });

  it('접수되면 sent, 무효 토큰뿐이면 failed 로 남기고 토큰을 무효화한다', async () => {
    // when
    const summary = await service.send([push(USER_A), push(USER_B)], NOW);

    // then
    expect(summary).toEqual({ sent: 1, failed: 1, noDevice: 0 });
    const logs = notificationLogRepository.insertAll.mock.calls[0][0];
    expect(logs.map((log) => [log.userId, log.status, log.type])).toEqual([
      [USER_A, NotificationStatus.SENT, 'retention.streak_keep.a'],
      [USER_B, NotificationStatus.FAILED, 'retention.streak_keep.a'],
    ]);
    expect(
      deviceTokenService.invalidateDeliveredTokensDetailed,
    ).toHaveBeenCalledWith([{ id: 'd3', token: 'ExponentPushToken[b1]' }], NOW);
  });

  it('보낼 기기가 없는 사용자는 기록 없이 건너뛴다', async () => {
    // given
    deviceTokenService.findDeliverableByUserIds.mockResolvedValue([]);

    // when
    const summary = await service.send([push(USER_A)], NOW);

    // then
    expect(summary).toEqual({ sent: 0, failed: 0, noDevice: 1 });
    expect(pushClient.send).not.toHaveBeenCalled();
    expect(notificationLogRepository.insertAll).toHaveBeenCalledWith([]);
  });
});
