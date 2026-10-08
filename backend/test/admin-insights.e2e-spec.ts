import 'dotenv/config';

import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';

import { AppModule } from '@/app.module';
import { traceIdMiddleware } from '@/common/middlewares/trace-id.middleware';
import { toServiceDate } from '@/common/utils/service-date.util';
import { ContentOrigin, ContentStatus } from '@/modules/content/content.enum';
import { Content } from '@/modules/content/entities/content.entity';
import { PlayRecord } from '@/modules/playback/entities/play-record.entity';
import { UserSignal } from '@/modules/playback/entities/user-signal.entity';
import { UserSignalAction } from '@/modules/playback/playback.enum';
import { User } from '@/modules/user/entities/user.entity';
import { WithdrawalLog } from '@/modules/user/entities/withdrawal-log.entity';
import { SocialProvider, UserRole } from '@/modules/user/user.enum';

interface SummaryBody {
  days: number;
  users: {
    total_signups: number;
    current: number;
    withdrawals: number;
    withdrawal_rate: number | null;
    activated: number;
    active_1d: number;
    listeners_1d: number;
  };
  listening: {
    all_time: { listen_sec: number; plays: number; completes: number };
    window: { listen_sec: number; plays: number; completes: number };
  };
  daily: { date: string; plays: number; listen_sec: number; signups: number }[];
  hourly: { hour: number; plays: number }[];
  top_users: {
    user_id: string;
    listen_sec: number;
    plays: number;
    completes: number;
    tier: string;
  }[];
  top_contents: {
    content_id: string;
    title: string;
    listen_sec: number;
    plays: number;
    listeners: number;
    completes: number;
  }[];
  retention: { day: number; cohort_size: number; returned: number }[];
}

/**
 * 서비스 지표 요약 E2E(`admin-api.md` 4.22) — 실제 DB 위에서 이 테스트가 심은 재생·완청·탈퇴 기록이 합계·순위·추이에
 * 나타나는지 본다. 합계는 전 사용자 값이라 공유 로컬 DB 의 다른 행과 섞이므로 **차이와 포함 여부**로 대조한다.
 */
