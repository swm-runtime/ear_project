import 'dotenv/config';

import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';

import { AppModule } from '@/app.module';
import { traceIdMiddleware } from '@/common/middlewares/trace-id.middleware';
import { toServiceDate } from '@/common/utils/service-date.util';
import { ContentOrigin, ContentStatus } from '@/modules/content/content.enum';
import { Content } from '@/modules/content/entities/content.entity';
import { User } from '@/modules/user/entities/user.entity';
import { SocialProvider, UserRole } from '@/modules/user/user.enum';

interface UsersBody {
  sort: string;
  users: {
    user_id: string;
    tier: string;
    market: string;
    interest_count: number;
    plays_30d: number;
    listen_sec_30d: number;
    completes_30d: number;
    last_played_at: string | null;
  }[];
}

interface DetailBody {
  user_id: string;
  profile: Record<string, unknown>;
  interests: { topic_id: string; source: string; is_active: boolean }[];
  listening: {
    items: {
      content_id: string;
      listen_sec: number;
      complete_count: number;
      listened_ratio: number | null;
      topics: { topic_id: string }[];
    }[];
  };
  deliveries: {
    items: {
      content_id: string;
      source: string;
      algorithm_version: string | null;
      played_after: boolean;
      completed_after: boolean;
      feedback_stars: number | null;
    }[];
  };
  explanation: {
    notice: string;
    weights: { axes: Record<string, number> };
    preference: {
      signal_total: number;
      signal_counts_by_topic: { topic_id: string; total: number }[];
    };
    regular: {
      pool_size: number;
      top: { rank: number; score: number; breakdown: unknown }[];
    } | null;
  };
}

/** 응답 어디에도 있으면 안 되는 개인 식별 키 */
const FORBIDDEN_KEYS = [
  'email',
  'nickname',
  'provider_user_id',
  'profile_image_url',
  'job_title',
];

function allKeys(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(allKeys);
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) => [k, ...allKeys(v)]);
  }
  return [];
}

/**
 * 서비스 지표 "추천 검증" E2E — 실제 DB 위에서 ① 두 엔드포인트의 인증·인가·404 ② 심은 청취·편성·별점이 응답에 실리는지
 * ③ 이메일·닉네임이 응답 어디에도 없는지 ④ **열람 전후로 사용자 상태 표의 행 수와 `updated_at`이 그대로인지**(읽기 전용)
 * ⑤ 감사 로그가 1행 늘었는지를 본다.
 */
