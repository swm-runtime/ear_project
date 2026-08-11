import { plainToInstance, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsString,
  Matches,
  Max,
  MaxLength,
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

  /**
   * 오디오 서명 URL의 HMAC 키(`architecture.md` 9.4).
   *
   * **`JWT_SECRET`과 같은 값을 쓰지 않는다.** 용도가 다른 키를 겹쳐 쓰면 한쪽이 유출될 때
   * 피해 범위가 함께 넓어진다(pepper 두 개를 분리한 것과 같은 이유 — domain.md 11.2).
   */
  @IsString()
  @MinLength(32)
  AUDIO_URL_SIGNING_KEY: string;

  /**
   * 서명 URL이 가리키는 스트리밍 경로의 앞부분.
   *
   * 지금은 우리 서버가 서명하고 우리 서버가 내보내므로 이 서버의 공개 주소다. 오브젝트
   * 스토리지가 확정되면 CDN 도메인으로 바뀌며, 그때 바뀌는 것은 이 값과 `AudioUrlSigner`
   * 구현뿐이다 — 계약(`player-api.md` 4.1)은 그대로다.
   */
  @IsString()
  @MaxLength(2048)
  AUDIO_URL_BASE_URL: string;

  /**
   * 오디오 원본이 놓인 로컬 디렉터리. `contents.audio_path`가 이 아래의 상대 키다.
   *
   * **오브젝트 스토리지 확정 전까지의 자리다**(`architecture.md` 미결). 스토리지가 붙으면
   * 스트리밍 라우트째 CDN 서명 URL로 대체되며 이 변수도 함께 사라진다.
   */
  @IsString()
  @MaxLength(512)
  AUDIO_STORAGE_ROOT: string;

  /**
   * 앞단에서 신뢰하는 리버스 프록시(LB) 홉 수. Express `trust proxy`에 그대로 들어간다.
   *
   * **기본 0(끔)이고, 값은 배포 토폴로지가 정한다** — LB 뒤에 배포하면 홉 수만큼 올린다.
   * 잘못 켜는 쪽이 안 켜는 쪽보다 위험하다: 프록시가 없는데 켜면 클라이언트가
   * `X-Forwarded-For` 헤더로 **IP를 위조**할 수 있어, `audio_access_logs.ip_hash` 기반
   * 이상 탐지(FR-33 — domain.md 6.5)와 향후 레이트 리밋(architecture.md 9.6)이
   * 공격자 통제하에 들어간다. 안 켜면 모든 IP가 프록시 주소로 같아질 뿐이다.
   */
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10)
  TRUST_PROXY_HOPS: number = 0;
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
