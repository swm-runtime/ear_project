import { plainToInstance, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

import { SEMVER_PATTERN } from '@/common/utils/semver.util';

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

  /**
   * 스토어에 올라간 최신 앱 버전(semver). **테이블이 아니라 배포 설정이 원천이다**
   * (합의 2026-08-06 — `settings-api.md` 4.1 · domain.md 13.3).
   *
   * 설정 화면의 [업데이트] 배지 판정에 쓴다. **수동 기입이므로 배포 직후 갱신을 빠뜨리면
   * 배지가 늦게 뜬다** — 배포 체크리스트로 관리한다(운영 사항이지 계약이 아니다).
   *
   * **플랫폼별로 나눈다**(domain.md 13.3 — 스토어 심사 주기가 달라 두 값이 동시에
   * 올라가지 않는다). 한쪽 심사가 밀리는 동안 단일 값으로 판정하면 **아직 배포되지 않은
   * 플랫폼의 사용자에게 받을 것이 없는 [업데이트]가 노출된다.**
   */
  @IsString()
  @Matches(SEMVER_PATTERN)
  LATEST_APP_VERSION_IOS: string;

  @IsString()
  @Matches(SEMVER_PATTERN)
  LATEST_APP_VERSION_ANDROID: string;

  /**
   * 최소 지원 버전(semver). **강제 업데이트 판정은 스플래시 소관이고**(`splash.md`),
   * 설정 화면은 안내만 한다(`settings-api.md` 4.1) — 설정까지 들어온 세션은 이미 그 관문을
   * 통과했다. 값은 함께 내려주되 여기서 차단하지 않는다.
   *
   * 최신 버전과 같은 이유로 플랫폼별이다. **차단하는 쪽이라 위험이 더 크다** — 심사가
   * 밀린 플랫폼의 값을 함께 올리면 그 사용자 전원이 업데이트할 수 없는 화면에 갇힌다.
   */
  @IsString()
  @Matches(SEMVER_PATTERN)
  MIN_SUPPORTED_APP_VERSION_IOS: string;

  @IsString()
  @Matches(SEMVER_PATTERN)
  MIN_SUPPORTED_APP_VERSION_ANDROID: string;
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
