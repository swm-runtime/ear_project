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
    LATEST_APP_VERSION: '1.0.0',
    MIN_SUPPORTED_APP_VERSION: '1.0.0',
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
});
