import 'dotenv/config';

import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';

import { AppModule } from '@/app.module';
import { traceIdMiddleware } from '@/common/middlewares/trace-id.middleware';
import { toServiceDate } from '@/common/utils/service-date.util';
import {
  EMBEDDING_DIM,
  EMBEDDING_MODEL_ID,
} from '@/modules/content/content.constant';
import { ContentOrigin, ContentStatus } from '@/modules/content/content.enum';
import { Content } from '@/modules/content/entities/content.entity';
import { SocialProvider, UserMarket } from '@/modules/user/user.enum';

interface RelatedBody {
  items: {
    type?: string;
    content: Record<string, unknown> & { id: string };
    library: { item_id: string; source: string; status: string } | null;
    is_counted_today: boolean;
  }[];
}

interface ErrorBody {
  error_code: string;
}

/** 기준 축 — 공유 로컬 DB의 다른 임베딩(실제 모델 벡터는 성분이 고르게 퍼진다)과 거의 직교한다. 검색 E2E와 다른 축이다 */
const BASE_AXIS = 11;
const OTHER_AXIS = 1200;

/** 두 축 성분으로 만든 단위 벡터 — 기준 축 단위 벡터와의 코사인이 정확히 `cosine`이다 */
function vectorWithCosine(cosine: number): number[] {
  const vector = new Array<number>(EMBEDDING_DIM).fill(0);
  vector[BASE_AXIS] = cosine;
  vector[OTHER_AXIS] = Math.sqrt(1 - cosine * cosine);
  return vector;
}

function toPgVector(vector: number[]): string {
  return `[${vector.join(',')}]`;
}

/**
 * 관련 콘텐츠 E2E(KAN-240 — `player-api.md` 4.8, `player.md` 4.2-2, domain.md 5.6). 실제 DB 위에서 밟는다.
 *
 * 기준 편은 기준 축 단위 벡터, 후보는 기준 축과의 코사인을 정해 둔 벡터다 — 순서·임계값(0.3)·제외 조건을 코사인 값으로 통제한다.
 */
