import 'dotenv/config';

import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { App } from 'supertest/types';
import { DataSource, In } from 'typeorm';

import { AppModule } from '@/app.module';
import { toServiceDayRange } from '@/common/utils/service-date.util';
import { ContentOrigin, ContentStatus } from '@/modules/content/content.enum';
import { Content } from '@/modules/content/entities/content.entity';
import {
  DripArrivalSlot,
  dripArrivalBucketOf,
} from '@/modules/drip/drip-group.policy';
import { DripGroup } from '@/modules/drip/drip.enum';
import { DripBatchRunService } from '@/modules/drip/services/drip-batch-run.service';
import { DripBatchOrchestrator } from '@/modules/drip-batch/drip-batch.orchestrator';
import { NotificationLog } from '@/modules/notification/entities/notification-log.entity';
import { NotificationSkipReason } from '@/modules/notification/notification.enum';
import {
  PushMessage,
  PushTicket,
} from '@/modules/notification/notification.types';
import { PushClient } from '@/modules/notification/push/push.client';
import { User } from '@/modules/user/entities/user.entity';
import { DeviceTokenService } from '@/modules/user/services/device-token.service';
import { DevicePlatform, SocialProvider } from '@/modules/user/user.enum';

/**
 * 드립 도착 알림 시각 A/B(KAN-289) — 실제 DB 에서 07:00·07:30·08:00 크론 경로가 그룹대로 나눠 보내고, 기록 종류에 그룹이
 * 남고(`drip_arrival.a`·`.b`), 하루 1건 판정이 종류 머리로 묶이는지 본다. 스위치는 앱의 ConfigService 에 넣는다 — CI 는
 * `.env.example`(빈 값)을 복사해 쓰므로 process.env 를 바꿔도 소용없다. 발송 수단만 가짜다. 날짜는 다른 테스트와 겹치지 않는
 * 먼 날(2030-01-16)이다.
 */
