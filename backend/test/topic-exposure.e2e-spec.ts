import 'dotenv/config';

import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource, EntityManager } from 'typeorm';

import { AppModule } from '@/app.module';
import { TopicExposureService } from '@/modules/admin/services/topic-exposure.service';
import { ErrorCode } from '@/common/exceptions/error-code.enum';
import { traceIdMiddleware } from '@/common/middlewares/trace-id.middleware';
import { ContentOrigin, ContentStatus } from '@/modules/content/content.enum';
import { ContentTopic } from '@/modules/content/entities/content-topic.entity';
import { Content } from '@/modules/content/entities/content.entity';
import { Topic } from '@/modules/interest/entities/topic.entity';
import { UserInterest } from '@/modules/interest/entities/user-interest.entity';
import { UserInterestSource } from '@/modules/interest/interest.enum';
import { User } from '@/modules/user/entities/user.entity';
import { SocialProvider, UserRole } from '@/modules/user/user.enum';

/**
 * KAN-58 — **노출 가능 콘텐츠가 0건인 주제는 노출되지 않는다**(admin.md 4.5).
 *
 * 관리자 API → 실제 DB → 사용자 관심사 조회까지 한 번에 본다. 단위 테스트는 규칙을 목으로
 * 확인하지만, "0건"의 정의(발행 중 + 라이선스 미만료)가 SQL 에서 맞게 걸리는지와 숨김이
 * 사용자 관심사에서 실제로 빠지는지는 DB 를 거쳐야 확인된다.
 *
 * 자기 데이터를 직접 심고 끝나면 지운다.
 */
