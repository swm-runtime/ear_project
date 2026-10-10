import 'dotenv/config';

import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';

import { AppModule } from '@/app.module';
import { traceIdMiddleware } from '@/common/middlewares/trace-id.middleware';
import { ContentOrigin, ContentStatus } from '@/modules/content/content.enum';
import { Content } from '@/modules/content/entities/content.entity';
import { PlayRecord } from '@/modules/playback/entities/play-record.entity';
import { User } from '@/modules/user/entities/user.entity';
import { SocialProvider, UserRole } from '@/modules/user/user.enum';

/**
 * 주간 청취 상위 % E2E(`profile-api.md` 4.2 `listening_top_percent`, KAN-168) — 실제 DB 위에서
 * "나보다 많이 들은 사람 수" 집계 SQL 과 모집단(그 주 끝 전 가입자) 집계를 본다.
 *
 * 공유 로컬 DB 의 다른 행과 섞이지 않게 **2020년 1월 둘째 주**를 쓴다 — 그 주에 가입·청취한 행은 이 테스트가
 * 심은 것뿐이라 순위·모집단이 정확히 정해진다.
 */
describe('주간 청취 상위 % E2E', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  const userIds: string[] = [];
  const contentIds: string[] = [];
  const TOKEN = `e2etoppct${Date.now()}`;
  const WEEK_START = '2020-01-06';
  const JOINED_AT = new Date('2020-01-01T00:00:00.000Z');
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
      await dataSource.query(`DELETE FROM play_records WHERE user_id = $1`, [
        userId,
      ]);
      await dataSource.query(`DELETE FROM users WHERE id = $1`, [userId]);
    }
    for (const contentId of contentIds) {
      await dataSource.query(`DELETE FROM contents WHERE id = $1`, [contentId]);
    }
    await app.close();
  }, 60_000);

  it('그 주 청취 합으로 순위를 매기고(동점은 좋은 쪽), 0초 사용자도 모집단에 넣으며, 하위권·0초는 null 이다', async () => {
    // given — 그 주 전에 가입한 4명. 1등 3000초, 동점 2·3등 1000초(이틀에 나눠 들음), 0초 1명.
    // 다른 주의 기록은 순위에 끼지 않는다
    const contentId = await seedContent();
    const top = await createUser('top');
    const tiedA = await createUser('tied-a');
    const tiedB = await createUser('tied-b');
    const silent = await createUser('silent');
    await seedPlay(top.id, contentId, '2020-01-06', 3000);
    await seedPlay(tiedA.id, contentId, '2020-01-07', 600);
    await seedPlay(tiedA.id, contentId, '2020-01-12', 400);
    await seedPlay(tiedB.id, contentId, '2020-01-08', 1000);
    await seedPlay(silent.id, contentId, '2020-01-13', 99_999);

    // when / then — 1등: 1/4 → 25%
    expect(await topPercentOf(top.auth)).toBe(25);
    // 동점 둘 다 2등(나보다 많이 들은 사람 1명): 2/4 → 50%
    expect(await topPercentOf(tiedA.auth)).toBe(50);
    expect(await topPercentOf(tiedB.auth)).toBe(50);
    // 그 주 0초(다음 주 기록만 있음) → null
    expect(await topPercentOf(silent.auth)).toBeNull();

    // 4.1 의 이번 주 카드에도 같은 필드가 실린다 — 이번 주엔 듣지 않아 null
    const summary = await request(app.getHttpServer())
      .get(path('/users/me/profile'))
      .set('Authorization', top.auth);
    expect(summary.status).toBe(HttpStatus.OK);
    expect(
      (summary.body as { weekly_listening: Record<string, unknown> })
        .weekly_listening,
    ).toHaveProperty('listening_top_percent', null);
  });

  async function topPercentOf(auth: string): Promise<number | null> {
    const response = await request(app.getHttpServer())
      .get(path('/users/me/profile/weekly-listening'))
      .query({ week_start: WEEK_START })
      .set('Authorization', auth);
    expect(response.status).toBe(HttpStatus.OK);
    return (response.body as { listening_top_percent: number | null })
      .listening_top_percent;
  }

  async function createUser(
    label: string,
  ): Promise<{ id: string; auth: string }> {
    const repository = dataSource.getRepository(User);
    const user = await repository.save(
      repository.create({
        provider: SocialProvider.KAKAO,
        providerUserId: `${TOKEN}-${label}`,
        role: UserRole.USER,
        onboardingCompleted: true,
      }),
    );
    userIds.push(user.id);
    // 가입 시각을 그 주 전으로 옮긴다 — 모집단(그 주 끝 전 가입자)과 조회 가능 범위(가입 주 이후)가 이 값을 본다
    await dataSource.query(`UPDATE users SET created_at = $1 WHERE id = $2`, [
      JOINED_AT,
      user.id,
    ]);
    const token = app
      .get(JwtService)
      .sign(
        { sub: user.id, role: UserRole.USER, typ: 'access' },
        { expiresIn: 600 },
      );
    return { id: user.id, auth: `Bearer ${token}` };
  }

  async function seedPlay(
    userId: string,
    contentId: string,
    playDate: string,
    listenedSec: number,
  ): Promise<void> {
    const repository = dataSource.getRepository(PlayRecord);
    await repository.save(
      repository.create({
        userId,
        contentId,
        playDate,
        playedAt: new Date(`${playDate}T03:00:00.000Z`),
        isCounted: true,
        listenedSec,
      }),
    );
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
