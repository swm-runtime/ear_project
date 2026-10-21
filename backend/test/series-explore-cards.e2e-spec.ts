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
  ContentOrigin,
  ContentStatus,
  SeriesStatus,
} from '@/modules/content/content.enum';
import { ContentTopic } from '@/modules/content/entities/content-topic.entity';
import { Content } from '@/modules/content/entities/content.entity';
import { Series } from '@/modules/content/entities/series.entity';
import { Topic } from '@/modules/interest/entities/topic.entity';
import { User } from '@/modules/user/entities/user.entity';
import { SocialProvider, UserMarket, UserRole } from '@/modules/user/user.enum';

interface ItemBody {
  type?: string;
  content?: { id: string; series: { id: string } | null };
  series?: {
    id: string;
    title: string;
    total_episodes: number;
    episode_count: number;
    thumbnail_url: string;
    topic_ids: string[];
  };
}

interface ListBody {
  items: ItemBody[];
  next_cursor: string | null;
  has_next: boolean;
}

/** 1.2.x 응답의 항목 키 — 스위치가 꺼져 있으면 정확히 이것이다 */
const LEGACY_ITEM_KEYS = ['content', 'is_counted_today', 'library'];

/**
 * 탐색 시리즈 카드 E2E(KAN-134 확정 설계 4번 — `SERIES_EXPLORE_CARDS_ENABLED`).
 *
 * - **꺼짐(기본)**: 피드·주제 칩·주제별·인기·검색 응답에 `type` 키가 없고 시리즈 편이 편마다 한 줄이며 커서에 `g`가 없다 —
 *   이 기능 전(1단계) 응답과 같은 모양이다.
 * - **켬**: 같은 시리즈 편이 카드 하나(`type: "series"`)가 되고, 페이지를 끝까지 넘겨도 카드는 한 번 · 단일 콘텐츠는 빠짐·중복이
 *   없다. 검색은 시리즈 제목만 맞아도 카드가 나온다.
 *
 * 스위치는 ConfigService 대역으로 켠다 — 같은 DB 위에 꺼진 앱과 켠 앱을 함께 세운다.
 */
