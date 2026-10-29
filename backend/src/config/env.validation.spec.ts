import { NodeEnv, validateEnv } from './env.validation';

describe('validateEnv', () => {
  const validEnv = {
    NODE_ENV: 'development',
    PORT: '3000',
    DB_HOST: 'localhost',
    DB_PORT: '5432',
    DB_USERNAME: 'ear',
    DB_PASSWORD: 'ear',
    DB_NAME: 'ear',
    CORS_ORIGINS: 'http://localhost:8081',
    JWT_SECRET: 'test-jwt-secret-0123456789-0123456789',
    APPLE_CLIENT_ID: 'com.example.ear',
    APPLE_SERVICES_ID: 'com.example.ear.signin',
    GOOGLE_WEB_CLIENT_ID: '000-example.apps.googleusercontent.com',
    KAKAO_APP_ID: '1234567',
    ARCHIVE_HASH_PEPPER: 'test-archive-pepper-0123456789-0123456',
    WITHDRAWAL_HASH_PEPPER: 'test-withdrawal-pepper-0123456789-0123',
    LATEST_APP_VERSION_IOS: '1.0.0',
    LATEST_APP_VERSION_ANDROID: '1.0.0',
    MIN_SUPPORTED_APP_VERSION_IOS: '1.0.0',
    MIN_SUPPORTED_APP_VERSION_ANDROID: '1.0.0',
    AUDIO_URL_SIGNING_KEY: 'test-audio-signing-key-0123456789-0123',
    AUDIO_URL_BASE_URL: 'http://localhost:3000/api/v1/audio',
    AUDIO_STORAGE_ROOT: './storage/audio',
  };

  it.each([
    'Production',
    'Production,Sandbox',
    'Production, Sandbox',
    ' Sandbox , Production ',
    '',
  ])(
    'APP_STORE_ENVIRONMENTS="%s" 는 받는다 — 쉼표 앞뒤 공백으로 기동이 실패하지 않는다',
    (value) => {
      expect(() =>
        validateEnv({ ...validEnv, APP_STORE_ENVIRONMENTS: value }),
      ).not.toThrow();
    },
  );

  it.each(['Xcode', 'Production;Sandbox', 'Production,Sandbox,Production'])(
    'APP_STORE_ENVIRONMENTS="%s" 는 거부한다',
    (value) => {
      expect(() =>
        validateEnv({ ...validEnv, APP_STORE_ENVIRONMENTS: value }),
      ).toThrow();
    },
  );

  it('필수 환경 변수가 모두 있으면 숫자 타입으로 변환된 설정을 반환한다', () => {
    // given
    const config = { ...validEnv };

    // when
    const result = validateEnv(config);

    // then
    expect(result.NODE_ENV).toBe(NodeEnv.DEVELOPMENT);
    expect(result.PORT).toBe(3000);
    expect(result.DB_PORT).toBe(5432);
  });

  it('필수 환경 변수가 누락되면 기동을 실패시킨다', () => {
    // given
    const config: Record<string, string> = { ...validEnv };
    delete config.DB_PASSWORD;

    // when
    const validate = () => validateEnv(config);

    // then
    expect(validate).toThrow(/DB_PASSWORD/);
  });

  it('검증 실패 메시지에 환경 변수 값을 담지 않는다', () => {
    // given
    const config = { ...validEnv, NODE_ENV: 'staging' };

    // when
    const validate = () => validateEnv(config);

    // then
    expect(validate).toThrow(/NODE_ENV/);
    expect(validate).not.toThrow(/staging/);
  });

  it('알 수 없는 NODE_ENV 값이면 기동을 실패시킨다', () => {
    // given
    const config = { ...validEnv, NODE_ENV: 'qa' };

    // when
    const validate = () => validateEnv(config);

    // then
    expect(validate).toThrow(/environment validation failed/);
  });

  it('TRUST_PROXY_HOPS가 없으면 0(끔)이 기본이다', () => {
    // given — 프록시가 없는 환경에서 켜져 있으면 IP 위조 구멍이 된다. 기본은 반드시 끔이다
    const config = { ...validEnv };

    // when
    const result = validateEnv(config);

    // then
    expect(result.TRUST_PROXY_HOPS).toBe(0);
  });

  it('TRUST_PROXY_HOPS가 음수면 기동을 실패시킨다', () => {
    // given
    const config = { ...validEnv, TRUST_PROXY_HOPS: '-1' };

    // when
    const validate = () => validateEnv(config);

    // then
    expect(validate).toThrow(/TRUST_PROXY_HOPS/);
  });

  it('플랫폼별 버전 중 하나만 빠져도 기동을 실패시킨다', () => {
    // given — 넷 다 필수다. 폴백을 두면 일부만 채운 배포에서 어느 값이 쓰였는지가 조용해진다
    const config: Record<string, string> = { ...validEnv };
    delete config.LATEST_APP_VERSION_ANDROID;

    // when
    const validate = () => validateEnv(config);

    // then
    expect(validate).toThrow(/LATEST_APP_VERSION_ANDROID/);
  });

  it('버전 값이 semver가 아니면 기동을 실패시킨다', () => {
    // given
    const config = { ...validEnv, MIN_SUPPORTED_APP_VERSION_IOS: '1.0' };

    // when
    const validate = () => validateEnv(config);

    // then
    expect(validate).toThrow(/MIN_SUPPORTED_APP_VERSION_IOS/);
  });

  describe('비밀값 상호 중복', () => {
    it.each([
      ['ARCHIVE_HASH_PEPPER', 'WITHDRAWAL_HASH_PEPPER'],
      ['JWT_SECRET', 'AUDIO_URL_SIGNING_KEY'],
      ['JWT_SECRET', 'PIPELINE_SSO_SECRET'],
    ] as [keyof typeof validEnv, string][])(
      '%s와 %s이 같은 값이면 기동을 실패시킨다',
      (left, right) => {
        // given — 길이 제약은 둘 다 통과한다. 값이 같은 것만이 문제다
        const config = { ...validEnv, [right]: validEnv[left] };

        // when
        const validate = () => validateEnv(config);

        // then
        expect(validate).toThrow(/서로 다른 값이어야 합니다/);
      },
    );

    it('실패 메시지에 비밀값 자체를 담지 않는다', () => {
      // given — 부팅 로그·CI 출력에 살아 있는 키가 찍히면 검사가 새 유출 경로가 된다
      const config = { ...validEnv, ARCHIVE_HASH_PEPPER: validEnv.JWT_SECRET };

      // when
      const validate = () => validateEnv(config);

      // then
      expect(validate).toThrow(/JWT_SECRET, ARCHIVE_HASH_PEPPER/);
      expect(validate).not.toThrow(new RegExp(validEnv.JWT_SECRET));
    });

    it('선택값이 비어 있으면 서로 같다고 보지 않는다', () => {
      // given — 미설정끼리 겹쳤다고 막으면 파이프라인 SSO를 끄고 띄울 수 없다
      const config = {
        ...validEnv,
        PIPELINE_SSO_SECRET: '',
        CLOUDFRONT_PRIVATE_KEY_BASE64: '',
      };

      // when
      const validate = () => validateEnv(config);

      // then
      expect(validate).not.toThrow();
    });
  });

  it('PIPELINE_SSO_SECRET이 빈 문자열이면 미설정으로 보고 기동한다', () => {
    // given — `.env.example`이 `PIPELINE_SSO_SECRET=`로 배포된다. 이걸 막으면
    // 예제를 그대로 복사한 사람이 서버를 띄울 수 없다(auth-api.md 4.12 — 미설정 시 503)
    const config = { ...validEnv, PIPELINE_SSO_SECRET: '' };

    // when
    const validate = () => validateEnv(config);

    // then
    expect(validate).not.toThrow();
  });

  it('SIGNUP_TRIAL_ENABLED 는 true·false·빈 값만 받는다 — 오타로 체험이 조용히 꺼지거나 켜지지 않게', () => {
    expect(() =>
      validateEnv({ ...validEnv, SIGNUP_TRIAL_ENABLED: 'yes' }),
    ).toThrow(/SIGNUP_TRIAL_ENABLED/);
    for (const value of ['true', 'false', '']) {
      expect(() =>
        validateEnv({ ...validEnv, SIGNUP_TRIAL_ENABLED: value }),
      ).not.toThrow();
    }
    expect(() => validateEnv(validEnv)).not.toThrow();
  });

  it('FIRST_DRIP_RANDOM_ENABLED 는 true·false·빈 값만 받는다 — 오타로 실험이 조용히 켜지거나 꺼지지 않게', () => {
    expect(() =>
      validateEnv({ ...validEnv, FIRST_DRIP_RANDOM_ENABLED: 'on' }),
    ).toThrow(/FIRST_DRIP_RANDOM_ENABLED/);
    for (const value of ['true', 'false', '']) {
      expect(() =>
        validateEnv({ ...validEnv, FIRST_DRIP_RANDOM_ENABLED: value }),
      ).not.toThrow();
    }
  });

  it('RETENTION_MORNING_PUSH_MODE 는 off·dry_run·on·빈 값만 받는다(KAN-288)', () => {
    expect(() =>
      validateEnv({ ...validEnv, RETENTION_MORNING_PUSH_MODE: 'true' }),
    ).toThrow(/RETENTION_MORNING_PUSH_MODE/);
    for (const value of ['off', 'dry_run', 'on', '']) {
      expect(() =>
        validateEnv({ ...validEnv, RETENTION_MORNING_PUSH_MODE: value }),
      ).not.toThrow();
    }
  });

  it('DRIP_ARRIVAL_AB_ENABLED 는 true·false·빈 값만 받는다(KAN-289)', () => {
    expect(() =>
      validateEnv({ ...validEnv, DRIP_ARRIVAL_AB_ENABLED: 'on' }),
    ).toThrow(/DRIP_ARRIVAL_AB_ENABLED/);
    for (const value of ['true', 'false', '']) {
      expect(() =>
        validateEnv({ ...validEnv, DRIP_ARRIVAL_AB_ENABLED: value }),
      ).not.toThrow();
    }
  });

  it('SERIES_PAYWALL_ENABLED 는 true·false·빈 값만, SERIES_FREE_EPISODES 는 1~99 정수이거나 빈 값이다(KAN-290)', () => {
    expect(() =>
      validateEnv({ ...validEnv, SERIES_PAYWALL_ENABLED: 'on' }),
    ).toThrow(/SERIES_PAYWALL_ENABLED/);
    for (const value of ['true', 'false', '']) {
      expect(() =>
        validateEnv({ ...validEnv, SERIES_PAYWALL_ENABLED: value }),
      ).not.toThrow();
    }
    // 0이면 1편(탐험·첫 드립이 주는 시리즈 도입부)까지 잠긴다 — 받지 않는다
    for (const value of ['0', '-1', '3.5', 'three', '100']) {
      expect(() =>
        validateEnv({ ...validEnv, SERIES_FREE_EPISODES: value }),
      ).toThrow(/SERIES_FREE_EPISODES/);
    }
    for (const value of ['1', '3', '99', '']) {
      expect(() =>
        validateEnv({ ...validEnv, SERIES_FREE_EPISODES: value }),
      ).not.toThrow();
    }
  });

  it('PLAN_DISCOUNT_* — 스위치는 true·false·빈 값만, 정가는 양의 정수이거나 빈 값이다(KAN-286)', () => {
    expect(() =>
      validateEnv({ ...validEnv, PLAN_DISCOUNT_DISPLAY_ENABLED: 'yes' }),
    ).toThrow(/PLAN_DISCOUNT_DISPLAY_ENABLED/);
    for (const key of [
      'PLAN_DISCOUNT_ORIGINAL_PRICE_DAILY_KRW',
      'PLAN_DISCOUNT_ORIGINAL_PRICE_PRO_KRW',
    ]) {
      for (const value of ['0', '-1', '3,900', '3900.5', 'abc']) {
        expect(() => validateEnv({ ...validEnv, [key]: value })).toThrow(
          new RegExp(key),
        );
      }
      for (const value of ['', '3900', '9900']) {
        expect(() => validateEnv({ ...validEnv, [key]: value })).not.toThrow();
      }
    }
  });

  it('CONTENT_REVIEW_ENABLED 는 true·false·빈 값만 받는다 — 오타로 후기가 처리방침 시행 전에 켜지지 않게', () => {
    expect(() =>
      validateEnv({ ...validEnv, CONTENT_REVIEW_ENABLED: 'on' }),
    ).toThrow(/CONTENT_REVIEW_ENABLED/);
    for (const value of ['true', 'false', '']) {
      expect(() =>
        validateEnv({ ...validEnv, CONTENT_REVIEW_ENABLED: value }),
      ).not.toThrow();
    }
  });

  it('CONTENT_REVIEW_REWARD_ENABLED 는 true·false·빈 값만 받는다 — 오타로 보상이 조용히 나가거나 멈추지 않게', () => {
    expect(() =>
      validateEnv({ ...validEnv, CONTENT_REVIEW_REWARD_ENABLED: 'yes' }),
    ).toThrow(/CONTENT_REVIEW_REWARD_ENABLED/);
    for (const value of ['true', 'false', '']) {
      expect(() =>
        validateEnv({ ...validEnv, CONTENT_REVIEW_REWARD_ENABLED: value }),
      ).not.toThrow();
    }
  });

  it('SIGNUP_TRIAL_DAYS 는 1~30 정수이고 비워도 된다 — 배포 스크립트가 빈 값으로 선언해 둔다', () => {
    for (const value of ['0', '31', '7.5', 'week', '-1']) {
      expect(() =>
        validateEnv({ ...validEnv, SIGNUP_TRIAL_DAYS: value }),
      ).toThrow(/SIGNUP_TRIAL_DAYS/);
    }
    for (const value of ['', '1', '7', '14', '30']) {
      expect(() =>
        validateEnv({ ...validEnv, SIGNUP_TRIAL_DAYS: value }),
      ).not.toThrow();
    }
  });

  it('SIGNUP_TRIAL_EXISTING_USERS_BEFORE 는 YYYY-MM-DD 날짜이고 비워도 된다 — 잘못된 값으로 조용히 아무도 못 받지 않게', () => {
    for (const value of ['2026-10-1', '20261011', 'true', '2026-13-01']) {
      expect(() =>
        validateEnv({
          ...validEnv,
          SIGNUP_TRIAL_EXISTING_USERS_BEFORE: value,
        }),
      ).toThrow(/SIGNUP_TRIAL_EXISTING_USERS_BEFORE/);
    }
    for (const value of ['', '2026-10-11']) {
      expect(() =>
        validateEnv({
          ...validEnv,
          SIGNUP_TRIAL_EXISTING_USERS_BEFORE: value,
        }),
      ).not.toThrow();
    }
  });

  it('SENTRY_WEBHOOK_TOKEN 은 비우거나 URL 경로에 안전한 16자 이상 — 짧은 토큰은 기동을 실패시킨다', () => {
    for (const value of [
      'short',
      'has space in it xxxx',
      'slash/inside/xxxxxxxxxxxx',
    ]) {
      expect(() =>
        validateEnv({ ...validEnv, SENTRY_WEBHOOK_TOKEN: value }),
      ).toThrow(/SENTRY_WEBHOOK_TOKEN/);
    }
    for (const value of ['', 'abcdefghijklmnop', 'A-Z_09'.repeat(4)]) {
      expect(() =>
        validateEnv({ ...validEnv, SENTRY_WEBHOOK_TOKEN: value }),
      ).not.toThrow();
    }
  });

  it('SERVICE_DAY_BOUNDARY_05_FROM 은 ISO 시각이고 KST 04시대는 거부한다 — 그 구간 전환은 날짜가 거꾸로 간다(KAN-149)', () => {
    for (const value of [
      'not-a-date',
      '2026-10-14', // 날짜만 — UTC 자정 = KST 09:00 이라 통과할 것 같지만 시각을 요구한다
      '2026-10-14T04:00:00+09:00',
      '2026-10-14T04:59:59+09:00',
      '2026-10-13T19:30:00Z', // = KST 04:30
    ]) {
      expect(() =>
        validateEnv({ ...validEnv, SERVICE_DAY_BOUNDARY_05_FROM: value }),
      ).toThrow(/SERVICE_DAY_BOUNDARY_05_FROM/);
    }
    for (const value of [
      '',
      '2026-10-14T05:00:00+09:00',
      '2026-10-13T20:00:00.000Z', // = KST 05:00
      '2026-10-14T03:59:00+09:00',
    ]) {
      expect(() =>
        validateEnv({ ...validEnv, SERVICE_DAY_BOUNDARY_05_FROM: value }),
      ).not.toThrow();
    }
  });

  it('CLUSTER_WORKERS 가 auto 또는 1~8 이 아니면 기동을 실패시킨다 — 오타로 조용히 1워커가 되지 않게', () => {
    expect(() => validateEnv({ ...validEnv, CLUSTER_WORKERS: 'two' })).toThrow(
      /CLUSTER_WORKERS/,
    );
    expect(() => validateEnv({ ...validEnv, CLUSTER_WORKERS: '0' })).toThrow(
      /CLUSTER_WORKERS/,
    );
    expect(() =>
      validateEnv({ ...validEnv, CLUSTER_WORKERS: 'auto' }),
    ).not.toThrow();
    expect(() =>
      validateEnv({ ...validEnv, CLUSTER_WORKERS: '2' }),
    ).not.toThrow();
  });

  it('AUDIO_URL_BASE_URL 이 비었거나 절대 URL 이 아니면 기동을 실패시킨다 — 서명 URL 이 상대 경로로 나간다', () => {
    expect(() => validateEnv({ ...validEnv, AUDIO_URL_BASE_URL: '' })).toThrow(
      /AUDIO_URL_BASE_URL/,
    );
    expect(() =>
      validateEnv({ ...validEnv, AUDIO_URL_BASE_URL: 'audio' }),
    ).toThrow(/AUDIO_URL_BASE_URL/);
  });
});
