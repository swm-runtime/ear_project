import 'dotenv/config';

import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';

import { AppModule } from '@/app.module';
import { ErrorCode } from '@/common/exceptions/error-code.enum';
import { traceIdMiddleware } from '@/common/middlewares/trace-id.middleware';
import { toPreviousFinalMonthStart } from '@/common/utils/service-date.util';
import {
  ALL_TIME_PERIOD_START,
  ContentOrigin,
  ContentStatus,
  StatsPeriodType,
} from '@/modules/content/content.enum';
import { ContentStat } from '@/modules/content/entities/content-stat.entity';
import { ContentTopic } from '@/modules/content/entities/content-topic.entity';
import { Content } from '@/modules/content/entities/content.entity';
import { Topic } from '@/modules/interest/entities/topic.entity';
import { LibraryItem } from '@/modules/library/library-item.entity';
import { LibraryItemSource } from '@/modules/library/library.enum';
import { SocialProvider } from '@/modules/user/user.enum';

/**
 * PRD 9.2 — **E2E 핵심 루프**: 소셜 로그인·가입 → 온보딩 → 첫 드립 적립 → 라이브러리 노출.
 *
 * **계정 생성부터 HTTP로 밟는다.** 온보딩의 모든 판정이 토큰에서 꺼낸 `user_id`로
 * 스코프되므로(architecture.md 9.2), 계정을 코드로 만들어 넣으면 그 경로가 검증에서 빠진다.
 *
 * 제공자 호출은 개발 대역(`DevClient`)이 받는다 — **실제 OAuth 연동을 검증하는 테스트가
 * 아니다.** 제공자 SDK를 붙이는 시점에 `setup-e2e.ts`와 함께 다시 세운다.
 *
 * 라이브러리 조회 API가 아직 없으므로 마지막 단계는 `first-drip` 상태와 `library_items`
 * 적재로 확인한다. `library-api`가 생기면 그 조회까지 이어 붙인다.
 *
 * 이 테스트는 **자기 데이터를 직접 심고 끝나면 지운다.** 개발용 목 시드(`npm run seed:mock`)가
 * 돌아 있든 아니든 같은 결과가 나와야 한다.
 */
