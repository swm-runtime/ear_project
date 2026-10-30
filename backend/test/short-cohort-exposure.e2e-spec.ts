import 'dotenv/config';

import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';

import { AppModule } from '@/app.module';
import { traceIdMiddleware } from '@/common/middlewares/trace-id.middleware';
import { TokenService } from '@/modules/auth/services/token.service';
import {
  cohortLengthProfileSql,
  resolveContentLengthProfile,
} from '@/modules/content/content-cohort.policy';
import {
  ContentLanguage,
  ContentLengthProfile,
  ContentOrigin,
  ContentStatus,
} from '@/modules/content/content.enum';
import { ContentTopic } from '@/modules/content/entities/content-topic.entity';
import { Content } from '@/modules/content/entities/content.entity';
import { ContentCohortService } from '@/modules/content/services/content-cohort.service';
import { FirstDripService } from '@/modules/drip/services/first-drip.service';
import { UserInterest } from '@/modules/interest/entities/user-interest.entity';
import { UserInterestSource } from '@/modules/interest/interest.enum';
import { Topic } from '@/modules/interest/entities/topic.entity';
import { RetentionPushRepository } from '@/modules/retention-push/retention-push.repository';
import { User } from '@/modules/user/entities/user.entity';
import { SocialProvider, UserMarket, UserRole } from '@/modules/user/user.enum';

interface ListBody {
  items: { content?: { id: string } }[];
}

/** 경계 — 이 시각 이후 가입자가 short 코호트다. 이전 가입자는 created_at 을 이보다 앞으로 둔다 */
const SINCE = '2026-01-01T00:00:00+09:00';

/**
 * 짧은 판 코호트 노출 E2E(KAN-298) — `SHORT_CONTENT_COHORT_SINCE` 이후 가입자에게는 short 만, 이전 가입자에게는 standard 만
 * 탐색 목록·검색·첫 드립에 나온다. 설정이 비면 전원 standard 다. 공유 링크 상세는 막지 않는다. 실제 DB 위에서 본다.
 *
 * 토큰은 제품 경로(`TokenService.issueAccessToken` — 가입 시각 클레임)로 발급한다.
 */
