import 'dotenv/config';

import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';

import { AppModule } from '@/app.module';
import { ErrorCode } from '@/common/exceptions/error-code.enum';
import { traceIdMiddleware } from '@/common/middlewares/trace-id.middleware';
import {
  ContentLanguage,
  ContentOrigin,
  ContentStatus,
  SeriesStatus,
} from '@/modules/content/content.enum';
import { ContentTopic } from '@/modules/content/entities/content-topic.entity';
import { Content } from '@/modules/content/entities/content.entity';
import { Series } from '@/modules/content/entities/series.entity';
import { DripBatchOrchestrator } from '@/modules/drip-batch/drip-batch.orchestrator';
import { UserInterest } from '@/modules/interest/entities/user-interest.entity';
import { Topic } from '@/modules/interest/entities/topic.entity';
import { UserInterestSource } from '@/modules/interest/interest.enum';
import { RetentionPushRepository } from '@/modules/retention-push/retention-push.repository';
import { SeriesPaywallService } from '@/modules/subscription/services/series-paywall.service';
import { User } from '@/modules/user/entities/user.entity';
import {
  SocialProvider,
  UserMarket,
  UserRole,
  UserTier,
} from '@/modules/user/user.enum';

interface ErrorBody {
  error_code: string;
  message: string;
  retryable: boolean;
}

interface Actor {
  user: User;
  auth: string;
}

/**
 * 시리즈 유료화 E2E(KAN-290 — `experiments-api.md` 4.2) — 실제 DB 위에서 5부작 시리즈의 4편부터가 프로·체험이 아닌 사용자에게
 * 잠기는지 본다: 재생 게이트(오디오 URL·재생 시작·다시 듣기·대본)의 403 `SERIES_EPISODE_LOCKED`와 차감 없음, 잠금이 한도보다
 * 먼저인 것, 응답의 `is_locked`(시리즈·상세·탐색·라이브러리), 드립 연속 편, 리텐션 "듣던 콘텐츠", 스위치 끔.
 *
 * 스위치는 앱의 ConfigService 에 넣는다 — CI 는 `.env.example`(빈 값)을 복사해 쓰므로 process.env 를 바꿔도 소용없다
 * (`drip-arrival-ab.e2e-spec.ts`와 같다). 판정은 부를 때마다 설정을 읽는다.
 * 초대 코드 Pro 는 지급 중 `users.tier = pro`로 적힌다(promotion.orchestrator `syncUserTier`) — 여기서는 그 결과 상태로 둔다.
 */
