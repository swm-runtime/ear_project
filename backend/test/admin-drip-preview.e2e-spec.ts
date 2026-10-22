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
import { Content } from '@/modules/content/entities/content.entity';
import { User } from '@/modules/user/entities/user.entity';
import { SocialProvider, UserRole } from '@/modules/user/user.enum';

interface PreviewBody {
  user: Record<string, unknown>;
  interests: { topic_id: string; source: string }[];
  regular: { pool_size: number; candidates: { content_id: string }[] } | null;
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
 * 편성 미리보기(`GET /admin/drip/preview?user_id=`, 2026-10-22) E2E — 실제 DB 위에서 ① 인증·인가 ② `user_id` 조회·404·400
 * (종전 `email` 키는 400) ③ 응답 어디에도 이메일·닉네임 키·값이 없는지 ④ 열람 1회마다 감사 로그 `drip.preview_view` 1행을 본다.
 * 단정은 이 파일이 심은 행(`TOKEN`)으로만 좁힌다 — 병렬 CI 의 다른 스위트 행에 흔들리지 않게.
 */
describe('편성 미리보기 E2E', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  const userIds: string[] = [];
  const contentIds: string[] = [];
  const topicIds: string[] = [];
  const TOKEN = `e2edrippreview${Date.now()}`;
  const SECRET_EMAIL = `${TOKEN}@preview.example.com`;
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
        'library_items',
        'user_signals',
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

  it('인증이 없으면 401, 일반 계정은 403', async () => {
    const userAuth = await createUser('plain', UserRole.USER);
    const someId = '00000000-0000-4000-8000-000000000000';

    await request(app.getHttpServer())
      .get(path('/admin/drip/preview'))
      .query({ user_id: someId })
      .expect(HttpStatus.UNAUTHORIZED);
    await request(app.getHttpServer())
      .get(path('/admin/drip/preview'))
      .query({ user_id: someId })
      .set('Authorization', userAuth)
      .expect(HttpStatus.FORBIDDEN);
  }, 60_000);

  it('없는 user_id 는 404, uuid 가 아니거나 비었거나 email 로 물으면 400 — 감사 로그는 남지 않는다', async () => {
    const adminAuth = await createUser('admin-404', UserRole.ADMIN);
    const unknownId = '00000000-0000-4000-8000-00000000dcba';

    await request(app.getHttpServer())
      .get(path('/admin/drip/preview'))
      .query({ user_id: unknownId })
      .set('Authorization', adminAuth)
      .expect(HttpStatus.NOT_FOUND);
    for (const query of [
      { user_id: 'not-a-uuid' },
      {},
      { email: SECRET_EMAIL },
    ]) {
      const res = await request(app.getHttpServer())
        .get(path('/admin/drip/preview'))
        .query(query)
        .set('Authorization', adminAuth)
        .expect(HttpStatus.BAD_REQUEST);
      expect((res.body as { error_code: string }).error_code).toBe(
        'VALIDATION_FAILED',
      );
    }

    const [{ count }] = await dataSource.query<{ count: number }[]>(
      `SELECT count(*)::int AS count FROM audit_logs WHERE target = $1`,
      [`user:${unknownId}`],
    );
    expect(count).toBe(0);
  }, 60_000);

  it('탈퇴한 사용자는 404', async () => {
    const adminAuth = await createUser('admin-withdrawn', UserRole.ADMIN);
    const withdrawnId = await createUserId('withdrawn', UserRole.USER);
    await dataSource.query(
      `UPDATE users SET status = 'withdrawn' WHERE id = $1`,
      [withdrawnId],
    );

    await request(app.getHttpServer())
      .get(path('/admin/drip/preview'))
      .query({ user_id: withdrawnId })
      .set('Authorization', adminAuth)
      .expect(HttpStatus.NOT_FOUND);
    expect(await countAudit(withdrawnId)).toBe(0);
  }, 60_000);

  it('user_id 로 계산하고, 응답 어디에도 이메일·닉네임이 없으며, 감사 로그 drip.preview_view 를 1행 남긴다', async () => {
    // given — 이메일·닉네임을 가진 대상, 관심 주제 하나, 그 주제의 발행 콘텐츠 하나
    const adminAuth = await createUser('admin', UserRole.ADMIN);
    const adminId = userIds[userIds.length - 1];
    const targetId = await createUserId('target', UserRole.USER, {
      email: SECRET_EMAIL,
      nickname: SECRET_NICKNAME,
    });
    const topicId = await seedTopic();
    const contentId = await seedContent('후보 편', topicId);
    await dataSource.query(
      `INSERT INTO user_interests (user_id, topic_id, source) VALUES ($1, $2, 'onboarding')`,
      [targetId, topicId],
    );
    const auditBefore = await countAudit(targetId);

    // when
    const response = await request(app.getHttpServer())
      .get(path('/admin/drip/preview'))
      .query({ user_id: targetId })
      .set('Authorization', adminAuth)
      .expect(HttpStatus.OK);
    const body = response.body as PreviewBody;

    // then — 내용
    expect(response.headers['cache-control']).toBe('no-store');
    expect(body.user).toEqual({
      id: targetId,
      tier: 'light',
      market: 'kr',
      job_category: null,
      years_of_experience: null,
      onboarding_completed: true,
    });
    expect(body.interests).toEqual([
      expect.objectContaining({ topic_id: topicId, source: 'onboarding' }),
    ]);
    expect(
      body.regular?.candidates.some((c) => c.content_id === contentId),
    ).toBe(true);

    // then — 개인 식별 정보 없음(키·값 모두)
    const keys = allKeys(body);
    expect(keys.filter((k) => FORBIDDEN_KEYS.includes(k))).toEqual([]);
    const text = JSON.stringify(body);
    expect(text).not.toContain(SECRET_EMAIL);
    expect(text).not.toContain(SECRET_NICKNAME);

    // then — 감사 로그 1행
    expect(await countAudit(targetId)).toBe(auditBefore + 1);
    const [audit] = await dataSource.query<
      { actor: string; action: string; before: unknown; after: unknown }[]
    >(
      `SELECT actor, action, before, after FROM audit_logs WHERE target = $1 ORDER BY id DESC LIMIT 1`,
      [`user:${targetId}`],
    );
    expect(audit).toEqual({
      actor: adminId,
      action: 'drip.preview_view',
      before: null,
      after: null,
    });
  }, 60_000);

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
        // now() 와 다른 시각 — 같은 시각 발행분끼리의 정렬 흔들림을 피한다
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
