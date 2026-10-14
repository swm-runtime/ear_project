import 'dotenv/config';

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';

import { AppModule } from '@/app.module';
import { toServiceDayRange } from '@/common/utils/service-date.util';
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
 * 드립 도착 알림 07:00 분리(2026-10-14) — **그날 배치가 적립한 것을 DB 에서 다시 읽는 경로**가 실제 SQL 에서
 * 맞는지 본다: 범위(서비스 날짜 시작 ~ 배치 종료), 소프트 삭제 제외, 사용자당 1건(정규 + 탐험).
 *
 * 발송 수단만 가짜다. 날짜는 다른 테스트와 겹치지 않는 먼 날(2030-01-15)을 쓰고, 심은 행은 끝나면 지운다.
 */
describe('드립 도착 알림 07:00 E2E', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let orchestrator: DripBatchOrchestrator;
  let deviceTokenService: DeviceTokenService;

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

  const RUN_DATE = '2030-01-15';
  /** 2030-01-15 07:00 KST */
  const AT_0700 = new Date('2030-01-14T22:00:00.000Z');
  const dayStart = () => toServiceDayRange(AT_0700).start;
  const at = (offsetMs: number) => new Date(dayStart().getTime() + offsetMs);
  const BATCH_END_OFFSET = 10_000;

  const userIds: string[] = [];

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

    await dataSource.query(`DELETE FROM drip_batch_runs WHERE run_date = $1`, [
      RUN_DATE,
    ]);
  }, 60_000);

  afterAll(async () => {
    await dataSource.query(`DELETE FROM drip_batch_runs WHERE run_date = $1`, [
      RUN_DATE,
    ]);
    for (const userId of userIds) {
      await dataSource.query(`DELETE FROM library_items WHERE user_id = $1`, [
        userId,
      ]);
      await dataSource.query(`DELETE FROM users WHERE id = $1`, [userId]);
    }
    await app.close();
  }, 60_000);

  it('배치가 적립한 편만 사용자당 1건으로 보낸다 — 지운 편·배치 뒤 적립·미완료 배치는 빠진다', async () => {
    const [c1, c2, c3] = await dataSource.query<
      { id: string; title: string }[]
    >(
      `SELECT id, title FROM contents WHERE status = 'published' ORDER BY id LIMIT 3`,
    );
    expect(c3).toBeDefined();

    const placed = await createUser('placed');
    const late = await createUser('late');
    await registerDevice(placed, 'ExponentPushToken[placed]');
    await registerDevice(late, 'ExponentPushToken[late]');

    // placed: 배치 안에서 정규 1 · 탐험 1 · 정규 1(알림 전에 지움)
    await addItem(placed, c1.id, 'drip', at(1_000), null);
    await addItem(placed, c2.id, 'discovery', at(2_000), null);
    await addItem(placed, c3.id, 'drip', at(1_500), at(60 * 60 * 1000));
    // late: 배치가 끝난 뒤(06:30) 적립 — 배치 결과가 아니다
    await addItem(late, c1.id, 'drip', at(90 * 60 * 1000), null);

    // 배치가 아직 끝나지 않았으면 보내지 않는다
    await dataSource.query(
      `INSERT INTO drip_batch_runs (run_date, started_at) VALUES ($1, $2)`,
      [RUN_DATE, at(0)],
    );
    await orchestrator.notifyTodayArrivals(AT_0700);
    expect(sent).toHaveLength(0);

    // 배치 종료 후
    await dataSource.query(
      `UPDATE drip_batch_runs SET finished_at = $2 WHERE run_date = $1`,
      [RUN_DATE, at(BATCH_END_OFFSET)],
    );
    await orchestrator.notifyTodayArrivals(AT_0700);

    expect(sent.map((message) => message.to)).toEqual([
      'ExponentPushToken[placed]',
    ]);
    const logs = await dataSource
      .getRepository(NotificationLog)
      .find({ where: { userId: placed } });
    expect(logs.map((log) => log.status)).toEqual([NotificationStatus.SENT]);
    // 지운 편(c3)은 알림 본문에 오지 않는다 — 정규 1 + 탐험 1
    expect(JSON.stringify(sent[0])).not.toContain(c3.title);

    // 같은 날 다시 불러도 하루 1건이다
    await orchestrator.notifyTodayArrivals(AT_0700);
    expect(sent).toHaveLength(1);
  });

  // --- 헬퍼 ---

  async function createUser(label: string): Promise<string> {
    const repository = dataSource.getRepository(User);
    const user = await repository.save(
      repository.create({
        provider: SocialProvider.KAKAO,
        providerUserId: `e2e-push0700-${label}-${Date.now()}`,
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
