import 'dotenv/config';

import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { App } from 'supertest/types';
import { DataSource, In, Like } from 'typeorm';

import { AppModule } from '@/app.module';
import { toServiceDayRange } from '@/common/utils/service-date.util';
import { ContentOrigin, ContentStatus } from '@/modules/content/content.enum';
import { Content } from '@/modules/content/entities/content.entity';
import { DripArrivalSlot } from '@/modules/drip/drip-group.policy';
import { DripGroup } from '@/modules/drip/drip.enum';
import { DripBatchRunService } from '@/modules/drip/services/drip-batch-run.service';
import { DripBatchOrchestrator } from '@/modules/drip-batch/drip-batch.orchestrator';
import { NotificationLog } from '@/modules/notification/entities/notification-log.entity';
import { NotificationStatus } from '@/modules/notification/notification.enum';
import {
  PushMessage,
  PushTicket,
} from '@/modules/notification/notification.types';
import { PushClient } from '@/modules/notification/push/push.client';
import { User } from '@/modules/user/entities/user.entity';
import { DeviceTokenService } from '@/modules/user/services/device-token.service';
import { DevicePlatform, SocialProvider } from '@/modules/user/user.enum';

/**
 * 아침 알림(KAN-288) — 08:00 도착 알림 크론 안에서 **실제 SQL**로 대상(최신 마케팅 동의)·미청취 편 수(드립·탐험만, 7일 안)·
 * 오늘 적립받은 사용자 제외·하루 1건·dry_run 무발송을 본다. 스위치는 앱의 ConfigService 에 넣는다(CI 는 `.env.example` 복사).
 * 발송 수단만 가짜다. 날짜는 다른 테스트와 겹치지 않는 먼 날(2030-01-17)이다. 로컬 DB 에 다른 사용자가 있을 수 있어
 * 검증은 이 테스트가 만든 사용자로만 한다.
 */
