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
});
