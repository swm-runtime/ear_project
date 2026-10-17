import 'dotenv/config';

import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';

import { AppModule } from '@/app.module';
import { traceIdMiddleware } from '@/common/middlewares/trace-id.middleware';
import { DailyActiveUserRepository } from '@/modules/auth/daily-active-user.repository';
import { Session } from '@/modules/auth/session.entity';
import { toServiceDate } from '@/common/utils/service-date.util';
import { ContentOrigin, ContentStatus } from '@/modules/content/content.enum';
import { Content } from '@/modules/content/entities/content.entity';
import { PlayRecord } from '@/modules/playback/entities/play-record.entity';
import { UserSignal } from '@/modules/playback/entities/user-signal.entity';
import { UserSignalAction } from '@/modules/playback/playback.enum';
import { InviteCodeRedemption } from '@/modules/subscription/entities/invite-code-redemption.entity';
import { InviteCode } from '@/modules/subscription/entities/invite-code.entity';
import { User } from '@/modules/user/entities/user.entity';
import { PlayDailyTotalRepository } from '@/modules/playback/repositories/play-daily-total.repository';
import { WithdrawalLog } from '@/modules/user/entities/withdrawal-log.entity';
import { SocialProvider, UserRole, UserTier } from '@/modules/user/user.enum';

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
    listeners_7d: number;
    tiers: { light: number; daily: number; pro: number };
    tier_events: { daily: number; pro: number };
  };
  listening: {
    all_time: { listen_sec: number; plays: number; completes: number };
    window: { listen_sec: number; plays: number; completes: number };
  };
  daily: {
    date: string;
    plays: number;
    listen_sec: number;
    signups: number;
    active_users: number | null;
  }[];
  weekday: {
    weekday: number;
    label: string;
    days: number;
    active_days: number;
    avg_active_users: number | null;
    avg_listeners: number | null;
  }[];
  active_users_since: string;
  by_market: {
    market: string;
    users: number;
    signups_in_window: number;
    onboarding_completed: number;
    active_7d: number;
    listeners_7d: number;
    listen_sec: number;
    plays: number;
    paid_active: number;
  }[];
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
  // 이 테스트가 누적에 더한 값 — afterAll 이 되돌린다(누적은 앱에서는 빼지 않지만 테스트가 심은 값은 치운다)
  const seededTotals: [string, number][] = [];

  async function addPlayDailyTotal(
    playDate: string,
    playCount: number,
    listenSec: number,
    completeCount: number,
  ): Promise<void> {
    await dataSource.query(
      `INSERT INTO play_daily_totals (play_date, play_count, listen_sec, complete_count) VALUES ($1, $2, $3, $4)
       ON CONFLICT (play_date) DO UPDATE
          SET play_count = play_daily_totals.play_count + EXCLUDED.play_count,
              listen_sec = play_daily_totals.listen_sec + EXCLUDED.listen_sec,
              complete_count = play_daily_totals.complete_count + EXCLUDED.complete_count`,
      [playDate, playCount, listenSec, completeCount],
    );
  }
  const inviteCodeIds: string[] = [];
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
    for (const id of inviteCodeIds) {
      await dataSource.query(`DELETE FROM invite_codes WHERE id = $1`, [id]);
    }
    for (const id of withdrawalIds) {
      await dataSource.query(`DELETE FROM withdrawal_logs WHERE id = $1`, [id]);
    }
    for (const [playDate, listenSec] of seededTotals) {
      await addPlayDailyTotal(playDate, -1, -listenSec, 0);
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
    // 전 기간 누적은 `play_daily_totals`를 읽는다 — 재생 경로(PlaybackService)를 거치지 않고 심었으니 누적도 같이 심는다
    for (const [playDate, listenSec] of [
      [toServiceDate(yesterday), 5_000_000],
      [toServiceDate(now), 4_000_000],
    ] as const) {
      await addPlayDailyTotal(playDate, 1, listenSec, 0);
      seededTotals.push([playDate, listenSec]);
    }
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
    // given — 초대 코드 이벤트로 Pro 인 계정 하나(구독 없음)
    const eventUserId = await createUserId('event');
    await dataSource.query(`UPDATE users SET tier = 'pro' WHERE id = $1`, [
      eventUserId,
    ]);
    const inviteCode = await dataSource.getRepository(InviteCode).save({
      code: TOKEN.slice(0, 32).toUpperCase(),
      name: 'E2E PoC',
      tier: UserTier.PRO,
      grantDays: 30,
      grantUntilDate: null,
    });
    inviteCodeIds.push(inviteCode.id);
    await dataSource.getRepository(InviteCodeRedemption).save({
      inviteCodeId: inviteCode.id,
      userId: eventUserId,
      tier: UserTier.PRO,
      startsAt: new Date(now.getTime() - 60_000),
      endsAt: new Date(now.getTime() + 86_400_000),
    });

    // when
    const res = await request(app.getHttpServer())
      .get(path('/admin/insights/summary'))
      .query({ days: 7 })
      .set('Authorization', adminAuth)
      .expect(HttpStatus.OK);
    expect(res.headers['cache-control']).toBe('no-store');
    const body = res.body as SummaryBody;

    // then — 전역 합계는 **비교하지 않는다.** CI 는 E2E 파일을 병렬로 돌려 다른 스위트가 그 사이 사용자·재생 기록을
    // 넣고 **지운다**(afterAll) — 증가도 감소도 일어나 "차이"나 "이상"조차 성립하지 않았다(2026-10-08 CI 두 번 실패).
    // 어느 순간에도 성립하는 항등식·범위만 보고, 정확한 수치는 아래 이 테스트만의 사용자·콘텐츠 순위 행으로 본다
    expect(body.days).toBe(7);
    expect(before.days).toBe(14);
    expect(body.users.total_signups).toBe(
      body.users.current + body.users.withdrawals,
    );
    expect(body.users.withdrawals).toBeGreaterThanOrEqual(1);
    // 이벤트 인원은 그 티어 인원의 일부다 — 이 테스트가 심은 이벤트 Pro 1명이 들어 있다
    expect(body.users.tier_events.pro).toBeGreaterThanOrEqual(1);
    expect(body.users.tier_events.pro).toBeLessThanOrEqual(
      body.users.tiers.pro,
    );
    expect(body.users.tier_events.daily).toBeLessThanOrEqual(
      body.users.tiers.daily,
    );
    expect(body.users.activated).toBeGreaterThanOrEqual(1);
    expect(body.users.activated).toBeLessThanOrEqual(body.users.current);
    expect(body.users.listeners_1d).toBeGreaterThanOrEqual(1);
    expect(body.users.listeners_1d).toBeLessThanOrEqual(
      body.users.listeners_7d,
    );
    expect(body.listening.all_time.listen_sec).toBeGreaterThanOrEqual(
      9_000_000,
    );
    expect(body.listening.window.listen_sec).toBeGreaterThanOrEqual(9_000_000);
    // 창(window)은 `play_records`를, 전 기간은 줄지 않는 누적(`play_daily_totals`)을 읽어 원천이 다르다 — 병렬 스위트가 재생
    // 기록만 직접 심으면 창이 전 기간을 넘을 수 있어 둘을 비교하지 않는다. 이 테스트가 심은 2회만 확인한다
    expect(body.listening.all_time.plays).toBeGreaterThanOrEqual(2);

    // then — 이 테스트의 청취자(KR)가 KR 시장 칸에 들어 있다
    expect(
      body.by_market.find((m) => m.market === 'kr')?.listen_sec,
    ).toBeGreaterThanOrEqual(9_000_000);

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
    // 시간대 합과 창 재생 수는 **다른 쿼리**라 그 사이 병렬 스위트가 넣은 재생이 한쪽에만 잡힐 수 있다
    // (2026-10-08 CI: 3 vs 4). 같음 대신 이 테스트가 심은 창 안 재생 2건이 양쪽에 있는지만 본다
    expect(
      body.hourly.reduce((sum, h) => sum + h.plays, 0),
    ).toBeGreaterThanOrEqual(2);
    expect(body.listening.window.plays).toBeGreaterThanOrEqual(2);
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

  it('누적 표는 같은 날짜에 더하기만 한다 — 운영 SQL 그대로(재생 수·청취 시간·완청 수 각각)', async () => {
    // 다른 스위트가 건드리지 않는 날짜로 정확히 본다(오늘·어제 행은 병렬 스위트가 함께 더한다)
    const playDate = '2001-02-03';
    const repository = app.get(PlayDailyTotalRepository);
    try {
      await repository.add(playDate, { playCount: 1, listenSec: 0 });
      await repository.add(playDate, { playCount: 0, listenSec: 90 });
      await repository.add(playDate, { playCount: 1, listenSec: 30 });
      await repository.add(playDate, { completeCount: 1 });

      const [row] = await dataSource.query<
        { play_count: number; listen_sec: string; complete_count: number }[]
      >(
        `SELECT play_count, listen_sec, complete_count FROM play_daily_totals WHERE play_date = $1`,
        [playDate],
      );
      expect(row).toEqual({
        play_count: 2,
        listen_sec: '120',
        complete_count: 1,
      });
    } finally {
      await dataSource.query(
        `DELETE FROM play_daily_totals WHERE play_date = $1`,
        [playDate],
      );
    }
  });

  it('일별 접속자 — 오늘은 세션에서 바로 세어 들어 있고, 요일별 7칸과 첫 신뢰 날짜가 실린다', async () => {
    // given — 지금 토큰을 갱신한 사용자 하나(세션 행)
    const adminAuth = await createUser('admin-active', UserRole.ADMIN);
    const activeId = await createUserId('active');
    await seedSession(activeId, new Date());

    // when
    const body = (
      await request(app.getHttpServer())
        .get(path('/admin/insights/summary'))
        .query({ days: 14 })
        .set('Authorization', adminAuth)
        .expect(HttpStatus.OK)
    ).body as SummaryBody;

    // then — 전역 합계는 병렬 스위트 때문에 정확히 비교하지 않는다. 오늘 칸에 이 테스트의 1명이 있는지만 본다
    const today = body.daily[body.daily.length - 1];
    expect(today.active_users).toBeGreaterThanOrEqual(1);
    for (const d of body.daily) {
      expect(
        d.active_users === null || typeof d.active_users === 'number',
      ).toBe(true);
    }
    expect(body.weekday.map((w) => w.label)).toEqual([
      '월',
      '화',
      '수',
      '목',
      '금',
      '토',
      '일',
    ]);
    // 14일 창의 온전한 날은 13일(첫날 부분일·오늘 제외) — 요일마다 1~2일
    expect(body.weekday.reduce((sum, w) => sum + w.days, 0)).toBe(13);
    for (const w of body.weekday) {
      expect(w.active_days).toBeLessThanOrEqual(w.days);
      // 0일이면 평균은 0 이 아니라 null
      if (w.days === 0) expect(w.avg_listeners).toBeNull();
      if (w.active_days === 0) expect(w.avg_active_users).toBeNull();
    }
    expect(body.active_users_since).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(body.active_users_since <= today.date).toBe(true);
  }, 60_000);

  it('일별 접속자 저장 — 같은 날을 두 번 다시 세도 값이 같고, 시장마다 한 행(접속자 없는 시장은 0)이다', async () => {
    // 다른 스위트가 건드리지 않는 날짜로 정확히 본다(KST 2001-02-04 12:00 에 토큰 갱신 1명 — 같은 날 두 번 갱신해도 1명)
    const activeDate = '2001-02-04';
    const userId = await createUserId('active-past');
    await seedSession(userId, new Date('2001-02-04T03:00:00.000Z'));
    await seedSession(userId, new Date('2001-02-04T14:59:00.000Z'));
    // 그 앞날 KST 23:59(= UTC 02-03 14:59)는 세지 않는다
    const otherId = await createUserId('active-past-other');
    await seedSession(otherId, new Date('2001-02-03T14:59:00.000Z'));
    const repository = app.get(DailyActiveUserRepository);
    const read = () =>
      dataSource.query<{ market: string; active_users: number }[]>(
        `SELECT market, active_users FROM daily_active_users WHERE active_date = $1 ORDER BY market`,
        [activeDate],
      );
    try {
      // when
      await repository.recount(activeDate);
      const first = await read();
      await repository.recount(activeDate);
      const second = await read();

      // then
      expect(first).toEqual([
        { market: 'global', active_users: 0 },
        { market: 'kr', active_users: 1 },
      ]);
      expect(second).toEqual(first);

      // when — 원천(세션)이 지워진 뒤 다시 세도 기록은 줄지 않는다
      await dataSource.query(`DELETE FROM sessions WHERE user_id = $1`, [
        userId,
      ]);
      await repository.recount(activeDate);

      // then
      expect(await read()).toEqual(first);
    } finally {
      await dataSource.query(
        `DELETE FROM daily_active_users WHERE active_date = $1`,
        [activeDate],
      );
    }
  });

  it('시장별 집계는 계정이 없는 시장까지 시장마다 한 칸이고, 각 값은 그 시장 계정 수를 넘지 않는다(global-api 4.10)', async () => {
    // given
    const adminAuth = await createUser('admin-market', UserRole.ADMIN);

    // when
    const body = (
      await request(app.getHttpServer())
        .get(path('/admin/insights/summary'))
        .set('Authorization', adminAuth)
        .expect(HttpStatus.OK)
    ).body as SummaryBody;

    // then — 전역 합계는 병렬 스위트 때문에 비교하지 않는다(위 테스트 주석). 항등식·범위만 본다
    expect(body.by_market.map((m) => m.market)).toEqual(['kr', 'global']);
    for (const m of body.by_market) {
      expect(m.signups_in_window).toBeLessThanOrEqual(m.users);
      expect(m.onboarding_completed).toBeLessThanOrEqual(m.users);
      expect(m.active_7d).toBeLessThanOrEqual(m.users);
      expect(m.listeners_7d).toBeLessThanOrEqual(m.users);
      expect(m.paid_active).toBeLessThanOrEqual(m.users);
    }
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

  /** 토큰 갱신 1회 — 세션 행. 사용자를 지우면 CASCADE 로 함께 지워진다 */
  async function seedSession(userId: string, issuedAt: Date): Promise<void> {
    const repository = dataSource.getRepository(Session);
    await repository.save(
      repository.create({
        userId,
        refreshTokenHash: `${TOKEN}-${userId}-${issuedAt.getTime()}`,
        deviceId: `${TOKEN}-device`,
        issuedAt,
        expiresAt: new Date(Date.now() + 86_400_000),
        revokedAt: null,
        revokedReason: null,
      }),
    );
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
