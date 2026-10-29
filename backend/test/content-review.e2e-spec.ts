import 'dotenv/config';
import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';

import { AppModule } from '@/app.module';
import { ErrorCode } from '@/common/exceptions/error-code.enum';
import { traceIdMiddleware } from '@/common/middlewares/trace-id.middleware';
import {
  shiftServiceDate,
  toServiceDate,
} from '@/common/utils/service-date.util';
import { ContentOrigin, ContentStatus } from '@/modules/content/content.enum';
import { Content } from '@/modules/content/entities/content.entity';
import { SocialProvider, UserMarket } from '@/modules/user/user.enum';

interface SignUpBody {
  access_token: string;
  user: { id: string };
}
interface LoginBody {
  signup_token?: string;
  access_token?: string;
}
interface ReviewBody {
  stars: number;
  text: string | null;
  is_completed: boolean;
  content_version: number;
  created_at: string;
  updated_at: string;
}
interface SheetBody {
  enabled: boolean;
  reviewable: boolean;
  reason: string | null;
  review: ReviewBody | null;
  reward_progress: unknown;
}
interface SaveBody {
  review: ReviewBody;
  reward_progress: unknown;
  issued_promotion: unknown;
}
interface PromptBody {
  enabled: boolean;
  show: boolean;
  item: { content_id: string; completed_date: string } | null;
  reward_progress: unknown;
  muted_until: string | null;
}
interface SummaryBody {
  totals: {
    reviews: number;
    average_stars: number | null;
    text_reviews: number;
    reviewed_contents: number;
  };
  promotions: Record<string, number>;
  items: Record<string, unknown>[];
}
interface ListBody {
  items: Record<string, unknown>[];
  next_cursor: string | null;
}

const DAY = 24 * 60 * 60 * 1000;

/**
 * 콘텐츠 후기 E2E(KAN-279 1단계 — `content-review-api.md` 4.1~4.5 · 4.8 · 4.9) — 실제 DB 위에서 밟는다.
 *
 * 재생 시작 · 완청은 재생 API 를 거치지 않고 `playback_progresses` · `play_records` · `library_items` · `user_signals`에 직접
 * 넣는다. 검증 대상은 재생이 아니라 "그 사실 위에서 후기를 받고 묻는가"다. 스위치는 ConfigService 를 바꿔 켠다.
 */
