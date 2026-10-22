import 'dotenv/config';

import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createServer, IncomingMessage, Server, ServerResponse } from 'http';
import { AddressInfo } from 'net';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';

import { AppModule } from '@/app.module';
import { traceIdMiddleware } from '@/common/middlewares/trace-id.middleware';
import {
  EMBEDDING_DIM,
  EMBEDDING_MODEL_ID,
} from '@/modules/content/content.constant';
import { ContentOrigin, ContentStatus } from '@/modules/content/content.enum';
import { Content } from '@/modules/content/entities/content.entity';
import { ContentTitleEmbeddingService } from '@/modules/content/services/content-title-embedding.service';
import { SocialProvider } from '@/modules/user/user.enum';

interface SearchBody {
  items: { content: { id: string }; matched_by: string[] }[];
  match: 'keyword' | 'related';
  engines: string[];
}

const STUB_TOKEN = 'e2e-internal-token';
/**
 * 질의 벡터의 축 — 다른 E2E(`search-correction-hybrid` 7번 축)·공유 로컬 DB의 실제 모델 벡터와 거의 직교한다.
 * 이 파일의 편만 이 축 성분을 갖는다
 */
const QUERY_AXIS = 21;
const OTHER_AXIS = 1100;

/** 두 축 성분으로 만든 단위 벡터 — 질의 축과의 코사인이 정확히 `cosine`이다 */
function vectorWithCosine(cosine: number): number[] {
  const vector = new Array<number>(EMBEDDING_DIM).fill(0);
  vector[QUERY_AXIS] = cosine;
  vector[OTHER_AXIS] = Math.sqrt(1 - cosine * cosine);
  return vector;
}

function toPgVector(vector: number[]): string {
  return `[${vector.join(',')}]`;
}

/** 이 실행만의 무작위 받침 없는 음절 n개 — 공유 로컬 DB의 다른 어휘와 겹치지 않는 한글 토큰 */
function randomSyllables(n: number): string {
  let token = '';
  for (let i = 0; i < n; i += 1) {
    const cho = Math.floor(Math.random() * 19);
    const jung = Math.floor(Math.random() * 21);
    token += String.fromCodePoint(0xac00 + (cho * 21 + jung) * 28);
  }
  return token;
}

/**
 * 제목 임베딩 E2E — 검색 의미 엔진이 질의 벡터를 **제목 벡터**(`content_title_embeddings`)에도 견주는지(`explore.md` 4.5-5 개정
 * 요청 `search-title-embeddings.md`). 실제 DB와 로컬 HTTP AI 서버 스텁(`search-correction-hybrid.e2e-spec.ts`와 같은 방식) 위에서
 * 밟는다. 스텁은 텍스트별로 정해 둔 벡터를 돌려주고(정하지 않은 텍스트는 질의 축과 직교), `boom`이 든 텍스트는 500이다.
 *
 * 질의·제목은 이 실행만의 무작위 토큰이라 키워드 엔진에는 걸리지 않는다 — 결과는 의미 엔진에서만 온다. 단언은 이 파일이
 * 만든 편으로 한정한다(공유 DB의 다른 편이 결과에 섞여도 깨지지 않게).
 */
