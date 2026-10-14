import 'dotenv/config';

import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
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
import { Notice } from '@/modules/notice/entities/notice.entity';
import { User } from '@/modules/user/entities/user.entity';
import { SocialProvider, UserMarket, UserRole } from '@/modules/user/user.enum';

interface IdList {
  items: { id?: string; topic_id?: string; content_id?: string }[];
}

/**
 * 글로벌 2 — 카탈로그 격리(KAN-188 · `global-api.md` 4.5·4.7·4.8). 사용자 시장이 아닌 콘텐츠·주제·공지는 **어떤 응답에도**
 * 나오지 않고, ID로 직접 와도 404다. KR 계정은 GLOBAL 행이 생겨도 종전과 같은 것만 본다.
 *
 * 시장은 access token 클레임(`market`)으로 전달된다 — 여기서는 토큰을 직접 서명해 두 시장 계정을 만든다.
 */
describe('글로벌 카탈로그 격리 E2E', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let krAuth: string;
  let globalAuth: string;
  const userIds: string[] = [];
  const topicIds: string[] = [];
  const contentIds: string[] = [];
  const noticeIds: string[] = [];
  const path = (p: string) => `/api/v1${p}`;
  const STAMP = `E2E-ISO-${Date.now()}`;

  let krTopic: Topic;
  let globalTopic: Topic;
  let krContent: Content;
  let globalContent: Content;
  let krNotice: Notice;
  let globalNotice: Notice;

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

    krAuth = await createUser('kr', UserMarket.KR);
    globalAuth = await createUser('global', UserMarket.GLOBAL);

    krTopic = await seedTopic(UserMarket.KR);
    globalTopic = await seedTopic(UserMarket.GLOBAL);
    krContent = await seedContent(UserMarket.KR, ContentLanguage.KO, krTopic);
    globalContent = await seedContent(
      UserMarket.GLOBAL,
      ContentLanguage.EN,
      globalTopic,
    );
    krNotice = await seedNotice(UserMarket.KR);
    globalNotice = await seedNotice(UserMarket.GLOBAL);
  }, 60_000);

  afterAll(async () => {
    await dataSource.query(`DELETE FROM notices WHERE id = ANY($1)`, [
      noticeIds,
    ]);
    await dataSource.query(
      `DELETE FROM content_topics WHERE content_id = ANY($1)`,
      [contentIds],
    );
    await dataSource.query(`DELETE FROM contents WHERE id = ANY($1)`, [
      contentIds,
    ]);
    await dataSource.query(`DELETE FROM topics WHERE id = ANY($1)`, [topicIds]);
    await dataSource.query(`DELETE FROM users WHERE id = ANY($1)`, [userIds]);
    await app.close();
  }, 60_000);

  it('온보딩 주제 목록은 사용자 시장의 주제만 담는다', async () => {
    const kr = await get('/onboarding/topics', krAuth);
    const global = await get('/onboarding/topics', globalAuth);

    expect(topicIdsOf(kr)).toContain(krTopic.id);
    expect(topicIdsOf(kr)).not.toContain(globalTopic.id);
    expect(topicIdsOf(global)).toContain(globalTopic.id);
    expect(topicIdsOf(global)).not.toContain(krTopic.id);
  }, 60_000);

  it('탐색 목록은 주제를 직접 지정해도 다른 시장 콘텐츠를 내주지 않는다', async () => {
    const leaked = await get(
      `/explore/contents?topic_ids=${krTopic.id}`,
      globalAuth,
    );
    expect(contentIdsOf(leaked)).not.toContain(krContent.id);

    const own = await get(
      `/explore/contents?topic_ids=${globalTopic.id}`,
      globalAuth,
    );
    expect(contentIdsOf(own)).toContain(globalContent.id);

    const krOwn = await get(
      `/explore/contents?topic_ids=${krTopic.id}`,
      krAuth,
    );
    expect(contentIdsOf(krOwn)).toContain(krContent.id);
  }, 60_000);

  it('콘텐츠 상세는 다른 시장 ID로 직접 와도 404이고, 같은 시장은 language를 싣는다', async () => {
    await request(app.getHttpServer())
      .get(path(`/contents/${krContent.id}`))
      .set('Authorization', globalAuth)
      .expect(HttpStatus.NOT_FOUND);

    const own = await request(app.getHttpServer())
      .get(path(`/contents/${globalContent.id}`))
      .set('Authorization', globalAuth)
      .expect(HttpStatus.OK);
    expect((own.body as { language: string }).language).toBe('en');

    await request(app.getHttpServer())
      .get(path(`/contents/${globalContent.id}`))
      .set('Authorization', krAuth)
      .expect(HttpStatus.NOT_FOUND);
  }, 60_000);

  it('공지는 시장별로만 보이고 다른 시장 공지는 404다', async () => {
    const kr = await get('/notices', krAuth);
    const global = await get('/notices', globalAuth);

    expect(idsOf(kr)).toContain(krNotice.id);
    expect(idsOf(kr)).not.toContain(globalNotice.id);
    expect(idsOf(global)).toContain(globalNotice.id);
    expect(idsOf(global)).not.toContain(krNotice.id);

    await request(app.getHttpServer())
      .get(path(`/notices/${krNotice.id}`))
      .set('Authorization', globalAuth)
      .expect(HttpStatus.NOT_FOUND);
  }, 60_000);

  it('market 클레임이 없는 옛 토큰은 KR로 동작한다', async () => {
    const legacyAuth = await createUser('legacy', UserMarket.KR, false);
    const topics = await get('/onboarding/topics', legacyAuth);

    expect(topicIdsOf(topics)).toContain(krTopic.id);
    expect(topicIdsOf(topics)).not.toContain(globalTopic.id);
  }, 60_000);

  async function get(p: string, auth: string): Promise<IdList> {
    const response = await request(app.getHttpServer())
      .get(path(p))
      .set('Authorization', auth)
      .expect(HttpStatus.OK);
    return response.body as IdList;
  }

  const idsOf = (body: IdList) => body.items.map((item) => item.id);
  const topicIdsOf = (body: IdList) =>
    body.items.map((item) => item.topic_id ?? item.id);
  const contentIdsOf = (body: IdList) =>
    body.items.map((item) => item.content_id ?? item.id);

  async function createUser(
    label: string,
    market: UserMarket,
    withClaim = true,
  ): Promise<string> {
    const repository = dataSource.getRepository(User);
    const user = await repository.save(
      repository.create({
        provider: SocialProvider.KAKAO,
        providerUserId: `${STAMP}-${label}`,
        role: UserRole.USER,
        onboardingCompleted: true,
        market,
      }),
    );
    userIds.push(user.id);

    const token = app.get(JwtService).sign(
      {
        sub: user.id,
        role: user.role,
        typ: 'access',
        ...(withClaim ? { market } : {}),
      },
      { expiresIn: 600 },
    );

    return `Bearer ${token}`;
  }

  async function seedTopic(market: UserMarket): Promise<Topic> {
    const repository = dataSource.getRepository(Topic);
    const topic = await repository.save(
      repository.create({
        name: `${STAMP}-${market}`,
        parentCategory: STAMP,
        isVisible: true,
        displayOrder: 980,
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
  ): Promise<Content> {
    const repository = dataSource.getRepository(Content);
    const content = await repository.save(
      repository.create({
        title: `${STAMP} ${market}`,
        description: 'e2e 격리 전용',
        authorName: '테스트',
        sourceName: 'E2E',
        sourceUrl: 'https://example.com/e2e',
        origin: ContentOrigin.AI_GENERATED,
        partnerId: null,
        seriesId: null,
        episodeNo: null,
        totalEpisodes: null,
        audioPath: `e2e-iso/${market}.mp3`,
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

  async function seedNotice(market: UserMarket): Promise<Notice> {
    const repository = dataSource.getRepository(Notice);
    const notice = await repository.save(
      repository.create({
        title: `${STAMP} ${market}`,
        body: 'e2e 격리 전용',
        isPinned: false,
        publishedAt: new Date(Date.now() - 60_000),
        market,
      }),
    );
    noticeIds.push(notice.id);
    return notice;
  }
});
