import { Logger } from '@nestjs/common';

import { SlowQueryLogger } from './slow-query.logger';

describe('SlowQueryLogger', () => {
  let logged: { message: unknown; fields: Record<string, unknown> }[];

  beforeEach(() => {
    logged = [];
    jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation((message: unknown, fields: unknown) => {
        logged.push({ message, fields: fields as Record<string, unknown> });
      });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('느린 쿼리를 WARN으로 남기되 바인딩 파라미터는 기록하지 않는다', () => {
    const logger = new SlowQueryLogger();

    // TypeORM은 (time, query, parameters, queryRunner)로 부른다 — 파라미터에 개인정보가 온다
    logger.logQuerySlow(1730, 'SELECT * FROM users WHERE email = $1', [
      'user@example.com',
    ]);

    expect(logged[0].fields.duration_ms).toBe(1730);
    expect(logged[0].fields.query).toBe('SELECT * FROM users WHERE email = $1');
    expect(JSON.stringify(logged[0])).not.toContain('user@example.com');
  });

  it('쿼리 텍스트는 300자로 자른다 — 대형 IN 절이 로그 한 줄을 삼키지 않게', () => {
    const logger = new SlowQueryLogger();

    logger.logQuerySlow(1200, `SELECT ${'x'.repeat(1000)}`);

    expect((logged[0].fields.query as string).length).toBe(300);
  });
});
