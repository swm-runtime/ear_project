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
import { toServiceDate } from '@/common/utils/service-date.util';
import { InviteGrantExpiryService } from '@/modules/billing/services/invite-grant-expiry.service';
import { ContentOrigin, ContentStatus } from '@/modules/content/content.enum';
import { Content } from '@/modules/content/entities/content.entity';
import { User } from '@/modules/user/entities/user.entity';
import {
  SocialProvider,
  UserMarket,
  UserRole,
  UserTier,
} from '@/modules/user/user.enum';

interface PromotionBody {
  id: string;
  kind: string;
  name: string;
  tier: string;
  plan_name: string;
  grant_days: number;
  issued_at: string;
  expires_at: string;
  last_usable_date: string;
  redeemable: boolean;
  reason: string | null;
  overlaps_trial: boolean;
  redeem_preview: { ends_at: string; last_date: string };
}
interface SaveBody {
  review: { is_completed: boolean };
  reward_progress: { current: number; required: number } | null;
  issued_promotion: PromotionBody | null;
}
interface ScreenBody {
  enabled: boolean;
  grant: {
    name: string;
    tier: string;
    ends_at: string;
    last_date: string;
  } | null;
  promotions: PromotionBody[];
  has_unused: boolean;
  reward_progress: { current: number; required: number } | null;
}
interface SubscriptionBody {
  plan: {
    status: string;
    tier: string;
    grant: {
      name: string;
      tier: string;
      ends_at: string;
      last_date: string;
    } | null;
  };
  entitlements: { daily_play_limit: number | null };
}

const LONG_TEXT = '비유가 쉬워서 출근길에 듣기 좋았어요';

/**
 * 후기 참여 프로모션 E2E(KAN-279 2단계 — `content-review-api.md` 4.2 발급 · 4.6 S12 · 4.7 사용) — 실제 DB 위에서 밟는다.
 * 완청 · 재생 시작은 행을 직접 넣는다. 두 스위치는 ConfigService 를 바꿔 켠다.
 */
