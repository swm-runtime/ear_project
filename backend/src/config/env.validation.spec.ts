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
});