describe('시리즈 유료화 E2E (KAN-290)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let configService: ConfigService;
  const STAMP = `e2e-spaywall-${Date.now().toString(36)}`;
  const path = (p: string) => `/api/v1${p}`;
  const userIds: string[] = [];
  const contentIds: string[] = [];
  let topic: Topic;
  let seriesId: string;
  /** 편 번호(1~5) → 콘텐츠 id */
  const episode: Record<number, string> = {};
  let userCount = 0;

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
    configService = app.get(ConfigService);

    const topics = dataSource.getRepository(Topic);
    topic = await topics.save(
      topics.create({
        name: `${STAMP}-topic`,
        parentCategory: STAMP,
        isVisible: true,
        displayOrder: 981,
        market: UserMarket.KR,
      }),
    );
    const seriesRepository = dataSource.getRepository(Series);
    const series = await seriesRepository.save(
      seriesRepository.create({
        title: `${STAMP} 시리즈`,
        description: '소개',
        totalEpisodes: 5,
        status: SeriesStatus.COMPLETED,
      }),
    );
    seriesId = series.id;
    for (const episodeNo of [1, 2, 3, 4, 5]) {
      episode[episodeNo] = await seedEpisode(episodeNo);
    }
  }, 60_000);

  beforeEach(() => {
    configService.set('SERIES_PAYWALL_ENABLED', 'true');
    configService.set('SERIES_FREE_EPISODES', '');
  });

  afterAll(async () => {
    configService.set('SERIES_PAYWALL_ENABLED', '');
    await dataSource.query(`DELETE FROM users WHERE id = ANY($1)`, [userIds]);
    await dataSource.query(`DELETE FROM contents WHERE id = ANY($1)`, [
      contentIds,
    ]);
    await dataSource.query(`DELETE FROM series WHERE id = $1`, [seriesId]);
    await dataSource.query(`DELETE FROM topics WHERE id = $1`, [topic.id]);
    await app.close();
  }, 60_000);

  it('무료 사용자의 4편은 오디오 URL·재생 시작·다시 듣기·대본이 403 SERIES_EPISODE_LOCKED 이고 차감되지 않는다', async () => {
    const free = await createUser('free', UserTier.LIGHT);

    const issued = await issue(free, episode[4]).expect(HttpStatus.FORBIDDEN);
    expect(issued.body as ErrorBody).toMatchObject({
      error_code: ErrorCode.SERIES_EPISODE_LOCKED,
      message: '이 편은 프로 구독에서 들을 수 있어요',
      retryable: false,
    });
    await play(free, episode[4])
      .expect(HttpStatus.FORBIDDEN)
      .expect((res) =>
        expect((res.body as ErrorBody).error_code).toBe(
          ErrorCode.SERIES_EPISODE_LOCKED,
        ),
      );
    await request(app.getHttpServer())
      .get(path(`/contents/${episode[4]}/script`))
      .set('Authorization', free.auth)
      .expect(HttpStatus.FORBIDDEN)
      .expect((res) =>
        expect((res.body as ErrorBody).error_code).toBe(
          ErrorCode.SERIES_EPISODE_LOCKED,
        ),
      );
    await request(app.getHttpServer())
      .post(path(`/contents/${episode[4]}/replay`))
      .set('Authorization', free.auth)
      .set('Idempotency-Key', `${STAMP}-replay-${free.user.id}`)
      .expect(HttpStatus.FORBIDDEN)
      .expect((res) =>
        expect((res.body as ErrorBody).error_code).toBe(
          ErrorCode.SERIES_EPISODE_LOCKED,
        ),
      );

    // 차감 없음 — 재생 기록·신호가 남지 않는다
    expect(await countPlayRecords(free.user.id)).toBe(0);
    expect(await countSignals(free.user.id)).toBe(0);

    // 1~3편은 무료 사용자도 듣는다(종전 판정 — 차감)
    const allowed = await play(free, episode[3]).expect(HttpStatus.OK);
    expect((allowed.body as { counted: boolean }).counted).toBe(true);
    expect(await countPlayRecords(free.user.id)).toBe(1);
  });

  it('한도와 잠금이 둘 다 해당하면 잠금이 이긴다 — 한도 시트가 아니라 잠금 시트', async () => {
    const free = await createUser('limit', UserTier.LIGHT);
    // 무료 한도(하루 2편)를 1~2편으로 소진한다
    await play(free, episode[1]).expect(HttpStatus.OK);
    await play(free, episode[2]).expect(HttpStatus.OK);

    // 무료 편(3편)은 한도에 걸린다
    await play(free, episode[3])
      .expect(HttpStatus.FORBIDDEN)
      .expect((res) =>
        expect((res.body as ErrorBody).error_code).toBe(
          ErrorCode.PLAY_LIMIT_EXCEEDED,
        ),
      );
    // 잠긴 편(4편)은 잠금이다
    await play(free, episode[4])
      .expect(HttpStatus.FORBIDDEN)
      .expect((res) =>
        expect((res.body as ErrorBody).error_code).toBe(
          ErrorCode.SERIES_EPISODE_LOCKED,
        ),
      );
    expect(await countPlayRecords(free.user.id)).toBe(2);
  });

  it('프로(초대 코드 Pro 포함)·가입 체험 중이면 4편 이후도 재생된다 — 데일리는 잠긴다', async () => {
    const pro = await createUser('pro', UserTier.PRO);
    const trial = await createUser(
      'trial',
      UserTier.LIGHT,
      new Date(Date.now() + 2 * 86_400_000),
    );
    const daily = await createUser('daily', UserTier.DAILY);

    for (const actor of [pro, trial]) {
      await play(actor, episode[5]).expect(HttpStatus.OK);
      await issue(actor, episode[4]).expect(HttpStatus.CREATED);
      await request(app.getHttpServer())
        .get(path(`/contents/${episode[4]}/script`))
        .set('Authorization', actor.auth)
        .expect(HttpStatus.OK);
    }
    await play(daily, episode[4]).expect(HttpStatus.FORBIDDEN);
  });

  it('응답의 is_locked — 시리즈 편 목록·콘텐츠 상세·탐색 목록·라이브러리가 사용자 티어에 맞게 싣는다', async () => {
    const free = await createUser('fields-free', UserTier.LIGHT);
    const pro = await createUser('fields-pro', UserTier.PRO);

    // 시리즈 편 목록 — 1~3편 false, 4~5편 true(무료) / 전부 false(프로)
    expect(await seriesLocks(free)).toEqual([false, false, false, true, true]);
    expect(await seriesLocks(pro)).toEqual([false, false, false, false, false]);

    // 콘텐츠 상세 — 최상위와 content 둘 다
    const detail = await request(app.getHttpServer())
      .get(path(`/contents/${episode[4]}`))
      .set('Authorization', free.auth)
      .expect(HttpStatus.OK);
    const detailBody = detail.body as {
      is_locked: boolean;
      content: { is_locked: boolean };
    };
    expect(detailBody.is_locked).toBe(true);
    expect(detailBody.content.is_locked).toBe(true);
    const detailPro = await request(app.getHttpServer())
      .get(path(`/contents/${episode[4]}`))
      .set('Authorization', pro.auth)
      .expect(HttpStatus.OK);
    expect((detailPro.body as { is_locked: boolean }).is_locked).toBe(false);

    // 탐색 주제 목록 — 콘텐츠 카드마다
    expect(await exploreLocks(free)).toEqual({
      [episode[1]]: false,
      [episode[2]]: false,
      [episode[3]]: false,
      [episode[4]]: true,
      [episode[5]]: true,
    });
    expect(Object.values(await exploreLocks(pro))).not.toContain(true);

    // 라이브러리 — 이미 담긴 4편도 잠긴다(예외 없음)
    await save(free, episode[4]);
    await save(free, episode[2]);
    const library = await request(app.getHttpServer())
      .get(path('/users/me/library-items?limit=50'))
      .set('Authorization', free.auth)
      .expect(HttpStatus.OK);
    const lockByContent = Object.fromEntries(
      (
        library.body as {
          items: { content: { id: string; is_locked: boolean } }[];
        }
      ).items.map((item) => [item.content.id, item.content.is_locked]),
    );
    expect(lockByContent).toEqual({
      [episode[4]]: true,
      [episode[2]]: false,
    });
  });

  it('스위치를 끄면 잠그지 않는다 — is_locked 는 전부 false, 4편 재생도 된다', async () => {
    configService.set('SERIES_PAYWALL_ENABLED', '');
    const free = await createUser('off', UserTier.LIGHT);

    expect(await seriesLocks(free)).toEqual([
      false,
      false,
      false,
      false,
      false,
    ]);
    await play(free, episode[4]).expect(HttpStatus.OK);
  });

  it('무료 편수 설정을 따른다 — SERIES_FREE_EPISODES=4 면 5편만 잠긴다', async () => {
    configService.set('SERIES_FREE_EPISODES', '4');
    const free = await createUser('free4', UserTier.LIGHT);

    expect(await seriesLocks(free)).toEqual([false, false, false, false, true]);
  });

  it('드립 — 3편까지 완청한 무료 사용자에게 4편이 오지 않는다. 프로에게는 4편이 간다', async () => {
    const free = await createUser('drip-free', UserTier.LIGHT);
    const pro = await createUser('drip-pro', UserTier.PRO);
    for (const actor of [free, pro]) {
      await addInterest(actor.user.id);
      for (const episodeNo of [1, 2, 3]) {
        await addCompleted(actor.user.id, episode[episodeNo]);
      }
    }

    const picksOf = async (actor: Actor) => {
      const plan = await app
        .get(DripBatchOrchestrator)
        .planForUser(
          await dataSource
            .getRepository(User)
            .findOneByOrFail({ id: actor.user.id }),
          new Date(),
          new Map(),
          {
            persistPreference: false,
            persistAutoExpand: false,
            stopAtSkip: false,
            loadRecentDripTopics: false,
          },
        );
      return (plan.regular?.picks ?? []).map((pick) => pick.content.id);
    };

    const freePicks = await picksOf(free);
    expect(freePicks).not.toContain(episode[4]);
    expect(freePicks).not.toContain(episode[5]);
    expect(await picksOf(pro)).toContain(episode[4]);

    // 스위치를 끄면 무료 사용자도 4편이 다음 편이다(종전)
    configService.set('SERIES_PAYWALL_ENABLED', '');
    expect(await picksOf(free)).toContain(episode[4]);
  });

  it('리텐션 알림 "듣던 콘텐츠"는 잠긴 편을 고르지 않는다', async () => {
    const free = await createUser('resume-free', UserTier.LIGHT);
    const pro = await createUser('resume-pro', UserTier.PRO);
    for (const actor of [free, pro]) {
      await addInProgress(actor.user.id, episode[4]);
    }
    const now = new Date();
    const factsWith = async () =>
      app.get(RetentionPushRepository).findUserFacts({
        userIds: [free.user.id, pro.user.id],
        weekDates: [],
        listenedSince: new Date(now.getTime() - 86_400_000),
        playDatesSince: '2000-01-01',
        resumeSince: new Date(now.getTime() - 3 * 86_400_000),
        shortCohortSince: null,
        seriesLock: await app.get(SeriesPaywallService).resolveSqlParams(),
        now,
      });
    const resumeOf = (rows: Awaited<ReturnType<typeof factsWith>>) =>
      Object.fromEntries(
        rows.map((row) => [row.userId, row.resume?.contentId ?? null]),
      );

    expect(resumeOf(await factsWith())).toEqual({
      [free.user.id]: null,
      [pro.user.id]: episode[4],
    });

    configService.set('SERIES_PAYWALL_ENABLED', '');
    expect(resumeOf(await factsWith())[free.user.id]).toBe(episode[4]);
  });

  // ── 도우미 ──────────────────────────────────────────────────────────

  function issue(actor: Actor, contentId: string) {
    return request(app.getHttpServer())
      .post(path(`/contents/${contentId}/audio-urls`))
      .set('Authorization', actor.auth)
      .send({ device_id: `${STAMP}-device` });
  }

  /** 재생 시작은 200 이다(play.controller `@HttpCode(OK)`) */
  function play(actor: Actor, contentId: string) {
    return request(app.getHttpServer())
      .post(path(`/contents/${contentId}/play`))
      .set('Authorization', actor.auth)
      .send({ entry_point: 'explore' });
  }

  async function save(actor: Actor, contentId: string): Promise<void> {
    await request(app.getHttpServer())
      .post(path(`/contents/${contentId}/save`))
      .set('Authorization', actor.auth)
      .send({ client_seq: 1 })
      .expect((res) => {
        expect([HttpStatus.OK, HttpStatus.CREATED]).toContain(res.status);
      });
  }

  async function seriesLocks(actor: Actor): Promise<boolean[]> {
    const response = await request(app.getHttpServer())
      .get(path(`/series/${seriesId}`))
      .set('Authorization', actor.auth)
      .expect(HttpStatus.OK);
    return (
      response.body as {
        episodes: { episode_no: number; content: { is_locked: boolean } }[];
      }
    ).episodes
      .sort((a, b) => a.episode_no - b.episode_no)
      .map((item) => item.content.is_locked);
  }

  async function exploreLocks(actor: Actor): Promise<Record<string, boolean>> {
    const response = await request(app.getHttpServer())
      .get(path(`/explore/contents?topic_ids=${topic.id}&limit=50`))
      .set('Authorization', actor.auth)
      .expect(HttpStatus.OK);
    return Object.fromEntries(
      (
        response.body as {
          items: { content?: { id: string; is_locked: boolean } }[];
        }
      ).items
        .filter((item) => item.content !== undefined)
        .map((item) => [item.content!.id, item.content!.is_locked]),
    );
  }

  async function countPlayRecords(userId: string): Promise<number> {
    const [{ count }] = await dataSource.query<{ count: number }[]>(
      `SELECT count(*)::int AS count FROM play_records WHERE user_id = $1`,
      [userId],
    );
    return count;
  }

  async function countSignals(userId: string): Promise<number> {
    const [{ count }] = await dataSource.query<{ count: number }[]>(
      `SELECT count(*)::int AS count FROM user_signals WHERE user_id = $1`,
      [userId],
    );
    return count;
  }

  async function addInterest(userId: string): Promise<void> {
    const interests = dataSource.getRepository(UserInterest);
    await interests.save(
      interests.create({
        userId,
        topicId: topic.id,
        source: UserInterestSource.ONBOARDING,
        isActive: true,
      }),
    );
  }

  /** 완청한 편 — 라이브러리 completed 행(완청 판정의 한 갈래) + 드립 영구 제외(들은 편) */
  async function addCompleted(userId: string, contentId: string) {
    const at = new Date(Date.now() - 2 * 86_400_000);
    await dataSource.query(
      `INSERT INTO library_items (user_id, content_id, source, status, added_at, completed_at)
       VALUES ($1, $2, 'drip', 'completed', $3, $3)`,
      [userId, contentId, at],
    );
  }

  /** 듣던 편 — 진행 중 라이브러리 행 + 남은 시간 5분인 재생 위치 */
  async function addInProgress(userId: string, contentId: string) {
    await dataSource.query(
      `INSERT INTO library_items (user_id, content_id, source, status, added_at)
       VALUES ($1, $2, 'save', 'in_progress', now() - interval '1 day')`,
      [userId, contentId],
    );
    await dataSource.query(
      `INSERT INTO playback_progresses (user_id, content_id, position_sec, max_reached_sec, updated_at)
       VALUES ($1, $2, 300, 300, now() - interval '1 hour')`,
      [userId, contentId],
    );
  }

  async function createUser(
    label: string,
    tier: UserTier,
    trialEndsAt: Date | null = null,
  ): Promise<Actor> {
    const repository = dataSource.getRepository(User);
    const user = await repository.save(
      repository.create({
        provider: SocialProvider.KAKAO,
        providerUserId: `${STAMP}-${label}-${++userCount}`,
        role: UserRole.USER,
        onboardingCompleted: true,
        market: UserMarket.KR,
        tier,
        trialEndsAt,
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
    return { user, auth: `Bearer ${token}` };
  }

  async function seedEpisode(episodeNo: number): Promise<string> {
    const repository = dataSource.getRepository(Content);
    const content = await repository.save(
      repository.create({
        title: `${STAMP} ${episodeNo}편`,
        description: 'e2e 시리즈 유료화 전용',
        authorName: null,
        sourceName: 'E2E',
        sourceUrl: null,
        origin: ContentOrigin.AI_GENERATED,
        partnerId: null,
        seriesId,
        episodeNo,
        totalEpisodes: 5,
        audioPath: `${STAMP}/${episodeNo}.mp3`,
        durationSec: 600,
        thumbnailUrl: 'https://example.com/e2e-spaywall.png',
        contentVersion: 1,
        licenseExpiresAt: null,
        status: ContentStatus.PUBLISHED,
        // 과거로 둔다 — 병렬로 도는 다른 스위트의 "새로 나온" 섹션을 밀어내지 않게
        publishedAt: new Date(Date.UTC(2020, 0, 1, 0, episodeNo)),
        withdrawnAt: null,
        market: UserMarket.KR,
        language: ContentLanguage.KO,
      }),
    );
    contentIds.push(content.id);
    await dataSource
      .getRepository(ContentTopic)
      .save(
        dataSource
          .getRepository(ContentTopic)
          .create({ contentId: content.id, topicId: topic.id }),
      );
    return content.id;
  }
});
