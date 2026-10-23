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
import { LibraryService } from '@/modules/library/library.service';
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

  it('담지 않고 끝까지 들은 편은 상세·프로필에서 완청으로 보인다', async () => {
    // given
    const contentId = await seedContent();
    const other = await seedContent();
    const { auth } = await createUser('display');
    await saveProgress(auth, contentId, 560);
    await saveProgress(auth, other, 300);

    // when
    const detail = await request(app.getHttpServer())
      .get(path(`/contents/${contentId}`))
      .set('Authorization', auth)
      .expect(HttpStatus.OK);
    const partial = await request(app.getHttpServer())
      .get(path(`/contents/${other}`))
      .set('Authorization', auth)
      .expect(HttpStatus.OK);
    const profile = await request(app.getHttpServer())
      .get(path('/users/me/profile'))
      .set('Authorization', auth)
      .expect(HttpStatus.OK);

    // then — 라이브러리 행이 없어도 완청은 완청이다
    expect((detail.body as { is_completed: boolean }).is_completed).toBe(true);
    expect((partial.body as { is_completed: boolean }).is_completed).toBe(
      false,
    );
    expect(JSON.stringify(profile.body)).toContain(
      '"completed_content_count":1',
    );
  });

  it('담지 않고 듣던 편이 미니플레이어 복원 대상이 되고(id null), 끝까지 들으면 빠진다', async () => {
    // given — 탐색에서 듣다 나갔다(라이브러리 행 없음)
    const contentId = await seedContent();
    const { auth } = await createUser('resume');
    await saveProgress(auth, contentId, 200);

    // when
    const resume = await request(app.getHttpServer())
      .get(path('/users/me/library-items/resume'))
      .set('Authorization', auth)
      .expect(HttpStatus.OK);

    // then
    const target = (
      resume.body as {
        resume_target: {
          id: string | null;
          status: string;
          content: { id: string };
          progress: { position_sec: number } | null;
        } | null;
      }
    ).resume_target;
    expect(target).not.toBeNull();
    expect(target?.id).toBeNull();
    expect(target?.status).toBe('in_progress');
    expect(target?.content.id).toBe(contentId);
    expect(target?.progress?.position_sec).toBe(200);

    // when — 끝까지 들었다
    await saveProgress(auth, contentId, 560);
    const after = await request(app.getHttpServer())
      .get(path('/users/me/library-items/resume'))
      .set('Authorization', auth)
      .expect(HttpStatus.OK);

    // then — 완청한 편을 이어 들을 자리는 없다
    expect((after.body as { resume_target: unknown }).resume_target).toBeNull();
  });

  it('담은 편이면 복원 대상의 id가 라이브러리 항목 id다', async () => {
    // given
    const contentId = await seedContent();
    const { auth } = await createUser('resume-saved');
    await request(app.getHttpServer())
      .post(path(`/contents/${contentId}/save`))
      .set('Authorization', auth)
      .send({ client_seq: 1, reason: 'user_save' })
      .expect(HttpStatus.CREATED);
    await saveProgress(auth, contentId, 120);

    // when
    const resume = await request(app.getHttpServer())
      .get(path('/users/me/library-items/resume'))
      .set('Authorization', auth)
      .expect(HttpStatus.OK);

    // then
    const target = (
      resume.body as { resume_target: { id: string | null } | null }
    ).resume_target;
    expect(typeof target?.id).toBe('string');
  });

  it('듣다 만 편을 담으면 in_progress로 들어가 진행 바가 보이고, 지웠다 복구해도 그 사이 들은 만큼 맞춘다', async () => {
    // given — 탐색에서 절반쯤 들었다
    const contentId = await seedContent();
    const { userId, auth } = await createUser('half');
    await saveProgress(auth, contentId, 250);

    // when — 담는다
    const saved = await request(app.getHttpServer())
      .post(path(`/contents/${contentId}/save`))
      .set('Authorization', auth)
      .send({ client_seq: 1, reason: 'user_save' })
      .expect(HttpStatus.CREATED);

    // then
    expect((saved.body as SaveContentBody).library_item.status).toBe(
      'in_progress',
    );

    // when — 지운 뒤 탐색에서 끝까지 듣고, 삭제를 실행 취소한다
    const itemId = (saved.body as { library_item: { id: string } }).library_item
      .id;
    await request(app.getHttpServer())
      .delete(path(`/users/me/library-items/${itemId}`))
      .set('Authorization', auth)
      .expect(HttpStatus.NO_CONTENT);
    await saveProgress(auth, contentId, 570);
    await request(app.getHttpServer())
      .post(path(`/users/me/library-items/${itemId}/restore`))
      .set('Authorization', auth)
      .expect((res) => expect([200, 201]).toContain(res.status));

    // then — 완청으로 돌아온다
    const rows: { status: string }[] = await dataSource.query(
      `SELECT status FROM library_items WHERE user_id = $1 AND content_id = $2`,
      [userId, contentId],
    );
    expect(rows[0].status).toBe('completed');
  });

  it('일괄 정리(dry-run)는 어긋난 옛 행을 센다 — 자동 적립 시절 unplayed 행', async () => {
    // given — 옛 앱 자동 적립처럼 행을 먼저 만들고(unplayed), 위치만 쌓였다
    const contentId = await seedContent();
    const { userId } = await createUser('legacy');
    await dataSource.query(
      `INSERT INTO library_items (user_id, content_id, source, status, added_at)
       VALUES ($1, $2, 'save', 'unplayed', now())`,
      [userId, contentId],
    );
    await dataSource.query(
      `INSERT INTO playback_progresses (user_id, content_id, position_sec, max_reached_sec)
       VALUES ($1, $2, 120, 120)`,
      [userId, contentId],
    );

    // when
    const counts = await app
      .get(LibraryService)
      .syncAllStatusWithProgress(true);

    // then — 바꾸지 않고 센다
    expect(counts.toInProgress).toBeGreaterThanOrEqual(1);
    const rows: { status: string }[] = await dataSource.query(
      `SELECT status FROM library_items WHERE user_id = $1 AND content_id = $2`,
      [userId, contentId],
    );
    expect(rows[0].status).toBe('unplayed');
  });

  it('라이브러리에서 지운 편은 지운 뒤 위치가 저장돼도 미니플레이어로 돌아오지 않는다', async () => {
    // given — 담고 듣다가 지웠는데, 재생이 이어져 위치가 한 번 더 저장됐다
    const contentId = await seedContent();
    const { auth } = await createUser('deleted-resume');
    const saved = await request(app.getHttpServer())
      .post(path(`/contents/${contentId}/save`))
      .set('Authorization', auth)
      .send({ client_seq: 1, reason: 'user_save' })
      .expect(HttpStatus.CREATED);
    const itemId = (saved.body as { library_item: { id: string } }).library_item
      .id;
    await saveProgress(auth, contentId, 100);
    await request(app.getHttpServer())
      .delete(path(`/users/me/library-items/${itemId}`))
      .set('Authorization', auth)
      .expect(HttpStatus.NO_CONTENT);
    await saveProgress(auth, contentId, 130);

    // when
    const resume = await request(app.getHttpServer())
      .get(path('/users/me/library-items/resume'))
      .set('Authorization', auth)
      .expect(HttpStatus.OK);

    // then
    expect(
      (resume.body as { resume_target: unknown }).resume_target,
    ).toBeNull();
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
