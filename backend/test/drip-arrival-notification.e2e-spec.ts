import 'dotenv/config';

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';

import { AppModule } from '@/app.module';
import { AuthService } from '@/modules/auth/services/auth.service';
import { NotificationLog } from '@/modules/notification/entities/notification-log.entity';
import {
  NotificationSkipReason,
  NotificationStatus,
  NotificationType,
} from '@/modules/notification/notification.enum';
import {
  DripArrival,
  PushMessage,
  PushTicket,
} from '@/modules/notification/notification.types';
import { PushClient } from '@/modules/notification/push/push.client';
import { DripArrivalNotificationService } from '@/modules/notification/services/drip-arrival-notification.service';
import { User } from '@/modules/user/entities/user.entity';
import { DeviceTokenService } from '@/modules/user/services/device-token.service';
import { UserSettingService } from '@/modules/user/services/user-setting.service';
import { DevicePlatform, SocialProvider } from '@/modules/user/user.enum';

/**
 * KAN-68 — 드립 도착 알림의 **판정·기록이 실제 DB에서 맞게 걸리는지** 본다.
 *
 * 발송 수단만 가짜로 바꾼다(실제 Expo 호출 없음). 기기 등록·알림 토글은 실제 Service 경로로 심어,
 * "권한 허용 · 토큰 있음 · 무효화 안 됨" 조회와 "행 없으면 토글 켜짐" 기본값, 서비스 날짜 창의
 * 하루 1건 판정, `notification_logs` 저장, 로그아웃의 토큰 해제가 SQL 에서 맞는지가 목적이다.
 *
 * 자기 데이터를 직접 심고 끝나면 지운다(`notification_logs`·`device_tokens`는 users CASCADE).
 */