describe('후기 참여 프로모션 E2E', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let configService: ConfigService;
  const TOKEN = `e2e-rr-${Date.now()}`;
  const userIds: string[] = [];
  const contentIds: string[] = [];
  const codeIds: string[] = [];
  const now = new Date();

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
    configService.set('CONTENT_REVIEW_REWARD_ENABLED', 'true');
  });

  afterAll(async () => {
    for (const userId of userIds) {
      await dataSource.query(`DELETE FROM users WHERE id = $1`, [userId]);
    }
    for (const codeId of codeIds) {
      await dataSource.query(`DELETE FROM invite_codes WHERE id = $1`, [
        codeId,
      ]);
    }
    for (const contentId of contentIds) {
      await dataSource.query(`DELETE FROM contents WHERE id = $1`, [contentId]);
    }
    await app.close();
  }, 60_000);

  it('끝까지 들은 편 3개에 글 10자 후기를 남기면 3번째 저장에서 1장이 발급되고, 별점만 · 안 들은 편은 세지 않으며 다시 발급되지 않는다', async () => {
    const { userId, auth } = await createUser('issue');
    const [a, b, c, starsOnly, notCompleted, d] = await seedContents(6);
    for (const id of [a, b, c, starsOnly, d]) {
      await listenToEnd(userId, id);
    }
    await startPlaying(userId, notCompleted);

    const first = await save(auth, a, LONG_TEXT);
    expect(first.reward_progress).toEqual({ current: 1, required: 3 });
    expect(first.issued_promotion).toBeNull();
    // 별점만 · 끝까지 듣지 않은 편 · 공백 빼고 9자 글은 진행에 들지 않는다
    await save(auth, starsOnly, null);
    await save(auth, notCompleted, LONG_TEXT);
    const short = await save(auth, b, '가 나 다 라 마 바 사 아 자');
    expect(short.reward_progress).toEqual({ current: 1, required: 3 });
    // 같은 편을 고쳐 글을 채우면 그 편이 든다
    const second = await save(auth, b, LONG_TEXT);
    expect(second.reward_progress).toEqual({ current: 2, required: 3 });

    // when — 3번째 편
    const third = await save(auth, c, LONG_TEXT);

    // then — 발급 · 진행 null
    expect(third.reward_progress).toBeNull();
    const issued = third.issued_promotion!;
    expect(issued).toMatchObject({
      kind: 'review_reward',
      name: '후기 참여',
      tier: 'pro',
      plan_name: expect.any(String) as string,
      grant_days: 7,
      redeemable: true,
      reason: null,
      overlaps_trial: false,
    });
    // 소멸은 발급 서비스 날짜 3개월 뒤 같은 날짜의 서비스 날짜 시작 — 마지막 사용일은 그 전날
    expect(issued.last_usable_date).toBe(
      toServiceDate(new Date(new Date(issued.expires_at).getTime() - 1)),
    );
    expect(
      new Date(issued.expires_at).getTime() -
        new Date(issued.issued_at).getTime(),
    ).toBeGreaterThan(85 * 24 * 60 * 60 * 1000);
    expect(issued.redeem_preview.last_date >= toServiceDate(now)).toBe(true);

    // 발급은 지급이 아니다 — 티어 캐시 · 지급 행이 그대로다
    expect(await tierOf(userId)).toBe(UserTier.LIGHT);
    expect(await redemptionCount(userId)).toBe(0);

    // 4번째 · 같은 편 재전송은 다시 발급하지 않는다
    const fourth = await save(auth, d, LONG_TEXT);
    expect(fourth).toMatchObject({
      reward_progress: null,
      issued_promotion: null,
    });
    expect((await save(auth, c, LONG_TEXT)).issued_promotion).toBeNull();
    expect(await promotionCount(userId)).toBe(1);

    // 시트 · 먼저 묻기도 받은 계정이라 보상 줄이 없다
    const sheet = await get(`/contents/${a}/review`, auth).expect(200);
    expect(
      (sheet.body as { reward_progress: unknown }).reward_progress,
    ).toBeNull();
  }, 60_000);

  it('두 기기가 동시에 3번째 후기를 보내도 1장만 발급되고 한쪽만 issued_promotion 을 받는다', async () => {
    const { userId, auth } = await createUser('race');
    const [a, b, c, d] = await seedContents(4);
    for (const id of [a, b, c, d]) {
      await listenToEnd(userId, id);
    }
    await save(auth, a, LONG_TEXT);
    await save(auth, b, LONG_TEXT);

    const [left, right] = await Promise.all([
      put(`/contents/${c}/review`, auth, { stars: 5, text: LONG_TEXT }),
      put(`/contents/${d}/review`, auth, { stars: 4, text: LONG_TEXT }),
    ]);

    expect(left.status).toBe(HttpStatus.OK);
    expect(right.status).toBe(HttpStatus.OK);
    const issued = [left.body as SaveBody, right.body as SaveBody].filter(
      (body) => body.issued_promotion !== null,
    );
    expect(issued).toHaveLength(1);
    expect(await promotionCount(userId)).toBe(1);
  }, 60_000);

  it('발급 스위치가 꺼져 있으면 새 발급만 멈추고(진행 null), 이미 가진 프로모션은 그대로 쓸 수 있다', async () => {
    const holder = await createUser('switch-holder');
    const promotionId = await issueTo(holder);

    configService.set('CONTENT_REVIEW_REWARD_ENABLED', 'false');
    const { userId, auth } = await createUser('switch-off');
    const ids = await seedContents(3);
    for (const id of ids) {
      await listenToEnd(userId, id);
    }
    for (const id of ids) {
      const body = await save(auth, id, LONG_TEXT);
      expect(body).toMatchObject({
        reward_progress: null,
        issued_promotion: null,
      });
    }
    expect(await promotionCount(userId)).toBe(0);
    const screen = await promotions(auth);
    expect(screen.reward_progress).toBeNull();

    // 가진 쪽은 쓴다
    await post(
      `/users/me/promotions/${promotionId}/redeem`,
      holder.auth,
    ).expect(HttpStatus.OK);
  }, 60_000);

  it('S12 — 가진 프로모션 · 점 배지 · 진행 · 켜짐 여부를 싣고, 후기 스위치가 꺼져도 열려 있다', async () => {
    const fresh = await createUser('screen-fresh');
    expect(await promotions(fresh.auth)).toEqual({
      enabled: true,
      grant: null,
      promotions: [],
      has_unused: false,
      reward_progress: { current: 0, required: 3 },
    });

    const holder = await createUser('screen-holder');
    const promotionId = await issueTo(holder);
    configService.set('CONTENT_REVIEW_ENABLED', 'false');
    const screen = await promotions(holder.auth);
    expect(screen).toMatchObject({
      enabled: false,
      grant: null,
      has_unused: true,
      reward_progress: null,
    });
    expect(screen.promotions.map((promotion) => promotion.id)).toEqual([
      promotionId,
    ]);
  }, 60_000);

  it('무료 계정이 쓰면 Pro 7일이 지급되고(grant.name "후기 참여") 다시 쓰면 409, 끝나면 만료 배치가 무료로 되돌린다', async () => {
    const holder = await createUser('redeem');
    const promotionId = await issueTo(holder);
    const listed = (await promotions(holder.auth)).promotions[0];

    // when
    const redeemed = (
      await post(
        `/users/me/promotions/${promotionId}/redeem`,
        holder.auth,
      ).expect(HttpStatus.OK)
    ).body as SubscriptionBody;

    // then — 구독 조회와 같은 본문 · 지급 표시
    expect(redeemed.plan).toMatchObject({
      status: 'free',
      tier: 'pro',
      grant: {
        name: '후기 참여',
        tier: 'pro',
        ends_at: listed.redeem_preview.ends_at,
        last_date: listed.redeem_preview.last_date,
      },
    });
    expect(redeemed.entitlements.daily_play_limit).toBeNull();
    expect(await tierOf(holder.userId)).toBe(UserTier.PRO);
    const subscription = (
      await get('/users/me/subscription', holder.auth).expect(200)
    ).body as SubscriptionBody;
    expect(subscription.plan.grant?.name).toBe('후기 참여');

    // S12 — 쓴 것은 목록에서 빠지고 이용 중에 보인다
    const after = await promotions(holder.auth);
    expect(after).toMatchObject({ promotions: [], has_unused: false });
    expect(after.grant?.name).toBe('후기 참여');

    // 재전송 · 두 번째 사용은 409 이미 사용
    const again = await post(
      `/users/me/promotions/${promotionId}/redeem`,
      holder.auth,
    ).expect(HttpStatus.CONFLICT);
    expect(again.body).toMatchObject({
      error_code: ErrorCode.PROMOTION_ALREADY_USED,
    });

    // 내부 캠페인 행의 사용 수가 올랐다
    const [code] = await dataSource.query<{ redeemed_count: number }[]>(
      `SELECT redeemed_count FROM invite_codes WHERE code = 'REVIEW-REWARD'`,
    );
    expect(code.redeemed_count).toBeGreaterThanOrEqual(1);

    // 지급이 끝나면(끝을 1분 뒤로 당기고 그 뒤 시각으로 배치) 무료로 돌아간다
    const endsAt = new Date(Date.now() + 60_000);
    await dataSource.query(
      `UPDATE invite_code_redemptions SET ends_at = $2 WHERE user_id = $1`,
      [holder.userId, endsAt],
    );
    await app
      .get(InviteGrantExpiryService)
      .releaseEnded(new Date(endsAt.getTime() + 60_000));
    expect(await tierOf(holder.userId)).toBe(UserTier.LIGHT);
  }, 60_000);

  it('두 기기가 동시에 쓰면 지급은 하나이고 늦은 쪽은 409 PROMOTION_ALREADY_USED', async () => {
    const holder = await createUser('redeem-race');
    const promotionId = await issueTo(holder);

    const results = await Promise.all([
      post(`/users/me/promotions/${promotionId}/redeem`, holder.auth),
      post(`/users/me/promotions/${promotionId}/redeem`, holder.auth),
    ]);

    expect(results.map((result) => result.status).sort()).toEqual([
      HttpStatus.OK,
      HttpStatus.CONFLICT,
    ]);
    expect(await redemptionCount(holder.userId)).toBe(1);
  }, 60_000);

  it('Pro 구독 중이면 목록은 흐림(pro_subscribed) · 사용 409, 데일리 구독 중이면 쓸 수 있다', async () => {
    const pro = await createUser('pro-subscriber');
    const proPromotion = await issueTo(pro);
    await subscribe(pro.userId, 'pro');

    const listed = (await promotions(pro.auth)).promotions[0];
    expect(listed).toMatchObject({
      redeemable: false,
      reason: 'pro_subscribed',
    });
    const rejected = await post(
      `/users/me/promotions/${proPromotion}/redeem`,
      pro.auth,
    ).expect(HttpStatus.CONFLICT);
    expect(rejected.body).toMatchObject({
      error_code: ErrorCode.PROMOTION_PRO_SUBSCRIBED,
    });

    const daily = await createUser('daily-subscriber');
    const dailyPromotion = await issueTo(daily);
    await subscribe(daily.userId, 'daily');
    expect((await promotions(daily.auth)).promotions[0]).toMatchObject({
      redeemable: true,
      reason: null,
    });
    const redeemed = (
      await post(
        `/users/me/promotions/${dailyPromotion}/redeem`,
        daily.auth,
      ).expect(HttpStatus.OK)
    ).body as SubscriptionBody;
    expect(redeemed.plan).toMatchObject({ status: 'subscribed', tier: 'pro' });
    const [row] = await dataSource.query<{ subscribed_at_start: boolean }[]>(
      `SELECT subscribed_at_start FROM invite_code_redemptions WHERE user_id = $1`,
      [daily.userId],
    );
    expect(row.subscribed_at_start).toBe(true);
  }, 60_000);

  it('초대 코드 지급 이용 중이면 목록 grant_active · 사용 409 INVITE_GRANT_ALREADY_ACTIVE', async () => {
    const holder = await createUser('invite-active');
    const promotionId = await issueTo(holder);
    const [code] = await dataSource.query<{ id: string }[]>(
      `INSERT INTO invite_codes (code, name, tier, grant_days) VALUES ($1, 'E2E PoC', 'pro', 30) RETURNING id`,
      [`RR${Date.now()}`.slice(0, 32)],
    );
    codeIds.push(code.id);
    await dataSource.query(
      `INSERT INTO invite_code_redemptions (invite_code_id, user_id, tier, starts_at, ends_at)
       VALUES ($1, $2, 'pro', now() - interval '1 hour', now() + interval '10 days')`,
      [code.id, holder.userId],
    );

    expect((await promotions(holder.auth)).promotions[0]).toMatchObject({
      redeemable: false,
      reason: 'grant_active',
    });
    const rejected = await post(
      `/users/me/promotions/${promotionId}/redeem`,
      holder.auth,
    ).expect(HttpStatus.CONFLICT);
    expect(rejected.body).toMatchObject({
      error_code: ErrorCode.INVITE_GRANT_ALREADY_ACTIVE,
    });
  }, 60_000);

  it('소멸한 프로모션은 목록에서 빠지고 사용은 409 PROMOTION_EXPIRED, 남의 것 · 없는 것은 404, uuid 아님은 400, 토큰 없음은 401', async () => {
    const holder = await createUser('expired');
    const other = await createUser('other');
    const promotionId = await issueTo(holder);
    await dataSource.query(
      `UPDATE promotions SET expires_at = now() - interval '1 minute' WHERE id = $1`,
      [promotionId],
    );

    expect(await promotions(holder.auth)).toMatchObject({
      promotions: [],
      has_unused: false,
      reward_progress: null,
    });
    const expired = await post(
      `/users/me/promotions/${promotionId}/redeem`,
      holder.auth,
    ).expect(HttpStatus.CONFLICT);
    expect(expired.body).toMatchObject({
      error_code: ErrorCode.PROMOTION_EXPIRED,
    });

    const foreign = await post(
      `/users/me/promotions/${promotionId}/redeem`,
      other.auth,
    ).expect(HttpStatus.NOT_FOUND);
    expect(foreign.body).toMatchObject({
      error_code: ErrorCode.PROMOTION_NOT_FOUND,
    });
    await post(
      '/users/me/promotions/00000000-0000-4000-8000-000000000000/redeem',
      holder.auth,
    ).expect(HttpStatus.NOT_FOUND);
    await post('/users/me/promotions/nope/redeem', holder.auth).expect(
      HttpStatus.BAD_REQUEST,
    );
    await request(app.getHttpServer())
      .get(path('/users/me/promotions'))
      .expect(HttpStatus.UNAUTHORIZED);
    await request(app.getHttpServer())
      .post(path(`/users/me/promotions/${promotionId}/redeem`))
      .expect(HttpStatus.UNAUTHORIZED);
  }, 60_000);

  it('GLOBAL 사용자의 이름은 "Review"다 — 카드 · plan.grant 모두', async () => {
    const holder = await createUser('global', UserMarket.GLOBAL);
    const promotionId = await issueTo(holder);

    expect((await promotions(holder.auth)).promotions[0].name).toBe('Review');
    const redeemed = (
      await post(
        `/users/me/promotions/${promotionId}/redeem`,
        holder.auth,
      ).expect(HttpStatus.OK)
    ).body as SubscriptionBody;
    expect(redeemed.plan.grant?.name).toBe('Review');
  }, 60_000);

  it('내부 캠페인 코드 REVIEW-REWARD 는 코드 입력에서 404, 관리자 수정은 409', async () => {
    const user = await createUser('internal-code');
    const entered = await post(
      '/users/me/subscription/invite-codes',
      user.auth,
      { code: 'review-reward' },
    ).expect(HttpStatus.NOT_FOUND);
    expect(entered.body).toMatchObject({
      error_code: ErrorCode.INVITE_CODE_NOT_FOUND,
    });

    const admin = await createUser('internal-admin', UserMarket.KR, true);
    const [row] = await dataSource.query<{ id: string }[]>(
      `SELECT id FROM invite_codes WHERE code = 'REVIEW-REWARD'`,
    );
    const patched = await request(app.getHttpServer())
      .patch(path(`/admin/invite-codes/${row.id}`))
      .set('Authorization', admin.auth)
      .send({ is_active: true })
      .expect(HttpStatus.CONFLICT);
    expect(patched.body).toMatchObject({ error_code: ErrorCode.CONFLICT });
  }, 60_000);

  it('관리자 집계의 프로모션 건수 — 발급 · 사용 · 소멸 · 미사용', async () => {
    const admin = await createUser('counts-admin', UserMarket.KR, true);
    const before = await counts(admin.auth);
    const used = await createUser('counts-used');
    const unused = await createUser('counts-unused');
    const expired = await createUser('counts-expired');
    const usedId = await issueTo(used);
    await issueTo(unused);
    const expiredId = await issueTo(expired);
    await post(`/users/me/promotions/${usedId}/redeem`, used.auth).expect(200);
    await dataSource.query(
      `UPDATE promotions SET expires_at = now() - interval '1 minute' WHERE id = $1`,
      [expiredId],
    );

    const after = await counts(admin.auth);
    expect(after.issued - before.issued).toBe(3);
    expect(after.redeemed - before.redeemed).toBe(1);
    expect(after.expired - before.expired).toBe(1);
    expect(after.unused - before.unused).toBe(1);
  }, 60_000);

  // --- helpers ---

  const path = (suffix: string) => `/api/v1${suffix}`;
  const get = (suffix: string, auth: string) =>
    request(app.getHttpServer()).get(path(suffix)).set('Authorization', auth);
  const post = (suffix: string, auth: string, body: object = {}) =>
    request(app.getHttpServer())
      .post(path(suffix))
      .set('Authorization', auth)
      .send(body);
  const put = (suffix: string, auth: string, body: object) =>
    request(app.getHttpServer())
      .put(path(suffix))
      .set('Authorization', auth)
      .send(body);

  async function save(
    auth: string,
    contentId: string,
    text: string | null,
  ): Promise<SaveBody> {
    return (
      await put(`/contents/${contentId}/review`, auth, {
        stars: 5,
        text,
      }).expect(HttpStatus.OK)
    ).body as SaveBody;
  }

  async function promotions(auth: string): Promise<ScreenBody> {
    return (await get('/users/me/promotions', auth).expect(200))
      .body as ScreenBody;
  }

  async function counts(auth: string): Promise<Record<string, number>> {
    return (
      (await get('/admin/content-reviews/summary', auth).expect(200)).body as {
        promotions: Record<string, number>;
      }
    ).promotions;
  }

  /** 후기 3편으로 프로모션을 받게 한다 — 발급 경로 그대로 */
  async function issueTo(user: {
    userId: string;
    auth: string;
    market: UserMarket;
  }): Promise<string> {
    const ids = await seedContents(3, user.market);
    for (const id of ids) {
      await listenToEnd(user.userId, id);
    }
    let issued: PromotionBody | null = null;
    for (const id of ids) {
      issued =
        (await save(user.auth, id, LONG_TEXT)).issued_promotion ?? issued;
    }
    expect(issued).not.toBeNull();
    return issued!.id;
  }

  async function createUser(
    label: string,
    market: UserMarket = UserMarket.KR,
    admin = false,
  ): Promise<{ userId: string; auth: string; market: UserMarket }> {
    const repository = dataSource.getRepository(User);
    const user = await repository.save(
      repository.create({
        provider: SocialProvider.KAKAO,
        providerUserId: `${TOKEN}-${label}`,
        role: admin ? UserRole.ADMIN : UserRole.USER,
        onboardingCompleted: true,
        market,
      }),
    );
    userIds.push(user.id);
    const token = app.get(JwtService).sign(
      {
        sub: user.id,
        role: admin ? UserRole.ADMIN : UserRole.USER,
        typ: 'access',
        market,
      },
      { expiresIn: 600 },
    );
    return { userId: user.id, auth: `Bearer ${token}`, market };
  }

  async function subscribe(userId: string, tier: 'pro' | 'daily') {
    await dataSource.query(
      `INSERT INTO subscriptions (user_id, tier, store, original_transaction_id, latest_receipt, status,
                                  is_auto_renew, started_at, expires_at, environment)
       VALUES ($1, $2, 'play_store', $3, 'e2e', 'active', true, now() - interval '1 day', now() + interval '20 days', 'production')`,
      [userId, tier, `${TOKEN}-${userId}`],
    );
  }

  async function startPlaying(userId: string, contentId: string) {
    await dataSource.query(
      `INSERT INTO playback_progresses (user_id, content_id, position_sec, max_reached_sec)
       VALUES ($1, $2, 30, 30)`,
      [userId, contentId],
    );
  }

  /** 끝까지 들음 — 위치 90% 이상(공용 완청 정의) */
  async function listenToEnd(userId: string, contentId: string) {
    await dataSource.query(
      `INSERT INTO playback_progresses (user_id, content_id, position_sec, max_reached_sec)
       VALUES ($1, $2, 600, 600)`,
      [userId, contentId],
    );
  }

  async function tierOf(userId: string): Promise<UserTier> {
    return (
      await dataSource.getRepository(User).findOneByOrFail({ id: userId })
    ).tier;
  }

  async function promotionCount(userId: string): Promise<number> {
    const [row] = await dataSource.query<{ count: number }[]>(
      `SELECT count(*)::int AS count FROM promotions WHERE user_id = $1`,
      [userId],
    );
    return row.count;
  }

  async function redemptionCount(userId: string): Promise<number> {
    const [row] = await dataSource.query<{ count: number }[]>(
      `SELECT count(*)::int AS count FROM invite_code_redemptions WHERE user_id = $1`,
      [userId],
    );
    return row.count;
  }

  async function seedContents(
    count: number,
    market: UserMarket = UserMarket.KR,
  ): Promise<string[]> {
    const repository = dataSource.getRepository(Content);
    const ids: string[] = [];

    for (let index = 0; index < count; index += 1) {
      const content = await repository.save(
        repository.create({
          title: `E2E 보상 콘텐츠 ${contentIds.length}`,
          description: 'e2e 전용',
          authorName: '테스트',
          sourceName: 'E2E',
          sourceUrl: 'https://example.com/e2e',
          origin: ContentOrigin.AI_GENERATED,
          partnerId: null,
          seriesId: null,
          episodeNo: null,
          totalEpisodes: null,
          audioPath: `e2e-rr/${contentIds.length}.mp3`,
          durationSec: 600,
          thumbnailUrl: 'https://example.com/e2e.png',
          contentVersion: 1,
          licenseExpiresAt: null,
          status: ContentStatus.PUBLISHED,
          publishedAt: new Date(now.getTime() - 60_000),
          withdrawnAt: null,
          market,
        }),
      );
      contentIds.push(content.id);
      ids.push(content.id);
    }

    return ids;
  }
});
