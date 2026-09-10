import 'dotenv/config';

import { DataSource, DataSourceOptions } from 'typeorm';

import { EnvironmentVariables, validateEnv } from '@/config/env.validation';

import { SLOW_QUERY_MS, SlowQueryLogger } from './slow-query.logger';

export type DatabaseEnv = Pick<
  EnvironmentVariables,
  'DB_HOST' | 'DB_PORT' | 'DB_USERNAME' | 'DB_PASSWORD' | 'DB_NAME'
>;

export function buildDataSourceOptions(env: DatabaseEnv): DataSourceOptions {
  return {
    type: 'postgres',
    host: env.DB_HOST,
    port: env.DB_PORT,
    username: env.DB_USERNAME,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    // architecture.md 6 / convention.md 4.5 — 스키마 변경은 마이그레이션으로만 관리한다
    synchronize: false,
    migrationsRun: false,
    entities: [`${__dirname}/../**/*.entity{.ts,.js}`],
    migrations: [`${__dirname}/migrations/*{.ts,.js}`],
    migrationsTableName: 'migrations',
    // 이 시간을 넘긴 쿼리만 WARN으로 남긴다 — 파라미터 비기록 (slow-query.logger.ts)
    maxQueryExecutionTime: SLOW_QUERY_MS,
    logger: new SlowQueryLogger(),
    /**
     * 풀 상한과 연결 대기 상한을 드라이버 기본값에 맡기지 않고 명시한다(2026-09-09 감사).
     * 기본값(pg: max 10, 연결 대기 무제한)은 그대로 두더라도 **값이 코드에 보여야** 운영이
     * 인스턴스 수·DB `max_connections`(postgres 기본 100)와 대조할 수 있다. 연결 대기는
     * 상한이 없으면 DB가 멈췄을 때 요청이 풀에서 영원히 기다린다 — 실패로 드러나야 알림이 간다.
     */
    poolSize: DB_POOL_SIZE,
    extra: {
      connectionTimeoutMillis: DB_CONNECTION_TIMEOUT_MS,
      idleTimeoutMillis: DB_IDLE_TIMEOUT_MS,
    },
  };
}

/** 인스턴스 1대 기준. 인스턴스를 늘리면 합이 DB `max_connections`를 넘지 않게 함께 본다 */
const DB_POOL_SIZE = 10;
/** 풀에서 연결을 받기까지의 대기 상한 — 넘기면 예외로 드러난다 */
const DB_CONNECTION_TIMEOUT_MS = 5_000;
/** 유휴 연결 회수 — 야간처럼 트래픽이 없을 때 DB 쪽 세션을 오래 붙들지 않는다 */
const DB_IDLE_TIMEOUT_MS = 30_000;

/** TypeORM CLI 전용 엔트리. 애플리케이션 런타임은 DatabaseModule을 사용한다. */
export default new DataSource(buildDataSourceOptions(validateEnv(process.env)));
