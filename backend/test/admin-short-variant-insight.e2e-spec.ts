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
import { InsightsShortVariantRow } from '@/modules/admin/admin.types';
import { AdminInsightsRepository } from '@/modules/admin/repositories/admin-insights.repository';
import {
  byCohort,
  byIntroVersion,
  byLengthProfile,
} from '@/modules/admin/services/admin-insights-short-variant.calc';
import {
  ContentLanguage,
  ContentLengthProfile,
  ContentOrigin,
  ContentStatus,
} from '@/modules/content/content.enum';
import { Content } from '@/modules/content/entities/content.entity';
import { ContentCohortService } from '@/modules/content/services/content-cohort.service';
import { PlayRecord } from '@/modules/playback/entities/play-record.entity';
import { User } from '@/modules/user/entities/user.entity';
import { SocialProvider, UserMarket, UserRole } from '@/modules/user/user.enum';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

interface MetricsBody {
  starters: number;
  completers: number;
  completion_rate: number | null;
  drop_10s: number;
  drop_30s: number;
  drop_60s: number;
  rate_10s: number | null;
  rate_30s: number | null;
  rate_60s: number | null;
}
interface SideBody {
  content_id: string;
  title: string;
  duration_sec: number;
  intro_version: string | null;
  all: MetricsBody;
  excluding_first: MetricsBody;
}
interface Body {
  market: string | null;
  min_age_hours: number;
  min_sample: number;
  drop_thresholds_sec: number[];
  cohort_since: string | null;
  cohort_window_hours: number | null;
  by_cohort: { key: string }[] | null;
  by_length_profile: { key: string }[];
  by_intro_version: { key: string | null }[];
  pairs: { short: SideBody; original: SideBody }[];
}

/**
 * 짧은 판·도입부 실험 E2E(`GET /admin/insights/short-variant`, KAN-298 · KAN-296) — 실제 DB 위에서 심은 재생이 시작·완청·
 * 10초·30초·1분 이탈·첫 편 제외·가입 코호트로 갈리는지 본다. 공유 로컬 DB·병렬 스위트의 다른 행과 섞이므로 **이 테스트가 심은
 * 콘텐츠로 좁힌 값**만 대조한다(전역 합계는 보지 않는다).
 *
 * 경계는 판정기에 직접 넣는다 — CI 는 .env.example 을 복사해 `SHORT_CONTENT_COHORT_SINCE=`(빈 값)가 먼저 들어간다.
 */