describe('검색 제목 임베딩 E2E', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let titleEmbeddings: ContentTitleEmbeddingService;
  let stub: Server;
  let auth = '';
  const stubCalls: string[] = [];
  const stubVectors = new Map<string, number[]>();
  const userIds: string[] = [];
  const contentIds: string[] = [];
  const path = (p: string) => `/api/v1${p}`;
  const previousEnv = {
    url: process.env.AI_SERVER_URL,
    token: process.env.AI_SERVER_INTERNAL_TOKEN,
  };

  const QUERY = randomSyllables(4);
  const TOKEN = randomSyllables(3);
  const titles = {
    close: `${TOKEN} 제목만 가까운 편`,
    titledScriptMid: `${TOKEN} 제목 있고 대본 중간`,
    untitledScriptMid: `${TOKEN} 제목 없고 대본 중간`,
    staleBefore: `${TOKEN} 바뀌기 전 제목`,
    staleAfter: `${TOKEN} 바뀐 뒤 제목`,
    failing: `${TOKEN} boom 제목`,
    backfillA: `${TOKEN} 백필 첫 편`,
    backfillB: `${TOKEN} 백필 둘째 편`,
    closer: `${TOKEN} 제목이 더 가까운 편`,
  };
  const ids = {
    close: '',
    closer: '',
    titledScriptMid: '',
    untitledScriptMid: '',
    stale: '',
    failing: '',
    backfillA: '',
    backfillB: '',
  };

  beforeAll(async () => {
    stub = createServer((req, res) => void handleStub(req, res));
    await new Promise<void>((resolve) => stub.listen(0, '127.0.0.1', resolve));
    const { port } = stub.address() as AddressInfo;
    process.env.AI_SERVER_URL = `http://127.0.0.1:${port}`;
    process.env.AI_SERVER_INTERNAL_TOKEN = STUB_TOKEN;

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
    titleEmbeddings = app.get(ContentTitleEmbeddingService);

    stubVectors.set(QUERY, vectorWithCosine(1));
    // 제목 벡터 — 질의와 가깝다(하한 0.34 위). 순서 단언이 동점에 기대지 않게 값을 다 다르게 둔다. 나머지 제목은 정하지 않아 직교(0)다
    stubVectors.set(titles.close, vectorWithCosine(0.6));
    stubVectors.set(titles.closer, vectorWithCosine(0.9));
    stubVectors.set(titles.staleBefore, vectorWithCosine(0.5));
    stubVectors.set(titles.staleAfter, vectorWithCosine(0.5));

    // 대본 벡터는 전부 하한(0.3) 아래이거나 그 사이(0.4)다 — 종전 구조였다면 제목 근처 편들은 의미 결과에 나오지 않는다
    ids.close = await seed(titles.close, 1, 0.1);
    ids.closer = await seed(titles.closer, 2, 0.1);
    ids.titledScriptMid = await seed(titles.titledScriptMid, 3, 0.4);
    ids.untitledScriptMid = await seed(titles.untitledScriptMid, 4, 0.4);
    ids.stale = await seed(titles.staleBefore, 5, 0.1);
    ids.failing = await seed(titles.failing, 6, 0.1);
    ids.backfillA = await seed(titles.backfillA, 7, 0.1);
    ids.backfillB = await seed(titles.backfillB, 8, 0.1);

    // 발행 훅이 하는 일 — 커밋 뒤 제목 임베딩(제목 없는 대본 중간 편·백필 편은 건너뛴다)
    for (const id of [ids.close, ids.closer, ids.titledScriptMid, ids.stale]) {
      const content = await dataSource
        .getRepository(Content)
        .findOneByOrFail({ id });
      expect(await titleEmbeddings.refresh(content)).toBe('created');
    }

    auth = await createUser();
  }, 60_000);

  afterAll(async () => {
    for (const id of userIds) {
      await dataSource.query(`DELETE FROM users WHERE id = $1`, [id]);
    }
    await dataSource.query(
      `DELETE FROM idempotency_keys WHERE idempotency_key LIKE 'e2e-title-emb-%'`,
    );
    // 제목·대본 임베딩은 CASCADE로 함께 지워진다
    for (const id of contentIds) {
      await dataSource.query(`DELETE FROM contents WHERE id = $1`, [id]);
    }
    await app.close();
    await new Promise<void>((resolve) => stub.close(() => resolve()));
    restoreEnv('AI_SERVER_URL', previousEnv.url);
    restoreEnv('AI_SERVER_INTERNAL_TOKEN', previousEnv.token);
  }, 60_000);

  async function searchIds(): Promise<{ body: SearchBody; order: string[] }> {
    const body = (
      await request(app.getHttpServer())
        .get(path('/explore/search'))
        .query({ query: QUERY, exact: 'true', limit: '50' })
        .set('Authorization', auth)
        .expect(HttpStatus.OK)
    ).body as SearchBody;
    const mine = new Set(contentIds);
    return {
      body,
      order: body.items
        .map((item) => item.content.id)
        .filter((id) => mine.has(id)),
    };
  }

  it('대본 벡터는 멀어도(0.1) 제목 벡터가 가까우면 의미 결과로 나온다 — 가까운 제목이 앞이다', async () => {
    // when
    const { body, order } = await searchIds();

    // then
    expect(body.engines).toEqual(['keyword', 'semantic']);
    expect(body.match).toBe('related');
    expect(order.slice(0, 2)).toEqual([ids.closer, ids.close]);
    const close = body.items.find((item) => item.content.id === ids.close);
    expect(close?.matched_by).toEqual(['semantic']);
  });

  it('제목 벡터가 있는 편은 대본이 하한 0.45를 넘어야 대본으로 맞는다 — 0.4는 빠진다', async () => {
    // when
    const { order } = await searchIds();

    // then
    expect(order).not.toContain(ids.titledScriptMid);
  });

  it('제목 벡터가 없는 편(생성 실패·백필 전)은 종전 대본 하한 0.3으로 맞는다 — 대본만으로 되돌아간다', async () => {
    // when
    const { order } = await searchIds();

    // then
    expect(order).toContain(ids.untitledScriptMid);
  });

  it('AI 서버가 실패하면 행을 남기지 않고(failed) 그 편은 대본 벡터만으로 판정된다', async () => {
    // given
    const content = await dataSource
      .getRepository(Content)
      .findOneByOrFail({ id: ids.failing });

    // when
    const outcome = await titleEmbeddings.refresh(content);

    // then
    expect(outcome).toBe('failed');
    const rows = await dataSource.query<{ n: number }[]>(
      `SELECT count(*)::int AS n FROM content_title_embeddings WHERE content_id = $1`,
      [ids.failing],
    );
    expect(rows[0].n).toBe(0);
    expect((await searchIds()).order).not.toContain(ids.failing);
  });

  it('같은 제목으로 다시 맞추면 AI 서버를 부르지 않는다(unchanged)', async () => {
    // given
    const content = await dataSource
      .getRepository(Content)
      .findOneByOrFail({ id: ids.close });
    const before = stubCalls.length;

    // when
    const outcome = await titleEmbeddings.refresh(content);

    // then
    expect(outcome).toBe('unchanged');
    expect(stubCalls.length).toBe(before);
  });

  it('제목이 바뀌면 옛 제목의 벡터는 무시되고, 백필이 새 제목으로 다시 만든다', async () => {
    // given — 제목 임베딩 뒤 제목만 바뀐 편(재발행 훅이 실패했다고 본다)
    await dataSource.query(`UPDATE contents SET title = $2 WHERE id = $1`, [
      ids.stale,
      titles.staleAfter,
    ]);
    expect((await searchIds()).order).not.toContain(ids.stale);

    // when
    const result = await titleEmbeddings.backfill({
      contentIds: [ids.stale],
      delayMs: 0,
    });

    // then
    expect(result).toEqual({ targets: 1, created: 1, failed: 0 });
    expect(stubCalls).toContain(titles.staleAfter);
    expect((await searchIds()).order).toContain(ids.stale);
  });

  it('백필은 멱등이다 — 두 번째 실행은 대상이 없고 AI 서버를 부르지 않는다', async () => {
    // given
    const scope = [ids.backfillA, ids.backfillB, ids.close];

    // when
    const first = await titleEmbeddings.backfill({
      contentIds: scope,
      delayMs: 0,
    });
    const callsAfterFirst = stubCalls.length;
    const second = await titleEmbeddings.backfill({
      contentIds: scope,
      delayMs: 0,
    });

    // then — 이미 유효한 행이 있는 편(close)은 첫 실행에서도 대상이 아니다
    expect(first).toEqual({ targets: 2, created: 2, failed: 0 });
    expect(second).toEqual({ targets: 0, created: 0, failed: 0 });
    expect(stubCalls.length).toBe(callsAfterFirst);
    const rows = await dataSource.query<
      { content_id: string; source_text: string; model: string }[]
    >(
      `SELECT content_id, source_text, model FROM content_title_embeddings WHERE content_id = ANY($1)`,
      [[ids.backfillA, ids.backfillB]],
    );
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.model === EMBEDDING_MODEL_ID)).toBe(true);
    expect(rows.map((row) => row.source_text).sort()).toEqual(
      [titles.backfillA, titles.backfillB].sort(),
    );
  });

  async function handleStub(req: IncomingMessage, res: ServerResponse) {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);

    if (req.url !== '/embeddings' || req.method !== 'POST') {
      res.writeHead(404).end();
      return;
    }
    if (req.headers['x-internal-token'] !== STUB_TOKEN) {
      res.writeHead(401).end();
      return;
    }

    const { text } = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
      text: string;
    };
    stubCalls.push(text);

    if (text.includes('boom')) {
      res.writeHead(500).end();
      return;
    }

    const vector =
      stubVectors.get(text) ??
      (() => {
        const unrelated = new Array<number>(EMBEDDING_DIM).fill(0);
        unrelated[OTHER_AXIS + 1] = 1;
        return unrelated;
      })();

    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({ model: EMBEDDING_MODEL_ID, dim: EMBEDDING_DIM, vector }),
    );
  }

  function restoreEnv(key: string, value: string | undefined) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  async function seed(
    title: string,
    index: number,
    scriptCosine: number,
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
        audioPath: `e2e-title-emb/${index}-${contentIds.length}.mp3`,
        durationSec: 600,
        thumbnailUrl: 'https://example.com/e2e.png',
        contentVersion: 1,
        licenseExpiresAt: null,
        status: ContentStatus.PUBLISHED,
        // 지금과 다른 발행 시각 — 정렬 동점이 시각에 기대지 않게
        publishedAt: new Date(Date.now() - (index + 10) * 60_000),
        withdrawnAt: null,
        tags: null,
      }),
    );
    contentIds.push(content.id);
    await dataSource.query(
      `INSERT INTO content_embeddings (content_id, embedding, model, content_version)
       VALUES ($1, $2::vector, $3, 1)`,
      [
        content.id,
        toPgVector(vectorWithCosine(scriptCosine)),
        EMBEDDING_MODEL_ID,
      ],
    );
    return content.id;
  }

  async function createUser(): Promise<string> {
    const providerToken = `e2e-title-emb-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
    const deviceId = 'e2e-title-emb-device';
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
      .set('Idempotency-Key', `e2e-title-emb-signup-${providerToken}`)
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
    return `Bearer ${body.access_token}`;
  }
});
