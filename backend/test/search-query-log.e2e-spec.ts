import 'dotenv/config';

import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';

import { AppModule } from '@/app.module';
import { traceIdMiddleware } from '@/common/middlewares/trace-id.middleware';
import { toServiceDate } from '@/common/utils/service-date.util';
import { ContentOrigin, ContentStatus } from '@/modules/content/content.enum';
import { Content } from '@/modules/content/entities/content.entity';
import { SearchQueryLog } from '@/modules/content/entities/search-query-log.entity';
import { PlayRecord } from '@/modules/playback/entities/play-record.entity';
import { SocialProvider } from '@/modules/user/user.enum';

interface SignUpBody {
  access_token: string;
  user: { id: string };
}
interface LoginBody {
  signup_token?: string;
  access_token?: string;
}
interface SummaryBody {
  days: number;
  totals: {
    searches: number;
    misses: number;
    miss_rate: number | null;
    clicked: number;
    users: number;
    short_queries: number;
    filtered_searches: number;
  };
  daily: { date: string; searches: number; misses: number; clicked: number }[];
  missed: RankRow[];
  top: RankRow[];
}

interface RankRow {
  query: string;
  searches: number;
  misses: number;
  clicked: number;
  result_count: number;
  has_more: boolean;
}

/**
 * 검색 질의 로그 E2E — `domain.md` 5.7의 규칙을 실제 DB 위에서 밟는다: 타이핑 묶음으로 접히는가,
 * 0건이 남는가, 결과 재생이 반응으로 집계되는가, 어드민 요약이 그 수를 돌려주는가.
 *
 * 콘텐츠 제목에 이 실행만의 토큰을 넣어 공유 로컬 DB의 다른 콘텐츠와 섞이지 않게 한다. 요약은 전 사용자 합계라
 * 이 테스트가 만든 질의(토큰 포함)로만 대조한다.
 */