describe('추천 검증 E2E', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  const userIds: string[] = [];
  const contentIds: string[] = [];
  const topicIds: string[] = [];
  const TOKEN = `e2einspect${Date.now()}`;
  const SECRET_EMAIL = `${TOKEN}@inspect.example.com`;
  const SECRET_NICKNAME = `${TOKEN}닉네임`;
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
      for (const table of [
        'drip_feedbacks',
        'library_items',
        'user_signals',
        'play_records',
        'playback_progresses',
        'user_interests',
        'user_preference_vectors',
        'drip_excluded_contents',
      ]) {
        await dataSource.query(`DELETE FROM ${table} WHERE user_id = $1`, [
          userId,
        ]);
      }
      await dataSource.query(`DELETE FROM audit_logs WHERE target = $1`, [
        `user:${userId}`,
      ]);
      await dataSource.query(`DELETE FROM users WHERE id = $1`, [userId]);
    }
    for (const contentId of contentIds) {
      await dataSource.query(
        `DELETE FROM content_topics WHERE content_id = $1`,
        [contentId],
      );
      await dataSource.query(`DELETE FROM contents WHERE id = $1`, [contentId]);
    }
    for (const topicId of topicIds) {
      await dataSource.query(`DELETE FROM topics WHERE id = $1`, [topicId]);
    }
    await app.close();
  }, 60_000);

  it('인증이 없으면 401, 일반 계정은 403 — 목록·상세 모두', async () => {
    const userAuth = await createUser('plain', UserRole.USER);
    const someId = '00000000-0000-4000-8000-000000000000';

    for (const url of [
      '/admin/insights/recommendations/users',
      `/admin/insights/recommendations/users/${someId}`,
    ]) {
      await request(app.getHttpServer())
        .get(path(url))
        .expect(HttpStatus.UNAUTHORIZED);
      await request(app.getHttpServer())
        .get(path(url))
        .set('Authorization', userAuth)
        .expect(HttpStatus.FORBIDDEN);
    }
  }, 60_000);

  it('없는 사용자는 404, uuid 가 아니면 400 — 감사 로그는 남지 않는다', async () => {
    const adminAuth = await createUser('admin-404', UserRole.ADMIN);
    const unknownId = '00000000-0000-4000-8000-00000000abcd';

    await request(app.getHttpServer())
      .get(path(`/admin/insights/recommendations/users/${unknownId}`))
      .set('Authorization', adminAuth)
      .expect(HttpStatus.NOT_FOUND);
    await request(app.getHttpServer())
      .get(path('/admin/insights/recommendations/users/not-a-uuid'))
      .set('Authorization', adminAuth)
      .expect(HttpStatus.BAD_REQUEST);
    await request(app.getHttpServer())
      .get(path('/admin/insights/recommendations/users'))
      .query({ sort: 'name' })
      .set('Authorization', adminAuth)
      .expect(HttpStatus.BAD_REQUEST);

    const [{ count }] = await dataSource.query<{ count: number }[]>(
      `SELECT count(*)::int AS count FROM audit_logs WHERE target = $1`,
      [`user:${unknownId}`],
    );
    expect(count).toBe(0);
  }, 60_000);

  it('심은 청취·편성·별점이 목록·상세에 실리고, 이메일·닉네임은 어디에도 없으며, 열람은 사용자 상태를 바꾸지 않고 감사 로그 1행만 남긴다', async () => {
    // given — 관심 주제 하나, 콘텐츠 둘(하나는 들은 편 + 편성분, 하나는 아직 안 받은 후보)
    const adminAuth = await createUser('admin', UserRole.ADMIN);
    const adminId = userIds[userIds.length - 1];
    const targetId = await createUserId('target', UserRole.USER, {
      email: SECRET_EMAIL,
      nickname: SECRET_NICKNAME,
    });
    const topicId = await seedTopic();
    const listenedId = await seedContent('들은 편', topicId);
    await seedContent('후보 편', topicId);
    const now = new Date();
    await dataSource.query(
      `INSERT INTO user_interests (user_id, topic_id, source) VALUES ($1, $2, 'onboarding')`,
      [targetId, topicId],
    );
    const addedAt = new Date(now.getTime() - 2 * 86_400_000);
    await dataSource.query(
      `INSERT INTO library_items (user_id, content_id, source, status, added_at, algorithm_version, completed_at, last_played_at)
       VALUES ($1, $2, 'drip', 'completed', $3, '2026-09-30.2', $4, $4)`,
      [targetId, listenedId, addedAt, now],
    );
    const playedAt = new Date(now.getTime() - 86_400_000);
    await dataSource.query(
      `INSERT INTO play_records (user_id, content_id, play_date, played_at, listened_sec) VALUES ($1, $2, $3, $4, 540)`,
      [targetId, listenedId, toServiceDate(playedAt), playedAt],
    );
    await dataSource.query(
      `INSERT INTO playback_progresses (user_id, content_id, position_sec, max_reached_sec) VALUES ($1, $2, 600, 600)`,
      [targetId, listenedId],
    );
    await dataSource.query(
      `INSERT INTO user_signals (user_id, content_id, action, created_at) VALUES ($1, $2, 'play', $3), ($1, $2, 'complete', $4)`,
      [targetId, listenedId, playedAt, now],
    );
    await dataSource.query(
      `INSERT INTO drip_feedbacks (user_id, content_id, source, algorithm_version, placed_date, stars)
       VALUES ($1, $2, 'drip', '2026-09-30.2', $3, 4)`,
      [targetId, listenedId, toServiceDate(addedAt)],
    );

    // when — 목록
    const list = (
      await request(app.getHttpServer())
        .get(path('/admin/insights/recommendations/users'))
        .query({ sort: 'recent', limit: 50 })
        .set('Authorization', adminAuth)
        .expect(HttpStatus.OK)
    ).body as UsersBody;

    // then — 목록
    const row = list.users.find((u) => u.user_id === targetId);
    expect(row).toMatchObject({
      tier: 'light',
      market: 'kr',
      interest_count: 1,
      plays_30d: 1,
      listen_sec_30d: 540,
      completes_30d: 1,
    });
    const listen = (
      await request(app.getHttpServer())
        .get(path('/admin/insights/recommendations/users'))
        .set('Authorization', adminAuth)
        .expect(HttpStatus.OK)
    ).body as UsersBody;
    expect(listen.sort).toBe('listen');
    expect(listen.users.every((u) => u.plays_30d > 0)).toBe(true);

    // given — 열람 전 사용자 상태 스냅샷
    const before = await snapshotUserState(targetId);
    const auditBefore = await countAudit(targetId);

    // when — 상세
    const response = await request(app.getHttpServer())
      .get(path(`/admin/insights/recommendations/users/${targetId}`))
      .set('Authorization', adminAuth)
      .expect(HttpStatus.OK);
    const body = response.body as DetailBody;

    // then — 내용
    expect(response.headers['cache-control']).toBe('no-store');
    expect(body.user_id).toBe(targetId);
    expect(body.interests).toEqual([
      expect.objectContaining({
        topic_id: topicId,
        source: 'onboarding',
        is_active: true,
      }),
    ]);
    expect(body.listening.items).toEqual([
      expect.objectContaining({
        content_id: listenedId,
        listen_sec: 540,
        complete_count: 1,
        listened_ratio: 1,
        topics: [expect.objectContaining({ topic_id: topicId })],
      }),
    ]);
    expect(body.deliveries.items).toEqual([
      expect.objectContaining({
        content_id: listenedId,
        source: 'drip',
        algorithm_version: '2026-09-30.2',
        played_after: true,
        completed_after: true,
        feedback_stars: 4,
      }),
    ]);
    expect(body.explanation.notice).toBe(
      '현재 시점 재계산 — 실제 과거 편성 당시 점수와 다를 수 있다',
    );
    expect(Object.keys(body.explanation.weights.axes).sort()).toEqual([
      'embedding',
      'meta',
      'signal',
    ]);
    // 취향 계산 입력 신호(원천 조회 규칙은 편성과 같다)가 전부 심은 주제 하나로 모인다
    const signalTotal = body.explanation.preference.signal_total;
    expect(signalTotal).toBeGreaterThanOrEqual(1);
    expect(body.explanation.preference.signal_counts_by_topic).toEqual([
      expect.objectContaining({ topic_id: topicId, total: signalTotal }),
    ]);
    // 들은 편은 라이브러리에 있어 후보에서 빠지고, 안 받은 편은 정규 후보 풀에 든다
    expect(body.explanation.regular?.pool_size).toBeGreaterThanOrEqual(1);
    expect(body.explanation.regular?.top[0]).toMatchObject({ rank: 1 });

    // then — 개인 식별 정보 없음
    for (const json of [body, list, listen]) {
      const keys = allKeys(json);
      expect(keys.filter((k) => FORBIDDEN_KEYS.includes(k))).toEqual([]);
      const text = JSON.stringify(json);
      expect(text).not.toContain(SECRET_EMAIL);
      expect(text).not.toContain(SECRET_NICKNAME);
    }

    // then — 읽기 전용: 사용자 상태 표의 행 수·최종 갱신 시각이 그대로다
    expect(await snapshotUserState(targetId)).toEqual(before);

    // then — 감사 로그 1행
    expect(await countAudit(targetId)).toBe(auditBefore + 1);
    const [audit] = await dataSource.query<{ actor: string; action: string }[]>(
      `SELECT actor, action FROM audit_logs WHERE target = $1 ORDER BY id DESC LIMIT 1`,
      [`user:${targetId}`],
    );
    expect(audit).toEqual({
      actor: adminId,
      action: 'insights.recommendation_view',
    });
  }, 60_000);

  /** 사용자 상태를 담는 표마다 행 수와 최종 `updated_at` — 열람 전후가 같아야 한다 */
  async function snapshotUserState(
    userId: string,
  ): Promise<Record<string, unknown>> {
    const tables = [
      'user_interests',
      'user_preference_vectors',
      'library_items',
      'drip_excluded_contents',
      'user_settings',
      'user_signals',
      'play_records',
      'playback_progresses',
      'drip_feedbacks',
      'first_drip_jobs',
      'notification_logs',
    ];
    const snapshot: Record<string, unknown> = {};
    for (const table of tables) {
      const [row] = await dataSource.query<
        { count: number; last: Date | null }[]
      >(
        `SELECT count(*)::int AS count, max(updated_at) AS last FROM ${table} WHERE user_id = $1`,
        [userId],
      );
      snapshot[table] = { count: row.count, last: row.last?.toISOString() };
    }
    const [user] = await dataSource.query<{ updated_at: Date }[]>(
      `SELECT updated_at FROM users WHERE id = $1`,
      [userId],
    );
    snapshot.users = user.updated_at.toISOString();
    return snapshot;
  }

  async function countAudit(userId: string): Promise<number> {
    const [{ count }] = await dataSource.query<{ count: number }[]>(
      `SELECT count(*)::int AS count FROM audit_logs WHERE target = $1`,
      [`user:${userId}`],
    );
    return count;
  }

  async function createUserId(
    label: string,
    role: UserRole = UserRole.USER,
    extra: Partial<User> = {},
  ): Promise<string> {
    const repository = dataSource.getRepository(User);
    const user = await repository.save(
      repository.create({
        provider: SocialProvider.KAKAO,
        providerUserId: `${TOKEN}-${label}`,
        role,
        onboardingCompleted: true,
        ...extra,
      }),
    );
    userIds.push(user.id);
    return user.id;
  }

  async function createUser(label: string, role: UserRole): Promise<string> {
    const userId = await createUserId(label, role);
    const token = app
      .get(JwtService)
      .sign({ sub: userId, role, typ: 'access' }, { expiresIn: 600 });
    return `Bearer ${token}`;
  }

  async function seedTopic(): Promise<string> {
    const [{ id }] = await dataSource.query<{ id: string }[]>(
      `INSERT INTO topics (name, parent_category, is_visible, display_order, market)
       VALUES ($1, $2, true, 990, 'kr') RETURNING id`,
      [`${TOKEN}-topic`, TOKEN],
    );
    topicIds.push(id);
    return id;
  }

  async function seedContent(label: string, topicId: string): Promise<string> {
    const repository = dataSource.getRepository(Content);
    const content = await repository.save(
      repository.create({
        title: `${TOKEN} ${label}`,
        description: 'e2e 전용',
        authorName: '테스트',
        sourceName: 'E2E',
        sourceUrl: 'https://example.com/e2e',
        origin: ContentOrigin.AI_GENERATED,
        partnerId: null,
        seriesId: null,
        episodeNo: null,
        totalEpisodes: null,
        audioPath: `${TOKEN}/${label}.mp3`,
        durationSec: 600,
        thumbnailUrl: 'https://example.com/e2e.png',
        contentVersion: 1,
        licenseExpiresAt: null,
        status: ContentStatus.PUBLISHED,
        publishedAt: new Date(Date.now() - 60_000),
        withdrawnAt: null,
      }),
    );
    contentIds.push(content.id);
    await dataSource.query(
      `INSERT INTO content_topics (content_id, topic_id) VALUES ($1, $2)`,
      [content.id, topicId],
    );
    return content.id;
  }
});
