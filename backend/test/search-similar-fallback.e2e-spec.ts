import 'dotenv/config';

import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';

import { AppModule } from '@/app.module';
import { traceIdMiddleware } from '@/common/middlewares/trace-id.middleware';
import { toJamo } from '@/common/utils/search-text.util';
import { SEARCH_SIMILAR_THRESHOLD } from '@/modules/content/content.constant';
import { ContentOrigin, ContentStatus } from '@/modules/content/content.enum';
import { Content } from '@/modules/content/entities/content.entity';
import { SearchQueryLog } from '@/modules/content/entities/search-query-log.entity';
import { SocialProvider, UserMarket } from '@/modules/user/user.enum';

interface SearchBody {
  match: 'exact' | 'similar';
  items: { content: { id: string } }[];
  next_cursor: string | null;
  has_next: boolean;
  fallback: { related_topics: unknown[]; popular_items: unknown[] } | null;
}

interface SummaryBody {
  totals: { misses: number; rescued: number };
  missed: { query: string; misses: number; similar_count: number | null }[];
}

/** 완성형 음절 범위에서 무작위 음절 n개 — 공유 로컬 DB의 다른 콘텐츠와 겹치지 않는 한글 토큰 */
function randomSyllables(n: number): string {
  let token = '';
  for (let i = 0; i < n; i += 1) {
    token += String.fromCodePoint(0xac00 + Math.floor(Math.random() * 11172));
  }
  return token;
}

/**
 * 검색 유사 결과 폴백 E2E(KAN-238 — `explore.md` 4.5-5, domain.md 5.1·5.7). 실제 DB 위에서 밟는다:
 * SQL `hangul_to_jamo`와 TS `toJamo`의 동치, 오타 질의가 유사 모드로 잡히는가, 임계값 아래·회수·다른 시장은 빠지는가,
 * `#` 질의는 폴백하지 않는가, 커서가 모드를 이어 가고 모드가 바뀌면 거절하는가, 로그·관리자 요약 두 칸.
 *
 * 이 실행만의 한글 토큰(`TOKEN` — 무작위 음절 5개)을 제목 앞에 넣고 질의에도 넣는다. 질의의 자모 트라이그램 대부분이 토큰에서
 * 나오므로, 토큰이 없는 다른 콘텐츠는 유사도가 임계값에 닿지 않는다(아래 "임계값" 테스트가 SQL로 직접 확인한다).
 */