describe('관련 콘텐츠 E2E — GET /contents/:content_id/related', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  const userIds: string[] = [];
  const contentIds: string[] = [];
  const path = (p: string) => `/api/v1${p}`;

  const ids = {
    base: '',
    /** 코사인 0.9 → 0.35 순 — 임계값 위 일곱 편 */
    near: [] as string[],
    far: '',
    stubModel: '',
    stale: '',
    withdrawn: '',
    expired: '',
    global: '',
    noEmbedding: '',
    staleBase: '',
    withdrawnBase: '',
    globalBase: '',
  };

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

    ids.base = await seed('기준 편', 0);
    await embed(ids.base, vectorWithCosine(1));

    const nearCosines = [0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.35];
    // 시드 순서를 코사인 순서와 엇갈리게 둔다 — 결과 순서가 발행 시각이 아니라 코사인에서 나와야 한다
    for (const [index, cosine] of [...nearCosines.entries()].reverse()) {
      const id = await seed(`가까운 편 ${cosine}`, index + 1);
      await embed(id, vectorWithCosine(cosine));
      ids.near[index] = id;
    }

    // 코사인 0.2 — 하한(0.3) 아래
    ids.far = await seed('먼 편', 20);
    await embed(ids.far, vectorWithCosine(0.2));
    // 아래는 전부 기준과 거의 같은 벡터(0.99)지만 후보 조건에서 빠져야 한다
    ids.stubModel = await seed('스텁 모델 편', 21);
    await embed(ids.stubModel, vectorWithCosine(0.99), { model: 'dev-stub' });
    ids.stale = await seed('재발행 미갱신 편', 22, { contentVersion: 2 });
    await embed(ids.stale, vectorWithCosine(0.99), { version: 1 });
    ids.withdrawn = await seed('회수된 편', 23, {
      status: ContentStatus.WITHDRAWN,
      withdrawnAt: new Date(),
    });
    await embed(ids.withdrawn, vectorWithCosine(0.99));
    ids.expired = await seed('라이선스 만료 편', 24, {
      licenseExpiresAt: new Date(Date.now() - 60_000),
    });
    await embed(ids.expired, vectorWithCosine(0.99));
    ids.global = await seed('다른 시장 편', 25, { market: UserMarket.GLOBAL });
    await embed(ids.global, vectorWithCosine(0.99));

    // 기준 편 쪽 에지
    ids.noEmbedding = await seed('임베딩 없는 편', 30);
    ids.staleBase = await seed('기준 벡터가 옛 판인 편', 31, {
      contentVersion: 3,
    });
    await embed(ids.staleBase, vectorWithCosine(1), { version: 2 });
    ids.withdrawnBase = await seed('회수된 기준 편', 32, {
      status: ContentStatus.WITHDRAWN,
      withdrawnAt: new Date(),
    });
    await embed(ids.withdrawnBase, vectorWithCosine(1));
    ids.globalBase = await seed('다른 시장 기준 편', 33, {
      market: UserMarket.GLOBAL,
    });
    await embed(ids.globalBase, vectorWithCosine(1));
  }, 60_000);

  afterAll(async () => {
    for (const id of userIds) {
      await dataSource.query(`DELETE FROM users WHERE id = $1`, [id]);
    }
    await dataSource.query(
      `DELETE FROM idempotency_keys WHERE idempotency_key LIKE 'e2e-related-%'`,
    );
    for (const id of contentIds) {
      await dataSource.query(`DELETE FROM contents WHERE id = $1`, [id]);
    }
    await app.close();
  }, 60_000);

  describe('후보·정렬', () => {
    it('기준 편은 빠지고 코사인 내림차순으로 기본 5건이다', async () => {
      // given
      const { auth } = await createUser('default');

      // when
      const response = await related(auth, ids.base).expect(HttpStatus.OK);

      // then
      const body = response.body as RelatedBody;
      expect(body.items.map((item) => item.content.id)).toEqual(
        ids.near.slice(0, 5),
      );
      expect(body.items.map((item) => item.content.id)).not.toContain(ids.base);
    });

    it('임계값 이하·다른 모델·버전 불일치·회수·만료·다른 시장 편은 limit을 넉넉히 줘도 나오지 않는다', async () => {
      // given
      const { auth } = await createUser('excluded');

      // when
      const response = await related(auth, ids.base, { limit: '10' }).expect(
        HttpStatus.OK,
      );

      // then — 임계값 위 일곱 편만, 코사인 순서
      const returned = (response.body as RelatedBody).items.map(
        (item) => item.content.id,
      );
      expect(returned).toEqual(ids.near);
      for (const excluded of [
        ids.far,
        ids.stubModel,
        ids.stale,
        ids.withdrawn,
        ids.expired,
        ids.global,
      ]) {
        expect(returned).not.toContain(excluded);
      }
    });

    it('exclude_ids에 든 편을 빼고 limit 안에서 다음 편으로 채운다', async () => {
      // given
      const { auth } = await createUser('exclude');

      // when
      const response = await related(auth, ids.base, {
        limit: '10',
        exclude_ids: `${ids.near[0]},${ids.near[1]}`,
      }).expect(HttpStatus.OK);

      // then
      expect(
        (response.body as RelatedBody).items.map((item) => item.content.id),
      ).toEqual(ids.near.slice(2));
    });

    it('limit만큼만 준다', async () => {
      // given
      const { auth } = await createUser('limit');

      // when
      const response = await related(auth, ids.base, { limit: '2' }).expect(
        HttpStatus.OK,
      );

      // then
      expect(
        (response.body as RelatedBody).items.map((item) => item.content.id),
      ).toEqual(ids.near.slice(0, 2));
    });

    it('후보 편이 기준이 되면 그 편 자신은 빠지고 원래 기준 편이 후보로 나온다', async () => {
      // given
      const { auth } = await createUser('symmetric');

      // when — 0.9 편 기준(두 축 평면에서 기준 축과 25.8°). 0.8 편(36.9°)이 가장 가깝다
      const response = await related(auth, ids.near[0], {
        limit: '10',
      }).expect(HttpStatus.OK);

      // then
      const returned = (response.body as RelatedBody).items.map(
        (item) => item.content.id,
      );
      expect(returned[0]).toBe(ids.near[1]);
      expect(returned).toContain(ids.base);
      expect(returned).not.toContain(ids.near[0]);
    });
  });

  describe('행 모양', () => {
    it('탐색 4.1 콘텐츠 행과 같다 — 담긴 편은 library, 오늘 카운트된 편은 is_counted_today가 실린다', async () => {
      // given — 0.9 편은 담고, 0.8 편은 오늘 카운트된 재생 기록이 있다
      const { userId, auth } = await createUser('shape');
      await request(app.getHttpServer())
        .post(path(`/contents/${ids.near[0]}/save`))
        .set('Authorization', auth)
        .send({ client_seq: 1 })
        .expect(HttpStatus.CREATED);
      const now = new Date();
      await dataSource.query(
        `INSERT INTO play_records (user_id, content_id, play_date, played_at, listened_sec, is_counted)
         VALUES ($1, $2, $3, $4, 0, true)`,
        [userId, ids.near[1], toServiceDate(now), now],
      );

      // when
      const response = await related(auth, ids.base, { limit: '3' }).expect(
        HttpStatus.OK,
      );

      // then
      const [saved, counted, plain] = (response.body as RelatedBody).items;
      expect(Object.keys(saved).sort()).toEqual([
        'content',
        'is_completed',
        'is_counted_today',
        'library',
      ]);
      expect(saved.type).toBeUndefined();
      expect(Object.keys(saved.content).sort()).toEqual(
        [
          'author_name',
          'content_version',
          'duration_sec',
          'id',
          'language',
          'series',
          'source_name',
          'source_url',
          'tags',
          'thumbnail_url',
          'title',
          'topic_ids',
        ].sort(),
      );
      expect(saved.content).toMatchObject({
        id: ids.near[0],
        title: '가까운 편 0.9',
        content_version: 1,
        topic_ids: [],
        tags: [],
        series: null,
      });
      expect(saved.library).toEqual({
        item_id: expect.any(String) as string,
        source: 'save',
        status: 'unplayed',
      });
      expect(saved.is_counted_today).toBe(false);
      expect(counted.content.id).toBe(ids.near[1]);
      expect(counted.library).toBeNull();
      expect(counted.is_counted_today).toBe(true);
      expect(plain.library).toBeNull();
      expect(plain.is_counted_today).toBe(false);
    });
  });

  describe('기준 편 에지', () => {
    it('기준 편에 임베딩이 없으면 200 items: []', async () => {
      // given
      const { auth } = await createUser('no-embedding');

      // when
      const response = await related(auth, ids.noEmbedding).expect(
        HttpStatus.OK,
      );

      // then
      expect(response.body).toEqual({ items: [] });
    });

    it('기준 편 임베딩이 재발행 전 판이면 없는 것과 같아 200 items: []', async () => {
      // given
      const { auth } = await createUser('stale-base');

      // when
      const response = await related(auth, ids.staleBase).expect(HttpStatus.OK);

      // then
      expect(response.body).toEqual({ items: [] });
    });

    it.each([
      ['없는 id', () => randomUUID()],
      ['회수된 기준 편', () => ids.withdrawnBase],
      ['다른 시장 기준 편', () => ids.globalBase],
    ])('%s는 404 CONTENT_NOT_FOUND', async (_label, contentId) => {
      // given
      const { auth } = await createUser('not-found');

      // when
      const response = await related(auth, contentId()).expect(
        HttpStatus.NOT_FOUND,
      );

      // then
      expect((response.body as ErrorBody).error_code).toBe('CONTENT_NOT_FOUND');
    });
  });

  describe('요청 검증', () => {
    it.each([
      ['limit 0', { limit: '0' }],
      ['limit 11', { limit: '11' }],
      ['limit 숫자 아님', { limit: 'abc' }],
      ['exclude_ids uuid 아님', { exclude_ids: 'not-a-uuid' }],
      [
        'exclude_ids 51개',
        {
          exclude_ids: Array.from({ length: 51 }, () => randomUUID()).join(','),
        },
      ],
      ['모르는 쿼리', { cursor: 'x' }],
    ])('%s면 400 VALIDATION_FAILED', async (_label, query) => {
      // given
      const { auth } = await createUser('invalid');

      // when
      const response = await related(auth, ids.base, query).expect(
        HttpStatus.BAD_REQUEST,
      );

      // then
      expect((response.body as ErrorBody).error_code).toBe('VALIDATION_FAILED');
    });

    it('exclude_ids 50개는 받는다', async () => {
      // given
      const { auth } = await createUser('exclude-max');
      const excludeIds = [
        ids.near[0],
        ...Array.from({ length: 49 }, () => randomUUID()),
      ];

      // when
      const response = await related(auth, ids.base, {
        exclude_ids: excludeIds.join(','),
      }).expect(HttpStatus.OK);

      // then
      expect(
        (response.body as RelatedBody).items.map((item) => item.content.id),
      ).toEqual(ids.near.slice(1, 6));
    });

    it('경로의 content_id가 uuid가 아니면 400 VALIDATION_FAILED', async () => {
      // given
      const { auth } = await createUser('invalid-path');

      // when
      const response = await request(app.getHttpServer())
        .get(path('/contents/not-a-uuid/related'))
        .set('Authorization', auth)
        .expect(HttpStatus.BAD_REQUEST);

      // then
      expect((response.body as ErrorBody).error_code).toBe('VALIDATION_FAILED');
    });

    it('토큰이 없으면 401', async () => {
      // when / then
      await request(app.getHttpServer())
        .get(path(`/contents/${ids.base}/related`))
        .expect(HttpStatus.UNAUTHORIZED);
    });
  });

  function related(
    auth: string,
    contentId: string,
    query: Record<string, string> = {},
  ) {
    return request(app.getHttpServer())
      .get(path(`/contents/${contentId}/related`))
      .query(query)
      .set('Authorization', auth);
  }

  async function embed(
    contentId: string,
    vector: number[],
    options: { model?: string; version?: number } = {},
  ): Promise<void> {
    await dataSource.query(
      `INSERT INTO content_embeddings (content_id, embedding, model, content_version)
       VALUES ($1, $2::vector, $3, $4)`,
      [
        contentId,
        toPgVector(vector),
        options.model ?? EMBEDDING_MODEL_ID,
        options.version ?? 1,
      ],
    );
  }

  async function seed(
    title: string,
    index: number,
    overrides: Partial<Content> = {},
  ): Promise<string> {
    const repository = dataSource.getRepository(Content);
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
        audioPath: `e2e-related/${index}-${contentIds.length}.mp3`,
        durationSec: 600,
        thumbnailUrl: 'https://example.com/e2e.png',
        contentVersion: 1,
        licenseExpiresAt: null,
        status: ContentStatus.PUBLISHED,
        // 발행 시각을 과거로 둔다 — 병렬로 도는 탐색 e2e의 "새로 나온" 섹션을 밀어내지 않게(series-explore-cards)
        publishedAt: new Date(Date.UTC(2001, 0, 1) + index * 60_000),
        withdrawnAt: null,
        tags: null,
        ...overrides,
      }),
    );
    contentIds.push(content.id);
    return content.id;
  }

  async function createUser(
    label: string,
  ): Promise<{ userId: string; auth: string }> {
    const providerToken = `e2e-related-${label}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
    const deviceId = `e2e-related-device-${label}`;
    const login = await request(app.getHttpServer())
      .post(path('/auth/social-login'))
      .send({
        provider: SocialProvider.KAKAO,
        provider_token: providerToken,
        device_id: deviceId,
      })
      .expect(HttpStatus.OK);
    const signUp = await request(app.getHttpServer())
      .post(path('/auth/sign-up'))
      .set('Idempotency-Key', `e2e-related-signup-${providerToken}`)
      .send({
        signup_token: (login.body as { signup_token: string }).signup_token,
        device_id: deviceId,
        consents: [
          { consent_type: 'terms', version: '0.1', is_agreed: true },
          { consent_type: 'privacy', version: '0.1', is_agreed: true },
          { consent_type: 'age_confirmation', version: null, is_agreed: true },
        ],
      })
      .expect(HttpStatus.CREATED);
    const body = signUp.body as { access_token: string; user: { id: string } };
    userIds.push(body.user.id);

    return { userId: body.user.id, auth: `Bearer ${body.access_token}` };
  }
});
