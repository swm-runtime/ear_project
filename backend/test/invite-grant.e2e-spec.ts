import 'dotenv/config';

import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';

import { AppModule } from '@/app.module';
import { traceIdMiddleware } from '@/common/middlewares/trace-id.middleware';
import { BillingSyncService } from '@/modules/billing/services/billing-sync.service';
import { InviteGrantExpiryService } from '@/modules/billing/services/invite-grant-expiry.service';
import { InviteCodeRedemption } from '@/modules/subscription/entities/invite-code-redemption.entity';
import { InviteCode } from '@/modules/subscription/entities/invite-code.entity';
import { User } from '@/modules/user/entities/user.entity';
import { SocialProvider, UserRole, UserTier } from '@/modules/user/user.enum';

interface SubscriptionBody {
  plan: {
    status: string;
    tier: string;
    plan_name: string;
    daily_play_limit: number | null;
    grant: {
      name: string;
      tier: string;
      plan_name: string;
      ends_at: string;
      last_date: string;
    } | null;
  };
  entitlements: { daily_play_limit: number | null; ads_enabled: boolean };
}

/**
 * 초대 코드 지급 E2E(domain.md 8.6) — 실제 DB 위에서 지급 행이 `users.tier` 캐시·구독 조회·만료 배치에 반영되는지 본다.
 * 입력 API 는 별도 PR 이라 행을 직접 심는다(입력 규칙은 `InviteCodeService` 단위 테스트).
 */
describe('초대 코드 지급 E2E', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  const userIds: string[] = [];
  const codeIds: string[] = [];
  const TOKEN = `e2einvite${Date.now()}`;
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
    for (const codeId of codeIds) {
      await dataSource.query(`DELETE FROM invite_codes WHERE id = $1`, [
        codeId,
      ]);
    }
    await app.close();
  }, 60_000);

  it('Pro 지급이 티어 캐시·구독 조회·권한에 반영되고, 기간이 끝나면 만료 배치가 무료로 되돌린다', async () => {
    // given — 무료 사용자와 Pro 30일 코드, 지금 지급 중인 행
    const { userId, auth } = await createUser();
    const code = await dataSource.getRepository(InviteCode).save({
      code: `${TOKEN}`.slice(0, 32).toUpperCase(),
      name: '산군 PoC',
      tier: UserTier.PRO,
      grantDays: 30,
      grantUntilDate: null,
    });
    codeIds.push(code.id);
    const now = new Date();
    // 지급 끝을 1분 뒤로 둔다 — 배치는 DB 전체의 끝난 지급을 처리하므로, 배치 시각을 멀리 잡으면 병렬로 도는 다른
    // E2E 가 심은 지급(하루 이상)까지 대상이 돼 횟수 단언이 흔들린다(2026-10-10 로컬 5회 중 3회 실패)
    const endsAt = new Date(now.getTime() + 60_000);
    const redemptions = dataSource.getRepository(InviteCodeRedemption);
    const redemption = await redemptions.save({
      inviteCodeId: code.id,
      userId,
      tier: UserTier.PRO,
      startsAt: new Date(now.getTime() - 60_000),
      endsAt,
    });

    // when — 결제 반영과 같은 경로로 캐시를 맞춘다
    await dataSource.transaction((manager) =>
      app.get(BillingSyncService).syncUserTier(userId, manager),
    );

    // then — 캐시·구독 조회·권한이 Pro, 상태는 무료(구독 없음), grant 가 실린다
    expect(await tierOf(userId)).toBe(UserTier.PRO);
    const granted = await subscription(auth);
    expect(granted.plan).toMatchObject({
      status: 'free',
      tier: UserTier.PRO,
      daily_play_limit: null,
      grant: {
        name: '산군 PoC',
        tier: UserTier.PRO,
        ends_at: endsAt.toISOString(),
      },
    });
    expect(granted.entitlements.daily_play_limit).toBeNull();

    // when — 기간이 끝났다(배치 시각을 끝난 뒤로)
    const afterEnd = new Date(endsAt.getTime() + 60_000);
    const released = await app
      .get(InviteGrantExpiryService)
      .releaseEnded(afterEnd);

    // then — 무료로 내려가고 표시가 찍힌다. 다시 돌려도 이 행은 대상이 아니다 — 전체 처리 건수가 아니라 이 행의
    // 표시 시각이 그대로인지로 본다(다른 스위트의 행이 그 사이 끝날 수 있다)
    expect(released).toBeGreaterThanOrEqual(1);
    expect(await tierOf(userId)).toBe(UserTier.LIGHT);
    const row = await redemptions.findOneByOrFail({ id: redemption.id });
    expect(row.tierReleasedAt?.toISOString()).toBe(afterEnd.toISOString());
    const later = new Date(afterEnd.getTime() + 60_000);
    await app.get(InviteGrantExpiryService).releaseEnded(later);
    const again = await redemptions.findOneByOrFail({ id: redemption.id });
    expect(again.tierReleasedAt?.toISOString()).toBe(afterEnd.toISOString());
    expect(await tierOf(userId)).toBe(UserTier.LIGHT);
  }, 60_000);

  async function tierOf(userId: string): Promise<UserTier> {
    return (
      await dataSource.getRepository(User).findOneByOrFail({ id: userId })
    ).tier;
  }

  async function subscription(auth: string): Promise<SubscriptionBody> {
    const response = await request(app.getHttpServer())
      .get(path('/users/me/subscription'))
      .set('Authorization', auth)
      .expect(HttpStatus.OK);
    return response.body as SubscriptionBody;
  }

  async function createUser(): Promise<{ userId: string; auth: string }> {
    const repository = dataSource.getRepository(User);
    const user = await repository.save(
      repository.create({
        provider: SocialProvider.KAKAO,
        providerUserId: `${TOKEN}-user`,
        role: UserRole.USER,
        onboardingCompleted: true,
      }),
    );
    userIds.push(user.id);
    const token = app
      .get(JwtService)
      .sign(
        { sub: user.id, role: UserRole.USER, typ: 'access' },
        { expiresIn: 600 },
      );
    return { userId: user.id, auth: `Bearer ${token}` };
  }
});