describe('검색 유사 결과 폴백 E2E', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  const userIds: string[] = [];
  const contentIds: string[] = [];
  const TOKEN = randomSyllables(5);
  const OTHER_TOKEN = randomSyllables(5);
  /** 오타 질의 — 토큰 + "커리오"(커리어의 모음 오타) */
  const TYPO_QUERY = `${TOKEN} 커리오`;
  const path = (p: string) => `/api/v1${p}`;
  const ids = {
    career: '',
    careerSecond: '',
    careerThird: '',
    belowThreshold: '',
    withdrawn: '',
    global: '',
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

    ids.career = await seed(`${TOKEN} 커리어를 바꾸는 법`, 1);
    ids.careerSecond = await seed(`${TOKEN} 커리어 전환기`, 2);
    ids.careerThird = await seed(`${TOKEN} 커리어 첫걸음`, 3);
    // 토큰이 다른 "커리어" 편 — 질의의 "커리오" 부분만 닮아 임계값 아래다
    ids.belowThreshold = await seed(`${OTHER_TOKEN} 커리어 이야기`, 4);
    ids.withdrawn = await seed(`${TOKEN} 커리어 회수편`, 5, {
      status: ContentStatus.WITHDRAWN,
      withdrawnAt: new Date(),
    });
    ids.global = await seed(`${TOKEN} 커리어 글로벌편`, 6, {
      market: UserMarket.GLOBAL,
    });
  }, 60_000);

  afterAll(async () => {
    for (const id of userIds) {
      await dataSource.query(`DELETE FROM users WHERE id = $1`, [id]);
    }
    await dataSource.query(
      `DELETE FROM idempotency_keys WHERE idempotency_key LIKE 'e2e-similar-%'`,
    );
    for (const id of contentIds) {
      await dataSource.query(`DELETE FROM contents WHERE id = $1`, [id]);
    }
    await app.close();
  }, 60_000);

  describe('hangul_to_jamo (SQL) ↔ toJamo (TS)', () => {
    it('완성형 음절 11,172자 전부와 홀겹자모·비한글이 두 구현에서 같은 자모열이 된다', async () => {
      // given — 음절 전 범위 + 겹모음·겹받침 홀자모 + 영문·숫자·기호·공백
      let allSyllables = '';
      for (let code = 0xac00; code <= 0xd7a3; code += 1) {
        allSyllables += String.fromCodePoint(code);
      }
      const inputs = [
        allSyllables,
        'ㅘㅙㅚㅝㅞㅟㅢㄳㄵㄶㄺㄻㄼㄽㄾㄿㅀㅄ',
        'ㄱㄴㄷ ㅏㅓ',
        '닭과 뷁, 읽기',
        'AI 커리어 2편! (Stray Kids)',
        '["커리어", "이직"]',
        '',
      ];

      for (const input of inputs) {
        // when
        const [row] = await dataSource.query<{ jamo: string }[]>(
          `SELECT hangul_to_jamo($1) AS jamo`,
          [input],
        );

        // then
        expect(row.jamo).toBe(toJamo(input));
      }
    }, 60_000);

    it('search_jamo는 소문자 제목 + 태그 jsonb 문자열을 자모로 푼 생성 컬럼이다', async () => {
      // given
      const id = await seed(`${TOKEN} AI 닭`, 9, { tags: ['커리어', 'Bank'] });

      // when
      const [row] = await dataSource.query<{ search_jamo: string }[]>(
        `SELECT search_jamo FROM contents WHERE id = $1`,
        [id],
      );

      // then
      expect(row.search_jamo).toBe(toJamo(`${TOKEN} ai 닭 ["커리어", "Bank"]`));
    });
  });

  it('오타 질의는 부분 일치 0건이라 유사 결과로 채워지고 match: similar, fallback: null', async () => {
    // given
    const { auth } = await createUser('typo');

    // when
    const body = (await search(auth, TYPO_QUERY).expect(HttpStatus.OK))
      .body as SearchBody;

    // then — 회수편·다른 시장 편·임계값 아래 편은 없다
    const found = body.items.map((item) => item.content.id);
    expect(body.match).toBe('similar');
    expect(body.fallback).toBeNull();
    expect(found).toEqual(
      expect.arrayContaining([ids.career, ids.careerSecond, ids.careerThird]),
    );
    expect(found).not.toContain(ids.withdrawn);
    expect(found).not.toContain(ids.global);
    expect(found).not.toContain(ids.belowThreshold);
  }, 60_000);

  it('임계값 아래 편은 유사도가 0보다 크더라도 빠지고, 나온 편은 전부 임계값 이상이다', async () => {
    // given
    const { auth } = await createUser('threshold');
    const body = (await search(auth, TYPO_QUERY).expect(HttpStatus.OK))
      .body as SearchBody;
    const similarityOf = async (id: string) => {
      const [row] = await dataSource.query<{ similarity: number }[]>(
        `SELECT word_similarity(hangul_to_jamo($1), search_jamo)::double precision AS similarity
           FROM contents WHERE id = $2`,
        [TYPO_QUERY, id],
      );
      return Number(row.similarity);
    };

    // when
    const below = await similarityOf(ids.belowThreshold);
    const returned = await Promise.all(
      body.items.map((item) => similarityOf(item.content.id)),
    );

    // then — 0이 아닌 유사도라 "아예 안 닮아서"가 아니라 임계값 때문에 빠졌다
    expect(below).toBeGreaterThan(0);
    expect(below).toBeLessThan(SEARCH_SIMILAR_THRESHOLD);
    for (const similarity of returned) {
      expect(similarity).toBeGreaterThanOrEqual(SEARCH_SIMILAR_THRESHOLD);
    }
  }, 60_000);

  it('부분 일치 결과가 있으면 종전 그대로 match: exact이고 로그의 similar_count는 NULL이다', async () => {
    // given
    const { userId, auth } = await createUser('exact');

    // when
    const body = (await search(auth, `${TOKEN} 커리어`).expect(HttpStatus.OK))
      .body as SearchBody;

    // then
    expect(body.match).toBe('exact');
    expect(body.items.map((item) => item.content.id)).toEqual(
      expect.arrayContaining([ids.career, ids.careerSecond, ids.careerThird]),
    );
    const [row] = await dataSource
      .getRepository(SearchQueryLog)
      .find({ where: { userId } });
    expect(row.resultCount).toBeGreaterThan(0);
    expect(row.similarCount).toBeNull();
  }, 60_000);

  it('#으로 시작한 태그 전용 질의는 0건이어도 폴백하지 않는다', async () => {
    // given
    const { userId, auth } = await createUser('tag');

    // when
    const body = (await search(auth, `#${TYPO_QUERY}`).expect(HttpStatus.OK))
      .body as SearchBody;

    // then
    expect(body.match).toBe('exact');
    expect(body.items).toEqual([]);
    expect(body.fallback).not.toBeNull();
    const [row] = await dataSource
      .getRepository(SearchQueryLog)
      .find({ where: { userId } });
    expect(row.resultCount).toBe(0);
    expect(row.similarCount).toBeNull();
  }, 60_000);

  it('유사 결과 로그는 result_count 0 · similar_count ≥ 1이고, 관리자 요약이 rescued·similar_count로 센다', async () => {
    // given
    const { userId, auth, providerToken } = await createUser('log');

    // when
    const body = (await search(auth, TYPO_QUERY).expect(HttpStatus.OK))
      .body as SearchBody;

    // then — 미스율 정의(부분 일치 0건)는 그대로, 폴백 건수는 따로 남는다. 반응 추정용 id는 화면에 나간 유사 결과다
    const [row] = await dataSource
      .getRepository(SearchQueryLog)
      .find({ where: { userId } });
    expect(row.resultCount).toBe(0);
    expect(row.similarCount).toBe(body.items.length);
    expect(row.similarCount).toBeGreaterThanOrEqual(1);
    expect(row.resultContentIds).toEqual(
      body.items.map((item) => item.content.id),
    );

    // when — 관리자 요약
    await dataSource.query(`UPDATE users SET role = 'admin' WHERE id = $1`, [
      userId,
    ]);
    const adminAuth = await reLogin(providerToken);
    const summary = (
      await request(app.getHttpServer())
        .get(path('/admin/search-query-logs/summary'))
        .query({ days: 1 })
        .set('Authorization', adminAuth)
        .expect(HttpStatus.OK)
    ).body as SummaryBody;

    // then
    const missed = summary.missed.find((rank) => rank.query === TYPO_QUERY);
    expect(missed).toEqual(
      expect.objectContaining({ similar_count: row.similarCount }),
    );
    expect(summary.totals.rescued).toBeGreaterThanOrEqual(1);
    expect(summary.totals.rescued).toBeLessThanOrEqual(summary.totals.misses);
  }, 60_000);

  describe('커서', () => {
    it('유사 결과의 next_cursor는 같은 모드로 이어 읽는다 — 중복·누락이 없다', async () => {
      // given
      const { auth } = await createUser('cursor');
      const seen: string[] = [];
      let cursor: string | null = null;

      // when — 한 건씩 끝까지
      for (let page = 0; page < 10; page += 1) {
        const body = (
          await request(app.getHttpServer())
            .get(path('/explore/search'))
            .query({
              query: TYPO_QUERY,
              limit: 1,
              ...(cursor && { cursor }),
            })
            .set('Authorization', auth)
            .expect(HttpStatus.OK)
        ).body as SearchBody;
        seen.push(...body.items.map((item) => item.content.id));
        if (body.items.length > 0) {
          expect(body.match).toBe('similar');
        }
        cursor = body.next_cursor;
        if (!cursor) {
          break;
        }
      }

      // then
      expect(new Set(seen).size).toBe(seen.length);
      expect(seen).toEqual(
        expect.arrayContaining([ids.career, ids.careerSecond, ids.careerThird]),
      );
    }, 60_000);

    it('부분 일치 커서를 유사 모드 질의에 섞으면 EXPLORE_CURSOR_INVALID', async () => {
      // given — 부분 일치 질의의 커서
      const { auth } = await createUser('cursor-mix');
      const exact = (
        await request(app.getHttpServer())
          .get(path('/explore/search'))
          .query({ query: `${TOKEN} 커리어`, limit: 1 })
          .set('Authorization', auth)
          .expect(HttpStatus.OK)
      ).body as SearchBody;
      expect(exact.next_cursor).not.toBeNull();

      // when
      const response = await request(app.getHttpServer())
        .get(path('/explore/search'))
        .query({ query: TYPO_QUERY, limit: 1, cursor: exact.next_cursor })
        .set('Authorization', auth)
        .expect(HttpStatus.BAD_REQUEST);

      // then
      expect(response.body).toMatchObject({
        error_code: 'EXPLORE_CURSOR_INVALID',
      });
    }, 60_000);

    it('유사 결과 커서를 받은 뒤 그 질의에 부분 일치 결과가 생기면 EXPLORE_CURSOR_INVALID — 모드가 바뀌었다', async () => {
      // given — 유사 결과 첫 페이지의 커서
      const { auth } = await createUser('cursor-switch');
      const query = `${TOKEN} 커리오 전환`;
      const first = (
        await request(app.getHttpServer())
          .get(path('/explore/search'))
          .query({ query, limit: 1 })
          .set('Authorization', auth)
          .expect(HttpStatus.OK)
      ).body as SearchBody;
      expect(first.match).toBe('similar');
      expect(first.next_cursor).not.toBeNull();

      // given — 그 질의가 제목에 그대로 든 편이 발행됐다
      await seed(`${query} 이야기`, 7);

      // when
      const response = await request(app.getHttpServer())
        .get(path('/explore/search'))
        .query({ query, limit: 1, cursor: first.next_cursor })
        .set('Authorization', auth)
        .expect(HttpStatus.BAD_REQUEST);

      // then — 첫 페이지부터 다시 부르면 부분 일치다
      expect(response.body).toMatchObject({
        error_code: 'EXPLORE_CURSOR_INVALID',
      });
      const again = (
        await request(app.getHttpServer())
          .get(path('/explore/search'))
          .query({ query, limit: 1 })
          .set('Authorization', auth)
          .expect(HttpStatus.OK)
      ).body as SearchBody;
      expect(again.match).toBe('exact');
    }, 60_000);
  });

  function search(auth: string, query: string) {
    return request(app.getHttpServer())
      .get(path('/explore/search'))
      .query({ query })
      .set('Authorization', auth);
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
        audioPath: `e2e-similar/${index}.mp3`,
        durationSec: 600,
        thumbnailUrl: 'https://example.com/e2e.png',
        contentVersion: 1,
        licenseExpiresAt: null,
        status: ContentStatus.PUBLISHED,
        publishedAt: new Date(Date.now() - index * 60_000),
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
  ): Promise<{ userId: string; auth: string; providerToken: string }> {
    const providerToken = `e2e-similar-${label}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
    const deviceId = `e2e-similar-device-${label}`;
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
      .set('Idempotency-Key', `e2e-similar-signup-${providerToken}`)
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

    return {
      userId: body.user.id,
      auth: `Bearer ${body.access_token}`,
      providerToken,
    };
  }

  async function reLogin(providerToken: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post(path('/auth/social-login'))
      .send({
        provider: SocialProvider.KAKAO,
        provider_token: providerToken,
        device_id: 'e2e-similar-device-relogin',
      })
      .expect(HttpStatus.OK);

    return `Bearer ${(response.body as { access_token: string }).access_token}`;
  }
});
