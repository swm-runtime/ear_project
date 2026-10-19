import 'dotenv/config';

import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';

import { AppModule } from '@/app.module';
import { traceIdMiddleware } from '@/common/middlewares/trace-id.middleware';
import {
  ContentLanguage,
  ContentOrigin,
  ContentStatus,
} from '@/modules/content/content.enum';
import { Content } from '@/modules/content/entities/content.entity';
import { ContentTopic } from '@/modules/content/entities/content-topic.entity';
import { Topic } from '@/modules/interest/entities/topic.entity';
import { LibraryService } from '@/modules/library/library.service';
import { User } from '@/modules/user/entities/user.entity';
import {
  OnboardingStep,
  SocialProvider,
  UserMarket,
  UserRole,
} from '@/modules/user/user.enum';

interface ConsentItem {
  consent_type: string;
  version: string | null;
  is_required: boolean;
  min_age?: number;
}

interface PreviewBody {
  current_market: string;
  target_market: string;
  available: boolean;
  blocked_reason: string | null;
  retry_after_sec: number | null;
  required_consents: ConsentItem[];
  steps: string[];
}

interface ChangeBody {
  user: { id: string; market: string; onboarding_completed: boolean };
  access_token: string | null;
  access_token_expires_at: string | null;
  onboarding: {
    onboarding_completed: boolean;
    onboarding_step: string;
    steps: string[];
  };
}

/**
 * 시장 전환(KAN-227 · `global-api.md` 4.11). KR 사용자가 GLOBAL로 옮길 때 — 새 시장 필수 동의 없이는 아무것도 바뀌지 않고,
 * 바뀌면 새 토큰·주제 단계 재온보딩·이전 시장 항목 숨김·전환 이력이 한 번에 일어난다. 하루 1회이고 재온보딩 전 되돌리기는 예외다.
 */
