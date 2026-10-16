import 'dotenv/config';

import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';

import { AppModule } from '@/app.module';
import { traceIdMiddleware } from '@/common/middlewares/trace-id.middleware';
import { SocialProvider } from '@/modules/user/user.enum';

interface UserBody {
  id: string;
  market: string;
  language_code: string | null;
  timezone: string | null;
}

interface TokenBody {
  status?: string;
  access_token: string;
  refresh_token: string;
  user?: UserBody;
  signup_token?: string;
}

interface LocaleInput {
  preferred_language?: string;
  language_code?: string;
  region_code?: string;
  timezone?: string;
}

/**
 * 글로벌 1 — 시장 모델(KAN-187 · `global-api.md` 2.1 · 4.1 · 4.2). 시장은 **가입 때 사용자가 고른 콘텐츠 언어**로 1회
 * 정해지고, 로그인·기기 등록은 언어·시간대만 갱신한다. `locale`이 없는 구 앱은 종전과 똑같이 `kr`로 가입된다.
 *
 * 제공자 호출은 개발 대역(`DevClient`)이 받는다(`setup-e2e.ts`).
 */
describe('글로벌 시장 모델 E2E', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  const userIds: string[] = [];
  const path = (p: string) => `/api/v1${p}`;

  let configService: ConfigService;

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
    // 이 파일은 글로벌 가입이 열린 상태(출시 뒤)의 판정을 본다 — 닫힌 상태는 마지막 테스트가 본다.
    // `process.env`가 아니라 ConfigService 를 바꾼다 — 검증된 env 스냅샷을 먼저 읽어 로컬 `.env` 값에 흔들린다
    configService = app.get(ConfigService);
    configService.set('GLOBAL_SIGNUP_ENABLED', 'true');
  }, 60_000);

  afterAll(async () => {
    for (const userId of userIds) {
      await dataSource.query(`DELETE FROM users WHERE id = $1`, [userId]);
    }
    await app.close();
  }, 60_000);

  it('가입 때 English를 고르면 global이고, 응답 user에 market·language_code·timezone이 실린다', async () => {
    const { signUp } = await signUpWith('en', {
      preferred_language: 'en',
      language_code: 'en-US',
      region_code: 'US',
      timezone: 'America/New_York',
    });

    expect(signUp.user).toMatchObject({
      market: 'global',
      language_code: 'en-US',
      timezone: 'America/New_York',
    });
    expect(await userRow(signUp.user!.id)).toMatchObject({
      market: 'global',
      language_code: 'en-US',
      region_code: 'US',
      timezone: 'America/New_York',
    });
  }, 60_000);

  it('영어 기기라도 한국어를 고르면 kr이다 — 기기 언어는 판정 입력이 아니다', async () => {
    const { signUp } = await signUpWith('ko-on-en-device', {
      preferred_language: 'ko',
      language_code: 'en-US',
      timezone: 'Asia/Seoul',
    });

    expect(signUp.user).toMatchObject({ market: 'kr', language_code: 'en-US' });
  }, 60_000);

  it('locale이 없는 구 앱은 종전과 같이 kr이고 로케일은 비어 있다', async () => {
    const { signUp } = await signUpWith('legacy', undefined);

    expect(signUp.user).toMatchObject({
      market: 'kr',
      language_code: null,
      timezone: null,
    });
  }, 60_000);

  it('고른 값 없이 기기 언어만 오면 기기 언어로 폴백한다(en → global)', async () => {
    const { signUp } = await signUpWith('device-fallback', {
      language_code: 'en-GB',
    });

    expect(signUp.user).toMatchObject({ market: 'global' });
  }, 60_000);

  it('다시 로그인하면 언어·시간대만 갱신되고 market은 가입 때 값 그대로다', async () => {
    const { providerToken, signUp } = await signUpWith('relogin', {
      preferred_language: 'en',
      language_code: 'en-US',
      timezone: 'America/New_York',
    });

    const again = await socialLogin(providerToken, 'e2e-market-relogin-b', {
      preferred_language: 'ko',
      language_code: 'ko-KR',
      timezone: 'Asia/Seoul',
    });

    expect(again.status).toBe('authenticated');
    expect(again.user).toMatchObject({
      id: signUp.user!.id,
      market: 'global',
      language_code: 'ko-KR',
      timezone: 'Asia/Seoul',
    });
  }, 60_000);

  it('기기 등록이 보낸 language_code·timezone은 사용자 행에 반영되고 GET /users/me에 보인다', async () => {
    const { signUp } = await signUpWith('device', {
      preferred_language: 'ko',
    });

    await request(app.getHttpServer())
      .put(path('/users/me/devices/e2e-market-device-a'))
      .set('Authorization', `Bearer ${signUp.access_token}`)
      .send({
        push_token: null,
        platform: 'ios',
        is_os_permission_granted: false,
        app_version: '3.1.1',
        language_code: 'en-AU',
        timezone: 'Australia/Sydney',
      })
      .expect(HttpStatus.NO_CONTENT);

    const me = await request(app.getHttpServer())
      .get(path('/users/me'))
      .set('Authorization', `Bearer ${signUp.access_token}`)
      .expect(HttpStatus.OK);

    expect((me.body as { user: UserBody }).user).toMatchObject({
      market: 'kr',
      language_code: 'en-AU',
      timezone: 'Australia/Sydney',
    });
  }, 60_000);

  it('형식이 아닌 시간대·지역은 버리고 가입은 막지 않는다', async () => {
    const { signUp } = await signUpWith('invalid-locale', {
      preferred_language: 'en',
      language_code: 'en',
      region_code: 'ZZ',
      timezone: 'Mars/Olympus',
    });

    expect(signUp.user).toMatchObject({
      market: 'global',
      language_code: 'en',
      timezone: null,
    });
  }, 60_000);

  it('글로벌 가입이 닫혀 있으면 English 를 골라도 kr 이다 — GLOBAL 카탈로그가 비어 온보딩에 갇히지 않게', async () => {
    // given — 글로벌 가입을 닫아 둔다(운영 기본값)
    configService.set('GLOBAL_SIGNUP_ENABLED', 'false');

    try {
      // when
      const { signUp } = await signUpWith('en-closed', {
        preferred_language: 'en',
        language_code: 'en-US',
      });

      // then
      expect(signUp.user).toMatchObject({ market: 'kr' });
      expect(await userRow(signUp.user!.id)).toMatchObject({ market: 'kr' });
    } finally {
      configService.set('GLOBAL_SIGNUP_ENABLED', 'true');
    }
  }, 60_000);

  async function signUpWith(
    label: string,
    locale: LocaleInput | undefined,
  ): Promise<{ providerToken: string; signUp: TokenBody }> {
    const providerToken = `e2e-market-${label}-${Date.now()}-${Math.floor(
      Math.random() * 1_000_000,
    )}`;
    const deviceId = `e2e-market-${label}-a`;

    const first = await socialLogin(providerToken, deviceId, locale);
    expect(first.status).toBe('consent_required');

    const response = await request(app.getHttpServer())
      .post(path('/auth/sign-up'))
      .set('Idempotency-Key', `e2e-signup-${providerToken}`)
      .send({
        signup_token: first.signup_token,
        device_id: deviceId,
        // 앱처럼 그 시장의 필수 동의를 전부 동의한다 — GLOBAL은 국외 이전 동의까지다(KAN-215)
        consents: await requiredConsentsFor(first.signup_token!, locale),
        ...(locale === undefined ? {} : { locale }),
      })
      .expect(HttpStatus.CREATED);
    const signUp = response.body as TokenBody;
    userIds.push(signUp.user!.id);

    return { providerToken, signUp };
  }

  /** 가입 동의 목록 재조회(`POST /auth/sign-up/consents`)가 준 필수 항목을 전부 동의한 입력 */
  async function requiredConsentsFor(
    signupToken: string,
    locale: LocaleInput | undefined,
  ): Promise<
    { consent_type: string; version: string | null; is_agreed: boolean }[]
  > {
    const response = await request(app.getHttpServer())
      .post(path('/auth/sign-up/consents'))
      .send({
        signup_token: signupToken,
        ...(locale === undefined ? {} : { locale }),
      })
      .expect(HttpStatus.OK);
    const body = response.body as {
      required_consents: {
        consent_type: string;
        version: string | null;
        is_required: boolean;
      }[];
    };

    return body.required_consents
      .filter((consent) => consent.is_required)
      .map((consent) => ({
        consent_type: consent.consent_type,
        version: consent.version,
        is_agreed: true,
      }));
  }

  async function socialLogin(
    providerToken: string,
    deviceId: string,
    locale: LocaleInput | undefined,
  ): Promise<TokenBody> {
    const response = await request(app.getHttpServer())
      .post(path('/auth/social-login'))
      .send({
        provider: SocialProvider.KAKAO,
        provider_token: providerToken,
        device_id: deviceId,
        ...(locale === undefined ? {} : { locale }),
      })
      .expect(HttpStatus.OK);
    return response.body as TokenBody;
  }

  async function userRow(userId: string): Promise<Record<string, unknown>> {
    const rows = await dataSource.query<Record<string, unknown>[]>(
      `SELECT market, language_code, region_code, timezone FROM users WHERE id = $1`,
      [userId],
    );
    return rows[0];
  }
});