describe('검색 질의 로그 E2E', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  const userIds: string[] = [];
  const contentIds: string[] = [];
  const TOKEN = `e2esql${Date.now()}`;
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
    await seedContents();
  }, 60_000);

  afterAll(async () => {
    for (const userId of userIds) {
      await dataSource.query(`DELETE FROM users WHERE id = $1`, [userId]);
    }
    await dataSource.query(
      `DELETE FROM idempotency_keys WHERE idempotency_key LIKE 'e2e-sql-%'`,
    );
    for (const contentId of contentIds) {
      await dataSource.query(`DELETE FROM contents WHERE id = $1`, [contentId]);
    }
    await app.close();
  }, 60_000);

  it('타이핑 묶음은 한 행으로 접히고, 0건은 남으며, 결과 재생은 반응으로 집계된다', async () => {
    const { userId, auth, providerToken } = await createUser('main');
    const logs = dataSource.getRepository(SearchQueryLog);

    // given — "커리" → "커리어" (접두사, 몇 ms 간격) : 한 행이 마지막 질의로 남는다
    await search(auth, `${TOKEN} 커리`).expect(HttpStatus.OK);
    const found = await search(auth, `${TOKEN} 커리어`).expect(HttpStatus.OK);
    const foundBody = found.body as { items: { content: { id: string } }[] };
    expect(foundBody.items.length).toBeGreaterThan(0);

    let rows = await logs.find({ where: { userId } });
    expect(rows).toHaveLength(1);
    expect(rows[0].query).toBe(`${TOKEN} 커리어`);
    expect(rows[0].resultCount).toBe(foundBody.items.length);
    expect(rows[0].resultContentIds).toEqual(
      foundBody.items.map((item) => item.content.id),
    );

    // given — 다른 말 "없는말" : 새 행, 0건
    await search(auth, `${TOKEN} 없는말`).expect(HttpStatus.OK);
    rows = await logs.find({ where: { userId }, order: { id: 'ASC' } });
    expect(rows).toHaveLength(2);
    expect(rows[1].query).toBe(`${TOKEN} 없는말`);
    expect(rows[1].resultCount).toBe(0);

    // given — 커서 페이지는 행을 늘리지 않는다 (결과가 한 페이지뿐이라 next_cursor 가 없으면 생략)
    const nextCursor = (found.body as { next_cursor: string | null })
      .next_cursor;
    if (nextCursor) {
      await request(app.getHttpServer())
        .get(path('/explore/search'))
        .query({ query: `${TOKEN} 커리어`, cursor: nextCursor })
        .set('Authorization', auth)
        .expect(HttpStatus.OK);
      expect(await logs.count({ where: { userId } })).toBe(2);
    }

    // given — 검색 뒤 결과 중 하나를 재생했다(앱의 재생 시작이 남기는 행과 같은 것)
    const playRecords = dataSource.getRepository(PlayRecord);
    const playedAt = new Date(rows[0].updatedAt.getTime() + 30_000);
    await playRecords.save(
      playRecords.create({
        userId,
        contentId: rows[0].resultContentIds[0],
        playDate: toServiceDate(playedAt),
        playedAt,
        isCounted: true,
        listenedSec: 0,
      }),
    );

    // when — 관리자 요약
    await dataSource.query(`UPDATE users SET role = 'admin' WHERE id = $1`, [
      userId,
    ]);
    const adminAuth = await reLogin(providerToken);
    const summary = await request(app.getHttpServer())
      .get(path('/admin/search-query-logs/summary'))
      .query({ days: 1 })
      .set('Authorization', adminAuth)
      .expect(HttpStatus.OK);
    const body = summary.body as SummaryBody;

    // then — 이 테스트의 두 질의가 각각 반응 1·0건 0으로 집계된다
    expect(body.days).toBe(1);
    const hit = body.top.find((row) => row.query === `${TOKEN} 커리어`);
    const miss = body.missed.find((row) => row.query === `${TOKEN} 없는말`);
    expect(hit).toEqual(
      expect.objectContaining({ searches: 1, misses: 0, clicked: 1 }),
    );
    expect(miss).toEqual(
      expect.objectContaining({
        searches: 1,
        misses: 1,
        clicked: 0,
        result_count: 0,
        has_more: false,
      }),
    );
    // then — 나온 콘텐츠 수는 그 검색이 남긴 첫 페이지 건수 그대로다
    expect(hit?.result_count).toBe(rows[0].resultCount);
    expect(hit?.has_more).toBe(rows[0].hasNext);
    expect(hit?.result_count).toBeGreaterThan(0);
    expect(body.totals.searches).toBeGreaterThanOrEqual(2);
    expect(body.totals.clicked).toBeGreaterThanOrEqual(1);
    expect(body.totals.misses).toBeGreaterThanOrEqual(1);
    expect(body.daily.length).toBeGreaterThan(0);

    // then — 창 밖 값은 거절
    await request(app.getHttpServer())
      .get(path('/admin/search-query-logs/summary'))
      .query({ days: 0 })
      .set('Authorization', adminAuth)
      .expect(HttpStatus.BAD_REQUEST);
  });

  function search(auth: string, query: string) {
    return request(app.getHttpServer())
      .get(path('/explore/search'))
      .query({ query })
      .set('Authorization', auth);
  }

  async function createUser(
    label: string,
  ): Promise<{ userId: string; auth: string; providerToken: string }> {
    const providerToken = `e2e-sql-${label}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
    const deviceId = `e2e-sql-device-${label}`;
    const login = await request(app.getHttpServer())
      .post(path('/auth/social-login'))
      .send({
        provider: SocialProvider.KAKAO,
        provider_token: providerToken,
        device_id: deviceId,
      })
      .expect(HttpStatus.OK);
    const loginBody = login.body as LoginBody;
    const signUp = await request(app.getHttpServer())
      .post(path('/auth/sign-up'))
      .set('Idempotency-Key', `e2e-sql-signup-${providerToken}`)
      .send({
        signup_token: loginBody.signup_token,
        device_id: deviceId,
        consents: [
          { consent_type: 'terms', version: '0.1', is_agreed: true },
          { consent_type: 'privacy', version: '0.1', is_agreed: true },
          { consent_type: 'age_confirmation', version: null, is_agreed: true },
        ],
      })
      .expect(HttpStatus.CREATED);
    const signUpBody = signUp.body as SignUpBody;
    userIds.push(signUpBody.user.id);

    return {
      userId: signUpBody.user.id,
      auth: `Bearer ${signUpBody.access_token}`,
      providerToken,
    };
  }

  async function reLogin(providerToken: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post(path('/auth/social-login'))
      .send({
        provider: SocialProvider.KAKAO,
        provider_token: providerToken,
        device_id: 'e2e-sql-device-relogin',
      })
      .expect(HttpStatus.OK);

    return `Bearer ${(response.body as LoginBody).access_token}`;
  }

  /** 제목에 이 실행의 토큰이 들어간 발행 콘텐츠 2편 — "커리어" 검색이 이것만 맞춘다 */
  async function seedContents(): Promise<void> {
    const repository = dataSource.getRepository(Content);
    for (const [index, title] of [
      `${TOKEN} 커리어를 바꾸는 법`,
      `${TOKEN} 커리어 전환 이야기`,
    ].entries()) {
      const content = await repository.save(
        repository.create({
          title,
          description: 'e2e 전용',
          authorName: '테스트',
          sourceName: 'E2E',
          sourceUrl: 'https://example.com/e2e',
          origin: ContentOrigin.AI_GENERATED,
          partnerId: null,
          seriesId: null,
          episodeNo: null,
          totalEpisodes: null,
          audioPath: `e2e-sql/${index}.mp3`,
          durationSec: 600,
          thumbnailUrl: 'https://example.com/e2e.png',
          contentVersion: 1,
          licenseExpiresAt: null,
          status: ContentStatus.PUBLISHED,
          publishedAt: new Date(Date.now() - (index + 1) * 60_000),
          withdrawnAt: null,
        }),
      );
      contentIds.push(content.id);
    }
  }
});
