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
import { InsightsDripArrivalTimeRow } from '@/modules/admin/admin.types';
import { AdminInsightsRepository } from '@/modules/admin/repositories/admin-insights.repository';
import { serviceDayRangesBetween } from '@/modules/admin/services/admin-insights.service';
import {
  ContentLanguage,
  ContentOrigin,
  ContentStatus,
} from '@/modules/content/content.enum';
import { Content } from '@/modules/content/entities/content.entity';
import { PlayRecord } from '@/modules/playback/entities/play-record.entity';
import { User } from '@/modules/user/entities/user.entity';
import { SocialProvider, UserMarket, UserRole } from '@/modules/user/user.enum';

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

interface ArmBody {
  key: string;
  send_time: string;
  reference: boolean;
  sent: number;
  users: number;
  played_2h: number;
  played_same_day: number;
  play_rate_2h: number | null;
  play_rate_same_day: number | null;
  first_sent_at: string | null;
  last_sent_at: string | null;
}
interface Body {
  market: string | null;
  days: number;
  since: string;
  min_sample: number;
  reaction_window_hours: number;
  arms: ArmBody[];
}

/**
 * 도착 알림 시각 실험 E2E(`GET /admin/insights/drip-arrival-time`, KAN-289) — 실제 DB 위에서 심은 알림·재생이 묶음·2시간·
 * 당일(서비스 날짜) 재생으로 갈리는지 본다. 공유 로컬 DB·병렬 스위트의 다른 행과 섞이지 않게 **재료 대조는 아무도 쓰지 않는
 * 2021-03 서비스 날짜로만 좁혀**(Repository 의 날짜 배열) 본다 — 그 시기는 04:00 경계라 `SERVICE_DAY_BOUNDARY_05_FROM` 값과
 * 무관하다. HTTP 대조는 형태·필터·권한만 본다(전역 합계는 보지 않는다).
 */
