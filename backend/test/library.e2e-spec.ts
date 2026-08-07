import 'dotenv/config';

import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';

import { AppModule } from '@/app.module';
import { ErrorCode } from '@/common/exceptions/error-code.enum';
import { traceIdMiddleware } from '@/common/middlewares/trace-id.middleware';
import { ContentOrigin, ContentStatus } from '@/modules/content/content.enum';
import { ContentTopic } from '@/modules/content/entities/content-topic.entity';
import { Content } from '@/modules/content/entities/content.entity';
import { Topic } from '@/modules/interest/entities/topic.entity';
import { LibraryItem } from '@/modules/library/library-item.entity';
import {
  LibraryItemSource,
  LibraryItemStatus,
} from '@/modules/library/library.enum';
import { PlaybackProgress } from '@/modules/playback/entities/playback-progress.entity';
import { SocialProvider } from '@/modules/user/user.enum';

/**
 * PRD 9.2 — **E2E 핵심 루프**: 온보딩 → 첫 드립 적립 → 라이브러리 노출 → 즉시 재생 →
 * 완청 신호. 그리고 **무료 사용자 시나리오**: 2편 재생 → 3편째 페이월.
 *
 * 재생 위치(`playback_progresses`)는 `player-api`가 소유하는 쓰기 경로라 아직 없다.
 * 완청 판정을 검증하기 위해 그 행만 직접 심는다 — **판정 자체는 서버가 하는지**를 보는
 * 것이 목적이므로, 클라이언트가 완료를 선언하는 경로로 대신하지 않는다.
 *
 * 이 테스트는 **자기 데이터를 직접 심고 끝나면 지운다.** 목 시드가 돌아 있든 아니든 같은
 * 결과가 나와야 한다.
 */
