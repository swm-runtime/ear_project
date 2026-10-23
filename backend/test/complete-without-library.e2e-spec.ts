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
import { ContentTopic } from '@/modules/content/entities/content-topic.entity';
import { Content } from '@/modules/content/entities/content.entity';
import { Topic } from '@/modules/interest/entities/topic.entity';
import { User } from '@/modules/user/entities/user.entity';
import { SocialProvider, UserMarket, UserRole } from '@/modules/user/user.enum';

interface SaveProgressBody {
  library_item: { status: string; completed_at: string | null } | null;
}

interface SaveContentBody {
  library_item: { status: string };
}

const DURATION_SEC = 600;

/**
 * 담지 않은 편의 완청(KAN-248 — `player-api.md` 4.3).
 *
 * 탐색 재생은 라이브러리 행을 만들지 않는다(`explore.md` 4.4). 그래도 끝까지 들으면 `complete` 신호가
 * 1건 남아야 하고(추천 입력), 나중에 담으면 그 행이 `completed`로 들어가야 한다 — 실제 DB 위에서 본다.
 */
describe('담지 않은 편의 완청 E2E', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  const userIds: string[] = [];
  const topicIds: string[] = [];
  const contentIds: string[] = [];
  const STAMP = `e2e-complete-nolib-${Date.now().toString(36)}`;
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
      await dataSource.query(`DELETE FROM users WHERE id = $1`, [userId]);
    }
    for (const contentId of contentIds) {
      await dataSource.query(`DELETE FROM contents WHERE id = $1`, [contentId]);
    }
    for (const topicId of topicIds) {
      await dataSource.query(`DELETE FROM topics WHERE id = $1`, [topicId]);
    }
    await app.close();
  }, 60_000);

  it('담지 않고 90%를 넘기면 신호 1건만 남고, 나중에 담으면 completed로 들어간다', async () => {
    // given
    const contentId = await seedContent();
    const { userId, auth } = await createUser('listener');

    // when — 기준 미달 → 처음 넘김 → 넘긴 뒤 또 저장
    const below = await saveProgress(auth, contentId, 500);
    const crossed = await saveProgress(auth, contentId, 560);
    await saveProgress(auth, contentId, 590);

    // then — 행은 생기지 않고 완청 신호는 한 번이다
    expect(below.library_item).toBeNull();
    expect(crossed.library_item).toBeNull();
    expect(await countLibraryRows(userId, contentId)).toBe(0);
    expect(await countCompleteSignals(userId, contentId)).toBe(1);

    // when — 다 들은 뒤 담는다
    const saved = await request(app.getHttpServer())
      .post(path(`/contents/${contentId}/save`))
      .set('Authorization', auth)
      .send({ client_seq: 1, reason: 'user_save' })
      .expect(HttpStatus.CREATED);

    // then — "안 들음"이 아니라 완청으로 들어가고, 신호는 더 쌓이지 않는다
    const body = saved.body as SaveContentBody;
    expect(body.library_item.status).toBe('completed');
    const rows: { completed_at: Date | null }[] = await dataSource.query(
      `SELECT completed_at FROM library_items WHERE user_id = $1 AND content_id = $2`,
      [userId, contentId],
    );
    expect(rows[0].completed_at).not.toBeNull();
    expect(await countCompleteSignals(userId, contentId)).toBe(1);
  });

  it('기준에 못 미친 편을 담으면 completed가 아니다', async () => {
    // given
    const contentId = await seedContent();
    const { userId, auth } = await createUser('partial');
    await saveProgress(auth, contentId, 300);

    // when
    const saved = await request(app.getHttpServer())
      .post(path(`/contents/${contentId}/save`))
      .set('Authorization', auth)
      .send({ client_seq: 1, reason: 'user_save' })
      .expect(HttpStatus.CREATED);

    // then
    expect((saved.body as SaveContentBody).library_item.status).not.toBe(
      'completed',
    );
    expect(await countCompleteSignals(userId, contentId)).toBe(0);
  });

  async function saveProgress(
    auth: string,
    contentId: string,
    reachedSec: number,
  ): Promise<SaveProgressBody> {
    const response = await request(app.getHttpServer())
      .put(path(`/users/me/playback-progresses/${contentId}`))
      .set('Authorization', auth)
      .send({
        position_sec: reachedSec,
        max_reached_sec: reachedSec,
        listened_sec_delta: 5,
        content_version: 1,
      })
      .expect(HttpStatus.OK);
    return response.body as SaveProgressBody;
  }

  async function countLibraryRows(
    userId: string,
    contentId: string,
  ): Promise<number> {
    const rows: { count: string }[] = await dataSource.query(
      `SELECT count(*) FROM library_items WHERE user_id = $1 AND content_id = $2`,
      [userId, contentId],
    );
    return Number(rows[0].count);
  }

  async function countCompleteSignals(
    userId: string,
    contentId: string,
  ): Promise<number> {
    const rows: { count: string }[] = await dataSource.query(
      `SELECT count(*) FROM user_signals
        WHERE user_id = $1 AND content_id = $2 AND action = 'complete'`,
      [userId, contentId],
    );
    return Number(rows[0].count);
  }

  async function createUser(
    label: string,
  ): Promise<{ userId: string; auth: string }> {
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
    const token = app.get(JwtService).sign(
      {
        sub: user.id,
        role: UserRole.USER,
        typ: 'access',
        market: UserMarket.KR,
      },
      { expiresIn: 600 },
    );
    return { userId: user.id, auth: `Bearer ${token}` };
  }

  async function seedContent(): Promise<string> {
    const topicRepository = dataSource.getRepository(Topic);
    const topic = await topicRepository.save(
      topicRepository.create({
        name: `${STAMP}-${topicIds.length}`,
        parentCategory: STAMP,
        isVisible: true,
        displayOrder: 970,
        market: UserMarket.KR,
      }),
    );
    topicIds.push(topic.id);

    const contentRepository = dataSource.getRepository(Content);
    const content = await contentRepository.save(
      contentRepository.create({
        title: `${STAMP} 편 ${contentIds.length + 1}`,
        description: 'e2e 전용',
        authorName: '테스트',
        sourceName: 'E2E',
        sourceUrl: 'https://example.com/e2e',
        origin: ContentOrigin.AI_GENERATED,
        partnerId: null,
        seriesId: null,
        episodeNo: null,
        totalEpisodes: null,
        audioPath: `${STAMP}/${contentIds.length}.mp3`,
        durationSec: DURATION_SEC,
        thumbnailUrl: 'https://example.com/e2e.png',
        contentVersion: 1,
        licenseExpiresAt: null,
        status: ContentStatus.PUBLISHED,
        // 다른 병렬 스위트의 "새 편" 목록을 밀어내지 않게 과거로 둔다
        publishedAt: new Date(
          Date.UTC(2001, 0, 1) + contentIds.length * 60_000,
        ),
        withdrawnAt: null,
      }),
    );
    contentIds.push(content.id);
    await dataSource.getRepository(ContentTopic).save({
      contentId: content.id,
      topicId: topic.id,
    });
    return content.id;
  }
});
