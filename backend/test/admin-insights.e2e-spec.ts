import 'dotenv/config';

import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';

import { AppModule } from '@/app.module';
import { traceIdMiddleware } from '@/common/middlewares/trace-id.middleware';
import { AdminInsightsRepository } from '@/modules/admin/repositories/admin-insights.repository';
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
import {
  SocialProvider,
  UserMarket,
  UserRole,
  UserTier,
} from '@/modules/user/user.enum';

interface SummaryBody {
  days: number;
  market: string | null;
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
  retention: {
    day: number;
    cohort_size: number;
    returned: number;
    bounded_cohort_size: number;
    bounded_returned: number;
  }[];
  retention_cohorts: Record<
    'daily' | 'weekly',
    {
      offsets: number[];
      rows: {
        start: string;
        users: number;
        cells: ({ returned: number; rate: number | null } | null)[];
      }[];
    }
  >;
  recent_since: string;
  recent_top_contents: {
    content_id: string;
    plays: number;
    listeners: number;
    listen_sec: number;
    completes: number;
  }[];
}

/**
 * 서비스 지표 요약 E2E(`admin-api.md` 4.22) — 실제 DB 위에서 이 테스트가 심은 재생·완청·탈퇴 기록이 합계·순위·추이에
 * 나타나는지 본다. 합계는 전 사용자 값이라 공유 로컬 DB 의 다른 행과 섞이므로 **차이와 포함 여부**로 대조한다.
 */