describe('라이브러리 E2E', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;

  const topicIds: string[] = [];
  const contentIds: string[] = [];
  const userIds: string[] = [];

  /** `plans.light.daily_play_limit` = 2 (domain.md 8.1) */
  const FREE_PLAY_LIMIT = 2;
  /** 첫 드립 2편 + 한도 밖 재생 대상 + 회수 대상까지 넉넉히 둔다 */
  const CATALOG_SIZE = 8;

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

    await seedCatalog();
  }, 60_000);

  afterAll(async () => {
    await cleanUp();
    await app.close();
  }, 60_000);

  // --- 시나리오 ---

  it('온보딩을 마치면 라이브러리에 드립이 보이고, 탭 한 번으로 재생·완청까지 이어진다', async () => {
    // given — 온보딩을 실제로 밟아 첫 드립을 받는다
    const { userId, auth } = await createOnboardedUser('loop');

    // when — 화면 진입
    const list = await get('/users/me/library-items', auth).expect(
      HttpStatus.OK,
    );
    const body = list.body as ListBody;

    // then — 통합 목록과 잔여 재생 표시값이 **같은 응답**에 온다
    expect(body.items).toHaveLength(2);
    expect(body.has_next).toBe(false);
    expect(body.next_cursor).toBeNull();
    expect(body.daily_play_limit).toBe(FREE_PLAY_LIMIT);
    expect(body.daily_play_count).toBe(0);
    expect(body.service_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const first = body.items[0];
    expect(first).toMatchObject({
      source: LibraryItemSource.DRIP,
      status: LibraryItemStatus.UNPLAYED,
      is_counted_today: false,
      // 재생 이력이 없으면 0으로 채우지 않고 비운다
      progress: null,
    });
    expect(first.content.topic_ids).toHaveLength(1);

    // 적립 시각 내림차순이다
    expect(new Date(body.items[0].added_at).getTime()).toBeGreaterThanOrEqual(
      new Date(body.items[1].added_at).getTime(),
    );

    // 아직 들은 것이 없으므로 미니플레이어에 띄울 것이 없다
    const emptyResume = await get(
      '/users/me/library-items/resume',
      auth,
    ).expect(HttpStatus.OK);
    expect(emptyResume.body).toMatchObject({
      resume_target: null,
      daily_play_limit: FREE_PLAY_LIMIT,
      daily_play_count: 0,
    });

    // when — 카드 탭 = 즉시 재생
    const played = await post(`/contents/${first.content.id}/play`, auth, {
      entry_point: 'library',
    }).expect(HttpStatus.OK);

    // then — 차감이 일어나고 상태가 전이된다
    expect(played.body).toMatchObject({
      counted: true,
      library_item: { id: first.id, status: LibraryItemStatus.IN_PROGRESS },
      daily_play_limit: FREE_PLAY_LIMIT,
      daily_play_count: 1,
    });

    // 목록을 다시 열면 서버 값으로 덮어써진다 — 클라이언트가 임의로 1을 빼지 않는다
    const afterPlay = await get('/users/me/library-items', auth).expect(
      HttpStatus.OK,
    );
    const afterPlayBody = afterPlay.body as ListBody;
    expect(afterPlayBody.daily_play_count).toBe(1);
    expect(
      afterPlayBody.items.find((item) => item.id === first.id),
    ).toMatchObject({
      status: LibraryItemStatus.IN_PROGRESS,
      is_counted_today: true,
    });

    // when — 90% 지점까지 도달한 상태를 만든다(재생 위치는 player-api 소유)
    await saveProgress(userId, first.content.id, 0.95);

    // then — 미니플레이어 복원 대상이 된다. **자동 재생 지시는 응답에 없다**
    const resume = await get('/users/me/library-items/resume', auth).expect(
      HttpStatus.OK,
    );
    const resumeBody = resume.body as ResumeBody;
    expect(resumeBody.resume_target).toMatchObject({
      id: first.id,
      is_counted_today: true,
    });
    expect(resumeBody.resume_target?.progress?.position_sec).toBeGreaterThan(0);
    expect(resumeBody).not.toHaveProperty('auto_play');

    // when — 완청 처리
    const completed = await post(
      `/users/me/library-items/${first.id}/complete`,
      auth,
      {},
    ).expect(HttpStatus.OK);

    // then
    expect(completed.body).toMatchObject({
      id: first.id,
      status: LibraryItemStatus.COMPLETED,
    });
    expect((completed.body as CompleteBody).completed_at).not.toBeNull();

    // 완료 탭에서 보이고, 완료된 것은 미니플레이어에 띄우지 않는다
    const completedTab = await get(
      '/users/me/library-items?filter=completed',
      auth,
    ).expect(HttpStatus.OK);
    expect((completedTab.body as ListBody).items).toHaveLength(1);

    const afterComplete = await get(
      '/users/me/library-items/resume',
      auth,
    ).expect(HttpStatus.OK);
    expect((afterComplete.body as ResumeBody).resume_target).toBeNull();
  }, 60_000);

  it('완청 기준에 못 미치면 상태를 바꾸지 않고 조용히 거절한다', async () => {
    // given — 서버가 `max_reached_sec`으로 다시 판정한다
    const { userId, auth } = await createOnboardedUser('not-reached');
    const items = await listItems(auth);
    const target = items[0];

    await post(`/contents/${target.content.id}/play`, auth, {
      entry_point: 'library',
    }).expect(HttpStatus.OK);
    await saveProgress(userId, target.content.id, 0.5);

    // when
    const response = await post(
      `/users/me/library-items/${target.id}/complete`,
      auth,
      {},
    ).expect(HttpStatus.CONFLICT);

    // then
    expect(response.body).toMatchObject({
      error_code: ErrorCode.LIBRARY_COMPLETION_NOT_REACHED,
      retryable: false,
    });

    const after = await listItems(auth);
    expect(after.find((item) => item.id === target.id)?.status).toBe(
      LibraryItemStatus.IN_PROGRESS,
    );
  }, 60_000);

  it('무료 사용자가 2편을 재생하면 3편째에 페이월이 열리고, 이미 튼 콘텐츠는 계속 들린다', async () => {
    // given
    const { auth } = await createOnboardedUser('paywall');
    const items = await listItems(auth);
    expect(items).toHaveLength(FREE_PLAY_LIMIT);

    // when — 한도만큼 재생한다
    for (const item of items) {
      const response = await post(`/contents/${item.content.id}/play`, auth, {
        entry_point: 'library',
      }).expect(HttpStatus.OK);
      expect((response.body as PlayBody).counted).toBe(true);
    }

    const exhausted = await get('/users/me/library-items', auth).expect(
      HttpStatus.OK,
    );
    expect((exhausted.body as ListBody).daily_play_count).toBe(FREE_PLAY_LIMIT);

    // then — 3편째는 페이월을 여는 코드로 막힌다
    const blockedContentId = contentIds.find(
      (id) => !items.some((item) => item.content.id === id),
    ) as string;
    const blocked = await post(`/contents/${blockedContentId}/play`, auth, {
      entry_point: 'explore',
    }).expect(HttpStatus.FORBIDDEN);
    expect(blocked.body).toMatchObject({
      error_code: ErrorCode.PLAY_LIMIT_EXCEEDED,
      retryable: false,
    });

    // 진입점을 바꿔도 판정은 같다 — 위조로 한도를 우회할 수 없다
    const blockedFromPush = await post(
      `/contents/${blockedContentId}/play`,
      auth,
      { entry_point: 'push' },
    ).expect(HttpStatus.FORBIDDEN);
    expect(blockedFromPush.body).toMatchObject({
      error_code: ErrorCode.PLAY_LIMIT_EXCEEDED,
    });

    // 한도를 소진했어도 오늘 이미 튼 콘텐츠는 차감 없이 이어들을 수 있다
    const replayed = await post(`/contents/${items[0].content.id}/play`, auth, {
      entry_point: 'miniplayer',
    }).expect(HttpStatus.OK);
    expect(replayed.body).toMatchObject({
      counted: false,
      daily_play_count: FREE_PLAY_LIMIT,
    });
  }, 60_000);

  it('라이브러리에 없는 콘텐츠를 재생해도 담기지 않는다', async () => {
    // given — 재생이 담기를 유발하면 라이브러리가 청취 이력으로 변한다
    const { userId, auth } = await createOnboardedUser('no-save');
    const items = await listItems(auth);
    const outsideContentId = contentIds.find(
      (id) => !items.some((item) => item.content.id === id),
    ) as string;

    // when
    const response = await post(`/contents/${outsideContentId}/play`, auth, {
      entry_point: 'explore',
    }).expect(HttpStatus.OK);

    // then
    expect(response.body).toMatchObject({ counted: true, library_item: null });

    const stored = await dataSource
      .getRepository(LibraryItem)
      .findBy({ userId });
    expect(stored.some((item) => item.contentId === outsideContentId)).toBe(
      false,
    );
  }, 60_000);

  it('삭제하면 목록에서 사라지고, 실행 취소하면 원래 순서로 돌아온다', async () => {
    // given
    const { auth } = await createOnboardedUser('delete');
    const items = await listItems(auth);
    const target = items[0];

    // when
    await remove(`/users/me/library-items/${target.id}`, auth).expect(
      HttpStatus.NO_CONTENT,
    );

    // then
    const afterDelete = await listItems(auth);
    expect(afterDelete.map((item) => item.id)).not.toContain(target.id);

    // 같은 삭제가 다시 도착해도 실패시키지 않는다(오프라인 큐 재전송)
    await remove(`/users/me/library-items/${target.id}`, auth).expect(
      HttpStatus.NO_CONTENT,
    );

    // when — 실행 취소
    const restored = await post(
      `/users/me/library-items/${target.id}/restore`,
      auth,
      {},
    ).expect(HttpStatus.OK);

    // then — 적립 시각이 그대로라 목록 순서가 바뀌지 않는다
    expect(restored.body).toMatchObject({
      id: target.id,
      added_at: target.added_at,
      deleted_at: null,
    });
    expect((await listItems(auth)).map((item) => item.id)).toEqual(
      items.map((item) => item.id),
    );
  }, 60_000);

  it('탭·주제 필터와 커서 페이지네이션이 조합되고, 조건이 바뀐 커서는 거절한다', async () => {
    // given — 드립 2건에 담기 2건을 더한다
    const { userId, auth } = await createOnboardedUser('filter');
    const dripped = await listItems(auth);
    const savedContentIds = contentIds
      .filter((id) => !dripped.some((item) => item.content.id === id))
      .slice(0, 2);
    await addSavedItems(userId, savedContentIds);

    // when — 통합 목록은 출처를 구분하지 않는다(FR-20)
    const all = await listItems(auth);

    // then
    expect(all).toHaveLength(4);
    expect(new Set(all.map((item) => item.source))).toEqual(
      new Set([LibraryItemSource.DRIP, LibraryItemSource.SAVE]),
    );

    // [이어 PICK] 탭은 드립만, 상태는 가리지 않는다
    const dripTab = await get(
      '/users/me/library-items?filter=drip',
      auth,
    ).expect(HttpStatus.OK);
    expect((dripTab.body as ListBody).items).toHaveLength(2);

    // 주제 필터 팝업은 **담긴 콘텐츠의 주제**를 개수와 함께 준다
    const topics = await get('/users/me/library-items/topics', auth).expect(
      HttpStatus.OK,
    );
    const topicBody = topics.body as TopicsBody;
    expect(topicBody.topics.length).toBeGreaterThan(0);
    expect(
      topicBody.topics.reduce((sum, topic) => sum + topic.item_count, 0),
    ).toBe(4);

    // 탭과 주제 필터는 AND다
    const combined = await get(
      `/users/me/library-items?filter=drip&topic_filter=${topicBody.topics[0].id}`,
      auth,
    ).expect(HttpStatus.OK);
    expect((combined.body as ListBody).items.length).toBeLessThanOrEqual(2);

    // when — 커서 페이지네이션
    const firstPage = await get('/users/me/library-items?limit=2', auth).expect(
      HttpStatus.OK,
    );
    const firstBody = firstPage.body as ListBody;
    expect(firstBody.items).toHaveLength(2);
    expect(firstBody.has_next).toBe(true);
    expect(firstBody.next_cursor).not.toBeNull();

    const secondPage = await get(
      `/users/me/library-items?limit=2&cursor=${encodeURIComponent(
        firstBody.next_cursor as string,
      )}`,
      auth,
    ).expect(HttpStatus.OK);
    const secondBody = secondPage.body as ListBody;
    expect(secondBody.items).toHaveLength(2);
    // 경계에서 항목이 반복되거나 사라지지 않는다
    expect(secondBody.items.map((item) => item.id)).not.toEqual(
      expect.arrayContaining(firstBody.items.map((i) => i.id)),
    );

    // then — 조건이 바뀐 커서를 이어 쓰면 두 조건이 섞인 목록이 만들어진다
    const rejected = await get(
      `/users/me/library-items?filter=drip&limit=2&cursor=${encodeURIComponent(
        firstBody.next_cursor as string,
      )}`,
      auth,
    ).expect(HttpStatus.BAD_REQUEST);
    expect(rejected.body).toMatchObject({
      error_code: ErrorCode.LIBRARY_CURSOR_INVALID,
    });
  }, 60_000);

  it('회수된 콘텐츠는 목록에서 빠지고 재생하면 제공 종료로 안내한다', async () => {
    // given
    const { auth } = await createOnboardedUser('withdrawn');
    const items = await listItems(auth);
    const target = items[0];

    // when — 파트너가 회수한다
    await dataSource
      .getRepository(Content)
      .update(
        { id: target.content.id },
        { status: ContentStatus.WITHDRAWN, withdrawnAt: new Date() },
      );

    // then — 목록에서 사라진다. `library_items` 행은 남는다
    const afterWithdrawn = await listItems(auth);
    expect(afterWithdrawn.map((item) => item.id)).not.toContain(target.id);

    // 이미 화면에 떠 있는 항목이 탭될 수 있으므로 재생에서도 다시 막는다
    const blocked = await post(`/contents/${target.content.id}/play`, auth, {
      entry_point: 'library',
    }).expect(HttpStatus.FORBIDDEN);
    expect(blocked.body).toMatchObject({
      error_code: ErrorCode.CONTENT_WITHDRAWN,
    });

    // 원상 복구 — 다른 시나리오가 같은 카탈로그를 쓴다
    await dataSource
      .getRepository(Content)
      .update(
        { id: target.content.id },
        { status: ContentStatus.PUBLISHED, withdrawnAt: null },
      );
  }, 60_000);

  it('남의 항목은 존재를 알리지 않고 찾을 수 없음으로 응답한다', async () => {
    // given — 403은 "그 항목이 존재한다"를 알려준다
    const owner = await createOnboardedUser('owner');
    const stranger = await createOnboardedUser('stranger');
    const ownerItems = await listItems(owner.auth);

    // when / then
    const response = await remove(
      `/users/me/library-items/${ownerItems[0].id}`,
      stranger.auth,
    ).expect(HttpStatus.NOT_FOUND);
    expect(response.body).toMatchObject({
      error_code: ErrorCode.LIBRARY_ITEM_NOT_FOUND,
    });
  }, 60_000);

  it('인증 없이 호출하면 401이다', async () => {
    // given / when
    const response = await request(app.getHttpServer())
      .get('/api/v1/users/me/library-items')
      .expect(HttpStatus.UNAUTHORIZED);

    // then
    expect(response.body).toMatchObject({ error_code: ErrorCode.UNAUTHORIZED });
  }, 60_000);

  // --- 헬퍼 ---

  interface ItemBody {
    id: string;
    source: string;
    status: string;
    added_at: string;
    is_counted_today: boolean;
    content: { id: string; duration_sec: number; topic_ids: string[] };
    progress: { position_sec: number; max_reached_sec: number } | null;
  }

  interface ListBody {
    items: ItemBody[];
    next_cursor: string | null;
    has_next: boolean;
    daily_play_limit: number | null;
    daily_play_count: number | null;
    service_date: string;
  }

  interface ResumeBody {
    resume_target: ItemBody | null;
    daily_play_limit: number | null;
    daily_play_count: number | null;
  }

  interface TopicsBody {
    topics: { id: string; name: string; item_count: number }[];
  }

  interface PlayBody {
    counted: boolean;
    library_item: { id: string; status: string } | null;
  }

  interface CompleteBody {
    completed_at: string | null;
  }

  interface AuthBody {
    status: string;
    signup_token?: string;
    access_token: string;
    user: { id: string };
  }

  const path = (suffix: string) => `/api/v1${suffix}`;

  const get = (suffix: string, auth: string) =>
    request(app.getHttpServer()).get(path(suffix)).set('Authorization', auth);

  const post = (suffix: string, auth: string, body: object) =>
    request(app.getHttpServer())
      .post(path(suffix))
      .set('Authorization', auth)
      .send(body);

  const remove = (suffix: string, auth: string) =>
    request(app.getHttpServer())
      .delete(path(suffix))
      .set('Authorization', auth);

  async function listItems(auth: string): Promise<ItemBody[]> {
    const response = await get('/users/me/library-items', auth).expect(
      HttpStatus.OK,
    );

    return (response.body as ListBody).items;
  }

  /**
   * 온보딩을 실제 엔드포인트로 밟아 첫 드립 2편을 받는다.
   * 담기는 건너뛴다 — 이 테스트의 관심사는 적립 경로가 아니라 라이브러리 화면이다.
   */
  async function createOnboardedUser(
    label: string,
  ): Promise<{ userId: string; auth: string }> {
    const providerToken = `e2e-lib-${label}-${Date.now()}-${Math.floor(
      Math.random() * 1_000_000,
    )}`;
    const deviceId = `e2e-lib-device-${label}`;

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
      .set('Idempotency-Key', `e2e-lib-signup-${providerToken}`)
      .send({
        signup_token: (login.body as AuthBody).signup_token,
        device_id: deviceId,
        consents: [
          { consent_type: 'terms', version: '0.1', is_agreed: true },
          { consent_type: 'privacy', version: '0.1', is_agreed: true },
        ],
      })
      .expect(HttpStatus.CREATED);

    const body = signUp.body as AuthBody;
    const auth = `Bearer ${body.access_token}`;
    userIds.push(body.user.id);

    await request(app.getHttpServer())
      .put(path('/onboarding/interests'))
      .set('Authorization', auth)
      .send({ topic_ids: topicIds })
      .expect(HttpStatus.OK);

    await request(app.getHttpServer())
      .post(path('/onboarding/complete'))
      .set('Authorization', auth)
      .set('Idempotency-Key', `e2e-lib-complete-${providerToken}`)
      .send({})
      .expect(HttpStatus.OK);

    await waitForFirstDrip(auth);

    return { userId: body.user.id, auth };
  }

  async function waitForFirstDrip(auth: string): Promise<void> {
    for (let attempt = 0; attempt < 50; attempt++) {
      const response = await get('/onboarding/first-drip', auth).expect(
        HttpStatus.OK,
      );

      if ((response.body as { status: string }).status !== 'pending') {
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    throw new Error('first drip did not settle within the polling window');
  }

  /** `player-api`가 아직 없으므로 재생 위치만 직접 심는다 */
  async function saveProgress(
    userId: string,
    contentId: string,
    ratio: number,
  ): Promise<void> {
    const content = await dataSource
      .getRepository(Content)
      .findOneByOrFail({ id: contentId });
    const reached = Math.floor(content.durationSec * ratio);

    await dataSource.getRepository(PlaybackProgress).save({
      userId,
      contentId,
      positionSec: reached,
      maxReachedSec: reached,
    });
  }

  /** 탐색 담기(`explore.md` 4.3)가 아직 없으므로 `source = save` 행만 직접 심는다 */
  async function addSavedItems(
    userId: string,
    savedContentIds: string[],
  ): Promise<void> {
    const repository = dataSource.getRepository(LibraryItem);
    const now = Date.now();

    await repository.save(
      savedContentIds.map((contentId, index) =>
        repository.create({
          userId,
          contentId,
          source: LibraryItemSource.SAVE,
          status: LibraryItemStatus.UNPLAYED,
          addedAt: new Date(now - (index + 1) * 60_000),
        }),
      ),
    );
  }

  async function seedCatalog(): Promise<void> {
    const topicRepository = dataSource.getRepository(Topic);
    const contentRepository = dataSource.getRepository(Content);
    const contentTopicRepository = dataSource.getRepository(ContentTopic);
    const now = new Date();

    const topic = await topicRepository.save(
      topicRepository.create({
        name: 'E2E-LIB',
        parentCategory: 'E2E-LIB',
        isVisible: true,
        displayOrder: 990,
      }),
    );
    topicIds.push(topic.id);

    for (let index = 0; index < CATALOG_SIZE; index++) {
      const content = await contentRepository.save(
        contentRepository.create({
          title: `E2E 라이브러리 콘텐츠 ${index + 1}`,
          description: 'e2e 전용',
          authorName: '테스트',
          sourceName: 'E2E',
          sourceUrl: 'https://example.com/e2e',
          origin: ContentOrigin.AI_GENERATED,
          partnerId: null,
          seriesId: null,
          episodeNo: null,
          totalEpisodes: null,
          audioPath: `e2e-lib/${index}.mp3`,
          durationSec: 600 + index,
          thumbnailUrl: 'https://example.com/e2e.png',
          contentVersion: 1,
          licenseExpiresAt: null,
          status: ContentStatus.PUBLISHED,
          publishedAt: new Date(now.getTime() - index * 60_000),
          withdrawnAt: null,
        }),
      );
      contentIds.push(content.id);

      await contentTopicRepository.save(
        contentTopicRepository.create({
          contentId: content.id,
          topicId: topic.id,
        }),
      );
    }
  }

  /** 심은 데이터만 지운다. 사용자 관련 행은 `users` FK의 CASCADE로 함께 사라진다 */
  async function cleanUp(): Promise<void> {
    for (const userId of userIds) {
      await dataSource.query(`DELETE FROM users WHERE id = $1`, [userId]);
    }

    await dataSource.query(
      `DELETE FROM idempotency_keys WHERE idempotency_key LIKE 'e2e-lib-%'`,
    );

    for (const contentId of contentIds) {
      await dataSource.query(`DELETE FROM contents WHERE id = $1`, [contentId]);
    }

    await dataSource.query(
      `DELETE FROM topics WHERE parent_category = 'E2E-LIB'`,
    );
  }
});