describe('시장 전환 E2E', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let configService: ConfigService;
  const userIds: string[] = [];
  const topicIds: string[] = [];
  const contentIds: string[] = [];
  const path = (p: string) => `/api/v1${p}`;
  const STAMP = `E2E-MKT-${Date.now()}`;

  let krTopic: Topic;
  let krContents: Content[];
  let globalContent: Content;

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
    // 검증된 env 스냅샷이 아니라 ConfigService 를 바꾼다 — 로컬 `.env` 값에 흔들리지 않게(global-market.e2e 와 같다)
    configService = app.get(ConfigService);
    configService.set('MARKET_CHANGE_ENABLED', 'true');
    configService.set('GLOBAL_SIGNUP_ENABLED', 'true');

    krTopic = await seedTopic(UserMarket.KR);
    const globalTopic = await seedTopic(UserMarket.GLOBAL);
    krContents = [];
    for (let i = 0; i < 5; i += 1) {
      krContents.push(
        await seedContent(UserMarket.KR, ContentLanguage.KO, krTopic, i),
      );
    }
    globalContent = await seedContent(
      UserMarket.GLOBAL,
      ContentLanguage.EN,
      globalTopic,
      0,
    );
  }, 60_000);

  afterAll(async () => {
    await dataSource.query(
      `DELETE FROM library_items WHERE user_id = ANY($1)`,
      [userIds],
    );
    await dataSource.query(
      `DELETE FROM content_topics WHERE content_id = ANY($1)`,
      [contentIds],
    );
    await dataSource.query(`DELETE FROM contents WHERE id = ANY($1)`, [
      contentIds,
    ]);
    await dataSource.query(
      `DELETE FROM user_interests WHERE user_id = ANY($1)`,
      [userIds],
    );
    await dataSource.query(`DELETE FROM topics WHERE id = ANY($1)`, [topicIds]);
    await dataSource.query(`DELETE FROM users WHERE id = ANY($1)`, [userIds]);
    await app.close();
  }, 60_000);

  it('미리보기는 아무것도 바꾸지 않고 GLOBAL 필수 동의(국외 이전 포함)와 단계를 준다', async () => {
    const { auth, userId } = await createKrUser('preview');

    const body = await preview(auth, 'en');

    expect(body).toMatchObject({
      current_market: 'kr',
      target_market: 'global',
      available: true,
      blocked_reason: null,
      retry_after_sec: null,
      steps: ['topic'],
    });
    expect(body.required_consents.map((c) => c.consent_type)).toEqual(
      expect.arrayContaining([
        'terms',
        'privacy',
        'age_confirmation',
        'cross_border_transfer',
      ]),
    );
    expect(body.required_consents.every((c) => c.is_required)).toBe(true);
    expect(await userRow(userId)).toMatchObject({ market: 'kr' });
  }, 60_000);

  it('국외 이전 동의가 빠지면 400 CONSENT_REQUIRED이고 시장·주제·동의 무엇도 바뀌지 않는다', async () => {
    const { auth, userId } = await createKrUser('missing-consent');
    const consents = (await agreedConsents(auth, 'en')).filter(
      (c) => c.consent_type !== 'cross_border_transfer',
    );

    const response = await request(app.getHttpServer())
      .post(path('/users/me/market-change'))
      .set('Authorization', auth)
      .send({ preferred_language: 'en', consents })
      .expect(HttpStatus.BAD_REQUEST);

    expect(response.body).toMatchObject({ error_code: 'CONSENT_REQUIRED' });
    expect(await userRow(userId)).toMatchObject({
      market: 'kr',
      onboarding_completed: true,
    });
    expect(await activeInterestCount(userId)).toBe(1);
    expect(await consentCount(userId)).toBe(0);
    expect(await changeRows(userId)).toHaveLength(0);
  }, 60_000);

  it('전환하면 새 토큰·주제 단계 재온보딩·이전 시장 주제 비활성·첫 드립 초기화·이력이 한 번에 일어난다', async () => {
    const { auth, userId } = await createKrUser('switch');

    const body = await change(auth, 'en', HttpStatus.OK);

    // 응답 — 새 토큰의 시장 클레임이 global 이다
    expect(body.user).toMatchObject({
      id: userId,
      market: 'global',
      onboarding_completed: false,
    });
    expect(body.onboarding).toEqual({
      onboarding_completed: false,
      onboarding_step: 'topic',
      steps: ['topic'],
    });
    expect(body.access_token).not.toBeNull();
    expect(
      app.get(JwtService).decode<{ market: string }>(body.access_token!),
    ).toMatchObject({ market: 'global' });

    // DB — 같은 트랜잭션의 결과들
    expect(await userRow(userId)).toMatchObject({
      market: 'global',
      onboarding_completed: false,
      onboarding_step: OnboardingStep.TOPIC,
    });
    expect(await activeInterestCount(userId)).toBe(0);
    expect(await firstDripJobCount(userId)).toBe(0);
    expect(await changeRows(userId)).toEqual([
      { from_market: 'kr', to_market: 'global', is_revert: false },
    ]);
    expect(await consentVersions(userId)).toEqual(
      expect.arrayContaining([
        { consent_type: 'terms', version: 'global-0.1' },
        { consent_type: 'cross_border_transfer', version: null },
      ]),
    );

    // 이전 시장 항목은 목록에서 숨고, 재고(정규 드립 건너뛰기 판정)에도 세지 않는다
    const newAuth = `Bearer ${body.access_token}`;
    const library = await request(app.getHttpServer())
      .get(path('/users/me/library-items'))
      .set('Authorization', newAuth)
      .expect(HttpStatus.OK);
    const listed = (
      library.body as { items: { content: { id: string } }[] }
    ).items.map((item) => item.content.id);
    expect(listed).toContain(globalContent.id);
    expect(listed).not.toContain(krContents[0].id);

    const libraryService = app.get(LibraryService);
    expect(await libraryService.countUnfinished(userId, UserMarket.KR)).toBe(5);
    expect(
      await libraryService.countUnfinished(userId, UserMarket.GLOBAL),
    ).toBe(1);
  }, 60_000);

  it('이미 그 시장이면 200이고 아무것도 바꾸지 않는다 — 토큰도 새로 주지 않는다(멱등)', async () => {
    const { auth, userId } = await createKrUser('same');

    const body = await change(auth, 'ko', HttpStatus.OK, []);

    expect(body.access_token).toBeNull();
    expect(body.user).toMatchObject({ market: 'kr' });
    expect(await changeRows(userId)).toHaveLength(0);
  }, 60_000);

  it('같은 서비스 날짜의 두 번째 전환은 429 MARKET_CHANGE_COOLDOWN — 재온보딩 전 직전 시장으로 되돌리기는 예외다', async () => {
    const { auth, userId } = await createKrUser('cooldown');

    const first = await change(auth, 'en', HttpStatus.OK);
    const globalAuth = `Bearer ${first.access_token}`;

    // 재온보딩을 끝내기 전 되돌리기 — 세지 않는다
    const reverted = await change(globalAuth, 'ko', HttpStatus.OK);
    expect(reverted.user).toMatchObject({ market: 'kr' });
    const krAuth = `Bearer ${reverted.access_token}`;

    // 되돌리기를 다시 되돌리는 것은 예외가 아니다 — 온보딩 중에도 오늘은 막힌다(무한 왕복 방지)
    const pingPong = await request(app.getHttpServer())
      .post(path('/users/me/market-change'))
      .set('Authorization', krAuth)
      .send({
        preferred_language: 'en',
        consents: await agreedConsents(krAuth, 'en'),
      })
      .expect(HttpStatus.TOO_MANY_REQUESTS);
    expect(pingPong.body).toMatchObject({
      error_code: 'MARKET_CHANGE_COOLDOWN',
    });
    expect(await changeRows(userId)).toEqual([
      { from_market: 'kr', to_market: 'global', is_revert: false },
      { from_market: 'global', to_market: 'kr', is_revert: true },
    ]);

    // 재온보딩을 끝낸 뒤 다시 옮기려 해도 오늘은 막힌다
    await dataSource.query(
      `UPDATE users SET onboarding_completed = true, onboarding_step = 'done' WHERE id = $1`,
      [userId],
    );
    const consents = await agreedConsents(krAuth, 'en');
    expect(await preview(krAuth, 'en')).toMatchObject({
      available: false,
      blocked_reason: 'cooldown',
    });
    const blocked = await request(app.getHttpServer())
      .post(path('/users/me/market-change'))
      .set('Authorization', krAuth)
      .send({ preferred_language: 'en', consents })
      .expect(HttpStatus.TOO_MANY_REQUESTS);

    expect(blocked.body).toMatchObject({
      error_code: 'MARKET_CHANGE_COOLDOWN',
      retryable: false,
    });
    expect(
      (blocked.body as { retry_after_sec: number }).retry_after_sec,
    ).toBeGreaterThan(0);
    expect(await userRow(userId)).toMatchObject({ market: 'kr' });
  }, 60_000);

  it('전환 스위치가 꺼져 있거나 글로벌 가입이 닫혀 있으면 409 MARKET_UNAVAILABLE', async () => {
    const { auth, userId } = await createKrUser('closed');
    const consents = await agreedConsents(auth, 'en');

    for (const [key, value] of [
      ['MARKET_CHANGE_ENABLED', 'false'],
      ['GLOBAL_SIGNUP_ENABLED', 'false'],
    ] as const) {
      configService.set(key, value);
      try {
        expect(await preview(auth, 'en')).toMatchObject({
          available: false,
          blocked_reason: 'market_unavailable',
        });
        const response = await request(app.getHttpServer())
          .post(path('/users/me/market-change'))
          .set('Authorization', auth)
          .send({ preferred_language: 'en', consents })
          .expect(HttpStatus.CONFLICT);
        expect(response.body).toMatchObject({
          error_code: 'MARKET_UNAVAILABLE',
        });
      } finally {
        configService.set(key, 'true');
      }
    }
    expect(await userRow(userId)).toMatchObject({ market: 'kr' });
  }, 60_000);

  // --- 헬퍼 ---

  async function preview(auth: string, lang: string): Promise<PreviewBody> {
    const response = await request(app.getHttpServer())
      .get(path('/users/me/market-change/preview'))
      .query({ preferred_language: lang })
      .set('Authorization', auth)
      .expect(HttpStatus.OK);

    return response.body as PreviewBody;
  }

  /** 앱처럼 미리보기가 준 필수 항목을 전부 동의한 입력 */
  async function agreedConsents(
    auth: string,
    lang: string,
  ): Promise<
    { consent_type: string; version: string | null; is_agreed: boolean }[]
  > {
    return (await preview(auth, lang)).required_consents.map((consent) => ({
      consent_type: consent.consent_type,
      version: consent.version,
      is_agreed: true,
    }));
  }

  async function change(
    auth: string,
    lang: string,
    status: HttpStatus,
    consents?: {
      consent_type: string;
      version: string | null;
      is_agreed: boolean;
    }[],
  ): Promise<ChangeBody> {
    const response = await request(app.getHttpServer())
      .post(path('/users/me/market-change'))
      .set('Authorization', auth)
      .send({
        preferred_language: lang,
        consents: consents ?? (await agreedConsents(auth, lang)),
      })
      .expect(status);

    return response.body as ChangeBody;
  }

  /** 온보딩을 마친 KR 사용자 — KR 주제 1개, KR 미청취 5편 + GLOBAL 1편(이전 실험 흔적), 첫 드립 작업 1행 */
  async function createKrUser(
    label: string,
  ): Promise<{ auth: string; userId: string }> {
    const repository = dataSource.getRepository(User);
    const user = await repository.save(
      repository.create({
        provider: SocialProvider.KAKAO,
        providerUserId: `${STAMP}-${label}`,
        role: UserRole.USER,
        onboardingCompleted: true,
        onboardingStep: OnboardingStep.DONE,
        onboardingCompletedAt: new Date(),
        market: UserMarket.KR,
      }),
    );
    userIds.push(user.id);

    await dataSource.query(
      `INSERT INTO user_interests (user_id, topic_id, source, is_active, is_user_removed)
       VALUES ($1, $2, 'onboarding', true, false)`,
      [user.id, krTopic.id],
    );
    for (const content of [...krContents, globalContent]) {
      await dataSource.query(
        `INSERT INTO library_items (user_id, content_id, source, added_at) VALUES ($1, $2, 'drip', now())`,
        [user.id, content.id],
      );
    }
    await dataSource.query(
      `INSERT INTO first_drip_jobs (user_id, status, attempt_count, item_count) VALUES ($1, 'completed', 1, 2)`,
      [user.id],
    );

    const token = app
      .get(JwtService)
      .sign(
        { sub: user.id, role: user.role, typ: 'access', market: UserMarket.KR },
        { expiresIn: 600 },
      );

    return { auth: `Bearer ${token}`, userId: user.id };
  }

  async function userRow(userId: string): Promise<Record<string, unknown>> {
    const rows = await dataSource.query<Record<string, unknown>[]>(
      `SELECT market, onboarding_completed, onboarding_step FROM users WHERE id = $1`,
      [userId],
    );
    return rows[0];
  }

  async function activeInterestCount(userId: string): Promise<number> {
    const rows = await dataSource.query<{ count: string }[]>(
      `SELECT COUNT(*) AS count FROM user_interests WHERE user_id = $1 AND is_active`,
      [userId],
    );
    return Number(rows[0].count);
  }

  async function consentCount(userId: string): Promise<number> {
    const rows = await dataSource.query<{ count: string }[]>(
      `SELECT COUNT(*) AS count FROM consents WHERE user_id = $1`,
      [userId],
    );
    return Number(rows[0].count);
  }

  async function consentVersions(
    userId: string,
  ): Promise<{ consent_type: string; version: string | null }[]> {
    return dataSource.query(
      `SELECT consent_type, version FROM consents WHERE user_id = $1`,
      [userId],
    );
  }

  async function firstDripJobCount(userId: string): Promise<number> {
    const rows = await dataSource.query<{ count: string }[]>(
      `SELECT COUNT(*) AS count FROM first_drip_jobs WHERE user_id = $1`,
      [userId],
    );
    return Number(rows[0].count);
  }

  async function changeRows(
    userId: string,
  ): Promise<{ from_market: string; to_market: string; is_revert: boolean }[]> {
    return dataSource.query(
      `SELECT from_market, to_market, is_revert FROM user_market_changes WHERE user_id = $1 ORDER BY changed_at`,
      [userId],
    );
  }

  async function seedTopic(market: UserMarket): Promise<Topic> {
    const repository = dataSource.getRepository(Topic);
    const topic = await repository.save(
      repository.create({
        name: `${STAMP}-${market}`,
        parentCategory: STAMP,
        isVisible: true,
        displayOrder: 981,
        market,
      }),
    );
    topicIds.push(topic.id);
    return topic;
  }

  async function seedContent(
    market: UserMarket,
    language: ContentLanguage,
    topic: Topic,
    index: number,
  ): Promise<Content> {
    const repository = dataSource.getRepository(Content);
    const content = await repository.save(
      repository.create({
        title: `${STAMP} ${market} ${index}`,
        description: 'e2e 시장 전환 전용',
        authorName: '테스트',
        sourceName: 'E2E',
        sourceUrl: 'https://example.com/e2e',
        origin: ContentOrigin.AI_GENERATED,
        partnerId: null,
        seriesId: null,
        episodeNo: null,
        totalEpisodes: null,
        audioPath: `e2e-mkt/${market}-${index}.mp3`,
        durationSec: 600,
        thumbnailUrl: 'https://example.com/e2e.png',
        contentVersion: 1,
        licenseExpiresAt: null,
        status: ContentStatus.PUBLISHED,
        publishedAt: new Date(),
        withdrawnAt: null,
        market,
        language,
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