describe('아침 알림 E2E', () => {
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

  const RUN_DATE = '2030-01-17';
  /** 2030-01-17 08:00 KST */
  const AT_0800 = new Date('2030-01-16T23:00:00.000Z');
  const dayStart = () => toServiceDayRange(AT_0800).start;
  const at = (offsetMs: number) => new Date(dayStart().getTime() + offsetMs);
  const DAY_MS = 24 * 60 * 60 * 1000;

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
    configService.set('RETENTION_MORNING_PUSH_MODE', '');
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
      // 공유 DB 라 다른 e2e(드립 배치)가 이 편을 다른 사용자에게 적립 · 영구 제외했을 수 있다 — 참조 행을 먼저 지운다
      // (안 지우면 fk_drip_excluded_contents_contents 로 이 파일 전체가 간헐 실패한다)
      await dataSource.query(
        `DELETE FROM drip_excluded_contents WHERE content_id = $1`,
        [contentId],
      );
      await dataSource.query(
        `DELETE FROM library_items WHERE content_id = $1`,
        [contentId],
      );
      await dataSource.query(`DELETE FROM contents WHERE id = $1`, [contentId]);
    }
    await app.close();
  }, 60_000);

  it('드립이 없는 마케팅 동의자에게만 08:00 에 1건 — 1편은 그 콘텐츠, 여러 편은 라이브러리. dry_run 은 보내지 않는다', async () => {
    // given
    const [c1, c2, c3, c4] = await seedContents(4);
    const single = await createUser('single', true);
    const many = await createUser('many', true);
    const noConsent = await createUser('no-consent', false);
    const placed = await createUser('placed', true);
    const savedOnly = await createUser('saved-only', true);
    const stale = await createUser('stale', true);
    for (const userId of userIds) {
      await registerDevice(userId, `ExponentPushToken[morning-${userId}]`);
    }
    // single: 이틀 전 드립 1편(안 들음)
    await addItem(single, c1.id, 'drip', at(-2 * DAY_MS), null);
    // many: 어제 드립 2편 + 탐험 1편, 지운 편 1편(세지 않는다)
    await addItem(many, c1.id, 'drip', at(-DAY_MS), null);
    await addItem(many, c2.id, 'drip', at(-DAY_MS), null);
    await addItem(many, c3.id, 'discovery', at(-DAY_MS), null);
    await addItem(many, c4.id, 'drip', at(-DAY_MS), at(-DAY_MS / 2));
    // noConsent: 미청취가 있지만 최신 마케팅 동의가 철회다
    await addItem(noConsent, c1.id, 'drip', at(-DAY_MS), null);
    // placed: 오늘 배치가 적립했다(드립이 있는 날 — 도착 알림 몫) + 어제 미청취
    await addItem(placed, c1.id, 'drip', at(-DAY_MS), null);
    await addItem(placed, c2.id, 'drip', at(0), null);
    // savedOnly: 직접 담은 편만 — "추천받은 콘텐츠"가 아니다
    await addItem(savedOnly, c1.id, 'save', at(-DAY_MS), null);
    // stale: 8일 전 드립 — 7일 창 밖
    await addItem(stale, c1.id, 'drip', at(-8 * DAY_MS), null);

    await app.get(DripBatchRunService).claim(RUN_DATE, DripGroup.ASIA, at(0));
    await dataSource.query(
      `UPDATE drip_batch_runs SET finished_at = $2 WHERE run_date = $1`,
      [RUN_DATE, at(10_000)],
    );
    configService.set('DRIP_ARRIVAL_AB_ENABLED', '');
    const mine = () =>
      sent.filter((message) =>
        userIds.some((id) => message.to === `ExponentPushToken[morning-${id}]`),
      );
    const morningLogs = () =>
      dataSource.getRepository(NotificationLog).find({
        where: { userId: In(userIds), type: Like('retention.morning.%') },
      });
    const runMorningCron = () =>
      orchestrator.notifyTodayArrivals(
        AT_0800,
        DripGroup.ASIA,
        DripArrivalSlot.H0800,
      );

    // when — dry_run(시험 대상 없음)
    configService.set('RETENTION_MORNING_PUSH_MODE', 'dry_run');
    await runMorningCron();
    // then
    expect(mine()).toHaveLength(0);
    expect(await morningLogs()).toHaveLength(0);

    // when — on
    configService.set('RETENTION_MORNING_PUSH_MODE', 'on');
    await runMorningCron();

    // then
    const byToken = Object.fromEntries(
      mine().map((message) => [message.to, message]),
    );
    expect(Object.keys(byToken).sort()).toEqual(
      [single, many].map((id) => `ExponentPushToken[morning-${id}]`).sort(),
    );
    const toSingle = byToken[`ExponentPushToken[morning-${single}]`];
    expect(toSingle.data.deep_link).toBe(`ear://contents/${c1.id}`);
    expect(toSingle.body).toBe(`${c1.title}\n수신거부: 설정 > 알림`);
    expect(toSingle.title.startsWith('(광고) ')).toBe(true);
    const toMany = byToken[`ExponentPushToken[morning-${many}]`];
    expect(toMany.data.deep_link).toBe('ear://library');
    expect(toMany.title).toContain('3편');
    expect(String(toMany.data.type)).toMatch(/^retention\.morning\.[ab]$/);
    const logs = await morningLogs();
    expect(logs.map((log) => log.userId).sort()).toEqual([single, many].sort());
    expect(logs.every((log) => log.status === NotificationStatus.SENT)).toBe(
      true,
    );

    // when — 같은 날 다시(재시작 등)
    await runMorningCron();
    // then — 하루 1건
    expect(mine()).toHaveLength(2);
  });

  // --- 헬퍼 ---

  async function seedContents(count: number): Promise<Content[]> {
    const repository = dataSource.getRepository(Content);
    const contents: Content[] = [];

    for (let index = 0; index < count; index += 1) {
      const content = await repository.save(
        repository.create({
          title: `E2E 아침 알림 콘텐츠 ${index}`,
          description: 'e2e 전용',
          authorName: '테스트',
          sourceName: 'E2E',
          sourceUrl: null,
          origin: ContentOrigin.AI_GENERATED,
          partnerId: null,
          seriesId: null,
          episodeNo: null,
          totalEpisodes: null,
          audioPath: `e2e-morning/${index}.mp3`,
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

  async function createUser(
    label: string,
    marketingAgreed: boolean,
  ): Promise<string> {
    const repository = dataSource.getRepository(User);
    const user = await repository.save(
      repository.create({
        provider: SocialProvider.KAKAO,
        providerUserId: `e2e-morning-${label}-${Date.now()}`,
        onboardingCompleted: true,
      }),
    );
    userIds.push(user.id);
    // 최신 마케팅 동의가 기준이다 — 철회자는 동의 뒤 철회 행을 하나 더 둔다
    await dataSource.query(
      `INSERT INTO consents (user_id, consent_type, version, is_agreed, agreed_at)
       VALUES ($1, 'marketing', '1', true, $2)`,
      [user.id, new Date('2029-12-01T00:00:00.000Z')],
    );
    if (!marketingAgreed) {
      await dataSource.query(
        `INSERT INTO consents (user_id, consent_type, version, is_agreed, agreed_at)
         VALUES ($1, 'marketing', '1', false, $2)`,
        [user.id, new Date('2029-12-02T00:00:00.000Z')],
      );
    }
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
    source: 'drip' | 'discovery' | 'save',
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
