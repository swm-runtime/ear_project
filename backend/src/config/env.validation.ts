import { plainToInstance, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsString,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

export enum NodeEnv {
  DEVELOPMENT = 'development',
  TEST = 'test',
  PRODUCTION = 'production',
}

/**
 * architecture.md 9.5 — 모든 비밀값은 환경 변수로 주입하고, 부팅 시 스키마를 검증한다.
 * 누락되면 기본값으로 넘어가지 않고 기동을 실패시킨다.
 */
export class EnvironmentVariables {
  @IsEnum(NodeEnv)
  NODE_ENV: NodeEnv;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT: number;

  @IsString()
  @IsNotEmpty()
  DB_HOST: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  DB_PORT: number;

  @IsString()
  @IsNotEmpty()
  DB_USERNAME: string;

  @IsString()
  @IsNotEmpty()
  DB_PASSWORD: string;

  @IsString()
  @IsNotEmpty()
  DB_NAME: string;

  /** 쉼표로 구분한 허용 오리진 목록. `*`를 쓰지 않는다 (architecture.md 9.5) */
  @IsString()
  @IsNotEmpty()
  CORS_ORIGINS: string;

  /** access token·signup token 서명 키 (architecture.md 9.1) */
  @IsString()
  @MinLength(32)
  JWT_SECRET: string;

  /** archived_* 테이블 간 조인 키 생성용 pepper (domain.md 11.2) */
  @IsString()
  @MinLength(32)
  ARCHIVE_HASH_PEPPER: string;

  /** withdrawal_logs 해시용 pepper. 아카이브와 **다른 키**여야 한다 (domain.md 11.2) */
  @IsString()
  @MinLength(32)
  WITHDRAWAL_HASH_PEPPER: string;
}

/**
 * 실패 메시지에 값을 담지 않는다. 비밀값이 그대로 로그에 남는 것을 막기 위해
 * 위반한 변수 이름과 제약 조건만 노출한다 (convention.md 8.4).
 */
export function validateEnv(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const validated = plainToInstance(EnvironmentVariables, config);
  const errors = validateSync(validated, { skipMissingProperties: false });

  if (errors.length > 0) {
    const reasons = errors
      .map(
        (error) =>
          ` - ${error.property}: ${Object.values(error.constraints ?? {}).join(', ')}`,
      )
      .join('\n');
    throw new Error(`environment validation failed\n${reasons}`);
  }

  return validated;
}