describe('주제 노출 E2E', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let adminAuth: string;

  const PARENT_CATEGORY = 'E2E-EXPOSURE';
  const contentIds: string[] = [];
  const userIds: string[] = [];

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

    const admin = await createUser('admin', UserRole.ADMIN);
    adminAuth = admin.auth;
  }, 60_000);

  afterAll(async () => {
    await cleanUp();
    await app.close();
  }, 60_000);

  it('회수·만료만 남은 주제는 원시 건수가 있어도 노출을 켤 수 없다', async () => {
    // given — 원시 연결 2건(회수 1 + 만료 1), 노출 가능 0건
    const topic = await seedTopic('empty', false);
    await seedContent(topic, { status: ContentStatus.WITHDRAWN });
    await seedContent(topic, { licenseExpiresAt: new Date(Date.now() - 1) });

    // when
    const response = await patchTopic(topic.id, { is_visible: true }).expect(
      HttpStatus.CONFLICT,
    );

    // then
    expect(response.body).toMatchObject({
      error_code: ErrorCode.ADMIN_TOPIC_HAS_NO_CONTENTS,
      // details 는 응답 최상위에 펼쳐진다(ADMIN_TOPIC_HAS_CONTENTS 와 같은 모양)
      content_count: 0,
    });
    expect((await reloadTopic(topic.id)).isVisible).toBe(false);

    // 목록은 두 건수를 함께 준다 — 삭제 판정은 원시, 노출 판정은 노출 가능 기준
    const item = await findAdminTopic(topic.id);
    expect(item).toMatchObject({ content_count: 2, visible_content_count: 0 });
  });

  it('발행 중인 콘텐츠가 있으면 노출을 켤 수 있다', async () => {
    // given
    const topic = await seedTopic('filled', false);
    await seedContent(topic);

    // when
    await patchTopic(topic.id, { is_visible: true }).expect(HttpStatus.OK);

    // then
    expect((await reloadTopic(topic.id)).isVisible).toBe(true);
  });

  it('마지막 노출 콘텐츠를 회수하면 주제가 숨겨지고 사용자 관심사에서 빠진다', async () => {
    // given — 사용자는 두 주제를 관심사로 가졌고, 하나는 콘텐츠 1건뿐이다
    const lonely = await seedTopic('lonely', true);
    const lonelyContent = await seedContent(lonely);
    const other = await seedTopic('other', true);
    await seedContent(other);
    const user = await createUser('viewer', UserRole.USER);
    await seedInterests(user.userId, [lonely.id, other.id]);

    const before = await getInterestTopicIds(user.auth);
    expect(before).toEqual(expect.arrayContaining([lonely.id, other.id]));

    // when
    await request(app.getHttpServer())
      .post(`/api/v1/admin/contents/${lonelyContent.id}/withdraw`)
      .set('Authorization', adminAuth)
      .send({ reason: 'e2e' })
      .expect(HttpStatus.OK);

    // then — 0건이 된 주제만 숨겨지고, 다른 주제는 그대로다
    expect((await reloadTopic(lonely.id)).isVisible).toBe(false);
    expect((await reloadTopic(other.id)).isVisible).toBe(true);

    const after = await getInterestTopicIds(user.auth);
    expect(after).toContain(other.id);
    expect(after).not.toContain(lonely.id);

    const audits = await dataSource.query<{ actor: string }[]>(
      `SELECT actor FROM audit_logs WHERE action = 'topic.auto_hide' AND target = $1`,
      [`topic:${lonely.id}`],
    );
    expect(audits).toHaveLength(1);
  });

  it('노출 가능 콘텐츠가 있는 주제의 콘텐츠를 회수하면 주제는 그대로 노출된다', async () => {
    // given
    const topic = await seedTopic('two', true);
    const withdrawn = await seedContent(topic);
    await seedContent(topic);

    // when
    await request(app.getHttpServer())
      .post(`/api/v1/admin/contents/${withdrawn.id}/withdraw`)
      .set('Authorization', adminAuth)
      .send({})
      .expect(HttpStatus.OK);

    // then
    expect((await reloadTopic(topic.id)).isVisible).toBe(true);
  });

  it('마지막 두 콘텐츠를 동시에 회수해도 주제가 숨겨진다', async () => {
    // given — 두 회수 트랜잭션이 각자 콘텐츠를 내린 채 아직 커밋하지 않았다.
    // 잠금이 없으면 READ COMMITTED 에서 서로를 아직 발행 중으로 세어 아무도 숨기지 않는다
    const topic = await seedTopic('race', true);
    const first = await seedContent(topic);
    const second = await seedContent(topic);
    const service = app.get(TopicExposureService);
    const command = {
      topicIds: [topic.id],
      actor: null,
      trigger: 'withdraw' as const,
      now: new Date(),
    };
    const firstTx = dataSource.createQueryRunner();
    const secondTx = dataSource.createQueryRunner();
    await firstTx.startTransaction();
    await secondTx.startTransaction();

    try {
      await withdrawRow(firstTx.manager, first.id);
      await withdrawRow(secondTx.manager, second.id);

      // when — 첫 판정은 두 번째 콘텐츠를 아직 발행 중으로 보고 숨기지 않는다.
      // 두 번째 판정은 주제 잠금에 막혀 첫 트랜잭션의 커밋을 기다린 뒤 센다
      const firstHidden = await service.hideEmptyTopics(
        command,
        firstTx.manager,
      );
      let secondSettled = false;
      const secondJudging = service
        .hideEmptyTopics(command, secondTx.manager)
        .finally(() => {
          secondSettled = true;
        });
      await new Promise((resolve) => setTimeout(resolve, 500));
      // 잠금이 없으면 여기서 이미 끝났고, 첫 번째를 발행 중으로 세어 아무것도 숨기지 않았다
      expect(secondSettled).toBe(false);

      await firstTx.commitTransaction();
      const secondHidden = await secondJudging;
      await secondTx.commitTransaction();

      // then
      expect(firstHidden).toEqual([]);
      expect(secondHidden.map((hidden) => hidden.id)).toEqual([topic.id]);
      expect((await reloadTopic(topic.id)).isVisible).toBe(false);
    } finally {
      if (firstTx.isTransactionActive) await firstTx.rollbackTransaction();
      if (secondTx.isTransactionActive) await secondTx.rollbackTransaction();
      await firstTx.release();
      await secondTx.release();
    }
  });

  it('일일 판정이 라이선스 만료로 0건이 된 노출 주제를 system 으로 숨긴다', async () => {
    // given — 규칙 이전에 켜졌거나 만료로 비게 된 주제
    const topic = await seedTopic('expired', true);
    await seedContent(topic, { licenseExpiresAt: new Date(Date.now() - 1) });

    // when — 배치 전체(`hideAllEmptyVisibleTopics`)는 공유 DB 의 다른 주제까지 숨겨 병렬 e2e 를
    // 흔든다. 같은 판정을 이 테스트의 주제로만 돌린다
    await dataSource.transaction((manager) =>
      app.get(TopicExposureService).hideEmptyTopics(
        {
          topicIds: [topic.id],
          actor: null,
          trigger: 'daily_sweep',
          now: new Date(),
        },
        manager,
      ),
    );

    // then
    expect((await reloadTopic(topic.id)).isVisible).toBe(false);
    const audits = await dataSource.query<{ actor: string }[]>(
      `SELECT actor FROM audit_logs WHERE action = 'topic.auto_hide' AND target = $1`,
      [`topic:${topic.id}`],
    );
    expect(audits).toEqual([{ actor: 'system' }]);
  });

  it('콘텐츠 연결이 없고 사용자가 고른 주제도 삭제되고 관심사가 함께 정리된다', async () => {
    // given — 재발행으로 유일한 콘텐츠가 다른 주제로 옮겨 원시 0건 + 관심사 행이 남은 상태
    const topic = await seedTopic('delete-with-interest', false);
    const user = await createUser('delete-viewer', UserRole.USER);
    await seedInterests(user.userId, [topic.id]);

    // when — 종전에는 fk_user_interests_topics 위반으로 500 이었다
    await request(app.getHttpServer())
      .delete(`/api/v1/admin/topics/${topic.id}`)
      .set('Authorization', adminAuth)
      .expect(HttpStatus.NO_CONTENT);

    // then
    const remaining = await dataSource.query<{ count: string }[]>(
      `SELECT COUNT(*) AS count FROM user_interests WHERE topic_id = $1`,
      [topic.id],
    );
    expect(Number(remaining[0].count)).toBe(0);
    const audits = await dataSource.query<{ after: unknown }[]>(
      `SELECT after FROM audit_logs WHERE action = 'topic.delete' AND target = $1`,
      [`topic:${topic.id}`],
    );
    expect(audits).toEqual([{ after: { removed_interest_count: 1 } }]);
  });

  // --- 헬퍼 ---

  const patchTopic = (topicId: string, body: object) =>
    request(app.getHttpServer())
      .patch(`/api/v1/admin/topics/${topicId}`)
      .set('Authorization', adminAuth)
      .send(body);

  async function findAdminTopic(
    topicId: string,
  ): Promise<Record<string, unknown> | undefined> {
    const response = await request(app.getHttpServer())
      .get('/api/v1/admin/topics')
      .set('Authorization', adminAuth)
      .expect(HttpStatus.OK);

    return (
      response.body as { items: (Record<string, unknown> & { id: string })[] }
    ).items.find((topic) => topic.id === topicId);
  }

  async function getInterestTopicIds(auth: string): Promise<string[]> {
    const response = await request(app.getHttpServer())
      .get('/api/v1/users/me/interests')
      .set('Authorization', auth)
      .expect(HttpStatus.OK);

    return (
      response.body as { interests: { topic_id: string }[] }
    ).interests.map((interest) => interest.topic_id);
  }

  /** 회수의 상태 전환만 흉내 낸다 — 판정 경로(`hideEmptyTopics`)를 트랜잭션 경계째로 조작하기 위해 */
  async function withdrawRow(
    manager: EntityManager,
    contentId: string,
  ): Promise<void> {
    await manager.query(
      `UPDATE contents SET status = $1, withdrawn_at = now() WHERE id = $2`,
      [ContentStatus.WITHDRAWN, contentId],
    );
  }

  function reloadTopic(topicId: string): Promise<Topic> {
    return dataSource.getRepository(Topic).findOneByOrFail({ id: topicId });
  }

  function seedTopic(label: string, isVisible: boolean): Promise<Topic> {
    const repository = dataSource.getRepository(Topic);

    return repository.save(
      repository.create({
        name: `E2E-EXP-${label}-${Date.now()}`,
        parentCategory: PARENT_CATEGORY,
        isVisible,
        displayOrder: 980,
      }),
    );
  }

  async function seedContent(
    topic: Topic,
    overrides: Partial<Pick<Content, 'status' | 'licenseExpiresAt'>> = {},
  ): Promise<Content> {
    const contentRepository = dataSource.getRepository(Content);
    const status = overrides.status ?? ContentStatus.PUBLISHED;
    const content = await contentRepository.save(
      contentRepository.create({
        title: `E2E 노출 콘텐츠 ${contentIds.length + 1}`,
        description: 'e2e 전용',
        authorName: '테스트',
        sourceName: 'E2E',
        sourceUrl: 'https://example.com/e2e',
        origin: ContentOrigin.AI_GENERATED,
        partnerId: null,
        seriesId: null,
        episodeNo: null,
        totalEpisodes: null,
        audioPath: `e2e-exposure/${contentIds.length}.mp3`,
        durationSec: 600,
        thumbnailUrl: 'https://example.com/e2e.png',
        contentVersion: 1,
        licenseExpiresAt: overrides.licenseExpiresAt ?? null,
        status,
        publishedAt: new Date(),
        withdrawnAt: status === ContentStatus.WITHDRAWN ? new Date() : null,
      }),
    );
    contentIds.push(content.id);

    const contentTopicRepository = dataSource.getRepository(ContentTopic);
    await contentTopicRepository.save(
      contentTopicRepository.create({
        contentId: content.id,
        topicId: topic.id,
      }),
    );

    return content;
  }

  /** 관리자 역할은 가입 경로로 만들 수 없다 — 행을 심고 같은 서명 키로 토큰을 발급한다 */
  async function createUser(
    label: string,
    role: UserRole,
  ): Promise<{ userId: string; auth: string }> {
    const repository = dataSource.getRepository(User);
    const user = await repository.save(
      repository.create({
        provider: SocialProvider.KAKAO,
        providerUserId: `e2e-exposure-${label}-${Date.now()}`,
        role,
        onboardingCompleted: true,
      }),
    );
    userIds.push(user.id);

    const token = app
      .get(JwtService)
      .sign(
        { sub: user.id, role: user.role, typ: 'access' },
        { expiresIn: 600 },
      );

    return { userId: user.id, auth: `Bearer ${token}` };
  }

  async function seedInterests(
    userId: string,
    topicIds: string[],
  ): Promise<void> {
    const repository = dataSource.getRepository(UserInterest);
    await repository.save(
      topicIds.map((topicId) =>
        repository.create({
          userId,
          topicId,
          source: UserInterestSource.MANUAL,
          isActive: true,
        }),
      ),
    );
  }

  /** 심은 데이터만 지운다. 사용자 관련 행은 `users` FK의 CASCADE로 함께 사라진다 */
  async function cleanUp(): Promise<void> {
    for (const userId of userIds) {
      await dataSource.query(`DELETE FROM users WHERE id = $1`, [userId]);
    }

    for (const contentId of contentIds) {
      await dataSource.query(`DELETE FROM contents WHERE id = $1`, [contentId]);
    }

    const topics = await dataSource.query<{ id: string }[]>(
      `SELECT id FROM topics WHERE parent_category = $1`,
      [PARENT_CATEGORY],
    );
    for (const { id } of topics) {
      await dataSource.query(`DELETE FROM audit_logs WHERE target = $1`, [
        `topic:${id}`,
      ]);
    }
    await dataSource.query(
      `DELETE FROM audit_logs WHERE target = ANY($1::text[])`,
      [contentIds.map((contentId) => `content:${contentId}`)],
    );
    await dataSource.query(`DELETE FROM topics WHERE parent_category = $1`, [
      PARENT_CATEGORY,
    ]);
  }
});