describe('서비스 지표 요약 E2E', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  const userIds: string[] = [];
  const contentIds: string[] = [];
  const withdrawalIds: string[] = [];
  const TOKEN = `e2einsight${Date.now()}`;
  const path = (p: string) => `/api/v1${p}`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.use(traceIdMiddleware);
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    dataSource = app.get(DataSource);
  }, 60_000);

  afterAll(async () => {
    for (const userId of userIds) {
      await dataSource.query(`DELETE FROM user_signals WHERE user_id = $1`, [
        userId,
      ]);
      await dataSource.query(`DELETE FROM play_records WHERE user_id = $1`, [
        userId,
      ]);
      await dataSource.query(`DELETE FROM users WHERE id = $1`, [userId]);
    }
    for (const contentId of contentIds) {
      await dataSource.query(`DELETE FROM contents WHERE id = $1`, [contentId]);
    }
    for (const id of withdrawalIds) {
      await dataSource.query(`DELETE FROM withdrawal_logs WHERE id = $1`, [id]);
    }
    await app.close();
  }, 60_000);

  it('심은 재생·완청·탈퇴가 합계·순위·추이에 반영되고, 개인 식별 정보는 응답 어디에도 없다', async () => {
    // given — 기준 스냅샷(이 테스트 전의 전 사용자 합계)
    const adminAuth = await createUser('admin', UserRole.ADMIN);
    const before = (
      await request(app.getHttpServer())
        .get(path('/admin/insights/summary'))
        .set('Authorization', adminAuth)
        .expect(HttpStatus.OK)
    ).body as SummaryBody;

    // given — 청취자 하나: 같은 콘텐츠를 어제·오늘 재생(5,000,000초 + 4,000,000초), 완청 1회.
    // 순위(Top 15)에 반드시 들도록 어떤 DB 의 기존 1위보다 큰 값을 심는다 — 합계는 전 사용자 값이라 차이로 대조한다
    const listenerId = await createUserId('listener');
    const contentId = await seedContent();
    const now = new Date();
    const yesterday = new Date(now.getTime() - 86_400_000);
    const playRecords = dataSource.getRepository(PlayRecord);
    await playRecords.save([
      playRecords.create({
        userId: listenerId,
        contentId,
        playDate: toServiceDate(yesterday),
        playedAt: yesterday,
        isCounted: true,
        listenedSec: 5_000_000,
      }),
      playRecords.create({
        userId: listenerId,
        contentId,
        playDate: toServiceDate(now),
        playedAt: now,
        isCounted: true,
        listenedSec: 4_000_000,
      }),
    ]);
    const signals = dataSource.getRepository(UserSignal);
    await signals.save(
      signals.create({
        userId: listenerId,
        contentId,
        action: UserSignalAction.COMPLETE,
        positionSec: 600,
        maxReachedSec: 600,
      }),
    );
    // given — 탈퇴 기록 하나(해시만 — 행은 개인을 가리키지 않는다)
    const withdrawals = dataSource.getRepository(WithdrawalLog);
    const withdrawal = await withdrawals.save(
      withdrawals.create({
        userHash: `${TOKEN}-hash`,
        userHashVersion: 1,
        reasonCode: 'low_usage',
        reasonText: null,
        withdrawnAt: now,
      }),
    );
    withdrawalIds.push(withdrawal.id);

    // when
    const res = await request(app.getHttpServer())
      .get(path('/admin/insights/summary'))
      .query({ days: 7 })
      .set('Authorization', adminAuth)
      .expect(HttpStatus.OK);
    expect(res.headers['cache-control']).toBe('no-store');
    const body = res.body as SummaryBody;

    // then — 가입·탈퇴: 관리자 + 청취자 2명이 늘고 탈퇴 1건이 늘었다. 탈퇴 포함 가입 = 현재 + 탈퇴
    expect(body.days).toBe(7);
    expect(body.users.current).toBe(before.users.current + 1); // admin 은 before 전에 만들어졌다
    expect(body.users.withdrawals).toBe(before.users.withdrawals + 1);
    expect(body.users.total_signups).toBe(
      body.users.current + body.users.withdrawals,
    );
    expect(body.users.activated).toBe(before.users.activated + 1);
    expect(body.users.listeners_1d).toBeGreaterThanOrEqual(1);
    // 앱 사용(세션) 기준 — 이 테스트는 JWT 를 직접 민팅해 세션 행을 만들지 않으므로 늘어나지 않아야 한다
    expect(body.users.active_1d).toBe(before.users.active_1d);

    // then — 청취: 전 기간·창 둘 다 1,500초·재생 2·완청 1 만큼 늘었다
    expect(body.listening.all_time.listen_sec).toBe(
      before.listening.all_time.listen_sec + 9_000_000,
    );
    expect(body.listening.all_time.plays).toBe(
      before.listening.all_time.plays + 2,
    );
    expect(body.listening.all_time.completes).toBe(
      before.listening.all_time.completes + 1,
    );
    expect(body.listening.window.plays).toBeGreaterThanOrEqual(2);

    // then — 순위에 이 사용자·콘텐츠가 그 수치 그대로 있고, 사용자 행은 user_id·티어뿐이다
    const topUser = body.top_users.find((u) => u.user_id === listenerId);
    expect(topUser).toEqual(
      expect.objectContaining({
        listen_sec: 9_000_000,
        plays: 2,
        completes: 1,
        tier: 'light',
      }),
    );
    expect(Object.keys(topUser!)).toEqual(
      expect.not.arrayContaining(['email', 'nickname']),
    );
    const topContent = body.top_contents.find(
      (c) => c.content_id === contentId,
    );
    expect(topContent).toEqual(
      expect.objectContaining({
        title: `${TOKEN} 콘텐츠`,
        listen_sec: 9_000_000,
        plays: 2,
        listeners: 1,
        completes: 1,
      }),
    );
    expect(JSON.stringify(body)).not.toMatch(/"email"|"nickname"/);

    // then — 추이: 7일 창이면 KST 로 8칸(오늘 포함), 오늘 칸에 재생이 있고 24시간이 다 있다
    expect(body.daily).toHaveLength(8);
    const today = body.daily[body.daily.length - 1];
    expect(today.plays).toBeGreaterThanOrEqual(1);
    expect(body.hourly).toHaveLength(24);
    expect(body.hourly.reduce((sum, h) => sum + h.plays, 0)).toBe(
      body.listening.window.plays,
    );
    expect(body.retention.map((r) => r.day)).toEqual([1, 7, 30]);

    // then — 창 밖 값은 거절, 일반 계정은 403, 토큰 없으면 401
    await request(app.getHttpServer())
      .get(path('/admin/insights/summary'))
      .query({ days: 0 })
      .set('Authorization', adminAuth)
      .expect(HttpStatus.BAD_REQUEST);
    const userAuth = await createUser('plain', UserRole.USER);
    await request(app.getHttpServer())
      .get(path('/admin/insights/summary'))
      .set('Authorization', userAuth)
      .expect(HttpStatus.FORBIDDEN);
    await request(app.getHttpServer())
      .get(path('/admin/insights/summary'))
      .expect(HttpStatus.UNAUTHORIZED);
  }, 60_000);

  async function createUserId(
    label: string,
    role: UserRole = UserRole.USER,
  ): Promise<string> {
    const repository = dataSource.getRepository(User);
    const user = await repository.save(
      repository.create({
        provider: SocialProvider.KAKAO,
        providerUserId: `${TOKEN}-${label}`,
        role,
        onboardingCompleted: true,
      }),
    );
    userIds.push(user.id);
    return user.id;
  }

  async function createUser(label: string, role: UserRole): Promise<string> {
    const userId = await createUserId(label, role);
    const token = app
      .get(JwtService)
      .sign({ sub: userId, role, typ: 'access' }, { expiresIn: 600 });
    return `Bearer ${token}`;
  }

  async function seedContent(): Promise<string> {
    const repository = dataSource.getRepository(Content);
    const content = await repository.save(
      repository.create({
        title: `${TOKEN} 콘텐츠`,
        description: 'e2e 전용',
        authorName: '테스트',
        sourceName: 'E2E',
        sourceUrl: 'https://example.com/e2e',
        origin: ContentOrigin.AI_GENERATED,
        partnerId: null,
        seriesId: null,
        episodeNo: null,
        totalEpisodes: null,
        audioPath: `${TOKEN}/0.mp3`,
        durationSec: 600,
        thumbnailUrl: 'https://example.com/e2e.png',
        contentVersion: 1,
        licenseExpiresAt: null,
        status: ContentStatus.PUBLISHED,
        publishedAt: new Date(Date.now() - 60_000),
        withdrawnAt: null,
      }),
    );
    contentIds.push(content.id);
    return content.id;
  }
});
