import 'dotenv/config';

import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';

import { AppModule } from '@/app.module';
import { traceIdMiddleware } from '@/common/middlewares/trace-id.middleware';
import { ContentOrigin, ContentStatus } from '@/modules/content/content.enum';
import { Content } from '@/modules/content/entities/content.entity';
import { SearchQueryLog } from '@/modules/content/entities/search-query-log.entity';
import { SocialProvider } from '@/modules/user/user.enum';

interface SearchBody {
  items: { content: { id: string } }[];
  next_cursor: string | null;
  fallback: { related_topics: unknown[]; popular_items: unknown[] } | null;
}

/**
 * 해시태그 검색 E2E(KAN-218 · `explore.md` 4.5-2·4.5-5). 검색이 `contents.tags`도 매칭하고, `#`으로 시작한 질의는
 * 태그 정확 일치만 찾는다. 이 실행만의 검색어(`WORD`)를 제목·태그·저자에 나눠 넣어 공유 로컬 DB의 다른 콘텐츠와
 * 섞이지 않게 한다.
 */
describe('해시태그 검색 E2E', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let auth: string;
  let userId: string;
  const userIds: string[] = [];
  const contentIds: string[] = [];
  const WORD = `qz${Date.now() % 1_000_000_000}`;
  const path = (p: string) => `/api/v1${p}`;
  /** 제목 매칭 · 태그 정확 매칭(2편) · 저자 매칭 · 태그 부분 매칭 콘텐츠 */
  const ids = {
    title: '',
    tag: '',
    tagSecond: '',
    author: '',
    tagPartial: '',
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
    await seedContents();
    ({ userId, auth } = await createUser());
  }, 60_000);

  afterAll(async () => {
    for (const id of userIds) {
      await dataSource.query(`DELETE FROM users WHERE id = $1`, [id]);
    }
    await dataSource.query(
      `DELETE FROM idempotency_keys WHERE idempotency_key LIKE 'e2e-hashtag-%'`,
    );
    for (const id of contentIds) {
      await dataSource.query(`DELETE FROM contents WHERE id = $1`, [id]);
    }
    await app.close();
  }, 60_000);

  it('제목·설명에 없는 말도 태그에 있으면 나오고, 순서는 제목 → 태그 → 저자다', async () => {
    // when
    const body = (await search(WORD).expect(HttpStatus.OK)).body as SearchBody;

    // then — 태그 부분 일치(WORD확장)도 태그 매칭이다
    const found = body.items.map((item) => item.content.id);
    expect(found).toEqual(
      expect.arrayContaining([ids.title, ids.tag, ids.author, ids.tagPartial]),
    );
    expect(found.indexOf(ids.title)).toBeLessThan(found.indexOf(ids.tag));
    expect(found.indexOf(ids.tag)).toBeLessThan(found.indexOf(ids.author));
  }, 60_000);

  it('#으로 시작하면 태그 정확 일치만 나온다 — 뒤 공백·대소문자는 같게 본다', async () => {
    for (const query of [`#${WORD}`, `#${WORD} `, `#${WORD.toUpperCase()}`]) {
      // when
      const body = (await search(query).expect(HttpStatus.OK))
        .body as SearchBody;

      // then — 제목에만 있는 콘텐츠·부분 일치 태그는 나오지 않는다
      expect(body.items.map((item) => item.content.id).sort()).toEqual(
        [ids.tag, ids.tagSecond].sort(),
      );
    }
  }, 60_000);

  it('태그 전용 검색도 커서로 이어 읽는다 — 중복·누락이 없고, 같은 커서를 # 없는 질의에 쓰면 400이다', async () => {
    // given — 첫 페이지 1건
    const first = (
      await request(app.getHttpServer())
        .get(path('/explore/search'))
        .query({ query: `#${WORD}`, limit: 1 })
        .set('Authorization', auth)
        .expect(HttpStatus.OK)
    ).body as SearchBody;
    expect(first.next_cursor).not.toBeNull();

    // when
    const second = (
      await request(app.getHttpServer())
        .get(path('/explore/search'))
        .query({ query: `#${WORD}`, limit: 1, cursor: first.next_cursor })
        .set('Authorization', auth)
        .expect(HttpStatus.OK)
    ).body as SearchBody;
    const otherMode = await request(app.getHttpServer())
      .get(path('/explore/search'))
      .query({ query: WORD, limit: 1, cursor: first.next_cursor })
      .set('Authorization', auth)
      .expect(HttpStatus.BAD_REQUEST);

    // then
    expect(
      [...first.items, ...second.items].map((item) => item.content.id).sort(),
    ).toEqual([ids.tag, ids.tagSecond].sort());
    expect(otherMode.body).toMatchObject({
      error_code: 'EXPLORE_CURSOR_INVALID',
    });
  }, 60_000);

  it('#만 있거나 #을 뗀 뒤 2자 미만이면 400 VALIDATION_FAILED', async () => {
    for (const query of ['#', '#a']) {
      // when
      const response = await search(query).expect(HttpStatus.BAD_REQUEST);

      // then
      expect(response.body).toMatchObject({ error_code: 'VALIDATION_FAILED' });
    }
  }, 60_000);

  it('태그 전용 검색에 결과가 없으면 대체 콘텐츠가 같은 모양으로 내려온다', async () => {
    // when
    const body = (await search(`#${WORD}없음`).expect(HttpStatus.OK))
      .body as SearchBody;

    // then
    expect(body.items).toEqual([]);
    expect(body.fallback).toEqual({
      related_topics: expect.any(Array) as unknown[],
      popular_items: expect.any(Array) as unknown[],
    });
  }, 60_000);

  it('태그 검색은 검색 로그에 #을 남긴다 — 태그 검색 비율을 셀 수 있게', async () => {
    // when
    await search(`#${WORD}`).expect(HttpStatus.OK);

    // then
    const rows = await dataSource
      .getRepository(SearchQueryLog)
      .find({ where: { userId }, order: { id: 'DESC' }, take: 1 });
    expect(rows[0].query).toBe(`#${WORD}`);
  }, 60_000);

  function search(query: string) {
    return request(app.getHttpServer())
      .get(path('/explore/search'))
      .query({ query })
      .set('Authorization', auth);
  }

  async function createUser(): Promise<{ userId: string; auth: string }> {
    const providerToken = `e2e-hashtag-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
    const deviceId = 'e2e-hashtag-device';
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
      .set('Idempotency-Key', `e2e-hashtag-signup-${providerToken}`)
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

  async function seedContents(): Promise<void> {
    const repository = dataSource.getRepository(Content);
    const seeds: [
      key: keyof typeof ids,
      fields: Pick<Content, 'title' | 'authorName' | 'tags'>,
    ][] = [
      [
        'title',
        { title: `${WORD} 제목에만 있는 말`, authorName: '테스트', tags: null },
      ],
      [
        'tag',
        {
          title: '태그로만 찾는 콘텐츠',
          authorName: '테스트',
          tags: [WORD, '기타'],
        },
      ],
      [
        'tagSecond',
        {
          title: '태그로만 찾는 두 번째 콘텐츠',
          authorName: '테스트',
          tags: ['기타', WORD.toUpperCase()],
        },
      ],
      [
        'author',
        {
          title: '저자로만 찾는 콘텐츠',
          authorName: `저자 ${WORD}`,
          tags: null,
        },
      ],
      [
        'tagPartial',
        {
          title: '부분 일치 태그 콘텐츠',
          authorName: '테스트',
          tags: [`${WORD}확장`, '기타'],
        },
      ],
    ];
    for (const [index, [key, fields]] of seeds.entries()) {
      const content = await repository.save(
        repository.create({
          ...fields,
          description: 'e2e 전용',
          sourceName: 'E2E',
          sourceUrl: 'https://example.com/e2e',
          origin: ContentOrigin.AI_GENERATED,
          partnerId: null,
          seriesId: null,
          episodeNo: null,
          totalEpisodes: null,
          audioPath: `e2e-hashtag/${index}.mp3`,
          durationSec: 600,
          thumbnailUrl: 'https://example.com/e2e.png',
          contentVersion: 1,
          licenseExpiresAt: null,
          status: ContentStatus.PUBLISHED,
          publishedAt: new Date(Date.now() - (index + 1) * 60_000),
          withdrawnAt: null,
        }),
      );
      ids[key] = content.id;
      contentIds.push(content.id);
    }
  }
});