describe('짧은 판·도입부 실험 지표 E2E', () => {
  let app: INestApplication<App>;
  let rollbackApp: INestApplication<App>;
  let dataSource: DataSource;
  const userIds: string[] = [];
  const contentIds: string[] = [];
  const STAMP = `E2E-SVM-${Date.now().toString(36)}`;
  const path = (p: string) => `/api/v1${p}`;
  // 경계 = 10일 전 → 비교 창 10일. 경계 전 코호트는 경계 전 10일 안 가입자
  const NOW = Date.now();
  const SINCE = new Date(NOW - 10 * DAY);

  let original: Content;
  let short: Content;
  let firstOnly: Content;
  // GLOBAL 가입자만 듣는 편 — 짧은 판 비교는 KR 실험이라 어느 코호트에도 들지 않아야 한다(2026-10-31)
  let globalOnly: Content;

  async function createApp(
    cohortService: ContentCohortService,
  ): Promise<INestApplication<App>> {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ContentCohortService)
      .useValue(cohortService)
      .compile();
    const created = moduleRef.createNestApplication<INestApplication<App>>();
    created.use(traceIdMiddleware);
    created.setGlobalPrefix('api/v1');
    created.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await created.init();
    return created;
  }

  /**
   * 콘텐츠 O(standard 600초 · 기존 도입부) ↔ S(short 300초 · O의 짧은 판 · hook-v2), 그리고 첫 편으로만 쓰는 F(standard).
   * - old1(경계 5일 전 가입): F 5초(첫 편 · 10초 이탈) → O 600초 · 라이브러리 completed
   * - old2(경계 3일 전 가입): O 25초(첫 편 · 30초 이탈)
   * - veteran(경계 30일 전 가입 — 비교 창 밖): O 8초(첫 편) → 코호트 null, 콘텐츠 단위에만
   * - new1(경계 1일 뒤 가입): S 50초(첫 편 · 1분 이탈) · O 방금 재생(24시간 안 — 제외)
   * - new2(경계 2일 뒤 가입): F 100초(첫 편) → S 300초 · 완청 신호
   */
  beforeAll(async () => {
    app = await createApp(
      new ContentCohortService({ get: () => SINCE.toISOString() } as never),
    );
    rollbackApp = await createApp(
      new ContentCohortService({ get: () => '' } as never),
    );
    dataSource = app.get(DataSource);

    original = await seedContent('standard', null, null, 600);
    short = await seedContent('short', original.id, 'hook-v2', 300);
    firstOnly = await seedContent('standard', null, null, 600);
    globalOnly = await seedContent('standard', null, null, 600);

    const at = (base: Date, offsetMs: number) =>
      new Date(base.getTime() + offsetMs);
    const old1 = await seedUser('old1', at(SINCE, -5 * DAY));
    const old2 = await seedUser('old2', at(SINCE, -3 * DAY));
    const veteran = await seedUser('veteran', at(SINCE, -30 * DAY));
    const new1 = await seedUser('new1', at(SINCE, DAY));
    const new2 = await seedUser('new2', at(SINCE, 2 * DAY));
    const globalNew = await seedUser(
      'global-new',
      at(SINCE, DAY),
      UserMarket.GLOBAL,
    );

    await play(old1.id, firstOnly.id, at(old1.createdAt, HOUR), 5);
    await play(old1.id, original.id, at(old1.createdAt, 2 * DAY), 600);
    await play(old2.id, original.id, at(old2.createdAt, HOUR), 25);
    await play(veteran.id, original.id, new Date(NOW - 3 * DAY), 8);
    await play(new1.id, short.id, at(new1.createdAt, HOUR), 50);
    await play(new1.id, original.id, new Date(NOW - HOUR), 300);
    await play(new2.id, firstOnly.id, at(new2.createdAt, HOUR), 100);
    await play(new2.id, short.id, at(new2.createdAt, 2 * DAY), 300);
    await play(globalNew.id, globalOnly.id, at(globalNew.createdAt, HOUR), 50);

    await dataSource.query(
      `INSERT INTO library_items (user_id, content_id, source, status, added_at)
       VALUES ($1, $2, 'save', 'completed', $3)`,
      [old1.id, original.id, at(old1.createdAt, 2 * DAY)],
    );
    await dataSource.query(
      `INSERT INTO user_signals (user_id, content_id, action, position_sec, max_reached_sec, created_at)
       VALUES ($1, $2, 'complete', 300, 300, $3)`,
      [new2.id, short.id, at(new2.createdAt, 2 * DAY)],
    );
  }, 120_000);

  afterAll(async () => {
    for (const table of [
      'play_records',
      'library_items',
      'playback_progresses',
      'user_signals',
    ]) {
      await dataSource.query(
        `DELETE FROM ${table} WHERE user_id = ANY($1::uuid[])`,
        [userIds],
      );
    }
    await dataSource.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [
      userIds,
    ]);
    await dataSource.query(
      `DELETE FROM contents WHERE id = ANY($1::uuid[]) AND variant_of_content_id IS NOT NULL`,
      [contentIds],
    );
    await dataSource.query(`DELETE FROM contents WHERE id = ANY($1::uuid[])`, [
      contentIds,
    ]);
    await rollbackApp.close();
    await app.close();
  }, 60_000);

  /** 이 테스트가 심은 편의 행 — GLOBAL 전용 편은 아래 전용 테스트만 본다(집계 기대값을 흔들지 않게) */
  async function mineRows(
    cohortSince: Date | null,
  ): Promise<InsightsShortVariantRow[]> {
    const rows = await allMineRows(cohortSince);
    return rows.filter((r) => r.contentId !== globalOnly.id);
  }

  async function allMineRows(
    cohortSince: Date | null,
  ): Promise<InsightsShortVariantRow[]> {
    const rows = await app
      .get(AdminInsightsRepository)
      .shortVariantRows(new Date(NOW), {
        market: null,
        minAgeHours: 24,
        reachedRatio: 0.9,
        cohortSince,
        dropSec: [10, 30, 60],
      });
    return rows.filter((r) => contentIds.includes(r.contentId));
  }

  it('편마다 시작·완청·10초·30초·1분 이탈을 세고, 24시간 안 재생은 빼며, 첫 편을 표시한다', async () => {
    // when
    const rows = await mineRows(SINCE);
    const of = (contentId: string) =>
      byLengthProfile(rows.filter((r) => r.contentId === contentId))
        .map((g) => g.all)
        .find((m) => m.starters > 0);
    const ofExcluding = (contentId: string) =>
      byLengthProfile(rows.filter((r) => r.contentId === contentId)).reduce(
        (sum, g) => sum + g.excludingFirst.starters,
        0,
      );

    // then — O: old1(완청) · old2(25초) · veteran(8초). new1 의 방금 재생은 없다
    expect(of(original.id)).toMatchObject({
      starters: 3,
      completers: 1,
      drop10: 1,
      drop30: 2,
      drop60: 2,
    });
    expect(ofExcluding(original.id)).toBe(1);
    // S: new1(50초 · 첫 편) · new2(완청 신호)
    expect(of(short.id)).toMatchObject({
      starters: 2,
      completers: 1,
      drop10: 0,
      drop30: 0,
      drop60: 1,
    });
    expect(ofExcluding(short.id)).toBe(1);
    // F 는 두 사람 모두 첫 편이다
    expect(ofExcluding(firstOnly.id)).toBe(0);
  }, 60_000);

  it('가입 코호트 — 경계 전 같은 길이 창 가입자 vs 경계 뒤 가입자, 창 밖 가입자는 빠진다', async () => {
    // when
    const rows = await mineRows(SINCE);
    const cohorts = byCohort(rows, true);

    // then — standard: old1(F 5초 · O 완청) · old2(O 25초) / short: new1(S 50초) · new2(F 100초 · S 완청)
    expect(cohorts?.map((g) => [g.key, g.all])).toEqual([
      [
        'standard',
        {
          starters: 3,
          completers: 1,
          completionRate: 1 / 3,
          drop10: 1,
          drop30: 2,
          drop60: 2,
          rate10: 1 / 3,
          rate30: 2 / 3,
          rate60: 2 / 3,
        },
      ],
      [
        'short',
        {
          starters: 3,
          completers: 1,
          completionRate: 1 / 3,
          drop10: 0,
          drop30: 0,
          drop60: 1,
          rate10: 0,
          rate30: 0,
          rate60: 1 / 3,
        },
      ],
    ]);
    // 첫 편 제외 — 둘 다 두 번째 편(완청)만 남는다
    expect(cohorts?.map((g) => g.excludingFirst.completionRate)).toEqual([
      1, 1,
    ]);
    // veteran 은 코호트 없이 콘텐츠 단위에만
    expect(rows.filter((r) => r.cohort === null)).toHaveLength(1);
    // 도입부 — hook-v2 는 S 의 값
    const intro = byIntroVersion(rows);
    expect(intro.map((g) => [g.key, g.all.starters])).toEqual([
      [null, 5],
      ['hook-v2', 2],
    ]);
  }, 60_000);

  it('GLOBAL 가입자는 경계 뒤 가입이어도 어느 코호트에도 들지 않는다 — 짧은 판은 KR 실험', async () => {
    // when
    const rows = (await allMineRows(SINCE)).filter(
      (r) => r.contentId === globalOnly.id,
    );

    // then
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.cohort === null)).toBe(true);
  }, 60_000);

  it('경계가 비면 전부 코호트 null 이다', async () => {
    // when
    const rows = await mineRows(null);

    // then
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.cohort === null)).toBe(true);
  }, 60_000);

  it('응답 — 짝 비교·시장 거르기·경계 표시, 집계뿐이고 no-store, 관리자 아니면 403', async () => {
    // given
    const adminAuth = await authOf('admin', UserRole.ADMIN);

    // when
    const res = await request(app.getHttpServer())
      .get(path('/admin/insights/short-variant?market=kr'))
      .set('Authorization', adminAuth)
      .expect(HttpStatus.OK);
    const body = res.body as Body;

    // then
    expect(res.headers['cache-control']).toBe('no-store');
    expect(body).toMatchObject({
      market: 'kr',
      min_age_hours: 24,
      min_sample: 20,
      drop_thresholds_sec: [10, 30, 60],
      cohort_since: SINCE.toISOString(),
    });
    expect(body.cohort_window_hours).toBeGreaterThanOrEqual(240);
    expect(body.by_cohort?.map((g) => g.key)).toEqual(['standard', 'short']);
    expect(body.by_length_profile.map((g) => g.key)).toEqual([
      'standard',
      'short',
    ]);
    expect(body.by_intro_version[0].key).toBeNull();
    const pair = body.pairs.find((p) => p.short.content_id === short.id);
    expect(pair?.short).toMatchObject({
      title: short.title,
      duration_sec: 300,
      intro_version: 'hook-v2',
      all: { starters: 2, completers: 1, completion_rate: 0.5, rate_60s: 0.5 },
      excluding_first: { starters: 1, completion_rate: 1 },
    });
    expect(pair?.original).toMatchObject({
      content_id: original.id,
      duration_sec: 600,
      intro_version: null,
      all: { starters: 3, completers: 1, drop_10s: 1, drop_30s: 2 },
      excluding_first: { starters: 1, completion_rate: 1 },
    });
    expect(JSON.stringify(body)).not.toMatch(
      /"email"|"nickname"|"user_id"|"provider_user_id"/,
    );
    expect(JSON.stringify(body)).not.toContain(STAMP + '-');

    const global = await request(app.getHttpServer())
      .get(path('/admin/insights/short-variant?market=global'))
      .set('Authorization', adminAuth)
      .expect(HttpStatus.OK);
    expect(
      (global.body as Body).pairs.find((p) => p.short.content_id === short.id),
    ).toBeUndefined();

    await request(app.getHttpServer())
      .get(path('/admin/insights/short-variant?market=mars'))
      .set('Authorization', adminAuth)
      .expect(HttpStatus.BAD_REQUEST);
    await request(app.getHttpServer())
      .get(path('/admin/insights/short-variant'))
      .set('Authorization', await authOf('user', UserRole.USER))
      .expect(HttpStatus.FORBIDDEN);
  }, 60_000);

  it('경계 미설정 — cohort_since·by_cohort 가 null 이고 콘텐츠 단위 비교는 그대로 나온다', async () => {
    // when
    const res = await request(rollbackApp.getHttpServer())
      .get(path('/admin/insights/short-variant'))
      .set('Authorization', await authOf('admin2', UserRole.ADMIN, rollbackApp))
      .expect(HttpStatus.OK);
    const body = res.body as Body;

    // then
    expect(body.cohort_since).toBeNull();
    expect(body.cohort_window_hours).toBeNull();
    expect(body.by_cohort).toBeNull();
    expect(
      body.pairs.find((p) => p.short.content_id === short.id)?.short.all
        .starters,
    ).toBe(2);
  }, 60_000);

  async function play(
    userId: string,
    contentId: string,
    playedAt: Date,
    listenedSec: number,
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

  async function seedUser(
    label: string,
    createdAt: Date,
    market: UserMarket = UserMarket.KR,
  ): Promise<User> {
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
    await dataSource.query(`UPDATE users SET created_at = $2 WHERE id = $1`, [
      user.id,
      createdAt,
    ]);
    return repository.findOneByOrFail({ id: user.id });
  }

  async function authOf(
    label: string,
    role: UserRole,
    target: INestApplication<App> = app,
  ): Promise<string> {
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
    const token = target
      .get(JwtService)
      .sign({ sub: user.id, role, typ: 'access' }, { expiresIn: 600 });
    return `Bearer ${token}`;
  }

  async function seedContent(
    profile: 'standard' | 'short',
    variantOf: string | null,
    introVersion: string | null,
    durationSec: number,
  ): Promise<Content> {
    const repository = dataSource.getRepository(Content);
    const content = await repository.save(
      repository.create({
        title: `${STAMP} ${profile} ${contentIds.length}`,
        description: 'e2e 짧은 판 지표 전용',
        authorName: null,
        sourceName: 'E2E',
        sourceUrl: null,
        origin: ContentOrigin.AI_GENERATED,
        partnerId: null,
        seriesId: null,
        episodeNo: null,
        totalEpisodes: null,
        audioPath: `${STAMP}/${contentIds.length}.mp3`,
        durationSec,
        thumbnailUrl: 'https://example.com/e2e.png',
        contentVersion: 1,
        licenseExpiresAt: null,
        status: ContentStatus.PUBLISHED,
        publishedAt: new Date(NOW - 40 * DAY),
        withdrawnAt: null,
        market: UserMarket.KR,
        language: ContentLanguage.KO,
        lengthProfile:
          profile === 'short'
            ? ContentLengthProfile.SHORT
            : ContentLengthProfile.STANDARD,
        variantOfContentId: variantOf,
        introVersion,
      }),
    );
    contentIds.push(content.id);
    return content;
  }
});
