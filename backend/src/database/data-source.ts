import 'dotenv/config';

import { DataSource, DataSourceOptions } from 'typeorm';

import { EnvironmentVariables, validateEnv } from '@/config/env.validation';

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
  };
}

/** TypeORM CLI 전용 엔트리. 애플리케이션 런타임은 DatabaseModule을 사용한다. */
export default new DataSource(buildDataSourceOptions(validateEnv(process.env)));