describe('탐색 시리즈 카드 E2E', () => {
  let offApp: INestApplication<App>;
  let onApp: INestApplication<App>;
  let dataSource: DataSource;
  const STAMP = `e2ecards${Date.now().toString(36)}`;
  /** 편 제목에는 없고 시리즈 제목에만 있는 낱말 — 시리즈 제목 일치 검색 확인용 */
  const SERIES_WORD = `${STAMP}series`;
  const userIds: string[] = [];
  const contentIds: string[] = [];
  let topicId: string;
  let seriesId: string;
  /** 커서 길이·빈 페이지 확인용 — 시리즈 10개짜리 별도 주제(위 시나리오의 개수 단언과 섞이지 않게) */
  const BULK = `e2ebulk${Date.now().toString(36)}`;
  let bulkTopicId: string;
  let bulkSingleId: string;
  const bulkSeriesIds: string[] = [];
  const episodeIds: string[] = [];
  const singleIds: string[] = [];
  let auth: string;

  async function buildApp(
    real: ConfigService | null,
  ): Promise<INestApplication<App>> {
    const builder = Test.createTestingModule({ imports: [AppModule] });
    // 켠 앱 — 꺼진 앱의 (검증된) 설정을 그대로 쓰고 스위치 하나만 true 로 돌려준다
    if (real) {
      const wrapped = Object.create(real) as ConfigService;
      wrapped.get = (key: string, ...rest: unknown[]) =>
        key === 'SERIES_EXPLORE_CARDS_ENABLED'
          ? 'true'
          : (real.get as (...args: unknown[]) => unknown)(key, ...rest);
      builder.overrideProvider(ConfigService).useValue(wrapped);
    }
    const moduleRef = await builder.compile();
    const app = moduleRef.createNestApplication<INestApplication<App>>();
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
    return app;
  }

  beforeAll(async () => {
    offApp = await buildApp(null);
    onApp = await buildApp(offApp.get(ConfigService));
    dataSource = offApp.get(DataSource);
    await seed();
  }, 90_000);

  afterAll(async () => {
    for (const userId of userIds) {
      await dataSource.query(`DELETE FROM users WHERE id = $1`, [userId]);
    }
    for (const id of contentIds) {
      await dataSource.query(`DELETE FROM contents WHERE id = $1`, [id]);
    }
    await dataSource.query(`DELETE FROM series WHERE id = ANY($1::uuid[])`, [
      [seriesId, ...bulkSeriesIds],
    ]);
    await dataSource.query(`DELETE FROM topics WHERE id = ANY($1::uuid[])`, [
      [topicId, bulkTopicId],
    ]);
    await offApp.close();
    await onApp.close();
  }, 60_000);

  it('꺼짐 — 피드·주제 칩·주제별·인기·검색에 type 키가 없고, 시리즈 편이 편마다 한 줄이며, 커서에 g가 없다', async () => {
    const feed = await get(offApp, '/explore/feed');
    for (const section of (feed.body as { sections: { items: ItemBody[] }[] })
      .sections) {
      for (const item of section.items) {
        expect(Object.keys(item).sort()).toEqual(LEGACY_ITEM_KEYS);
      }
    }
    await get(offApp, '/explore/topics');

    const topicList = await pageAll(offApp, '/explore/contents', {
      topic_ids: topicId,
      limit: '2',
    });
    expect(topicList.cursors.length).toBeGreaterThan(0);
    for (const cursor of topicList.cursors) {
      expect(Object.keys(decodeCursor(cursor)).sort()).toEqual([
        'i',
        'p',
        'q',
        't',
      ]);
    }
    const searched = await pageAll(offApp, '/explore/search', {
      query: STAMP,
      limit: '2',
    });
    const popular = await pageAll(offApp, '/explore/popular', { limit: '50' });

    for (const list of [topicList, searched, popular]) {
      for (const item of list.items) {
        expect(Object.keys(item).sort()).toEqual(LEGACY_ITEM_KEYS);
      }
    }
    // 시리즈 편 3개가 편마다 따로 나온다
    expect(idsOf(topicList.items).sort()).toEqual(
      [...episodeIds, ...singleIds].sort(),
    );
    expect(idsOf(searched.items).sort()).toEqual(
      [...episodeIds, ...singleIds].sort(),
    );
    expect(
      idsOf(popular.items)
        .filter((id) => episodeIds.includes(id))
        .sort(),
    ).toEqual([...episodeIds].sort());
    // 시리즈 제목 일치는 묻지 않는다 — 부분 일치로는 0건이다. 편 제목이 닮은 편은 유사 결과 폴백(KAN-238)으로 나올 수 있어
    // 첫 페이지의 `match`로 가른다: 결과가 있다면 부분 일치(시리즈 제목 일치)가 아니라 유사 결과여야 한다
    const seriesWord = (
      await get(offApp, '/explore/search', { query: SERIES_WORD, limit: '20' })
    ).body as ListBody & { match: string };
    expect(
      seriesWord.items.length === 0 || seriesWord.match === 'similar',
    ).toBe(true);
  }, 60_000);

  it('켬 — 주제별 목록을 끝까지 넘기면 시리즈 카드 한 번 + 단일 콘텐츠 전부, 중복 없음', async () => {
    const list = await pageAll(onApp, '/explore/contents', {
      topic_ids: topicId,
      limit: '2',
    });

    expect(list.items.every((item) => item.type !== undefined)).toBe(true);
    const seriesCards = list.items.filter((item) => item.type === 'series');
    expect(seriesCards).toHaveLength(1);
    expect(seriesCards[0].series).toMatchObject({
      id: seriesId,
      title: `${SERIES_WORD} 시리즈`,
      total_episodes: 3,
      episode_count: 3,
      thumbnail_url: 'https://example.com/e2e-cards-ep1.png',
      topic_ids: [topicId],
    });
    const contentItems = idsOf(
      list.items.filter((item) => item.type === 'content'),
    );
    expect(contentItems.sort()).toEqual([...singleIds].sort());
    // 시리즈 편은 콘텐츠 행으로 새지 않는다
    expect(contentItems.some((id) => episodeIds.includes(id))).toBe(false);
    // 카드 자리 = 가장 높은 순위 편 자리 — 재생 수가 같아 최신 발행(3화)이 가장 앞이고, 단일 콘텐츠보다 앞선다
    expect(list.items[0].type).toBe('series');
    // 커서는 꺼진 모드와 같은 모양이다 — 이미 낸 시리즈를 싣지 않는다(대표 편 키셋)
    for (const cursor of list.cursors) {
      expect(Object.keys(decodeCursor(cursor)).sort()).toEqual([
        'i',
        'p',
        'q',
        't',
      ]);
    }
  }, 60_000);

  it('켬 — 인기·검색·피드도 같은 규칙으로 접고, 검색은 시리즈 제목만 맞아도 카드가 나온다', async () => {
    const popular = await pageAll(onApp, '/explore/popular', { limit: '3' });
    expect(
      popular.items.filter(
        (item) => item.type === 'series' && item.series?.id === seriesId,
      ),
    ).toHaveLength(1);
    expect(
      idsOf(popular.items).filter((id) => episodeIds.includes(id)),
    ).toEqual([]);
    const popularIds = idsOf(popular.items);
    expect(new Set(popularIds).size).toBe(popularIds.length);

    const searched = await pageAll(onApp, '/explore/search', {
      query: STAMP,
      limit: '2',
    });
    expect(searched.items.map((item) => item.type).sort()).toEqual([
      'content',
      'content',
      'series',
    ]);

    const bySeriesTitle = await pageAll(onApp, '/explore/search', {
      query: SERIES_WORD,
      limit: '20',
    });
    expect(bySeriesTitle.items).toHaveLength(1);
    expect(bySeriesTitle.items[0]).toMatchObject({
      type: 'series',
      series: { id: seriesId },
    });

    // 시리즈 제목 오타 — 부분 일치는 0건이고 유사 결과 폴백(KAN-238)이 시리즈 제목 유사도까지 보아 같은 카드 하나로 접는다
    const typo = (
      await get(onApp, '/explore/search', {
        query: `${SERIES_WORD.slice(0, -1)}z`,
        limit: '20',
      })
    ).body as ListBody & { match: string };
    expect(typo.match).toBe('similar');
    expect(
      typo.items.filter(
        (item) => item.type === 'series' && item.series?.id === seriesId,
      ),
    ).toHaveLength(1);

    const feed = await get(onApp, '/explore/feed');
    const sections = (
      feed.body as { sections: { key: string; items: ItemBody[] }[] }
    ).sections;
    const recent = sections.find((section) => section.key === 'new');
    expect(
      recent?.items.filter(
        (item) => item.type === 'series' && item.series?.id === seriesId,
      ),
    ).toHaveLength(1);
    for (const section of sections) {
      expect(
        section.items.some(
          (item) =>
            item.type === 'content' &&
            episodeIds.includes(item.content?.id ?? ''),
        ),
      ).toBe(false);
    }
  }, 60_000);

  it('켬 — 시리즈 표지(KAN-234)가 있으면 주제별·인기·검색 카드 표지가 그것이고, 지우면 다시 1화 썸네일이다', async () => {
    const COVER = 'https://example.com/e2e-cards-cover.webp';
    const cardThumbnails = async () => {
      const lists = await Promise.all([
        pageAll(onApp, '/explore/contents', {
          topic_ids: topicId,
          limit: '20',
        }),
        pageAll(onApp, '/explore/popular', { limit: '20' }),
        pageAll(onApp, '/explore/search', { query: SERIES_WORD, limit: '20' }),
      ]);
      return lists.map(
        (list) =>
          list.items.find(
            (item) => item.type === 'series' && item.series?.id === seriesId,
          )?.series?.thumbnail_url,
      );
    };

    await dataSource.getRepository(Series).update(seriesId, {
      coverUrl: COVER,
    });
    try {
      expect(await cardThumbnails()).toEqual([COVER, COVER, COVER]);
      // 꺼진 앱은 카드가 없어 표지를 쓰지 않는다 — 편 행의 썸네일은 편 그대로
      const off = await pageAll(offApp, '/explore/contents', {
        topic_ids: topicId,
        limit: '20',
      });
      expect(JSON.stringify(off.items)).not.toContain(COVER);
    } finally {
      await dataSource.getRepository(Series).update(seriesId, {
        coverUrl: null,
      });
    }

    const EP1 = 'https://example.com/e2e-cards-ep1.png';
    expect(await cardThumbnails()).toEqual([EP1, EP1, EP1]);
  }, 60_000);

  it('켬 — 검증 재현(검색어 + 주제 필터, limit=1): 시리즈가 많아도 커서가 자라지 않고 빈 페이지·끊김 없이 마지막 시리즈 카드까지 간다', async () => {
    // given — 시리즈 10개(각 2편, 편들이 위쪽 순위) + 단일 1건(가장 아래)
    const list = await pageAll(onApp, '/explore/search', {
      query: BULK,
      topic_ids: bulkTopicId,
      limit: '1',
    });

    // then — 페이지마다 정확히 1건, 시리즈 카드 10 + 단일 1, 중복 없음
    expect(list.pages.every((count) => count === 1)).toBe(true);
    const cardIds = list.items
      .filter((item) => item.type === 'series')
      .map((item) => item.series?.id);
    expect(cardIds).toHaveLength(10);
    expect(new Set(cardIds).size).toBe(10);
    expect(
      list.items
        .filter((item) => item.type === 'content')
        .map((item) => item.content?.id),
    ).toEqual([bulkSingleId]);
    // 커서 길이는 시리즈 수와 무관하다(종전 g 방식은 7개쯤에서 512자를 넘었다)
    const lengths = list.cursors.map((cursor) => cursor.length);
    expect(Math.max(...lengths) - Math.min(...lengths)).toBeLessThan(8);
    expect(Math.max(...lengths)).toBeLessThan(300);

    // 주제별·인기도 같다
    const topicList = await pageAll(onApp, '/explore/contents', {
      topic_ids: bulkTopicId,
      limit: '1',
    });
    expect(topicList.pages.every((count) => count === 1)).toBe(true);
    expect(topicList.items).toHaveLength(11);
  }, 90_000);

  // ── 도우미 ──

  function get(app: INestApplication<App>, path: string, query = {}) {
    return request(app.getHttpServer())
      .get(`/api/v1${path}`)
      .query(query)
      .set('Authorization', auth)
      .expect(HttpStatus.OK);
  }

  async function pageAll(
    app: INestApplication<App>,
    path: string,
    query: Record<string, string>,
  ): Promise<{ items: ItemBody[]; cursors: string[]; pages: number[] }> {
    const items: ItemBody[] = [];
    const cursors: string[] = [];
    const pages: number[] = [];
    let cursor: string | null = null;

    for (let guard = 0; guard < 100; guard += 1) {
      const response = await get(app, path, {
        ...query,
        ...(cursor ? { cursor } : {}),
      });
      const body = response.body as ListBody;
      items.push(...body.items);
      pages.push(body.items.length);
      if (!body.has_next || !body.next_cursor) {
        break;
      }
      cursor = body.next_cursor;
      cursors.push(cursor);
    }

    return { items, cursors, pages };
  }

  /** 우리 시드의 콘텐츠·카드 id만 — 다른 테스트·시드 콘텐츠는 뺀다 */
  function idsOf(items: ItemBody[]): string[] {
    const ours = new Set([...episodeIds, ...singleIds]);
    return items
      .map((item) => item.content?.id ?? '')
      .filter((id) => ours.has(id));
  }

  function decodeCursor(cursor: string): Record<string, unknown> {
    return JSON.parse(
      Buffer.from(cursor, 'base64url').toString('utf8'),
    ) as Record<string, unknown>;
  }

  async function seed(): Promise<void> {
    const topic = await dataSource.getRepository(Topic).save(
      dataSource.getRepository(Topic).create({
        name: STAMP,
        parentCategory: STAMP,
        isVisible: true,
        displayOrder: 960,
        market: UserMarket.KR,
      }),
    );
    topicId = topic.id;

    const series = await dataSource.getRepository(Series).save(
      dataSource.getRepository(Series).create({
        title: `${SERIES_WORD} 시리즈`,
        description: '소개',
        totalEpisodes: 3,
        status: SeriesStatus.COMPLETED,
      }),
    );
    seriesId = series.id;

    const base = Date.now() - 3_600_000;
    const make = async (
      label: string,
      index: number,
      episodeNo: number | null,
      target: { prefix: string; topic: string; series: string } = {
        prefix: STAMP,
        topic: topicId,
        series: seriesId,
      },
    ): Promise<string> => {
      const repository = dataSource.getRepository(Content);
      const content = await repository.save(
        repository.create({
          title: `${target.prefix} ${label}`,
          description: 'e2e 전용',
          authorName: null,
          sourceName: 'E2E',
          sourceUrl: null,
          origin: ContentOrigin.AI_GENERATED,
          partnerId: null,
          seriesId: episodeNo === null ? null : target.series,
          episodeNo,
          totalEpisodes: episodeNo === null ? null : 3,
          audioPath: `${target.prefix}/${label}.mp3`,
          durationSec: 600,
          thumbnailUrl:
            episodeNo === 1
              ? 'https://example.com/e2e-cards-ep1.png'
              : 'https://example.com/e2e-cards.png',
          contentVersion: 1,
          licenseExpiresAt: null,
          status: ContentStatus.PUBLISHED,
          // 편은 단일보다 최신으로 둔다(주제별·인기의 동점 해소가 발행 시각 내림차순이다)
          publishedAt: new Date(base + index * 60_000),
          withdrawnAt: null,
        }),
      );
      contentIds.push(content.id);
      await dataSource
        .getRepository(ContentTopic)
        .save(
          dataSource
            .getRepository(ContentTopic)
            .create({ contentId: content.id, topicId: target.topic }),
        );
      return content.id;
    };

    singleIds.push(await make('단일 1', 1, null));
    singleIds.push(await make('단일 2', 2, null));
    episodeIds.push(await make('1화', 10, 1));
    episodeIds.push(await make('2화', 11, 2));
    episodeIds.push(await make('3화', 12, 3));

    const bulkTopic = await dataSource.getRepository(Topic).save(
      dataSource.getRepository(Topic).create({
        name: BULK,
        parentCategory: BULK,
        isVisible: true,
        displayOrder: 961,
        market: UserMarket.KR,
      }),
    );
    bulkTopicId = bulkTopic.id;
    // 단일이 가장 오래돼 맨 아래 — 그 위를 시리즈 편 20개가 채운다
    // 위 시나리오(피드의 새로 나온 섹션)를 밀어내지 않게 그보다 오래된 시각으로 둔다
    bulkSingleId = await make('단일', -300, null, {
      prefix: BULK,
      topic: bulkTopicId,
      series: '',
    });
    for (let n = 0; n < 10; n += 1) {
      const bulkSeries = await dataSource.getRepository(Series).save(
        dataSource.getRepository(Series).create({
          title: `${BULK} 묶음 ${n}`,
          description: '',
          totalEpisodes: 3,
          status: SeriesStatus.ONGOING,
        }),
      );
      bulkSeriesIds.push(bulkSeries.id);
      for (const episodeNo of [1, 2]) {
        await make(
          `묶음 ${n}-${episodeNo}`,
          -200 + n * 2 + episodeNo,
          episodeNo,
          {
            prefix: BULK,
            topic: bulkTopicId,
            series: bulkSeries.id,
          },
        );
      }
    }

    const userRepository = dataSource.getRepository(User);
    const user = await userRepository.save(
      userRepository.create({
        provider: SocialProvider.KAKAO,
        providerUserId: `${STAMP}-listener`,
        role: UserRole.USER,
        onboardingCompleted: true,
        market: UserMarket.KR,
      }),
    );
    userIds.push(user.id);
    auth = `Bearer ${offApp
      .get(JwtService)
      .sign(
        { sub: user.id, role: user.role, typ: 'access', market: user.market },
        { expiresIn: 600 },
      )}`;
  }
});
