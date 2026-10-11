import 'dotenv/config';

import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';

import { AppModule } from '@/app.module';
import { ErrorCode } from '@/common/exceptions/error-code.enum';
import { traceIdMiddleware } from '@/common/middlewares/trace-id.middleware';
import { sha256Hex } from '@/common/utils/hash.util';
import { SessionRevokedReason } from '@/modules/auth/auth.enum';
import { Session } from '@/modules/auth/session.entity';
import { SocialProvider } from '@/modules/user/user.enum';

interface TokenBody {
  status?: string;
  access_token: string;
  refresh_token: string;
  user?: { id: string };
}

interface SocialLoginBody extends Partial<TokenBody> {
  status: string;
  signup_token?: string;
}

interface ErrorBody {
  error_code: string;
}

/**
 * 갱신 토큰 폐기 사유 E2E(KAN-167 · `auth-api.md` 4.3) — 실제 DB 위에서 **로그아웃으로 폐기된 토큰**의 재제출은
 * INVALID로만 끝나 다른 기기를 건드리지 않고, **회전된 토큰**의 재제출은 종전대로 REUSED + 사용자 세션 전체 폐기인지 본다.
 *
 * 제공자 호출은 개발 대역(`DevClient`)이 받는다(`setup-e2e.ts`) — 같은 제공자 토큰이면 같은 계정이다.
 */
describe('갱신 토큰 폐기 사유 E2E', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  const userIds: string[] = [];
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
    await app.close();
  }, 60_000);

  it('기기 A가 로그아웃한 뒤 A의 옛 refresh token으로 갱신하면 INVALID이고 기기 B는 계속 갱신된다', async () => {
    const { userId, a, b } = await signInTwoDevices('logout');

    await request(app.getHttpServer())
      .post(path('/auth/logout'))
      .set('Authorization', `Bearer ${a.access_token}`)
      .send({ device_id: a.deviceId })
      .expect(HttpStatus.NO_CONTENT);

    // 로그아웃 204 직후, 로컬 삭제 전에 자동 갱신이 옛 토큰을 실어 보낸 경우
    const stale = await refresh(a.refresh_token, a.deviceId).expect(
      HttpStatus.UNAUTHORIZED,
    );
    expect((stale.body as ErrorBody).error_code).toBe(
      ErrorCode.AUTH_REFRESH_TOKEN_INVALID,
    );
    expect(await sessionOf(a.refresh_token)).toMatchObject({
      revokedReason: SessionRevokedReason.LOGOUT,
    });

    // B의 세션은 살아 있다 — 탈취 판정으로 번지지 않았다
    expect(await sessionOf(b.refresh_token)).toMatchObject({
      revokedAt: null,
      revokedReason: null,
    });
    await refresh(b.refresh_token, b.deviceId).expect(HttpStatus.OK);
    expect(await activeSessionCount(userId)).toBe(1);
  }, 60_000);

  it('회전된 옛 토큰으로 다시 갱신하면 REUSED이고 그 사용자의 모든 세션이 폐기된다', async () => {
    const { userId, a, b } = await signInTwoDevices('rotate');

    const rotated = await refresh(a.refresh_token, a.deviceId).expect(
      HttpStatus.OK,
    );
    const next = rotated.body as TokenBody;
    expect(await sessionOf(a.refresh_token)).toMatchObject({
      revokedReason: SessionRevokedReason.ROTATED,
    });

    const reused = await refresh(a.refresh_token, a.deviceId).expect(
      HttpStatus.UNAUTHORIZED,
    );
    expect((reused.body as ErrorBody).error_code).toBe(
      ErrorCode.AUTH_REFRESH_TOKEN_REUSED,
    );
    expect(await activeSessionCount(userId)).toBe(0);
    expect(await sessionOf(b.refresh_token)).toMatchObject({
      revokedReason: SessionRevokedReason.REUSE_DETECTED,
    });

    // 함께 끊긴 세션의 토큰은 회전된 토큰이 아니다 — 갱신은 막히되 REUSED로 다시 판정하지 않는다
    for (const [token, deviceId] of [
      [next.refresh_token, a.deviceId],
      [b.refresh_token, b.deviceId],
    ]) {
      const response = await refresh(token, deviceId).expect(
        HttpStatus.UNAUTHORIZED,
      );
      expect((response.body as ErrorBody).error_code).toBe(
        ErrorCode.AUTH_REFRESH_TOKEN_INVALID,
      );
    }
  }, 60_000);

  const refresh = (refreshToken: string, deviceId: string) =>
    request(app.getHttpServer())
      .post(path('/auth/token/refresh'))
      .send({ refresh_token: refreshToken, device_id: deviceId });

  async function sessionOf(refreshToken: string): Promise<Session> {
    return dataSource.getRepository(Session).findOneByOrFail({
      refreshTokenHash: sha256Hex(refreshToken),
    });
  }

  async function activeSessionCount(userId: string): Promise<number> {
    const rows = await dataSource.query<{ count: number }[]>(
      `SELECT count(*)::int AS count FROM sessions WHERE user_id = $1 AND revoked_at IS NULL`,
      [userId],
    );
    return rows[0].count;
  }

  /** 소셜 로그인 → 가입(기기 A) → 같은 계정으로 다시 소셜 로그인(기기 B) */
  async function signInTwoDevices(label: string): Promise<{
    userId: string;
    a: TokenBody & { deviceId: string };
    b: TokenBody & { deviceId: string };
  }> {
    const providerToken = `e2e-refresh-${label}-${Date.now()}-${Math.floor(
      Math.random() * 1_000_000,
    )}`;
    const deviceA = `e2e-refresh-${label}-a`;
    const deviceB = `e2e-refresh-${label}-b`;

    const first = await socialLogin(providerToken, deviceA);
    expect(first.status).toBe('consent_required');

    const signUp = await request(app.getHttpServer())
      .post(path('/auth/sign-up'))
      .set('Idempotency-Key', `e2e-signup-${providerToken}`)
      .send({
        signup_token: first.signup_token,
        device_id: deviceA,
        consents: [
          { consent_type: 'terms', version: '0.1', is_agreed: true },
          { consent_type: 'privacy', version: '0.1', is_agreed: true },
          { consent_type: 'age_confirmation', version: null, is_agreed: true },
        ],
      })
      .expect(HttpStatus.CREATED);
    const a = signUp.body as TokenBody;
    const userId = a.user!.id;
    userIds.push(userId);

    const second = await socialLogin(providerToken, deviceB);
    expect(second.status).toBe('authenticated');

    return {
      userId,
      a: { ...a, deviceId: deviceA },
      b: { ...(second as TokenBody), deviceId: deviceB },
    };
  }

  async function socialLogin(
    providerToken: string,
    deviceId: string,
  ): Promise<SocialLoginBody> {
    const response = await request(app.getHttpServer())
      .post(path('/auth/social-login'))
      .send({
        provider: SocialProvider.KAKAO,
        provider_token: providerToken,
        device_id: deviceId,
      })
      .expect(HttpStatus.OK);
    return response.body as SocialLoginBody;
  }
});