describe('짧은 판 코호트 노출 E2E', () => {
  let app: INestApplication<App>;
  let rollbackApp: INestApplication<App>;
  let dataSource: DataSource;
  const userIds: string[] = [];
  const topicIds: string[] = [];
  const contentIds: string[] = [];
  const STAMP = `E2E-SHORTCO-${Date.now().toString(36)}`;
  const path = (p: string) => `/api/v1${p}`;

  let topic: Topic;
  let standardContent: Content;
  let shortContent: Content;
  let newUser: User;
  let oldUser: User;

  async function createApp(
    cohortService?: ContentCohortService,
  ): Promise<INestApplication<App>> {
    let builder = Test.createTestingModule({ imports: [AppModule] });
    if (cohortService) {
      builder = builder
        .overrideProvider(ContentCohortService)
        .useValue(cohortService);
    }
    const moduleRef = await builder.compile();
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

  beforeAll(async () => {
    // 경계 설정은 판정기에 직접 넣는다 — CI 는 .env.example 을 그대로 복사해 `SHORT_CONTENT_COHORT_SINCE=`(빈 값)가
    // 설정에 먼저 들어가므로, 실행 중에 process.env 를 바꿔도 ConfigService 는 빈 값을 돌려준다(2026-10-29 CI 실패).
    // env 문자열 → 시각 파싱은 content-cohort 단위 테스트가 본다
    app = await createApp(
      new ContentCohortService({ get: () => SINCE } as never),
    );
    // 롤백 앱 — 설정이 빈 것과 같은 판정기
    rollbackApp = await createApp(
      new ContentCohortService({ get: () => '' } as never),
    );
    dataSource = app.get(DataSource);

    topic = await seedTopic();
    standardContent = await seedContent('standard', null);
    shortContent = await seedContent('short', standardContent.id);
    newUser = await seedUser('new', null);
    oldUser = await seedUser('old', new Date('2025-12-01T00:00:00.000Z'));
  }, 120_000);

  afterAll(async () => {
    await dataSource.query(
      `DELETE FROM library_items WHERE user_id = ANY($1)`,
      [userIds],
    );
    await dataSource.query(
      `DELETE FROM first_drip_jobs WHERE user_id = ANY($1)`,
      [userIds],
    );
    await dataSource.query(
      `DELETE FROM user_interests WHERE user_id = ANY($1)`,
      [userIds],
    );
    await dataSource.query(`DELETE FROM users WHERE id = ANY($1)`, [userIds]);
    await dataSource.query(
      `DELETE FROM content_topics WHERE content_id = ANY($1)`,
      [contentIds],
    );
    await dataSource.query(
      `DELETE FROM contents WHERE id = ANY($1) AND variant_of_content_id IS NOT NULL`,
      [contentIds],
    );
    await dataSource.query(`DELETE FROM contents WHERE id = ANY($1)`, [
      contentIds,
    ]);
    await dataSource.query(`DELETE FROM topics WHERE id = ANY($1)`, [topicIds]);
    await rollbackApp.close();
    await app.close();
  }, 60_000);

  it('탐색 목록 — 경계 이후 가입자는 short 만, 이전 가입자는 standard 만 본다', async () => {
    const forNew = await list(
      app,
      newUser,
      `/explore/contents?topic_ids=${topic.id}`,
    );
    const forOld = await list(
      app,
      oldUser,
      `/explore/contents?topic_ids=${topic.id}`,
    );

    expect(forNew).toEqual([shortContent.id]);
    expect(forOld).toEqual([standardContent.id]);
  }, 60_000);

  it('검색 — 같은 규칙이다', async () => {
    const query = encodeURIComponent(STAMP);
    const forNew = await list(app, newUser, `/explore/search?query=${query}`);
    const forOld = await list(app, oldUser, `/explore/search?query=${query}`);

    expect(forNew).toContain(shortContent.id);
    expect(forNew).not.toContain(standardContent.id);
    expect(forOld).toContain(standardContent.id);
    expect(forOld).not.toContain(shortContent.id);
  }, 60_000);

  it('공유 링크 상세는 코호트와 무관하게 열린다 — 노출 실험이지 접근 제한이 아니다', async () => {
    await request(app.getHttpServer())
      .get(path(`/contents/${standardContent.id}`))
      .set('Authorization', await authOf(app, newUser))
      .expect(HttpStatus.OK);
    await request(app.getHttpServer())
      .get(path(`/contents/${shortContent.id}`))
      .set('Authorization', await authOf(app, oldUser))
      .expect(HttpStatus.OK);
  }, 60_000);

  it('첫 드립 — 경계 이후 가입자에게는 short 만 적립한다(인기 대체 편성도 short 안에서), 이전 가입자에게는 standard 만', async () => {
    const firstDrip = app.get(FirstDripService);
    const now = new Date();

    for (const user of [newUser, oldUser]) {
      await firstDrip.createJob(user.id, now);
      await firstDrip.schedule(user.id, now);
    }

    const profilesOf = async (userId: string) =>
      dataSource.query<{ content_id: string; length_profile: string }[]>(
        `SELECT li.content_id, c.length_profile
           FROM library_items li JOIN contents c ON c.id = li.content_id
          WHERE li.user_id = $1`,
        [userId],
      );
    const forNew = await profilesOf(newUser.id);
    const forOld = await profilesOf(oldUser.id);

    expect(forNew.map((row) => row.content_id)).toContain(shortContent.id);
    expect(forNew.every((row) => row.length_profile === 'short')).toBe(true);
    expect(forOld.map((row) => row.content_id)).toContain(standardContent.id);
    expect(forOld.every((row) => row.length_profile === 'standard')).toBe(true);
  }, 60_000);

  it('설정이 비면(롤백) 경계 이후 가입자도 standard 만 본다', async () => {
    const forNew = await list(
      rollbackApp,
      newUser,
      `/explore/contents?topic_ids=${topic.id}`,
    );

    expect(forNew).toEqual([standardContent.id]);
  }, 60_000);

  it('리텐션 알림의 SQL 판정이 애플리케이션 판정과 같고, 듣던 콘텐츠 조회가 그 조건으로 돈다', async () => {
    const since = new Date(SINCE);
    const cases: [Date, Date | null][] = [
      [new Date(since.getTime() - 1), since],
      [since, since],
      [new Date(since.getTime() + 1), since],
      [since, null],
    ];
    for (const [signedUpAt, boundary] of cases) {
      const [row] = await dataSource.query<{ profile: string }[]>(
        `SELECT ${cohortLengthProfileSql('$1::timestamptz', '$2')} AS profile`,
        [signedUpAt, boundary],
      );
      expect(row.profile).toBe(
        resolveContentLengthProfile(signedUpAt, boundary),
      );
    }

    const facts = await app.get(RetentionPushRepository).findUserFacts({
      userIds: [newUser.id],
      weekDates: [],
      listenedSince: new Date(),
      playDatesSince: '2026-01-01',
      resumeSince: new Date(0),
      shortCohortSince: since,
    });
    expect(facts).toHaveLength(1);
    expect(app.get(ContentCohortService).cohortSince()).toEqual(since);
    expect(ContentLengthProfile.SHORT).toBe('short');
  }, 60_000);

  async function list(
    target: INestApplication<App>,
    user: User,
    url: string,
  ): Promise<string[]> {
    const response = await request(target.getHttpServer())
      .get(path(url))
      .set('Authorization', await authOf(target, user))
      .expect(HttpStatus.OK);
    return (response.body as ListBody).items
      .map((item) => item.content?.id)
      .filter((id): id is string => typeof id === 'string');
  }

  async function authOf(
    target: INestApplication<App>,
    user: User,
  ): Promise<string> {
    const fresh = await dataSource
      .getRepository(User)
      .findOneByOrFail({ id: user.id });
    const { token } = target
      .get(TokenService)
      .issueAccessToken(fresh, new Date());
    return `Bearer ${token}`;
  }

  async function seedUser(
    label: string,
    createdAt: Date | null,
  ): Promise<User> {
    const repository = dataSource.getRepository(User);
    const user = await repository.save(
      repository.create({
        provider: SocialProvider.KAKAO,
        providerUserId: `${STAMP}-${label}`,
        role: UserRole.USER,
        onboardingCompleted: true,
        market: UserMarket.KR,
      }),
    );
    userIds.push(user.id);
    if (createdAt) {
      await dataSource.query(`UPDATE users SET created_at = $2 WHERE id = $1`, [
        user.id,
        createdAt,
      ]);
    }
    const interests = dataSource.getRepository(UserInterest);
    await interests.save(
      interests.create({
        userId: user.id,
        topicId: topic.id,
        source: UserInterestSource.ONBOARDING,
        isActive: true,
      }),
    );
    return repository.findOneByOrFail({ id: user.id });
  }

  async function seedTopic(): Promise<Topic> {
    const repository = dataSource.getRepository(Topic);
    const created = await repository.save(
      repository.create({
        name: `${STAMP}-topic`,
        parentCategory: STAMP,
        isVisible: true,
        displayOrder: 972,
        market: UserMarket.KR,
      }),
    );
    topicIds.push(created.id);
    return created;
  }

  async function seedContent(
    profile: 'standard' | 'short',
    variantOf: string | null,
  ): Promise<Content> {
    const repository = dataSource.getRepository(Content);
    const content = await repository.save(
      repository.create({
        title: `${STAMP} ${profile}`,
        description: 'e2e 짧은 판 코호트 전용',
        authorName: null,
        sourceName: 'E2E',
        sourceUrl: null,
        origin: ContentOrigin.AI_GENERATED,
        partnerId: null,
        seriesId: null,
        episodeNo: null,
        totalEpisodes: null,
        audioPath: `${STAMP}/${profile}.mp3`,
        durationSec: profile === 'short' ? 540 : 900,
        thumbnailUrl: 'https://example.com/e2e.png',
        contentVersion: 1,
        licenseExpiresAt: null,
        status: ContentStatus.PUBLISHED,
        publishedAt: new Date(),
        withdrawnAt: null,
        market: UserMarket.KR,
        language: ContentLanguage.KO,
        lengthProfile:
          profile === 'short'
            ? ContentLengthProfile.SHORT
            : ContentLengthProfile.STANDARD,
        variantOfContentId: variantOf,
      }),
    );
    contentIds.push(content.id);
    const contentTopics = dataSource.getRepository(ContentTopic);
    await contentTopics.save(
      contentTopics.create({ contentId: content.id, topicId: topic.id }),
    );
    return content;
  }
});
