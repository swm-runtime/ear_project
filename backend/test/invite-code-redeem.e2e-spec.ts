import 'dotenv/config';

import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';

import { AppModule } from '@/app.module';
import { traceIdMiddleware } from '@/common/middlewares/trace-id.middleware';
import { InviteCodeRedemption } from '@/modules/subscription/entities/invite-code-redemption.entity';
import { InviteCode } from '@/modules/subscription/entities/invite-code.entity';
import { User } from '@/modules/user/entities/user.entity';
import { SocialProvider, UserRole, UserTier } from '@/modules/user/user.enum';

interface SubscriptionBody {
  plan: {
    status: string;
    tier: string;
    daily_play_limit: number | null;
    grant: { name: string; tier: string; last_date: string } | null;
  };
}

interface ErrorBody {
  error_code: string;
}

/**
 * 초대 코드 입력 E2E(`subscription-api.md` 4.8) — 실제 DB 위에서 입력 → 지급 행 · 사용 수 · `users.tier` · 응답 `plan.grant`가
 * 한 번에 맞는지, 그리고 거절 규칙(없음·꺼짐·재사용·동시 지급·한도)이 HTTP 계약대로 나가는지 본다.
 */
describe('초대 코드 입력 E2E', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  const userIds: string[] = [];
  const codeIds: string[] = [];
  const RUN = Date.now().toString(36).toUpperCase();
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

  it('코드를 입력하면 지급·사용 수·티어 캐시·응답이 함께 맞고, 같은 코드 재전송은 같은 결과다', async () => {
    const code = await seedCode(`PRO${RUN}`, {
      tier: UserTier.PRO,
      grantDays: 30,
    });
    const { userId, auth } = await createUser('a');

    // 소문자·공백이 섞여도 같은 코드다
    const first = await redeem(auth, ` pro${RUN.toLowerCase()} `).expect(
      HttpStatus.OK,
    );
    const body = first.body as SubscriptionBody;
    expect(first.headers['cache-control']).toBe('no-store');
    expect(body.plan).toMatchObject({
      status: 'free',
      tier: UserTier.PRO,
      daily_play_limit: null,
      grant: { name: 'E2E PoC', tier: UserTier.PRO },
    });
    expect(await tierOf(userId)).toBe(UserTier.PRO);

    const again = await redeem(auth, `PRO${RUN}`).expect(HttpStatus.OK);
    expect((again.body as SubscriptionBody).plan.grant).toEqual(
      body.plan.grant,
    );
    expect(await redemptionCount(code.id)).toBe(1);
    expect(
      (
        await dataSource.getRepository(InviteCode).findOneByOrFail({
          id: code.id,
        })
      ).redeemedCount,
    ).toBe(1);
  }, 60_000);

  it('없는·꺼진 코드는 404, 다른 지급 진행 중이면 409, 한도를 다 쓰면 다음 계정은 409다', async () => {
    await seedCode(`OFF${RUN}`, { isActive: false });
    await seedCode(`DAY${RUN}`, { tier: UserTier.DAILY, grantDays: 7 });
    await seedCode(`ONE${RUN}`, { maxRedemptions: 1 });
    const { auth } = await createUser('b');
    const { auth: otherAuth } = await createUser('c');

    expect(
      (
        (await redeem(auth, `NONE${RUN}`).expect(HttpStatus.NOT_FOUND))
          .body as ErrorBody
      ).error_code,
    ).toBe('INVITE_CODE_NOT_FOUND');
    expect(
      (
        (await redeem(auth, `OFF${RUN}`).expect(HttpStatus.NOT_FOUND))
          .body as ErrorBody
      ).error_code,
    ).toBe('INVITE_CODE_NOT_FOUND');

    await redeem(auth, `ONE${RUN}`).expect(HttpStatus.OK);
    expect(
      (
        (await redeem(auth, `DAY${RUN}`).expect(HttpStatus.CONFLICT))
          .body as ErrorBody
      ).error_code,
    ).toBe('INVITE_GRANT_ALREADY_ACTIVE');
    expect(
      (
        (await redeem(otherAuth, `ONE${RUN}`).expect(HttpStatus.CONFLICT))
          .body as ErrorBody
      ).error_code,
    ).toBe('INVITE_CODE_EXHAUSTED');
  }, 60_000);

  it('지급이 끝난 코드는 다시 쓸 수 없고(409), 빈 값은 400이다', async () => {
    const code = await seedCode(`USED${RUN}`, {});
    const { userId, auth } = await createUser('d');
    // 이미 쓰고 끝난 지급
    await dataSource.getRepository(InviteCodeRedemption).save({
      inviteCodeId: code.id,
      userId,
      tier: UserTier.PRO,
      startsAt: new Date(Date.now() - 10 * 86_400_000),
      endsAt: new Date(Date.now() - 86_400_000),
      tierReleasedAt: new Date(Date.now() - 86_400_000),
    });

    expect(
      (
        (await redeem(auth, `USED${RUN}`).expect(HttpStatus.CONFLICT))
          .body as ErrorBody
      ).error_code,
    ).toBe('INVITE_CODE_ALREADY_USED');
    await redeem(auth, '').expect(HttpStatus.BAD_REQUEST);
    expect(await tierOf(userId)).toBe(UserTier.LIGHT);
  }, 60_000);

  function redeem(auth: string, code: string) {
    return request(app.getHttpServer())
      .post(path('/users/me/subscription/invite-codes'))
      .set('Authorization', auth)
      .send({ code });
  }

  async function seedCode(
    code: string,
    overrides: Partial<InviteCode>,
  ): Promise<InviteCode> {
    const saved = await dataSource.getRepository(InviteCode).save({
      code,
      name: 'E2E PoC',
      tier: UserTier.PRO,
      grantDays: 30,
      grantUntilDate: null,
      ...overrides,
    });
    codeIds.push(saved.id);
    return saved;
  }

  async function redemptionCount(codeId: string): Promise<number> {
    return dataSource
      .getRepository(InviteCodeRedemption)
      .countBy({ inviteCodeId: codeId });
  }

  async function tierOf(userId: string): Promise<UserTier> {
    return (
      await dataSource.getRepository(User).findOneByOrFail({ id: userId })
    ).tier;
  }

  async function createUser(
    label: string,
  ): Promise<{ userId: string; auth: string }> {
    const repository = dataSource.getRepository(User);
    const user = await repository.save(
      repository.create({
        provider: SocialProvider.KAKAO,
        providerUserId: `e2e-invite-${RUN}-${label}`,
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
