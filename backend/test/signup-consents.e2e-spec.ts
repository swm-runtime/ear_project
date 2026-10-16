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

interface ConsentItem {
  consent_type: string;
  version: string | null;
  is_required: boolean;
  min_age?: number;
}

interface ConsentsBody {
  required_consents: ConsentItem[];
  market: string;
}

interface SocialLoginBody {
  status: string;
  signup_token: string;
  required_consents: ConsentItem[];
}

interface LocaleInput {
  preferred_language?: string;
  language_code?: string;
  region_code?: string;
}

/**
 * 가입 동의 목록 재조회·국외 이전 동의(KAN-215 · FE KAN-216 `changes/pending/auth-signup-consents-refetch.md`).
 * 가입 흐름은 로그인 → 콘텐츠 언어 선택 → **동의 목록 재조회** → 약관 동의다. 재조회가 준 목록 그대로 동의하면 가입이
 * 통과해야 하고, GLOBAL은 국외 이전 동의 없이는 가입되지 않는다. 제공자 호출은 개발 대역(`DevClient`)이 받는다.
 */
describe('가입 동의 목록 재조회 E2E', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let configService: ConfigService;
  const userIds: string[] = [];
  const path = (p: string) => `/api/v1${p}`;

  const ENGLISH: LocaleInput = {
    preferred_language: 'en',
    language_code: 'en-US',
  };
  const KOREAN: LocaleInput = {
    preferred_language: 'ko',
    language_code: 'ko-KR',
  };

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
    // 글로벌 가입이 열린 상태(출시 뒤)를 기본으로 본다 — 닫힌 상태는 해당 테스트가 바꿨다 되돌린다.
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

  it('English를 고르면 국외 이전 동의가 필수로 오고, 그 목록 그대로 동의하면 GLOBAL로 가입된다', async () => {
    // given
    const login = await socialLogin('global');

    // when
    const consents = await refetch(login.signup_token, ENGLISH);
    const created = await signUp(
      login.signup_token,
      'global',
      consents,
      ENGLISH,
    ).expect(HttpStatus.CREATED);
    const user = (created.body as { user: { id: string; market: string } })
      .user;
    userIds.push(user.id);

    // then
    expect(consents.market).toBe('global');
    expect(consents.required_consents).toContainEqual({
      consent_type: 'cross_border_transfer',
      version: null,
      is_required: true,
    });
    // 영어판 약관·처리방침의 버전이다(KAN-212) — KR 버전과 섞이지 않는다
    expect(consents.required_consents).toContainEqual({
      consent_type: 'terms',
      version: 'global-0.1',
      is_required: true,
    });
    expect(user.market).toBe('global');
    // 21자 종류값이 그대로 저장된다(varchar 20 → 32 마이그레이션)
    const rows = await dataSource.query<{ consent_type: string }[]>(
      `SELECT consent_type FROM consents WHERE user_id = $1 AND consent_type = 'cross_border_transfer' AND is_agreed`,
      [user.id],
    );
    expect(rows).toHaveLength(1);
  }, 60_000);

  it('한국어를 고르면 국외 이전 항목이 없고 KR 목록이다 — 로그인 응답의 한국어 기기 목록과 같다', async () => {
    // given
    const login = await socialLogin('kr', KOREAN);

    // when
    const consents = await refetch(login.signup_token, KOREAN);

    // then
    expect(consents.market).toBe('kr');
    expect(consents.required_consents).toEqual(login.required_consents);
    expect(
      consents.required_consents.map((consent) => consent.consent_type),
    ).not.toContain('cross_border_transfer');
  }, 60_000);

  it('글로벌 가입이 닫혀 있으면 English를 골라도 KR 목록과 market kr을 준다', async () => {
    // given — 운영 기본값
    configService.set('GLOBAL_SIGNUP_ENABLED', 'false');

    try {
      const login = await socialLogin('closed');

      // when
      const consents = await refetch(login.signup_token, ENGLISH);

      // then
      expect(consents.market).toBe('kr');
      expect(
        consents.required_consents.map((consent) => consent.consent_type),
      ).not.toContain('cross_border_transfer');
    } finally {
      configService.set('GLOBAL_SIGNUP_ENABLED', 'true');
    }
  }, 60_000);

  it('signup_token이 위조·만료면 401 AUTH_SIGNUP_TOKEN_EXPIRED', async () => {
    // when
    const response = await request(app.getHttpServer())
      .post(path('/auth/sign-up/consents'))
      .send({ signup_token: 'not-a-signup-token', locale: ENGLISH })
      .expect(HttpStatus.UNAUTHORIZED);

    // then
    expect(response.body).toMatchObject({
      error_code: 'AUTH_SIGNUP_TOKEN_EXPIRED',
    });
  }, 60_000);

  it('GLOBAL 가입에 국외 이전 동의가 빠지면 400 CONSENT_REQUIRED이고 계정이 생기지 않는다', async () => {
    // given — 국외 이전 동의를 모르는 구 화면처럼 KR 필수 3종만 보낸다
    const login = await socialLogin('missing');
    const consents = await refetch(login.signup_token, ENGLISH);
    const withoutCrossBorder: ConsentsBody = {
      ...consents,
      required_consents: consents.required_consents.filter(
        (consent) => consent.consent_type !== 'cross_border_transfer',
      ),
    };

    // when
    const response = await signUp(
      login.signup_token,
      'missing',
      withoutCrossBorder,
      ENGLISH,
    ).expect(HttpStatus.BAD_REQUEST);

    // then
    expect(response.body).toMatchObject({ error_code: 'CONSENT_REQUIRED' });
    // 같은 제공자 토큰으로 다시 로그인해도 여전히 신규다 — 계정이 생기지 않았다
    await socialLogin('missing');
  }, 60_000);

  it('국외 이전 동의 기록이 없는 GLOBAL 기존 가입자는 세션 복원에서 한 번 요구받는다', async () => {
    // given — GLOBAL로 가입한 뒤 국외 이전 동의 행만 없앤다(도입 전 가입자와 같은 상태)
    const login = await socialLogin('existing');
    const consents = await refetch(login.signup_token, ENGLISH);
    const created = await signUp(
      login.signup_token,
      'existing',
      consents,
      ENGLISH,
    ).expect(HttpStatus.CREATED);
    const body = created.body as { user: { id: string }; access_token: string };
    userIds.push(body.user.id);
    await dataSource.query(
      `DELETE FROM consents WHERE user_id = $1 AND consent_type = 'cross_border_transfer'`,
      [body.user.id],
    );

    // when
    const me = await request(app.getHttpServer())
      .get(path('/users/me'))
      .set('Authorization', `Bearer ${body.access_token}`)
      .expect(HttpStatus.OK);

    // then
    expect(
      (me.body as { pending_consents: ConsentItem[] }).pending_consents,
    ).toEqual([
      {
        consent_type: 'cross_border_transfer',
        version: null,
        is_required: true,
      },
    ]);
  }, 60_000);

  describe('연령 확인 기준 연령(KAN-220)', () => {
    const ageItem = (body: ConsentsBody) =>
      body.required_consents.find(
        (consent) => consent.consent_type === 'age_confirmation',
      );

    it('GLOBAL·싱가포르 기기면 min_age 16, 말레이시아·지역 없음이면 18이다', async () => {
      // given
      const login = await socialLogin('age-regions');

      // when
      const sg = await refetch(login.signup_token, {
        ...ENGLISH,
        region_code: 'SG',
      });
      const my = await refetch(login.signup_token, {
        ...ENGLISH,
        region_code: 'MY',
      });
      const unknown = await refetch(login.signup_token, ENGLISH);

      // then
      expect(ageItem(sg)).toMatchObject({ min_age: 16, version: 'age-16' });
      expect(ageItem(my)).toMatchObject({ min_age: 18, version: 'age-18' });
      expect(ageItem(unknown)).toMatchObject({ min_age: 18 });
    }, 60_000);

    it('KR 시장은 지역과 무관하게 18이고 연령 버전은 종전처럼 null이다', async () => {
      // given
      const login = await socialLogin('age-kr', KOREAN);

      // when
      const consents = await refetch(login.signup_token, {
        ...KOREAN,
        region_code: 'SG',
      });

      // then
      expect(ageItem(consents)).toEqual({
        consent_type: 'age_confirmation',
        version: null,
        is_required: true,
        min_age: 18,
      });
    }, 60_000);

    it('싱가포르 기기로 가입하면 16세 기준 확인이 기록되고, 18세 지역으로 옮기면 세션 복원이 18세 확인을 요구한다', async () => {
      // given — 싱가포르 기기로 재조회한 목록 그대로 가입한다
      const locale = { ...ENGLISH, region_code: 'SG' };
      const login = await socialLogin('age-moved');
      const consents = await refetch(login.signup_token, locale);
      const created = await signUp(
        login.signup_token,
        'age-moved',
        consents,
        locale,
      ).expect(HttpStatus.CREATED);
      const body = created.body as {
        user: { id: string };
        access_token: string;
      };
      userIds.push(body.user.id);
      const rows = await dataSource.query<{ version: string | null }[]>(
        `SELECT version FROM consents WHERE user_id = $1 AND consent_type = 'age_confirmation'`,
        [body.user.id],
      );
      expect(rows).toEqual([{ version: 'age-16' }]);

      // when — 로그인마다 갱신되는 기기 지역이 말레이시아가 됐다
      await dataSource.query(
        `UPDATE users SET region_code = 'MY' WHERE id = $1`,
        [body.user.id],
      );
      const me = await request(app.getHttpServer())
        .get(path('/users/me'))
        .set('Authorization', `Bearer ${body.access_token}`)
        .expect(HttpStatus.OK);

      // then
      expect(
        (me.body as { pending_consents: ConsentItem[] }).pending_consents,
      ).toEqual([
        {
          consent_type: 'age_confirmation',
          version: 'age-18',
          is_required: true,
          min_age: 18,
        },
      ]);
    }, 60_000);
  });

  const runId = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;

  function providerToken(label: string): string {
    return `e2e-signup-consents-${label}-${runId}`;
  }

  /** 개발 대역은 같은 제공자 토큰을 같은 계정으로 본다 — 라벨마다 다른 신규 사용자다 */
  async function socialLogin(
    label: string,
    locale?: LocaleInput,
  ): Promise<SocialLoginBody> {
    const response = await request(app.getHttpServer())
      .post(path('/auth/social-login'))
      .send({
        provider: SocialProvider.KAKAO,
        provider_token: providerToken(label),
        device_id: `e2e-signup-consents-${label}`,
        ...(locale === undefined ? {} : { locale }),
      })
      .expect(HttpStatus.OK);
    const body = response.body as SocialLoginBody;
    expect(body.status).toBe('consent_required');

    return body;
  }

  async function refetch(
    signupToken: string,
    locale: LocaleInput,
  ): Promise<ConsentsBody> {
    const response = await request(app.getHttpServer())
      .post(path('/auth/sign-up/consents'))
      .send({ signup_token: signupToken, locale })
      .expect(HttpStatus.OK);

    return response.body as ConsentsBody;
  }

  /** 받은 목록의 필수 항목을 전부 동의해 보낸다 — 앱의 A4 [동의하고 시작하기]와 같다 */
  function signUp(
    signupToken: string,
    label: string,
    consents: ConsentsBody,
    locale: LocaleInput,
  ): request.Test {
    return request(app.getHttpServer())
      .post(path('/auth/sign-up'))
      .set('Idempotency-Key', `e2e-signup-consents-${label}-${runId}`)
      .send({
        signup_token: signupToken,
        device_id: `e2e-signup-consents-${label}`,
        consents: consents.required_consents
          .filter((consent) => consent.is_required)
          .map((consent) => ({
            consent_type: consent.consent_type,
            version: consent.version,
            is_agreed: true,
          })),
        locale,
      });
  }
});