const DAY = 24 * 60 * 60 * 1000;

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
    expect(typeof body.retention[0].bounded_cohort_size).toBe('number');
    expect(typeof body.retention[0].bounded_returned).toBe('number');

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
    // 14일 창의 온전한 날은 14일 — 일별은 창 시작이 걸친 날의 KST 자정부터라 첫날도 온전하고, 오늘만 뺀다(요일마다 2일)
    expect(body.weekday.reduce((sum, w) => sum + w.days, 0)).toBe(14);
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

  it('사람별 접속일 — 그날 세션이 있는 사람마다 한 행이고, 두 번 넣어도 같으며, 원천 세션이 지워져도 남는다', async () => {
    // given — KST 2001-02-11 에 두 번 토큰 갱신한 1명, 그 앞날 KST 23:59 에 갱신한 1명(세지 않는다)
    const activeDate = '2001-02-11';
    const userId = await createUserId('active-date');
    await seedSession(userId, new Date('2001-02-11T03:00:00.000Z'));
    await seedSession(userId, new Date('2001-02-11T14:59:00.000Z'));
    const otherId = await createUserId('active-date-other');
    await seedSession(otherId, new Date('2001-02-10T14:59:00.000Z'));
    const repository = app.get(DailyActiveUserRepository);
    const read = () =>
      dataSource.query<{ user_id: string }[]>(
        `SELECT user_id FROM user_active_dates WHERE active_date = $1 AND user_id = ANY($2)`,
        [activeDate, [userId, otherId]],
      );

    // when
    await repository.recordActiveDates(activeDate);
    await repository.recordActiveDates(activeDate);

    // then
    expect(await read()).toEqual([{ user_id: userId }]);

    // when — 원천이 지워진 뒤 다시 넣어도 이미 남긴 행은 그대로
    await dataSource.query(`DELETE FROM sessions WHERE user_id = $1`, [userId]);
    await repository.recordActiveDates(activeDate);

    // then
    expect(await read()).toEqual([{ user_id: userId }]);
  });

  it('코호트 리텐션 — 가입일 기준 구간마다 접속 기록·남은 세션·재생 중 하나라도 있으면 돌아온 사람이다', async () => {
    // given — 다른 스위트와 겹치지 않는 2001-03-05(월) KST 12:00 가입자 2명
    const signedUpAt = new Date('2001-03-05T03:00:00.000Z');
    const a = await createUserId('cohort-a');
    const b = await createUserId('cohort-b');
    await dataSource.query(
      `UPDATE users SET created_at = $1 WHERE id = ANY($2)`,
      [signedUpAt, [a, b]],
    );
    // A: D1 접속(세션은 지워지고 기록만 남은 경우) · W2(가입 14~20일 뒤) 재생
    await dataSource.query(
      `INSERT INTO user_active_dates (user_id, active_date) VALUES ($1, '2001-03-06')`,
      [a],
    );
    const contentId = await seedContent();
    const playedAt = new Date('2001-03-20T03:00:00.000Z');
    const playRecords = dataSource.getRepository(PlayRecord);
    await playRecords.save(
      playRecords.create({
        userId: a,
        contentId,
        playDate: toServiceDate(playedAt),
        playedAt,
        isCounted: true,
        listenedSec: 60,
      }),
    );
    // B: 가입 당일(d+0)·D2(d+2) 세션은 D1 이 아니다 · D7 = W1 첫날(03-12) 세션
    await seedSession(b, new Date('2001-03-05T05:00:00.000Z'));
    await seedSession(b, new Date('2001-03-07T03:00:00.000Z'));
    await seedSession(b, new Date('2001-03-12T03:00:00.000Z'));
    // C: 일요일 KST 23:59 가입(= UTC 14:59) — 그날(03-11) 묶음이고 그 주(03-05 주)에 든다.
    //    가입 당일 활동은 세지 않고, 가입 14일 뒤(03-25) 재생은 W1 이 아니라 W2 다
    const c = await createUserId('cohort-c');
    await dataSource.query(`UPDATE users SET created_at = $1 WHERE id = $2`, [
      new Date('2001-03-11T14:59:00.000Z'),
      c,
    ]);
    await seedSession(c, new Date('2001-03-11T14:59:30.000Z'));
    const playedAtC = new Date('2001-03-25T03:00:00.000Z');
    await playRecords.save(
      playRecords.create({
        userId: c,
        contentId,
        playDate: toServiceDate(playedAtC),
        playedAt: playedAtC,
        isCounted: true,
        listenedSec: 60,
      }),
    );
    const repository = app.get(AdminInsightsRepository);

    // when
    const daily = await repository.cohortRetention(
      '2001-03-05',
      '2001-03-12',
      1,
      [1, 7],
    );
    const weekly = await repository.cohortRetention(
      '2001-03-05',
      '2001-03-12',
      7,
      [1, 2, 3, 4],
    );

    // then — 일별: 03-05 묶음 2명(D1 = A 만, D7 = B 만), 03-11 묶음 1명(C — 돌아온 칸 없음)
    expect(
      [...daily.sizes].sort((x, y) => x.start.localeCompare(y.start)),
    ).toEqual([
      { start: '2001-03-05', users: 2 },
      { start: '2001-03-11', users: 1 },
    ]);
    expect([...daily.hits].sort((x, y) => x.offset - y.offset)).toEqual([
      { start: '2001-03-05', offset: 1, returned: 1 },
      { start: '2001-03-05', offset: 7, returned: 1 },
    ]);
    // 주별: 03-05 주 3명(일요일 23:59 가입자 포함). W1 = B, W2 = A(가입 15일 뒤)·C(가입 14일 뒤)
    expect(weekly.sizes).toEqual([{ start: '2001-03-05', users: 3 }]);
    expect([...weekly.hits].sort((x, y) => x.offset - y.offset)).toEqual([
      { start: '2001-03-05', offset: 1, returned: 1 },
      { start: '2001-03-05', offset: 2, returned: 2 },
    ]);

    // when — 바운디드 N일 리텐션: 오늘 03-14(N일째가 03-13까지 다 지난 가입자), 기록을 믿을 수 있는 첫 날 03-06
    const bounded = await repository.boundedRetention(
      [1, 7, 30],
      '2001-03-14',
      '2001-03-06',
    );

    // then — 코호트 표 칸의 합과 같다. D1: A·B·C 중 A(03-06 접속 기록)만 — B 의 03-05·03-07, C 의 가입 당일은 D1 이 아니다.
    //        D7: 03-12 가 7일째인 A·B 중 B(03-12 세션)만 — C 의 7일째(03-18)는 아직 오지 않아 분모에 없다. D30: 해당 없음
    expect(bounded).toEqual([
      { day: 1, cohortSize: 3, returned: 1 },
      { day: 7, cohortSize: 2, returned: 1 },
      { day: 30, cohortSize: 0, returned: 0 },
    ]);
    // 기록을 믿을 수 있는 첫 날보다 앞선 N일째는 분모에서 빠진다(03-06 D1 인 A·B 가 빠지고 C 만 남는다)
    expect(
      (await repository.boundedRetention([1], '2001-03-14', '2001-03-07'))[0],
    ).toEqual({ day: 1, cohortSize: 1, returned: 0 });
  });

  it('요약 응답에 코호트 표 두 장(일별 14행 D1·D7 · 주별 8행 W1~W4)이 실린다', async () => {
    // given
    const adminAuth = await createUser('admin-cohort', UserRole.ADMIN);

    // when
    const body = (
      await request(app.getHttpServer())
        .get(path('/admin/insights/summary'))
        .set('Authorization', adminAuth)
        .expect(HttpStatus.OK)
    ).body as SummaryBody;

    // then
    const { daily, weekly } = body.retention_cohorts;
    expect(daily.offsets).toEqual([1, 7]);
    expect(daily.rows).toHaveLength(14);
    expect(weekly.offsets).toEqual([1, 2, 3, 4]);
    expect(weekly.rows).toHaveLength(8);
    // 어제 가입자의 D1 은 오늘이라 아직 끝나지 않았다
    expect(daily.rows[0].cells[0]).toBeNull();
    for (const row of [...daily.rows, ...weekly.rows]) {
      for (const cell of row.cells) {
        if (cell) expect(cell.returned).toBeLessThanOrEqual(row.users);
      }
    }
  }, 60_000);

  it('최근 하루 인기 콘텐츠 — 지금 - 24시간 이후 재생만 세고, 그 앞에만 재생된 콘텐츠는 없다', async () => {
    // given — 지금 3명이 들은 콘텐츠(완청 1) · 이틀 전에만 3명이 들은 콘텐츠
    const adminAuth = await createUser('admin-recent', UserRole.ADMIN);
    const recentId = await seedContent();
    const oldId = await seedContent();
    const now = new Date();
    const twoDaysAgo = new Date(now.getTime() - 2 * 86_400_000);
    const playRecords = dataSource.getRepository(PlayRecord);
    for (const label of ['r1', 'r2', 'r3']) {
      const userId = await createUserId(`recent-${label}`);
      await playRecords.save([
        playRecords.create({
          userId,
          contentId: recentId,
          playDate: toServiceDate(now),
          playedAt: now,
          isCounted: true,
          listenedSec: 120,
        }),
        playRecords.create({
          userId,
          contentId: oldId,
          playDate: toServiceDate(twoDaysAgo),
          playedAt: twoDaysAgo,
          isCounted: true,
          listenedSec: 120,
        }),
      ]);
      if (label === 'r1') {
        await dataSource.getRepository(UserSignal).save({
          userId,
          contentId: recentId,
          action: UserSignalAction.COMPLETE,
          positionSec: 600,
          maxReachedSec: 600,
        });
      }
    }

    // when
    const body = (
      await request(app.getHttpServer())
        .get(path('/admin/insights/summary'))
        .set('Authorization', adminAuth)
        .expect(HttpStatus.OK)
    ).body as SummaryBody;

    // then
    const sinceMs = new Date(body.recent_since).getTime();
    expect(Math.abs(now.getTime() - 86_400_000 - sinceMs)).toBeLessThan(60_000);
    const recent = body.recent_top_contents.find(
      (c) => c.content_id === recentId,
    );
    expect(recent).toEqual(
      expect.objectContaining({
        plays: 3,
        listeners: 3,
        listen_sec: 360,
        completes: 1,
      }),
    );
    expect(body.recent_top_contents.some((c) => c.content_id === oldId)).toBe(
      false,
    );
    // 청취자 수 순
    const listeners = body.recent_top_contents.map((c) => c.listeners);
    expect([...listeners].sort((a, b) => b - a)).toEqual(listeners);
  }, 60_000);

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

  it('시장을 고르면 그 시장 사용자만 센다 — 글로벌 청취자는 글로벌에만, 한국 청취자는 한국에만 잡히고 시장 비교와 맞는다', async () => {
    // given — 글로벌·한국 청취자 하나씩(전 기간 순위에 들도록 큰 청취 시간)
    const adminAuth = await createUser('admin-filter', UserRole.ADMIN);
    const globalId = await createUserId('global-listener');
    const krId = await createUserId('kr-listener');
    await dataSource.query(`UPDATE users SET market = 'global' WHERE id = $1`, [
      globalId,
    ]);
    const contentId = await seedContent();
    const now = new Date();
    const playRecords = dataSource.getRepository(PlayRecord);
    await playRecords.save(
      [globalId, krId].map((userId) =>
        playRecords.create({
          userId,
          contentId,
          playDate: toServiceDate(now),
          playedAt: now,
          isCounted: true,
          listenedSec: 50_000_000,
        }),
      ),
    );
    const summaryOf = async (query: string) =>
      (
        await request(app.getHttpServer())
          .get(path(`/admin/insights/summary${query}`))
          .set('Authorization', adminAuth)
          .expect(HttpStatus.OK)
      ).body as SummaryBody;

    // when
    const global = await summaryOf('?market=global');
    const kr = await summaryOf('?market=kr');
    const all = await summaryOf('');

    // then — 고른 시장을 되돌려 주고, 비교표는 늘 두 시장이다
    expect(global.market).toBe(UserMarket.GLOBAL);
    expect(kr.market).toBe(UserMarket.KR);
    expect(all.market).toBeNull();
    expect(global.by_market.map((m) => m.market)).toEqual(['kr', 'global']);

    // then — 순위는 그 시장 사람만
    const ids = (b: SummaryBody) => b.top_users.map((u) => u.user_id);
    expect(ids(global)).toContain(globalId);
    expect(ids(global)).not.toContain(krId);
    expect(ids(kr)).toContain(krId);
    expect(ids(kr)).not.toContain(globalId);
    expect(ids(all)).toEqual(expect.arrayContaining([globalId, krId]));

    // then — 창 청취 시간에 이 테스트가 심은 청취가 그 시장에 들어 있다. 같은 응답의 `by_market`과 같은 값인지는 보지 않는다 —
    // 두 값을 다른 시각에 세는 사이 병렬 스위트가 사용자·재생을 넣고 지워(CI 2026-10-25 #2049: 가입자 40 ↔ 41) 우연히만 같다
    for (const body of [global, kr]) {
      expect(body.users.current).toBeGreaterThanOrEqual(1);
      expect(body.listening.window.listen_sec).toBeGreaterThanOrEqual(
        50_000_000,
      );
    }
    // then — 오늘 막대의 청취 시간에도 시장이 갈린다(이 테스트의 50,000,000초가 그 시장 막대에만)
    const todayOf = (b: SummaryBody) => b.daily[b.daily.length - 1].listen_sec;
    expect(todayOf(global)).toBeGreaterThanOrEqual(50_000_000);
    expect(todayOf(all)).toBeGreaterThanOrEqual(todayOf(global) + 50_000_000);
  }, 60_000);

  it('모르는 시장 값은 400 이다', async () => {
    const adminAuth = await createUser('admin-bad-market', UserRole.ADMIN);
    await request(app.getHttpServer())
      .get(path('/admin/insights/summary?market=jp'))
      .set('Authorization', adminAuth)
      .expect(HttpStatus.BAD_REQUEST);
  }, 60_000);

  it('알림 반응 — 보낸 뒤 2시간 안에 재생한 알림만 반응으로 센다(종류별 · 리텐션은 규칙·변형으로 풀린다)', async () => {
    // given — 다른 스위트와 겹치지 않는 이 테스트만의 리텐션 종류. A 는 1시간 뒤 재생, B 는 3시간 뒤 재생, C 는 재생 없음
    const type = `retention.e2e${Date.now() % 100000}.b`;
    const sentAt = new Date(Date.now() - 6 * 60 * 60 * 1000);
    const [a, b, c] = await Promise.all([
      createUserId('push-react-a'),
      createUserId('push-react-b'),
      createUserId('push-react-c'),
    ]);
    for (const userId of [a, b, c]) {
      await dataSource.query(
        `INSERT INTO notification_logs (user_id, type, deep_link, scheduled_at, sent_at, status)
         VALUES ($1, $2, 'ear://library', $3, $3, 'sent')`,
        [userId, type, sentAt],
      );
    }
    const contentId = await seedContent();
    const playRecords = dataSource.getRepository(PlayRecord);
    for (const [userId, hours] of [
      [a, 1],
      [b, 3],
    ] as const) {
      const playedAt = new Date(sentAt.getTime() + hours * 60 * 60 * 1000);
      await playRecords.save(
        playRecords.create({
          userId,
          contentId,
          playDate: toServiceDate(playedAt),
          playedAt,
          isCounted: true,
          listenedSec: 60,
        }),
      );
    }
    const repository = app.get(AdminInsightsRepository);

    // when
    const rows = await repository.pushReactions(
      new Date(sentAt.getTime() - 60 * 1000),
    );

    // then
    expect(rows.find((row) => row.type === type)).toEqual({
      type,
      sent: 3,
      reacted: 1,
    });
    // 창보다 앞에 보낸 것은 세지 않는다
    expect(
      (await repository.pushReactions(new Date(sentAt.getTime() + 1000))).find(
        (row) => row.type === type,
      ),
    ).toBeUndefined();
  });

  it('프로모션 — 초대 코드마다 입력한 현재 계정의 지급·활성·청취를 세고, 코드 없는 계정을 기준선으로 싣는다', async () => {
    // given — 이 테스트만의 코드. A 는 지급 중·어제 접속·1시간 전 120초 청취, B 는 지급 끝·활동 없음
    const code = `E2E${Date.now() % 1000000}`;
    const now = Date.now();
    const [{ id: codeId }] = await dataSource.query<{ id: string }[]>(
      `INSERT INTO invite_codes (code, name, tier, grant_days, redeemed_count)
       VALUES ($1, 'E2E 프로모션', 'pro', 7, 3) RETURNING id`,
      [code],
    );
    const [a, b] = await Promise.all([
      createUserId('promo-a'),
      createUserId('promo-b'),
    ]);
    await dataSource.query(
      `INSERT INTO invite_code_redemptions (invite_code_id, user_id, tier, starts_at, ends_at)
       VALUES ($1, $2, 'pro', $3, $4), ($1, $5, 'pro', $6, $7)`,
      [
        codeId,
        a,
        new Date(now - 2 * DAY),
        new Date(now + 5 * DAY),
        b,
        new Date(now - 10 * DAY),
        new Date(now - 3 * DAY),
      ],
    );
    await seedSession(a, new Date(now - DAY));
    const contentId = await seedContent();
    const playedAt = new Date(now - 60 * 60 * 1000);
    const playRecords = dataSource.getRepository(PlayRecord);
    await playRecords.save(
      playRecords.create({
        userId: a,
        contentId,
        playDate: toServiceDate(playedAt),
        playedAt,
        isCounted: true,
        listenedSec: 120,
      }),
    );
    const adminAuth = await createUser('admin-promo', UserRole.ADMIN);

    try {
      // when
      const body = (
        await request(app.getHttpServer())
          .get(path('/admin/insights/invite-codes'))
          .query({ days: 7 })
          .set('Authorization', adminAuth)
          .expect(HttpStatus.OK)
      ).body as {
        codes: Record<string, unknown>[];
        baseline: { current: number };
      };

      // then — 입력 3(그중 1명 탈퇴) · 현재 2 · 지급 중 1 · 끝 1 · 7일 활성 1 · 청취자 1 · 청취 120초
      expect(body.codes.find((row) => row.code === code)).toMatchObject({
        name: 'E2E 프로모션',
        tier: 'pro',
        redeemed: 3,
        current: 2,
        withdrawn: 1,
        active_grants: 1,
        ended_grants: 1,
        active_7d: 1,
        listeners_7d: 1,
        listen_sec: 120,
        listen_sec_per_user: 60,
        paid_after_start: 0,
      });
      expect(body.baseline.current).toBeGreaterThan(0);
      expect(JSON.stringify(body)).not.toMatch(/"email"|"nickname"|"user_id"/);
    } finally {
      await dataSource.query(
        `DELETE FROM invite_code_redemptions WHERE invite_code_id = $1`,
        [codeId],
      );
      await dataSource.query(`DELETE FROM invite_codes WHERE id = $1`, [
        codeId,
      ]);
    }
  });

  describe('가입 퍼널 (GET /admin/insights/funnel)', () => {
    // 다른 스위트·같은 스위트의 2001 년 행과도 겹치지 않게 1995 년에 심는다
    const p = (at: string) => new Date(at);
    let seeded: Record<'a' | 'b' | 'c' | 'd', string>;

    async function play(
      userId: string,
      contentId: string,
      playedAt: Date,
      listenedSec = 60,
    ): Promise<void> {
      const repository = dataSource.getRepository(PlayRecord);
      await repository.save(
        repository.create({
          userId,
          contentId,
          playDate: toServiceDate(playedAt),
          playedAt,
          isCounted: true,
          listenedSec,
        }),
      );
    }

    async function complete(
      userId: string,
      contentId: string,
      at: Date,
    ): Promise<void> {
      await dataSource.query(
        `INSERT INTO user_signals (user_id, content_id, action, position_sec, max_reached_sec, created_at)
         VALUES ($1, $2, 'complete', 600, 600, $3)`,
        [userId, contentId, at],
      );
    }

    async function signedUpAt(userId: string, at: Date): Promise<void> {
      await dataSource.query(`UPDATE users SET created_at = $1 WHERE id = $2`, [
        at,
        userId,
      ]);
    }

    /**
     * 1995-03-06(월) 서비스 주 가입 A·B·C + 그 주 월요일 KST 03:00 가입 D(04:00 경계 전이라 지난 서비스 주다).
     * - A: 가입 2시간 뒤 첫 재생 · 3일 연속 청취 · 완청 · W1(가입 8일째) 세션 · 실결제
     * - B: 가입 이틀 뒤 첫 재생(24시간 밖) · 완청 없음
     * - D: 03-27 청취·완청
     */
    async function seedCohort(): Promise<
      Record<'a' | 'b' | 'c' | 'd', string>
    > {
      const contentId = await seedContent();
      const a = await createUserId('funnel-a');
      const b = await createUserId('funnel-b');
      const c = await createUserId('funnel-c');
      const d = await createUserId('funnel-d');
      await signedUpAt(a, p('1995-03-06T03:00:00.000Z'));
      await signedUpAt(b, p('1995-03-07T03:00:00.000Z'));
      await signedUpAt(c, p('1995-03-08T03:00:00.000Z'));
      await signedUpAt(d, p('1995-03-05T18:00:00.000Z'));
      await dataSource.query(
        `UPDATE users SET onboarding_completed = false WHERE id = $1`,
        [c],
      );

      await play(a, contentId, p('1995-03-06T05:00:00.000Z'));
      await play(a, contentId, p('1995-03-07T05:00:00.000Z'));
      await play(a, contentId, p('1995-03-08T05:00:00.000Z'));
      await complete(a, contentId, p('1995-03-06T06:00:00.000Z'));
      await seedSession(a, p('1995-03-14T03:00:00.000Z'));
      await dataSource.query(
        `INSERT INTO subscriptions (user_id, tier, store, original_transaction_id, latest_receipt, status,
                                    is_auto_renew, started_at, expires_at, environment)
         VALUES ($1, 'pro', 'play_store', $2, 'e2e', 'expired', false, $3, $4, 'production')`,
        [
          a,
          `${TOKEN}-funnel-sub`,
          p('1995-03-10T00:00:00.000Z'),
          p('1995-04-10T00:00:00.000Z'),
        ],
      );
      await play(a, contentId, p('1995-03-22T05:00:00.000Z'));

      await play(b, contentId, p('1995-03-09T05:00:00.000Z'), 30);

      await play(d, contentId, p('1995-03-27T05:00:00.000Z'));
      await complete(d, contentId, p('1995-03-27T06:00:00.000Z'));
      return { a, b, c, d };
    }

    beforeAll(async () => {
      seeded = await seedCohort();
    });

    afterAll(async () => {
      await dataSource.query(`DELETE FROM subscriptions WHERE user_id = $1`, [
        seeded.a,
      ]);
    });

    it('가입 주 퍼널 — 서비스 주로 묶고 단계마다 도달자를 센다(월요일 04시 전 가입은 지난 주)', async () => {
      // given — beforeAll 이 심은 4명
      const repository = app.get(AdminInsightsRepository);

      // when — 03-06 주(04:00 KST 경계 — 로컬 env 에 05:00 전환 시각이 있어도 1995 년은 전환 전이다)와 그 앞 주
      const rows = await repository.funnelCohorts(
        [
          {
            weekStart: '1995-03-06',
            startAt: p('1995-03-05T19:00:00.000Z'),
            endAt: p('1995-03-12T19:00:00.000Z'),
          },
          {
            weekStart: '1995-02-27',
            startAt: p('1995-02-26T19:00:00.000Z'),
            endAt: p('1995-03-05T19:00:00.000Z'),
          },
        ],
        { firstPlayHours: 24, habitDays: 14, minPlayDays: 3 },
      );

      // then
      expect(rows).toEqual([
        {
          weekStart: '1995-03-06',
          signups: 3,
          onboardingCompleted: 2,
          firstPlay24h: 1,
          firstPlayEver: 2,
          firstComplete: 1,
          w1Return: 1,
          habit14d: 1,
          paidEver: 1,
        },
        {
          weekStart: '1995-02-27',
          signups: 1,
          onboardingCompleted: 1,
          firstPlay24h: 0,
          firstPlayEver: 1,
          firstComplete: 1,
          w1Return: 0,
          habit14d: 0,
          paidEver: 0,
        },
      ]);
    });

    it('응답에 퍼널 단계·묶음이 실리고, 주 수 범위 밖이면 400, 관리자 아니면 403, 개인 식별 정보는 없다', async () => {
      // given
      const adminAuth = await createUser('admin-funnel', UserRole.ADMIN);

      // when
      const res = await request(app.getHttpServer())
        .get(path('/admin/insights/funnel?weeks=6&market=kr'))
        .set('Authorization', adminAuth)
        .expect(HttpStatus.OK);
      const body = res.body as {
        weeks: number;
        market: string | null;
        habit_min_play_days: number;
        steps: { key: string }[];
        cohorts: { week_start: string; in_progress: boolean }[];
        largest_drop_step: string | null;
      };

      // then
      expect(res.headers['cache-control']).toBe('no-store');
      expect(body.weeks).toBe(6);
      expect(body.market).toBe('kr');
      expect(body.habit_min_play_days).toBe(3);
      expect(body.cohorts).toHaveLength(6);
      expect(body.cohorts[0].in_progress).toBe(true);
      expect(body.cohorts.filter((c) => c.in_progress)).toHaveLength(1);
      expect(body.steps.map((s) => s.key)).toEqual([
        'signups',
        'onboarding_completed',
        'first_play_24h',
        'first_complete',
        'w1_return',
        'habit_14d',
        'paid_ever',
      ]);
      expect(JSON.stringify(body)).not.toMatch(
        /"email"|"nickname"|"user_id"|"provider_user_id"/,
      );

      for (const weeks of ['3', '13', 'abc']) {
        await request(app.getHttpServer())
          .get(path(`/admin/insights/funnel?weeks=${weeks}`))
          .set('Authorization', adminAuth)
          .expect(HttpStatus.BAD_REQUEST);
      }
      await request(app.getHttpServer())
        .get(path('/admin/insights/funnel?market=jp'))
        .set('Authorization', adminAuth)
        .expect(HttpStatus.BAD_REQUEST);
      const userAuth = await createUser('user-funnel', UserRole.USER);
      await request(app.getHttpServer())
        .get(path('/admin/insights/funnel'))
        .set('Authorization', userAuth)
        .expect(HttpStatus.FORBIDDEN);
    }, 60_000);
  });

  describe('길이별 완청률 (GET /admin/insights/completion-by-length)', () => {
    /**
     * 한국 편 K(600초)에 6명: 라이브러리 completed · 최대 도달 90% · 완청 신호 · 도달 50%(미완청) · 0초 재생만(시작 아님) ·
     * 방금 시작(24시간 안 — 제외). 글로벌 편 G 에는 완청 1명 — 결과에 나오면 안 된다.
     */
    it('한국 편만, 0초가 아닌 재생을 시작으로 보고, 완청 공용 정의(라이브러리·도달 90%·신호)로 센다 — 방금 시작은 뺀다', async () => {
      // given
      const kr = await seedContent();
      const global = await seedContent();
      await dataSource.query(
        `UPDATE contents SET market = 'global', language = 'en' WHERE id = $1`,
        [global],
      );
      const old = new Date(Date.now() - 3 * 86_400_000);
      const users = await Promise.all(
        ['lib', 'reach', 'signal', 'half', 'zero', 'fresh', 'glob'].map((l) =>
          createUserId(`comp-${l}`),
        ),
      );
      const [lib, reach, signal, half, zero, fresh, glob] = users;
      const playRepository = dataSource.getRepository(PlayRecord);
      const play = (userId: string, contentId: string, at: Date, sec = 60) =>
        playRepository.save(
          playRepository.create({
            userId,
            contentId,
            playDate: toServiceDate(at),
            playedAt: at,
            isCounted: true,
            listenedSec: sec,
          }),
        );
      for (const u of [lib, reach, signal, half]) await play(u, kr, old);
      await play(zero, kr, old, 0);
      await play(fresh, kr, new Date());
      await play(glob, global, old);
      await dataSource.query(
        `INSERT INTO library_items (user_id, content_id, source, status, added_at)
         VALUES ($1, $2, 'save', 'completed', $3)`,
        [lib, kr, old],
      );
      await dataSource.query(
        `INSERT INTO playback_progresses (user_id, content_id, position_sec, max_reached_sec)
         VALUES ($1, $3, 540, 540), ($2, $3, 300, 300), ($4, $5, 600, 600)`,
        [reach, half, kr, glob, global],
      );
      await dataSource.query(
        `INSERT INTO user_signals (user_id, content_id, action, position_sec, max_reached_sec, created_at)
         VALUES ($1, $2, 'complete', 600, 600, $3)`,
        [signal, kr, old],
      );

      // when
      const rows = await app
        .get(AdminInsightsRepository)
        .completionByContent(new Date(), {
          market: 'kr',
          minAgeHours: 24,
          reachedRatio: 0.9,
        });

      // then
      expect(rows.find((r) => r.contentId === kr)).toEqual({
        contentId: kr,
        title: `${TOKEN} 콘텐츠`,
        durationSec: 600,
        starters: 4,
        completers: 3,
      });
      expect(rows.find((r) => r.contentId === global)).toBeUndefined();
    });

    it('응답은 편 단위 집계와 추세뿐이고, 관리자 아니면 403 이다', async () => {
      // given
      const adminAuth = await createUser('admin-comp', UserRole.ADMIN);

      // when
      const res = await request(app.getHttpServer())
        .get(path('/admin/insights/completion-by-length'))
        .set('Authorization', adminAuth)
        .expect(HttpStatus.OK);
      const body = res.body as {
        content_market: string;
        min_age_hours: number;
        contents: { duration_sec: number; shrunk_rate: number }[];
      };

      // then
      expect(res.headers['cache-control']).toBe('no-store');
      expect(body.content_market).toBe('kr');
      expect(body.min_age_hours).toBe(24);
      expect(body.contents.length).toBeGreaterThan(0);
      expect(JSON.stringify(body)).not.toMatch(
        /"email"|"nickname"|"user_id"|"provider_user_id"/,
      );
      const userAuth = await createUser('user-comp', UserRole.USER);
      await request(app.getHttpServer())
        .get(path('/admin/insights/completion-by-length'))
        .set('Authorization', userAuth)
        .expect(HttpStatus.FORBIDDEN);
    });
  });

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