describe('콘텐츠 후기 E2E', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let configService: ConfigService;
  const userIds: string[] = [];
  const contentIds: string[] = [];
  const now = new Date();
  const today = toServiceDate(now);

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
  }, 60_000);

  beforeEach(() => {
    configService.set('CONTENT_REVIEW_ENABLED', 'true');
  });

  afterAll(async () => {
    for (const userId of userIds) {
      await dataSource.query(`DELETE FROM users WHERE id = $1`, [userId]);
    }
    await dataSource.query(
      `DELETE FROM idempotency_keys WHERE idempotency_key LIKE 'e2e-cr-%'`,
    );
    for (const contentId of contentIds) {
      await dataSource.query(`DELETE FROM contents WHERE id = $1`, [contentId]);
    }
    await app.close();
  }, 60_000);

  it('스위치가 꺼져 있으면 시트 enabled=false · reason=disabled, 저장 409 CONTENT_REVIEW_DISABLED, 먼저 묻기 show=false', async () => {
    configService.set('CONTENT_REVIEW_ENABLED', '');
    const { userId, auth } = await createUser('off');
    const [contentId] = await seedContents(1);
    await startPlaying(userId, contentId);
    await completeInLibrary(userId, contentId, new Date(now.getTime() - DAY));

    const sheet = (await get(`/contents/${contentId}/review`, auth).expect(200))
      .body as SheetBody;
    expect(sheet).toEqual({
      enabled: false,
      reviewable: false,
      reason: 'disabled',
      review: null,
      reward_progress: null,
    });

    const saved = await put(`/contents/${contentId}/review`, auth, {
      stars: 4,
    }).expect(HttpStatus.CONFLICT);
    expect(saved.body).toMatchObject({
      error_code: ErrorCode.CONTENT_REVIEW_DISABLED,
      retryable: false,
    });

    const prompt = (
      await get('/users/me/content-review/prompt', auth).expect(200)
    ).body as PromptBody;
    expect(prompt).toEqual({
      enabled: false,
      show: false,
      item: null,
      reward_progress: null,
      muted_until: null,
    });
    expect(await reviewCount(userId)).toBe(0);
  }, 60_000);

  it('토큰이 없으면 모든 후기 경로가 401, 일반 사용자의 관리자 경로는 403', async () => {
    const { auth } = await createUser('auth');
    const contentId = '00000000-0000-4000-8000-000000000000';

    const server = () => request(app.getHttpServer());
    const calls = [
      () => server().get(path(`/contents/${contentId}/review`)),
      () =>
        server()
          .put(path(`/contents/${contentId}/review`))
          .send({ stars: 3 }),
      () => server().get(path('/users/me/content-review/prompt')),
      () => server().post(path('/users/me/content-review/prompt/dismiss')),
      () => server().post(path('/users/me/content-review/prompt/mute')),
      () => server().get(path('/admin/content-reviews/summary')),
      () => server().get(path('/admin/content-reviews')),
    ];
    for (const call of calls) {
      await call().expect(HttpStatus.UNAUTHORIZED);
    }

    await get('/admin/content-reviews/summary', auth).expect(
      HttpStatus.FORBIDDEN,
    );
    await get('/admin/content-reviews', auth).expect(HttpStatus.FORBIDDEN);
  }, 60_000);

  it('들어 본 편에 후기를 저장하고 다시 열면 채워져 있다 — 고치면 그 시점의 완청 여부 · 편 버전으로 다시 적는다', async () => {
    const { userId, auth } = await createUser('happy');
    const [contentId] = await seedContents(1);
    await startPlaying(userId, contentId);

    // given — 재생만 시작한 편(끝까지 안 들음)
    const before = (
      await get(`/contents/${contentId}/review`, auth).expect(200)
    ).body as SheetBody;
    expect(before).toMatchObject({
      enabled: true,
      reviewable: true,
      reason: null,
      review: null,
      reward_progress: null,
    });

    // when — 앞뒤 공백이 있는 글로 별 4개
    const first = (
      await put(`/contents/${contentId}/review`, auth, {
        stars: 4,
        text: '  비유가 쉬워서 출근길에 듣기 좋았어요  ',
      }).expect(HttpStatus.OK)
    ).body as SaveBody;

    // then
    expect(first).toMatchObject({
      review: {
        stars: 4,
        text: '비유가 쉬워서 출근길에 듣기 좋았어요',
        is_completed: false,
        content_version: 1,
      },
      reward_progress: null,
      issued_promotion: null,
    });
    const reopened = (
      await get(`/contents/${contentId}/review`, auth).expect(200)
    ).body as SheetBody;
    expect(reopened.review).toEqual(first.review);

    // 끝까지 듣고 재발행(버전 2) 뒤 고친다 — 글은 빈 값 = 지움
    await completeInLibrary(userId, contentId, now);
    await dataSource.query(
      `UPDATE contents SET content_version = 2 WHERE id = $1`,
      [contentId],
    );
    const second = (
      await put(`/contents/${contentId}/review`, auth, {
        stars: 2,
        text: '   ',
      }).expect(HttpStatus.OK)
    ).body as SaveBody;
    expect(second.review).toMatchObject({
      stars: 2,
      text: null,
      is_completed: true,
      content_version: 2,
      created_at: first.review.created_at,
    });
    expect(new Date(second.review.updated_at).getTime()).toBeGreaterThanOrEqual(
      new Date(first.review.updated_at).getTime(),
    );
    // 한 사람 · 한 편 한 행 — 덮어썼다
    expect(await reviewCount(userId)).toBe(1);
    const [row] = await dataSource.query<{ market: string }[]>(
      `SELECT market FROM content_reviews WHERE user_id = $1`,
      [userId],
    );
    expect(row.market).toBe(UserMarket.KR);
  }, 60_000);

  it('재생 기록(play_records)만 있어도 들어 본 편이다 — 라이브러리 담기만으로는 아니다', async () => {
    const { userId, auth } = await createUser('records');
    const [recorded, savedOnly] = await seedContents(2);
    await dataSource.query(
      `INSERT INTO play_records (user_id, content_id, play_date, played_at, listened_sec, is_counted)
       VALUES ($1, $2, $3, now(), 30, true)`,
      [userId, recorded, today],
    );
    await dataSource.query(
      `INSERT INTO library_items (user_id, content_id, source, status, added_at)
       VALUES ($1, $2, 'save', 'unplayed', now())`,
      [userId, savedOnly],
    );

    await put(`/contents/${recorded}/review`, auth, { stars: 5 }).expect(200);

    const sheet = (await get(`/contents/${savedOnly}/review`, auth).expect(200))
      .body as SheetBody;
    expect(sheet).toMatchObject({ reviewable: false, reason: 'not_played' });
    const rejected = await put(`/contents/${savedOnly}/review`, auth, {
      stars: 5,
    }).expect(HttpStatus.CONFLICT);
    expect(rejected.body).toMatchObject({
      error_code: ErrorCode.CONTENT_REVIEW_NOT_PLAYED,
    });
  }, 60_000);

  it('회수된 편은 시트가 withdrawn(내 후기는 남음) · 저장 403, 없는 편 · 다른 시장 편은 404', async () => {
    const { userId, auth } = await createUser('withdrawn');
    const [withdrawn, global] = await seedContents(2);
    await dataSource.query(
      `UPDATE contents SET market = 'global' WHERE id = $1`,
      [global],
    );
    await startPlaying(userId, withdrawn);
    await startPlaying(userId, global);
    await put(`/contents/${withdrawn}/review`, auth, {
      stars: 3,
      text: '회수 전에 남긴 글',
    }).expect(200);
    await dataSource.query(
      `UPDATE contents SET status = $2, withdrawn_at = now() WHERE id = $1`,
      [withdrawn, ContentStatus.WITHDRAWN],
    );

    const sheet = (await get(`/contents/${withdrawn}/review`, auth).expect(200))
      .body as SheetBody;
    expect(sheet).toMatchObject({
      reviewable: false,
      reason: 'withdrawn',
      review: { stars: 3, text: '회수 전에 남긴 글' },
    });
    const rejected = await put(`/contents/${withdrawn}/review`, auth, {
      stars: 1,
    }).expect(HttpStatus.FORBIDDEN);
    expect(rejected.body).toMatchObject({
      error_code: ErrorCode.CONTENT_WITHDRAWN,
    });

    const missing = '00000000-0000-4000-8000-000000000000';
    for (const id of [missing, global]) {
      const sheetMissing = await get(`/contents/${id}/review`, auth).expect(
        HttpStatus.NOT_FOUND,
      );
      expect(sheetMissing.body).toMatchObject({
        error_code: ErrorCode.CONTENT_NOT_FOUND,
      });
      await put(`/contents/${id}/review`, auth, { stars: 2 }).expect(
        HttpStatus.NOT_FOUND,
      );
    }
  }, 60_000);

  it('형식 위반은 400 VALIDATION_FAILED — 스위치보다 먼저다', async () => {
    const { userId, auth } = await createUser('invalid');
    const [contentId] = await seedContents(1);
    await startPlaying(userId, contentId);

    await get('/contents/not-a-uuid/review', auth).expect(
      HttpStatus.BAD_REQUEST,
    );
    for (const body of [
      { stars: 0 },
      { stars: 6 },
      { stars: 3.5 },
      { stars: '4' },
      {},
      { stars: 3, text: '가'.repeat(501) },
      { stars: 3, text: 7 },
    ]) {
      const response = await put(
        `/contents/${contentId}/review`,
        auth,
        body,
      ).expect(HttpStatus.BAD_REQUEST);
      expect(response.body).toMatchObject({
        error_code: ErrorCode.VALIDATION_FAILED,
      });
    }

    // 앞뒤 공백을 뺀 뒤 500자는 통과
    await put(`/contents/${contentId}/review`, auth, {
      stars: 3,
      text: ` ${'가'.repeat(500)} `,
    }).expect(HttpStatus.OK);

    configService.set('CONTENT_REVIEW_ENABLED', 'false');
    await put(`/contents/${contentId}/review`, auth, { stars: 9 }).expect(
      HttpStatus.BAD_REQUEST,
    );
  }, 60_000);

  it('먼저 묻기 — 최근 끝까지 들은 후기 없는 편을 묻고, 닫으면 5 서비스 날짜 동안 묻지 않는다', async () => {
    const { userId, auth } = await createUser('prompt');
    const [older, latest, stale, reviewed] = await seedContents(4);
    for (const id of [older, latest, stale, reviewed]) {
      await startPlaying(userId, id);
    }
    await completeInLibrary(userId, older, new Date(now.getTime() - 3 * DAY));
    await completeInLibrary(userId, latest, new Date(now.getTime() - DAY));
    // 14 서비스 날짜 밖
    await completeInLibrary(userId, stale, new Date(now.getTime() - 15 * DAY));
    // 가장 최근에 들었지만 이미 후기가 있다
    await completeInLibrary(userId, reviewed, now);
    await put(`/contents/${reviewed}/review`, auth, { stars: 5 }).expect(200);

    // 저장은 "물었다"를 적지 않는다 — 여전히 묻는다
    const first = (
      await get('/users/me/content-review/prompt', auth).expect(200)
    ).body as PromptBody;
    expect(first).toMatchObject({
      enabled: true,
      show: true,
      item: {
        content_id: latest,
        completed_date: toServiceDate(new Date(now.getTime() - DAY)),
      },
      reward_progress: null,
      muted_until: null,
    });

    // 조회는 상태를 바꾸지 않는다
    expect(
      (
        (await get('/users/me/content-review/prompt', auth).expect(200))
          .body as PromptBody
      ).show,
    ).toBe(true);

    await post('/users/me/content-review/prompt/dismiss', auth).expect(
      HttpStatus.NO_CONTENT,
    );
    // 같은 날 재전송은 무해
    await post('/users/me/content-review/prompt/dismiss', auth).expect(
      HttpStatus.NO_CONTENT,
    );
    expect(await lastPromptedDate(userId)).toBe(today);
    const closed = (
      await get('/users/me/content-review/prompt', auth).expect(200)
    ).body as PromptBody;
    expect(closed).toMatchObject({ enabled: true, show: false, item: null });

    // 물은 지 4일 — 묻지 않는다 · 5일 — 묻는다
    await setLastPrompted(userId, shiftServiceDate(today, -4));
    expect(
      (
        (await get('/users/me/content-review/prompt', auth).expect(200))
          .body as PromptBody
      ).show,
    ).toBe(false);
    await setLastPrompted(userId, shiftServiceDate(today, -5));
    const again = (
      await get('/users/me/content-review/prompt', auth).expect(200)
    ).body as PromptBody;
    expect(again.show).toBe(true);
    expect(again.item?.content_id).toBe(latest);
  }, 60_000);

  it('완청 신호만 있는 편(라이브러리 행 없음)도 묻고, 회수된 편 · 다른 시장 편은 묻지 않는다', async () => {
    const { userId, auth } = await createUser('signal');
    const [signalOnly, withdrawn, global] = await seedContents(3);
    for (const id of [signalOnly, withdrawn, global]) {
      await startPlaying(userId, id);
    }
    await completeBySignal(userId, signalOnly, new Date(now.getTime() - DAY));
    await completeBySignal(userId, withdrawn, now);
    await completeBySignal(userId, global, now);
    await dataSource.query(`UPDATE contents SET status = $2 WHERE id = $1`, [
      withdrawn,
      ContentStatus.WITHDRAWN,
    ]);
    await dataSource.query(
      `UPDATE contents SET market = 'global' WHERE id = $1`,
      [global],
    );

    const prompt = (
      await get('/users/me/content-review/prompt', auth).expect(200)
    ).body as PromptBody;
    expect(prompt.show).toBe(true);
    expect(prompt.item?.content_id).toBe(signalOnly);
  }, 60_000);

  it('이번 주 그만 보기 — 다음 주 월요일 라벨을 돌려주고 그때까지 묻지 않으며 "물었다"도 적는다', async () => {
    const { userId, auth } = await createUser('mute');
    const [contentId] = await seedContents(1);
    await startPlaying(userId, contentId);
    await completeInLibrary(userId, contentId, now);

    const muted = (
      await post('/users/me/content-review/prompt/mute', auth).expect(
        HttpStatus.OK,
      )
    ).body as { muted_until: string };
    expect(muted.muted_until).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(new Date(`${muted.muted_until}T00:00:00Z`).getUTCDay()).toBe(1);
    expect(muted.muted_until > today).toBe(true);

    const prompt = (
      await get('/users/me/content-review/prompt', auth).expect(200)
    ).body as PromptBody;
    expect(prompt).toMatchObject({
      show: false,
      item: null,
      muted_until: muted.muted_until,
    });
    expect(await lastPromptedDate(userId)).toBe(today);
  }, 60_000);

  it('관리자 집계 · 글 목록 — 작성자 계정이 없고, 버전별 · 필터 · 커서가 계약대로다', async () => {
    const reviewer = await createUser('admin-a');
    const other = await createUser('admin-b');
    const [contentA, contentB] = await seedContents(2);
    for (const user of [reviewer, other]) {
      for (const id of [contentA, contentB]) {
        await startPlaying(user.userId, id);
      }
    }
    await completeInLibrary(reviewer.userId, contentA, now);
    await put(`/contents/${contentA}/review`, reviewer.auth, {
      stars: 5,
      text: '정말 좋았어요',
    }).expect(200);
    await dataSource.query(
      `UPDATE contents SET content_version = 2 WHERE id = $1`,
      [contentA],
    );
    await put(`/contents/${contentA}/review`, other.auth, { stars: 2 }).expect(
      200,
    );
    await put(`/contents/${contentB}/review`, other.auth, {
      stars: 4,
      text: '중간에 같은 설명이 반복돼요',
    }).expect(200);

    await dataSource.query(`UPDATE users SET role = 'admin' WHERE id = $1`, [
      reviewer.userId,
    ]);
    const adminAuth = await reLogin(reviewer.providerToken);

    // 편별 집계(한 편)
    const summary = (
      await get(
        `/admin/content-reviews/summary?content_id=${contentA}`,
        adminAuth,
      ).expect(200)
    ).body as SummaryBody;
    expect(summary.totals).toEqual({
      reviews: 2,
      average_stars: 3.5,
      text_reviews: 1,
      reviewed_contents: 1,
    });
    expect(summary.promotions).toEqual({
      issued: 0,
      redeemed: 0,
      expired: 0,
      unused: 0,
    });
    expect(summary.items).toHaveLength(1);
    expect(summary.items[0]).toMatchObject({
      content_id: contentA,
      market: 'kr',
      status: 'published',
      content_version: 2,
      reviews: 2,
      average_stars: 3.5,
      distribution: { '1': 0, '2': 1, '3': 0, '4': 0, '5': 1 },
      text_reviews: 1,
      completed_reviews: 1,
      by_version: [
        { content_version: 2, reviews: 1, average_stars: 2 },
        { content_version: 1, reviews: 1, average_stars: 5 },
      ],
    });
    expect(JSON.stringify(summary)).not.toContain(reviewer.userId);
    expect(JSON.stringify(summary)).not.toContain(other.userId);

    // 글 목록 — 편별 · 최신순 · 한 장씩 커서
    const firstPage = (
      await get(
        `/admin/content-reviews?content_id=${contentA}&limit=1`,
        adminAuth,
      ).expect(200)
    ).body as ListBody;
    expect(firstPage.items).toHaveLength(1);
    expect(firstPage.items[0]).toMatchObject({
      content_id: contentA,
      stars: 2,
      text: null,
      content_version: 2,
      market: 'kr',
      content_status: 'published',
      created_date: today,
      updated_date: today,
    });
    expect(Object.keys(firstPage.items[0]).sort()).toEqual(
      [
        'id',
        'content_id',
        'content_title',
        'content_status',
        'stars',
        'text',
        'is_completed',
        'content_version',
        'market',
        'created_date',
        'updated_date',
      ].sort(),
    );
    expect(firstPage.next_cursor).not.toBeNull();
    const secondPage = (
      await get(
        `/admin/content-reviews?content_id=${contentA}&limit=1&cursor=${firstPage.next_cursor}`,
        adminAuth,
      ).expect(200)
    ).body as ListBody;
    expect(secondPage.items).toHaveLength(1);
    expect(secondPage.items[0]).toMatchObject({
      stars: 5,
      text: '정말 좋았어요',
      is_completed: true,
      content_version: 1,
    });
    expect(secondPage.next_cursor).toBeNull();
    expect(JSON.stringify([firstPage, secondPage])).not.toContain(
      reviewer.userId,
    );

    // 글 있는 후기만
    const withText = (
      await get(
        `/admin/content-reviews?content_id=${contentB}&has_text=true`,
        adminAuth,
      ).expect(200)
    ).body as ListBody;
    expect(withText.items.map((item) => item.text)).toEqual([
      '중간에 같은 설명이 반복돼요',
    ]);

    // 필터가 바뀐 커서 · 모르는 값은 400
    await get(
      `/admin/content-reviews?content_id=${contentB}&limit=1&cursor=${firstPage.next_cursor}`,
      adminAuth,
    ).expect(HttpStatus.BAD_REQUEST);
    for (const query of [
      'market=jp',
      'has_text=yes',
      'limit=0',
      'limit=101',
      'cursor=%25%25',
    ]) {
      await get(`/admin/content-reviews?${query}`, adminAuth).expect(
        HttpStatus.BAD_REQUEST,
      );
    }
    await get('/admin/content-reviews/summary?market=jp', adminAuth).expect(
      HttpStatus.BAD_REQUEST,
    );
  }, 60_000);

  // --- helpers ---

  const path = (suffix: string) => `/api/v1${suffix}`;
  const get = (suffix: string, auth: string) =>
    request(app.getHttpServer()).get(path(suffix)).set('Authorization', auth);
  const post = (suffix: string, auth: string) =>
    request(app.getHttpServer()).post(path(suffix)).set('Authorization', auth);
  const put = (suffix: string, auth: string, body: object) =>
    request(app.getHttpServer())
      .put(path(suffix))
      .set('Authorization', auth)
      .send(body);

  async function createUser(
    label: string,
  ): Promise<{ userId: string; auth: string; providerToken: string }> {
    const providerToken = `e2e-cr-${label}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
    const deviceId = `e2e-cr-device-${label}`;
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
      .set('Idempotency-Key', `e2e-cr-signup-${providerToken}`)
      .send({
        signup_token: (login.body as LoginBody).signup_token,
        device_id: deviceId,
        consents: [
          { consent_type: 'terms', version: '0.1', is_agreed: true },
          { consent_type: 'privacy', version: '0.1', is_agreed: true },
          { consent_type: 'age_confirmation', version: null, is_agreed: true },
        ],
      })
      .expect(HttpStatus.CREATED);
    const body = signUp.body as SignUpBody;
    userIds.push(body.user.id);

    return {
      userId: body.user.id,
      auth: `Bearer ${body.access_token}`,
      providerToken,
    };
  }

  async function reLogin(providerToken: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post(path('/auth/social-login'))
      .send({
        provider: SocialProvider.KAKAO,
        provider_token: providerToken,
        device_id: 'e2e-cr-device-relogin',
      })
      .expect(HttpStatus.OK);

    return `Bearer ${(response.body as LoginBody).access_token}`;
  }

  /** 재생 시작 — 위치 행(끝까지 듣지 않음) */
  async function startPlaying(userId: string, contentId: string) {
    await dataSource.query(
      `INSERT INTO playback_progresses (user_id, content_id, position_sec, max_reached_sec)
       VALUES ($1, $2, 30, 30)`,
      [userId, contentId],
    );
  }

  /** 라이브러리 완청 — 완청 시각을 남긴다 */
  async function completeInLibrary(
    userId: string,
    contentId: string,
    completedAt: Date,
  ) {
    await dataSource.query(
      `INSERT INTO library_items (user_id, content_id, source, status, added_at, last_played_at, completed_at)
       VALUES ($1, $2, 'save', 'completed', $3, $3, $3)`,
      [userId, contentId, completedAt],
    );
  }

  /** 라이브러리 행 없이 끝까지 들음(탐색 재생) — 완청 신호만 */
  async function completeBySignal(userId: string, contentId: string, at: Date) {
    await dataSource.query(
      `INSERT INTO user_signals (user_id, content_id, action, created_at, updated_at)
       VALUES ($1, $2, 'complete', $3, $3)`,
      [userId, contentId, at],
    );
  }

  async function reviewCount(userId: string): Promise<number> {
    const [row] = await dataSource.query<{ count: number }[]>(
      `SELECT count(*)::int AS count FROM content_reviews WHERE user_id = $1`,
      [userId],
    );
    return row.count;
  }

  async function lastPromptedDate(userId: string): Promise<string | null> {
    const [row] = await dataSource.query<{ value: string | null }[]>(
      `SELECT content_review_last_prompted_date::text AS value FROM user_settings WHERE user_id = $1`,
      [userId],
    );
    return row?.value ?? null;
  }

  async function setLastPrompted(userId: string, date: string) {
    await dataSource.query(
      `UPDATE user_settings SET content_review_last_prompted_date = $2 WHERE user_id = $1`,
      [userId, date],
    );
  }

  async function seedContents(count: number): Promise<string[]> {
    const repository = dataSource.getRepository(Content);
    const ids: string[] = [];

    for (let index = 0; index < count; index += 1) {
      const content = await repository.save(
        repository.create({
          title: `E2E 후기 콘텐츠 ${contentIds.length}`,
          description: 'e2e 전용',
          authorName: '테스트',
          sourceName: 'E2E',
          sourceUrl: 'https://example.com/e2e',
          origin: ContentOrigin.AI_GENERATED,
          partnerId: null,
          seriesId: null,
          episodeNo: null,
          totalEpisodes: null,
          audioPath: `e2e-cr/${contentIds.length}.mp3`,
          durationSec: 600,
          thumbnailUrl: 'https://example.com/e2e.png',
          contentVersion: 1,
          licenseExpiresAt: null,
          status: ContentStatus.PUBLISHED,
          publishedAt: new Date(now.getTime() - 60_000),
          withdrawnAt: null,
        }),
      );
      contentIds.push(content.id);
      ids.push(content.id);
    }

    return ids;
  }
});