describe('온보딩 E2E', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;

  const topicIds: string[] = [];
  const contentIds: string[] = [];
  const userIds: string[] = [];

  const MISSING_CONTENT_ID = '00000000-0000-4000-8000-000000000000';
  /** 관심 주제 3개 × 4건 = 12건. 6건을 채우고도 남는다 */
  const CONTENTS_PER_TOPIC = 4;
  /** 관심 주제 밖 후보 — 두 번째 섹션 3건을 채운다 */
  const OUTSIDE_CONTENT_COUNT = 6;

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

    await seedCatalog();
  }, 60_000);

  afterAll(async () => {
    await cleanUp();
    await app.close();
  }, 60_000);

  // --- 시나리오 ---

  it('소셜 로그인·가입을 거친 사용자가 온보딩을 마치면 라이브러리가 비어 있지 않다', async () => {
    // given — 소셜 로그인 → 약관 동의 → 가입까지 실제로 밟는다
    const { userId, auth, providerToken } = await createUser('picked');

    const initialState = await get('/onboarding/state', auth).expect(
      HttpStatus.OK,
    );
    expect(initialState.body).toMatchObject({
      onboarding_completed: false,
      onboarding_step: 'topic',
      selected_topic_ids: [],
      picked_count: 0,
    });

    // when / then — 1단계: 상한을 우회한 요청은 서버가 거부한다
    const overLimit = await put('/onboarding/interests', auth, {
      topic_ids: [...topicIds, contentIds[0]],
    }).expect(HttpStatus.BAD_REQUEST);
    expect(overLimit.body).toMatchObject({
      error_code: ErrorCode.ONBOARDING_INTEREST_LIMIT_EXCEEDED,
      retryable: false,
    });

    const saved = await put('/onboarding/interests', auth, {
      topic_ids: topicIds,
    }).expect(HttpStatus.OK);
    expect(saved.body).toMatchObject({
      selected_topic_ids: topicIds,
      onboarding_step: 'career',
    });

    // 2단계: [건너뛰기]도 같은 경로를 쓰고 단계만 전진한다
    const skipped = await patch('/onboarding/career', auth, {}).expect(
      HttpStatus.OK,
    );
    expect(skipped.body).toMatchObject({
      career: {
        job_category: null,
        job_title: null,
        years_of_experience: null,
      },
      onboarding_step: 'pick',
    });

    // 3단계: 9건이 두 섹션으로 나뉘어 온다
    const recommendations = await get(
      '/onboarding/recommendations',
      auth,
    ).expect(HttpStatus.OK);
    const sections = (recommendations.body as SectionsBody).sections;
    expect(sections).toHaveLength(2);
    expect(sections[0].section_type).toBe('interest');
    expect(sections[0].items).toHaveLength(6);
    expect(sections[1].section_type).toBe('monthly_popular');
    expect(sections[1].items).toHaveLength(3);

    // 두 번째 섹션은 고른 주제 밖에서 뽑는다
    for (const item of sections[1].items) {
      const itemTopicIds = item.topics.map((topic) => topic.topic_id);
      expect(itemTopicIds.some((id) => topicIds.includes(id))).toBe(false);
    }

    // 재진입해도 같은 9건이다
    const revisited = await get('/onboarding/recommendations', auth).expect(
      HttpStatus.OK,
    );
    expect(revisited.body).toEqual(recommendations.body);

    // 담기: 회수·부재 건이 섞여도 성공한 건만 적립하고 진행을 막지 않는다
    const pickedIds = [
      sections[0].items[0].content_id,
      sections[0].items[1].content_id,
    ];
    const picks = await post('/onboarding/picks', auth, {
      content_ids: [...pickedIds, MISSING_CONTENT_ID],
    })
      .set('Idempotency-Key', `e2e-picks-${userId}`)
      .expect(HttpStatus.OK);
    expect(picks.body).toMatchObject({
      saved_content_ids: pickedIds,
      failed: [
        {
          content_id: MISSING_CONTENT_ID,
          error_code: ErrorCode.CONTENT_NOT_FOUND,
        },
      ],
      picked_count: 2,
    });

    // 완료: 1건 이상 담았으므로 편성 결과를 기다리지 않는다
    const completed = await post('/onboarding/complete', auth, {})
      .set('Idempotency-Key', `e2e-complete-${userId}`)
      .expect(HttpStatus.OK);
    expect(completed.body).toMatchObject({
      onboarding_completed: true,
      onboarding_step: 'done',
      picked_count: 2,
      awaits_first_drip: false,
      first_drip: { poll_interval_sec: 1, max_wait_sec: 15 },
    });

    // then — 첫 드립은 담은 수와 무관하게 실행되고, 적립은 원자적으로 끝난다
    const firstDrip = await waitForFirstDrip(auth);
    expect(firstDrip.status).toBe('completed');
    expect(firstDrip.library_item_count).toBe(2);

    const items = await dataSource
      .getRepository(LibraryItem)
      .findBy({ userId });
    const dripped = items.filter(
      (item) => item.source === LibraryItemSource.DRIP,
    );

    // 중복 적립 방지(FR-16) — 담은 2건이 드립으로 다시 오지 않는다
    expect(items).toHaveLength(4);
    expect(new Set(items.map((item) => item.contentId)).size).toBe(4);
    expect(dripped.every((item) => !pickedIds.includes(item.contentId))).toBe(
      true,
    );

    // 같은 제공자 계정으로 다시 로그인하면 온보딩을 다시 시키지 않는다
    // (스플래시가 이 값으로 진입을 분기한다 — FR-35, splash.md 4)
    const reLoggedIn = await reLogin(providerToken);
    expect(reLoggedIn.status).toBe('authenticated');
    expect(reLoggedIn.user).toMatchObject({
      id: userId,
      onboarding_completed: true,
      onboarding_step: 'done',
    });
  }, 60_000);

  it('하나도 담지 않은 사용자는 편성을 기다린 뒤 비어 있지 않은 라이브러리로 진입한다', async () => {
    // given
    const { userId, auth } = await createUser('skipped');

    await put('/onboarding/interests', auth, {
      topic_ids: [topicIds[0]],
    }).expect(HttpStatus.OK);
    await patch('/onboarding/career', auth, {}).expect(HttpStatus.OK);
    await get('/onboarding/recommendations', auth).expect(HttpStatus.OK);

    // when — [담기] 없이 [건너뛰기]로 완료한다
    const completed = await post('/onboarding/complete', auth, {})
      .set('Idempotency-Key', `e2e-complete-${userId}`)
      .expect(HttpStatus.OK);

    // then — 0건 경로에서만 대기가 걸린다
    expect(completed.body).toMatchObject({
      picked_count: 0,
      awaits_first_drip: true,
    });

    const firstDrip = await waitForFirstDrip(auth);
    expect(firstDrip.status).toBe('completed');
    // plans.light.daily_drip_count = 2 (domain.md 8.1)
    expect(firstDrip.library_item_count).toBe(2);

    const items = await dataSource
      .getRepository(LibraryItem)
      .findBy({ userId });
    expect(items).toHaveLength(2);
    expect(items.every((item) => item.source === LibraryItemSource.DRIP)).toBe(
      true,
    );
  }, 60_000);

  it('커리어를 입력하면 구간값이 그대로 왕복한다', async () => {
    // given
    const { auth } = await createUser('career');
    await put('/onboarding/interests', auth, {
      topic_ids: [topicIds[0]],
    }).expect(HttpStatus.OK);

    // when — 서버는 구간 하한값(int)으로 저장한다 (onboarding-api.md 4.4)
    await patch('/onboarding/career', auth, {
      job_category: 'developer',
      job_title: '백엔드 엔지니어',
      years_of_experience: '2-3',
    }).expect(HttpStatus.OK);

    // then
    const state = await get('/onboarding/state', auth).expect(HttpStatus.OK);
    expect(state.body).toMatchObject({
      career: {
        job_category: 'developer',
        job_title: '백엔드 엔지니어',
        years_of_experience: '2-3',
      },
      onboarding_step: 'pick',
    });
  }, 60_000);

  it('완료한 계정의 온보딩 API 호출은 거부하고, 상태 조회만 200으로 답한다', async () => {
    // given
    const { userId, auth } = await createUser('completed');
    await put('/onboarding/interests', auth, {
      topic_ids: [topicIds[0]],
    }).expect(HttpStatus.OK);
    await post('/onboarding/complete', auth, {})
      .set('Idempotency-Key', `e2e-complete-${userId}`)
      .expect(HttpStatus.OK);

    // when / then — 완료 이후의 관심사 변경은 interest-management 소관이다
    const rejected = await put('/onboarding/interests', auth, {
      topic_ids: [topicIds[1]],
    }).expect(HttpStatus.CONFLICT);
    expect(rejected.body).toMatchObject({
      error_code: ErrorCode.ONBOARDING_ALREADY_COMPLETED,
    });

    // 조회는 404가 아니다 — 실패를 완료로 오인하면 온보딩을 처음부터 다시 시킨다
    const state = await get('/onboarding/state', auth).expect(HttpStatus.OK);
    expect(state.body).toMatchObject({ onboarding_completed: true });
  }, 60_000);

  it('관심 주제를 저장하지 않은 계정은 추천 조회와 완료가 모두 막힌다', async () => {
    // given
    const { userId, auth } = await createUser('no-interest');

    // when / then
    const recommendations = await get(
      '/onboarding/recommendations',
      auth,
    ).expect(HttpStatus.CONFLICT);
    expect(recommendations.body).toMatchObject({
      error_code: ErrorCode.ONBOARDING_INTERESTS_NOT_SET,
    });

    const completed = await post('/onboarding/complete', auth, {})
      .set('Idempotency-Key', `e2e-complete-${userId}`)
      .expect(HttpStatus.CONFLICT);
    expect(completed.body).toMatchObject({
      error_code: ErrorCode.ONBOARDING_INTERESTS_NOT_SET,
    });
  }, 60_000);

  it('완료 전에 첫 드립 상태를 조회하면 거부한다', async () => {
    // given — 대기는 완료 이후에만 존재한다
    const { auth } = await createUser('not-completed');

    // when
    const response = await get('/onboarding/first-drip', auth).expect(
      HttpStatus.CONFLICT,
    );

    // then
    expect(response.body).toMatchObject({
      error_code: ErrorCode.ONBOARDING_NOT_COMPLETED,
    });
  }, 60_000);

  it('인증 없이 호출하면 401이다', async () => {
    // given / when
    const response = await request(app.getHttpServer())
      .get('/api/v1/onboarding/state')
      .expect(HttpStatus.UNAUTHORIZED);

    // then
    expect(response.body).toMatchObject({ error_code: ErrorCode.UNAUTHORIZED });
  }, 60_000);

  // --- 헬퍼 ---

  interface SectionsBody {
    sections: {
      section_type: string;
      title: string;
      items: {
        content_id: string;
        topics: { topic_id: string; name: string }[];
      }[];
    }[];
  }

  interface FirstDripBody {
    status: string;
    library_item_count: number;
  }

  interface AuthUserBody {
    id: string;
    nickname: string | null;
    tier: string;
    onboarding_completed: boolean;
    onboarding_step: string;
  }

  interface SocialLoginBody {
    status: string;
    signup_token?: string;
    access_token?: string;
    user?: AuthUserBody;
  }

  interface SignUpBody {
    status: string;
    access_token: string;
    refresh_token: string;
    user: AuthUserBody;
  }

  const path = (suffix: string) => `/api/v1${suffix}`;

  const get = (suffix: string, auth: string) =>
    request(app.getHttpServer()).get(path(suffix)).set('Authorization', auth);

  const put = (suffix: string, auth: string, body: object) =>
    request(app.getHttpServer())
      .put(path(suffix))
      .set('Authorization', auth)
      .send(body);

  const patch = (suffix: string, auth: string, body: object) =>
    request(app.getHttpServer())
      .patch(path(suffix))
      .set('Authorization', auth)
      .send(body);

  const post = (suffix: string, auth: string, body: object) =>
    request(app.getHttpServer())
      .post(path(suffix))
      .set('Authorization', auth)
      .send(body);

  /**
   * **소셜 로그인 → 약관 동의 → 가입**을 실제 엔드포인트로 밟는다(`auth-api.md` 4.1·4.2).
   *
   * 계정은 소셜 로그인이 아니라 **동의 버튼을 누른 시점에 생성된다.** 그래서
   * `social-login`은 `consent_required` + `signup_token`만 주고, `sign-up`이 계정과
   * 동의 이력을 하나의 트랜잭션에서 만든다.
   *
   * 제공자 호출은 개발 대역(`DevClient`)이 받는다 — 같은 토큰이면 같은 계정이 되므로
   * 호출마다 다른 토큰을 만들어 새 계정을 얻는다(`setup-e2e.ts` 참조).
   */
  async function createUser(
    label: string,
  ): Promise<{ userId: string; auth: string; providerToken: string }> {
    const providerToken = `e2e-${label}-${Date.now()}-${Math.floor(
      Math.random() * 1_000_000,
    )}`;
    const deviceId = `e2e-device-${label}`;

    const login = await request(app.getHttpServer())
      .post(path('/auth/social-login'))
      .send({
        provider: SocialProvider.KAKAO,
        provider_token: providerToken,
        device_id: deviceId,
      })
      .expect(HttpStatus.OK);
    const loginBody = login.body as SocialLoginBody;

    // 처음 보는 제공자 계정이므로 아직 우리 계정이 없다
    expect(loginBody.status).toBe('consent_required');
    expect(loginBody.signup_token).toEqual(expect.any(String));
    expect(loginBody.access_token).toBeUndefined();

    const signUp = await request(app.getHttpServer())
      .post(path('/auth/sign-up'))
      .set('Idempotency-Key', `e2e-signup-${providerToken}`)
      .send({
        signup_token: loginBody.signup_token,
        device_id: deviceId,
        consents: [
          { consent_type: 'terms', version: '0.1', is_agreed: true },
          { consent_type: 'privacy', version: '0.1', is_agreed: true },
        ],
      })
      .expect(HttpStatus.CREATED);
    const signUpBody = signUp.body as SignUpBody;

    // 가입 직후에는 온보딩 1단계이고, 닉네임·이메일은 비어 있다(domain.md 3.1)
    expect(signUpBody.status).toBe('authenticated');
    expect(signUpBody.user).toMatchObject({
      onboarding_completed: false,
      onboarding_step: 'topic',
      nickname: null,
      tier: 'light',
    });

    userIds.push(signUpBody.user.id);

    return {
      userId: signUpBody.user.id,
      auth: `Bearer ${signUpBody.access_token}`,
      providerToken,
    };
  }

  /** 같은 제공자 계정으로 다시 로그인한다 — 이미 계정이 있으므로 바로 인증된다 */
  async function reLogin(providerToken: string): Promise<SignUpBody> {
    const response = await request(app.getHttpServer())
      .post(path('/auth/social-login'))
      .send({
        provider: SocialProvider.KAKAO,
        provider_token: providerToken,
        device_id: 'e2e-device-relogin',
      })
      .expect(HttpStatus.OK);

    return response.body as SignUpBody;
  }

  /**
   * 클라이언트가 하는 것과 같은 폴링이다. 편성은 완료 요청 커밋 이후에 시작되므로
   * 첫 조회에서 `pending`이 올 수 있다.
   */
  async function waitForFirstDrip(auth: string): Promise<FirstDripBody> {
    for (let attempt = 0; attempt < 50; attempt++) {
      const response = await get('/onboarding/first-drip', auth).expect(
        HttpStatus.OK,
      );
      const body = response.body as FirstDripBody;

      if (body.status !== 'pending') {
        return body;
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    throw new Error('first drip did not settle within the polling window');
  }

  async function seedCatalog(): Promise<void> {
    const topicRepository = dataSource.getRepository(Topic);
    const contentRepository = dataSource.getRepository(Content);
    const contentTopicRepository = dataSource.getRepository(ContentTopic);
    const contentStatRepository = dataSource.getRepository(ContentStat);
    const now = new Date();

    const topics = await topicRepository.save(
      ['A', 'B', 'C', 'OUTSIDE'].map((suffix, index) =>
        topicRepository.create({
          name: `E2E-${suffix}`,
          parentCategory: 'E2E',
          isVisible: true,
          displayOrder: 900 + index,
        }),
      ),
    );
    topicIds.push(...topics.slice(0, 3).map((topic) => topic.id));
    const outsideTopicId = topics[3].id;

    const plan: { topicId: string; count: number }[] = [
      ...topics.slice(0, 3).map((topic) => ({
        topicId: topic.id,
        count: CONTENTS_PER_TOPIC,
      })),
      { topicId: outsideTopicId, count: OUTSIDE_CONTENT_COUNT },
    ];

    let sequence = 0;
    for (const { topicId, count } of plan) {
      for (let index = 0; index < count; index++) {
        sequence += 1;
        const content = await contentRepository.save(
          contentRepository.create({
            title: `E2E 콘텐츠 ${sequence}`,
            description: 'e2e 전용',
            authorName: '테스트',
            sourceName: 'E2E',
            sourceUrl: 'https://example.com/e2e',
            origin: ContentOrigin.AI_GENERATED,
            partnerId: null,
            seriesId: null,
            episodeNo: null,
            totalEpisodes: null,
            audioPath: `e2e/${sequence}.mp3`,
            durationSec: 600 + sequence,
            thumbnailUrl: 'https://example.com/e2e.png',
            contentVersion: 1,
            licenseExpiresAt: null,
            status: ContentStatus.PUBLISHED,
            publishedAt: new Date(now.getTime() - sequence * 60_000),
            withdrawnAt: null,
          }),
        );
        contentIds.push(content.id);

        await contentTopicRepository.save(
          contentTopicRepository.create({ contentId: content.id, topicId }),
        );

        await contentStatRepository.save([
          contentStatRepository.create({
            contentId: content.id,
            periodType: StatsPeriodType.ALL,
            periodStart: ALL_TIME_PERIOD_START,
            playCount: 100 - sequence,
            isFinal: false,
          }),
          // 직전 확정 월 표본을 기준값(30건) 이상으로 채워, 두 번째 섹션이 항상
          // `monthly_popular`로 확정되게 한다. 표본 부족 폴백은 단위 테스트가 덮는다.
          contentStatRepository.create({
            contentId: content.id,
            periodType: StatsPeriodType.MONTH,
            periodStart: toPreviousFinalMonthStart(now),
            playCount: 10,
            isFinal: true,
          }),
        ]);
      }
    }
  }

  /** 심은 데이터만 지운다. 사용자 관련 행은 `users` FK의 CASCADE로 함께 사라진다 */
  async function cleanUp(): Promise<void> {
    for (const userId of userIds) {
      await dataSource.query(`DELETE FROM users WHERE id = $1`, [userId]);
    }

    // 멱등키는 `users` FK가 없다(가입은 계정이 생기기 전에 호출된다 — domain.md 1.4)
    await dataSource.query(
      `DELETE FROM idempotency_keys WHERE idempotency_key LIKE 'e2e-%'`,
    );

    for (const contentId of contentIds) {
      await dataSource.query(`DELETE FROM contents WHERE id = $1`, [contentId]);
    }

    for (const topicId of [...topicIds]) {
      await dataSource.query(`DELETE FROM topics WHERE id = $1`, [topicId]);
    }

    await dataSource.query(`DELETE FROM topics WHERE parent_category = 'E2E'`);
  }
});