describe('드립 도착 알림 시각 A/B E2E', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let orchestrator: DripBatchOrchestrator;
  let deviceTokenService: DeviceTokenService;
  let configService: ConfigService;

  const sent: PushMessage[] = [];
  const fakePushClient: PushClient = {
    send: (messages: PushMessage[]): Promise<PushTicket[]> => {
      sent.push(...messages);
      return Promise.resolve(
        messages.map(() => ({ status: 'ok' as const, id: null })),
      );
    },
    getReceipts: () => Promise.resolve(new Map()),
  };

  const RUN_DATE = '2030-01-16';
  /** 2030-01-16 07:00 · 07:30 · 08:00 KST */
  const AT_0700 = new Date('2030-01-15T22:00:00.000Z');
  const AT_0730 = new Date('2030-01-15T22:30:00.000Z');
  const AT_0800 = new Date('2030-01-15T23:00:00.000Z');
  const dayStart = () => toServiceDayRange(AT_0700).start;
  const at = (offsetMs: number) => new Date(dayStart().getTime() + offsetMs);

  const userIds: string[] = [];
  const contentIds: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PushClient)
      .useValue(fakePushClient)
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();

    dataSource = app.get(DataSource);
    orchestrator = app.get(DripBatchOrchestrator);
    deviceTokenService = app.get(DeviceTokenService);
    configService = app.get(ConfigService);

    await dataSource.query(`DELETE FROM drip_batch_runs WHERE run_date = $1`, [
      RUN_DATE,
    ]);
  }, 60_000);

  afterAll(async () => {
    configService.set('DRIP_ARRIVAL_AB_ENABLED', '');
    await dataSource.query(`DELETE FROM drip_batch_runs WHERE run_date = $1`, [
      RUN_DATE,
    ]);
    for (const userId of userIds) {
      await dataSource.query(`DELETE FROM library_items WHERE user_id = $1`, [
        userId,
      ]);
      await dataSource.query(`DELETE FROM users WHERE id = $1`, [userId]);
    }
    for (const contentId of contentIds) {
      await dataSource.query(`DELETE FROM contents WHERE id = $1`, [contentId]);
    }
    await app.close();
  }, 60_000);

  it('켜면 07:00 은 쉬고 07:30 은 A · 08:00 은 B 그룹만 보내며, 기록 종류에 그룹이 남고 하루 1건이 유지된다', async () => {
    // given — 두 그룹이 다 나올 때까지 사용자를 만든다(그룹은 사용자 id 해시라 값으로 고를 수 없다)
    const [content] = await seedContents(1);
    const byBucket: Record<number, string[]> = { 0: [], 1: [] };
    while (byBucket[0].length < 2 || byBucket[1].length < 2) {
      const userId = await createUser(`u${userIds.length}`);
      await registerDevice(userId, `ExponentPushToken[ab-${userId}]`);
      await addItem(userId, content.id, 'drip', at(0), null);
      byBucket[dripArrivalBucketOf(userId)].push(userId);
    }
    const runService = app.get(DripBatchRunService);
    await runService.claim(RUN_DATE, DripGroup.ASIA, at(0));
    await dataSource.query(
      `UPDATE drip_batch_runs SET finished_at = $2 WHERE run_date = $1`,
      [RUN_DATE, at(10_000)],
    );
    configService.set('DRIP_ARRIVAL_AB_ENABLED', 'true');
    const tokensOf = (ids: string[]) =>
      ids.map((id) => `ExponentPushToken[ab-${id}]`).sort();
    const logsOf = () =>
      dataSource.getRepository(NotificationLog).find({
        where: { userId: In(userIds) },
      });

    // when — 07:00 크론
    await orchestrator.notifyTodayArrivals(
      AT_0700,
      DripGroup.ASIA,
      DripArrivalSlot.H0700,
    );
    // then
    expect(sent).toHaveLength(0);

    // when — 07:30 크론
    await orchestrator.notifyTodayArrivals(
      AT_0730,
      DripGroup.ASIA,
      DripArrivalSlot.H0730,
    );
    // then — A 그룹만, 앱이 읽는 data.type 은 그대로
    expect(sent.map((message) => message.to).sort()).toEqual(
      tokensOf(byBucket[0]),
    );
    expect(sent.every((message) => message.data.type === 'drip_arrival')).toBe(
      true,
    );

    // when — 08:00 크론
    await orchestrator.notifyTodayArrivals(
      AT_0800,
      DripGroup.ASIA,
      DripArrivalSlot.H0800,
    );
    // then
    expect(sent.map((message) => message.to).sort()).toEqual(
      tokensOf([...byBucket[0], ...byBucket[1]]),
    );
    const logs = await logsOf();
    expect(
      Object.fromEntries(logs.map((log) => [log.userId, log.type])),
    ).toEqual(
      Object.fromEntries([
        ...byBucket[0].map((id) => [id, 'drip_arrival.a']),
        ...byBucket[1].map((id) => [id, 'drip_arrival.b']),
      ]),
    );

    // when — 같은 날 스위치를 끄고 07:00 경로를 다시 돌려도(재시작 등) 하루 1건이다 — 종류 머리로 센다
    configService.set('DRIP_ARRIVAL_AB_ENABLED', '');
    const before = sent.length;
    await orchestrator.notifyTodayArrivals(AT_0700);
    // then
    expect(sent).toHaveLength(before);
    expect(
      (await logsOf()).filter(
        (log) => log.skipReason === NotificationSkipReason.DAILY_CAP,
      ),
    ).toHaveLength(userIds.length);
  });

  // --- 헬퍼 ---

  async function seedContents(count: number): Promise<Content[]> {
    const repository = dataSource.getRepository(Content);
    const contents: Content[] = [];

    for (let index = 0; index < count; index += 1) {
      const content = await repository.save(
        repository.create({
          title: `E2E 시각 A/B 콘텐츠 ${index}`,
          description: 'e2e 전용',
          authorName: '테스트',
          sourceName: 'E2E',
          sourceUrl: null,
          origin: ContentOrigin.AI_GENERATED,
          partnerId: null,
          seriesId: null,
          episodeNo: null,
          totalEpisodes: null,
          audioPath: `e2e-arrival-ab/${index}.mp3`,
          durationSec: 600,
          thumbnailUrl: 'https://example.com/e2e.png',
          contentVersion: 1,
          licenseExpiresAt: null,
          status: ContentStatus.PUBLISHED,
          publishedAt: new Date('2029-12-01T00:00:00.000Z'),
          withdrawnAt: null,
        }),
      );
      contentIds.push(content.id);
      contents.push(content);
    }

    return contents;
  }

  async function createUser(label: string): Promise<string> {
    const repository = dataSource.getRepository(User);
    const user = await repository.save(
      repository.create({
        provider: SocialProvider.KAKAO,
        providerUserId: `e2e-arrival-ab-${label}-${Date.now()}`,
        onboardingCompleted: true,
      }),
    );
    userIds.push(user.id);
    return user.id;
  }

  async function registerDevice(userId: string, token: string): Promise<void> {
    await deviceTokenService.register(
      {
        userId,
        deviceId: `device-${userId}`,
        pushToken: token,
        platform: DevicePlatform.IOS,
        isOsPermissionGranted: true,
        appVersion: '1.2.0',
      },
      new Date(),
    );
  }

  async function addItem(
    userId: string,
    contentId: string,
    source: 'drip' | 'discovery',
    addedAt: Date,
    deletedAt: Date | null,
  ): Promise<void> {
    await dataSource.query(
      `INSERT INTO library_items (user_id, content_id, source, added_at, deleted_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, contentId, source, addedAt, deletedAt],
    );
  }
});