describe('도착 알림 시각 실험 지표 E2E', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  const userIds: string[] = [];
  const contentIds: string[] = [];
  const STAMP = `E2E-DAT-${Date.now().toString(36)}`;
  const path = (p: string) => `/api/v1${p}`;

  // KST 2021-03-10 07:00 = 2021-03-09T22:00Z. 서비스 날짜 03-10 = [03-09T19:00Z, 03-10T19:00Z) (04:00 경계)
  const D1_0700 = new Date('2021-03-09T22:00:00.000Z');
  const D2_0700 = new Date('2021-03-10T22:00:00.000Z');
  const at = (base: Date, offsetMs: number) =>
    new Date(base.getTime() + offsetMs);
  const SEEDED_DAYS = serviceDayRangesBetween(
    new Date('2021-03-09T20:00:00.000Z'),
    new Date('2021-03-11T20:00:00.000Z'),
  );

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication<INestApplication<App>>();
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

    const content = await seedContent();
    const u1 = await seedUser('u1', UserMarket.KR);
    const u2 = await seedUser('u2', UserMarket.KR);
    const u3 = await seedUser('u3', UserMarket.KR);
    const u4 = await seedUser('u4', UserMarket.KR);
    const u5 = await seedUser('u5', UserMarket.KR);
    const u6 = await seedUser('u6', UserMarket.KR);
    const u7 = await seedUser('u7', UserMarket.KR);
    const g1 = await seedUser('g1', UserMarket.GLOBAL);

    // 07:00 기준선
    // u1: 1시간 뒤 재생 → 2시간 ✓ · 당일 ✓
    await log(u1.id, 'drip_arrival', D1_0700);
    await play(u1.id, content.id, at(D1_0700, HOUR));
    // u2 첫날: 5시간 뒤(KST 12:00) 재생 → 2시간 ✗ · 당일 ✓
    await log(u2.id, 'drip_arrival', D1_0700);
    await play(u2.id, content.id, at(D1_0700, 5 * HOUR));
    // u2 둘째 날: 다음 날 KST 03:30 재생 → 달력일은 다르지만 서비스 날짜(04:00 전)는 같다 → 당일 ✓
    await log(u2.id, 'drip_arrival', D2_0700);
    await play(u2.id, content.id, new Date('2021-03-11T18:30:00.000Z'));
    // u3: 위치 저장이 정확히 2시간 뒤(반열림 — 2시간에서는 빠지고 당일에는 든다) → 2시간 ✗ · 당일 ✓
    await log(u3.id, 'drip_arrival', D2_0700);
    await progress(u3.id, content.id, at(D2_0700, 2 * HOUR));
    // u7: 다음 날 KST 04:30 재생만(다음 서비스 날짜) → 2시간 ✗ · 당일 ✗
    await log(u7.id, 'drip_arrival', D2_0700);
    await play(u7.id, content.id, new Date('2021-03-11T19:30:00.000Z'));
    // 07:30(A) — u4: 위치 저장 30분 뒤 → 2시간 ✓ · 당일 ✓. 건너뛴 알림·보내기 전 재생은 세지 않는다
    await log(u4.id, 'drip_arrival.a', at(D1_0700, 30 * MIN));
    await log(u4.id, 'drip_arrival.a', at(D2_0700, 30 * MIN), 'skipped');
    await progress(u4.id, content.id, at(D1_0700, HOUR));
    await play(u4.id, content.id, at(D1_0700, -10 * MIN));
    // 08:00(B) — u5: 재생 없음
    await log(u5.id, 'drip_arrival.b', at(D1_0700, HOUR));
    // 참고 행 — u6 아침 알림 1시간 뒤 재생 · 저녁 리텐션은 어느 행에도 들지 않는다
    await log(u6.id, 'retention.morning.b', at(D1_0700, HOUR));
    await play(u6.id, content.id, at(D1_0700, 2 * HOUR));
    await log(u6.id, 'retention.inactive.a', at(D1_0700, 12 * HOUR));
    // 글로벌 사용자 — market=kr 이면 빠진다
    await log(g1.id, 'drip_arrival', D1_0700);
    await play(g1.id, content.id, at(D1_0700, 30 * MIN));
  }, 120_000);

  afterAll(async () => {
    for (const table of [
      'notification_logs',
      'play_records',
      'playback_progresses',
    ]) {
      await dataSource.query(
        `DELETE FROM ${table} WHERE user_id = ANY($1::uuid[])`,
        [userIds],
      );
    }
    await dataSource.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [
      userIds,
    ]);
    await dataSource.query(`DELETE FROM contents WHERE id = ANY($1::uuid[])`, [
      contentIds,
    ]);
    await app.close();
  }, 60_000);

  async function seededRows(
    market: UserMarket | null,
  ): Promise<Map<string, InsightsDripArrivalTimeRow>> {
    const rows = await app
      .get(AdminInsightsRepository)
      .dripArrivalTimeRows(new Date('2021-03-01T00:00:00.000Z'), {
        market,
        types: {
          baseline: 'drip_arrival',
          a: 'drip_arrival.a',
          b: 'drip_arrival.b',
          morningPrefix: 'retention.morning.',
        },
        serviceDays: SEEDED_DAYS,
      });
    return new Map(rows.map((r) => [r.key, r]));
  }

  it('묶음마다 보낸 알림·받은 사람·2시간·당일(서비스 날짜) 재생을 센다', async () => {
    // when
    const rows = await seededRows(UserMarket.KR);

    // then — 기준선: u1 ✓✓ · u2 첫날 ✗✓ · u2 둘째 날 ✗✓(03:30) · u3 ✗✓(위치 저장) · u7 ✗✗(다음 서비스 날짜)
    expect(rows.get('baseline')).toMatchObject({
      sent: 5,
      users: 4,
      played2h: 1,
      playedSameDay: 4,
      firstSentAt: D1_0700,
      lastSentAt: D2_0700,
    });
    expect(rows.get('a')).toMatchObject({
      sent: 1,
      users: 1,
      played2h: 1,
      playedSameDay: 1,
    });
    expect(rows.get('b')).toMatchObject({
      sent: 1,
      users: 1,
      played2h: 0,
      playedSameDay: 0,
    });
    expect(rows.get('morning')).toMatchObject({
      sent: 1,
      played2h: 1,
      playedSameDay: 1,
    });
    expect([...rows.keys()].sort()).toEqual(['a', 'b', 'baseline', 'morning']);
  }, 60_000);

  it('시장을 고르지 않으면 글로벌 사용자도 들어간다', async () => {
    // when
    const rows = await seededRows(null);

    // then
    expect(rows.get('baseline')).toMatchObject({
      sent: 6,
      users: 5,
      played2h: 2,
      playedSameDay: 5,
    });
  }, 60_000);

  it('응답 — 네 행 순서·발송 시각·참고 행, 집계뿐이고 no-store, 검증 400 · 관리자 아니면 403', async () => {
    // given — 창 안(방금) 기준선 1건
    const adminAuth = await authOf('admin', UserRole.ADMIN);
    const recent = await seedUser('recent', UserMarket.KR);
    await log(recent.id, 'drip_arrival', new Date(Date.now() - 2 * HOUR));

    // when
    const res = await request(app.getHttpServer())
      .get(path('/admin/insights/drip-arrival-time?days=1&market=kr'))
      .set('Authorization', adminAuth)
      .expect(HttpStatus.OK);
    const body = res.body as Body;

    // then
    expect(res.headers['cache-control']).toBe('no-store');
    expect(body).toMatchObject({
      market: 'kr',
      days: 1,
      min_sample: 100,
      reaction_window_hours: 2,
    });
    expect(body.arms.map((a) => [a.key, a.send_time, a.reference])).toEqual([
      ['baseline', '07:00', false],
      ['a', '07:30', false],
      ['b', '08:00', false],
      ['morning', '08:00', true],
    ]);
    expect(body.arms[0].sent).toBeGreaterThanOrEqual(1);
    expect(body.arms[0].play_rate_2h).not.toBeNull();
    expect(JSON.stringify(body)).not.toMatch(
      /"email"|"nickname"|"user_id"|"provider_user_id"|"opened/,
    );
    expect(JSON.stringify(body)).not.toContain(STAMP);

    const defaults = await request(app.getHttpServer())
      .get(path('/admin/insights/drip-arrival-time'))
      .set('Authorization', adminAuth)
      .expect(HttpStatus.OK);
    expect((defaults.body as Body).days).toBe(14);
    expect((defaults.body as Body).market).toBeNull();

    for (const bad of ['days=0', 'days=91', 'days=abc', 'market=mars']) {
      await request(app.getHttpServer())
        .get(path(`/admin/insights/drip-arrival-time?${bad}`))
        .set('Authorization', adminAuth)
        .expect(HttpStatus.BAD_REQUEST);
    }
    await request(app.getHttpServer())
      .get(path('/admin/insights/drip-arrival-time'))
      .set('Authorization', await authOf('user', UserRole.USER))
      .expect(HttpStatus.FORBIDDEN);
  }, 60_000);

  async function log(
    userId: string,
    type: string,
    sentAt: Date,
    status: 'sent' | 'skipped' = 'sent',
  ): Promise<void> {
    await dataSource.query(
      `INSERT INTO notification_logs (user_id, type, deep_link, scheduled_at, sent_at, status, skip_reason)
       VALUES ($1, $2, null, $3, $4, $5, $6)`,
      [
        userId,
        type,
        sentAt,
        status === 'sent' ? sentAt : null,
        status,
        status === 'sent' ? null : 'daily_cap',
      ],
    );
  }

  async function play(
    userId: string,
    contentId: string,
    playedAt: Date,
  ): Promise<void> {
    const repository = dataSource.getRepository(PlayRecord);
    await repository.save(
      repository.create({
        userId,
        contentId,
        playDate: toServiceDate(playedAt),
        playedAt,
        isCounted: true,
        listenedSec: 60,
      }),
    );
  }

  async function progress(
    userId: string,
    contentId: string,
    updatedAt: Date,
  ): Promise<void> {
    await dataSource.query(
      `INSERT INTO playback_progresses (user_id, content_id, position_sec, max_reached_sec, created_at, updated_at)
       VALUES ($1, $2, 60, 60, $3, $3)`,
      [userId, contentId, updatedAt],
    );
  }

  async function seedUser(label: string, market: UserMarket): Promise<User> {
    const repository = dataSource.getRepository(User);
    const user = await repository.save(
      repository.create({
        provider: SocialProvider.KAKAO,
        providerUserId: `${STAMP}-${label}`,
        role: UserRole.USER,
        onboardingCompleted: true,
        market,
      }),
    );
    userIds.push(user.id);
    return user;
  }

  async function authOf(label: string, role: UserRole): Promise<string> {
    const repository = dataSource.getRepository(User);
    const user = await repository.save(
      repository.create({
        provider: SocialProvider.KAKAO,
        providerUserId: `${STAMP}-auth-${label}`,
        role,
        onboardingCompleted: true,
      }),
    );
    userIds.push(user.id);
    const token = app
      .get(JwtService)
      .sign({ sub: user.id, role, typ: 'access' }, { expiresIn: 600 });
    return `Bearer ${token}`;
  }

  async function seedContent(): Promise<Content> {
    const repository = dataSource.getRepository(Content);
    const content = await repository.save(
      repository.create({
        title: `${STAMP} content`,
        description: 'e2e 도착 알림 시각 지표 전용',
        authorName: null,
        sourceName: 'E2E',
        sourceUrl: null,
        origin: ContentOrigin.AI_GENERATED,
        partnerId: null,
        seriesId: null,
        episodeNo: null,
        totalEpisodes: null,
        audioPath: `${STAMP}/0.mp3`,
        durationSec: 600,
        thumbnailUrl: 'https://example.com/e2e.png',
        contentVersion: 1,
        licenseExpiresAt: null,
        status: ContentStatus.PUBLISHED,
        publishedAt: new Date('2021-01-01T00:00:00.000Z'),
        withdrawnAt: null,
        market: UserMarket.KR,
        language: ContentLanguage.KO,
      }),
    );
    contentIds.push(content.id);
    return content;
  }
});