describe('드립 도착 알림 E2E', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let service: DripArrivalNotificationService;
  let deviceTokenService: DeviceTokenService;

  const sent: PushMessage[] = [];
  const fakePushClient: PushClient = {
    send: (messages: PushMessage[]): Promise<PushTicket[]> => {
      sent.push(...messages);
      return Promise.resolve(
        messages.map((message) =>
          message.to.includes('gone')
            ? {
                status: 'error' as const,
                error: 'DeviceNotRegistered',
                message: 'gone',
              }
            : { status: 'ok' as const, id: null },
        ),
      );
    },
    getReceipts: () => Promise.resolve(new Map()),
  };

  const userIds: string[] = [];
  // 2026-09-17 05:00 KST — 테스트끼리 날짜가 겹치지 않게 사용자를 나눈다
  const NOW = new Date('2026-09-16T20:00:00.000Z');

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PushClient)
      .useValue(fakePushClient)
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();

    dataSource = app.get(DataSource);
    service = app.get(DripArrivalNotificationService);
    deviceTokenService = app.get(DeviceTokenService);
  }, 60_000);

  beforeEach(() => {
    sent.length = 0;
  });

  afterAll(async () => {
    for (const userId of userIds) {
      await dataSource.query(`DELETE FROM users WHERE id = $1`, [userId]);
    }
    await app.close();
  }, 60_000);

  it('권한 허용 기기가 있는 사용자에게 정규 + 탐험을 합친 1건을 보내고 sent 로 남긴다', async () => {
    // given — 토글 행이 없다(기본 켜짐)
    const userId = await createUser('sent');
    await registerDevice(userId, 'device-1', 'ExponentPushToken[sent]', true);

    // when
    await service.notify([arrival(userId)], NOW);

    // then
    expect(sent).toEqual([
      expect.objectContaining({
        to: 'ExponentPushToken[sent]',
        title: '오늘의 콘텐츠 3편이 도착했어요',
      }),
    ]);
    expect(await findLogs(userId)).toEqual([
      expect.objectContaining({
        type: NotificationType.DRIP_ARRIVAL,
        status: NotificationStatus.SENT,
        skipReason: null,
        deepLink: 'ear://library',
      }),
    ]);
  });

  it('같은 서비스 날짜에 두 번째 판정은 daily_cap, 다음 서비스 날짜는 다시 보낸다', async () => {
    // given
    const userId = await createUser('cap');
    await registerDevice(userId, 'device-1', 'ExponentPushToken[cap]', true);
    await service.notify([arrival(userId)], NOW);
    sent.length = 0;

    // when — 같은 날 03:59 KST 직전(다음 날 03:00 KST)은 아직 같은 서비스 날짜다
    await service.notify(
      [arrival(userId)],
      new Date('2026-09-17T18:00:00.000Z'),
    );

    // then
    expect(sent).toEqual([]);
    expect((await findLogs(userId)).map((log) => log.skipReason)).toEqual([
      null,
      NotificationSkipReason.DAILY_CAP,
    ]);

    // when — 다음 서비스 날짜 04:00 KST
    await service.notify(
      [arrival(userId)],
      new Date('2026-09-17T19:00:00.000Z'),
    );

    // then
    expect(sent).toHaveLength(1);
  });

  it('토글을 끈 사용자는 toggle_off, 권한 거부 기기만 있는 사용자는 no_permission 이다', async () => {
    // given
    const offUserId = await createUser('off');
    await registerDevice(offUserId, 'device-1', 'ExponentPushToken[off]', true);
    await app
      .get(UserSettingService)
      .updateSettings(offUserId, { isDripNotificationEnabled: false });
    const deniedUserId = await createUser('denied');
    await registerDevice(deniedUserId, 'device-1', null, false);

    // when
    await service.notify([arrival(offUserId), arrival(deniedUserId)], NOW);

    // then
    expect(sent).toEqual([]);
    expect((await findLogs(offUserId))[0].skipReason).toBe(
      NotificationSkipReason.TOGGLE_OFF,
    );
    expect((await findLogs(deniedUserId))[0].skipReason).toBe(
      NotificationSkipReason.NO_PERMISSION,
    );
  });

  it('발송 서비스가 DeviceNotRegistered 로 거부한 기기는 무효화되어 다음 판정에서 빠진다', async () => {
    // given
    const userId = await createUser('gone');
    await registerDevice(userId, 'device-1', 'ExponentPushToken[gone]', true);

    // when
    await service.notify([arrival(userId)], NOW);

    // then
    expect((await findLogs(userId))[0].status).toBe(NotificationStatus.FAILED);
    expect(await deviceTokenService.findDeliverableByUserIds([userId])).toEqual(
      [],
    );
  });

  it('로그아웃한 기기는 발송 대상에서 빠지고, 다시 등록하면 돌아온다', async () => {
    // given
    const userId = await createUser('logout');
    await registerDevice(userId, 'device-1', 'ExponentPushToken[out]', true);

    // when
    await app
      .get(AuthService)
      .logout({ userId, deviceId: `device-1-${userId}` }, new Date());

    // then
    expect(await deviceTokenService.findDeliverableByUserIds([userId])).toEqual(
      [],
    );

    // when — 같은 기기에서 다시 로그인해 앱이 등록한다
    await registerDevice(userId, 'device-1', 'ExponentPushToken[out]', true);

    // then
    expect(
      await deviceTokenService.findDeliverableByUserIds([userId]),
    ).toHaveLength(1);
  });

  it('늦게 온 무효 판정은 그사이 새 토큰으로 재등록된 기기를 끄지 않는다', async () => {
    // given — 옛 토큰으로 보낸 뒤 같은 기기에서 앱을 다시 깔아 새 토큰이 등록됐다
    const userId = await createUser('reinstall');
    await registerDevice(userId, 'device-1', 'ExponentPushToken[old]', true);
    const [device] = await deviceTokenService.findDeliverableByUserIds([
      userId,
    ]);
    await registerDevice(userId, 'device-1', 'ExponentPushToken[new]', true);

    // when — receipt 가 옛 토큰을 DeviceNotRegistered 로 알려준다
    const invalidated = await deviceTokenService.invalidateDeliveredTokens(
      [{ id: device.id, token: 'ExponentPushToken[old]' }],
      new Date(),
    );

    // then
    expect(invalidated).toBe(0);
    expect(await deviceTokenService.findDeliverableByUserIds([userId])).toEqual(
      [expect.objectContaining({ token: 'ExponentPushToken[new]' })],
    );
  });

  // --- 헬퍼 ---

  function arrival(userId: string): DripArrival {
    return {
      userId,
      regular: [
        { contentId: 'r1', title: '정규 1' },
        { contentId: 'r2', title: '정규 2' },
      ],
      discovery: [{ contentId: 'd1', title: '탐험 1' }],
    };
  }

  async function createUser(label: string): Promise<string> {
    const repository = dataSource.getRepository(User);
    const user = await repository.save(
      repository.create({
        provider: SocialProvider.KAKAO,
        providerUserId: `e2e-push-${label}-${Date.now()}`,
        onboardingCompleted: true,
      }),
    );
    userIds.push(user.id);

    return user.id;
  }

  async function registerDevice(
    userId: string,
    deviceId: string,
    pushToken: string | null,
    isOsPermissionGranted: boolean,
  ): Promise<void> {
    await deviceTokenService.register(
      {
        userId,
        // 기기 id 는 사용자마다 달라야 한다 — 같은 기기의 다른 계정 등록은 무효화된다
        deviceId: `${deviceId}-${userId}`,
        pushToken,
        platform: DevicePlatform.IOS,
        isOsPermissionGranted,
        appVersion: '1.0.0',
      },
      new Date(),
    );
  }

  function findLogs(userId: string): Promise<NotificationLog[]> {
    return dataSource
      .getRepository(NotificationLog)
      .find({ where: { userId }, order: { id: 'ASC' } });
  }
});
