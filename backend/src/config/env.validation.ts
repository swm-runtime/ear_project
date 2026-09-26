import { plainToInstance, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  validateSync,
} from 'class-validator';

import { SEMVER_PATTERN } from '@/common/utils/semver.util';

/**
 * 푸시 발송 구현(`notification.md` 4.3 — Expo Push, 결정 2026-09-17).
 * 기본값은 `log`다 — 로컬·테스트·개발계가 실수로 실제 기기에 알림을 보내지 않게, **켜는 쪽이 명시한다.**
 * 개발계는 사용자 데이터가 분리돼 있어도 푸시 토큰은 기기 값이라 같은 기기가 운영에도 등록돼 있을 수 있다.
 */
export enum PushDelivery {
  /** 보내지 않고 로그만 남긴다(대상 판정·`notification_logs` 기록은 똑같이 한다) */
  LOG = 'log',
  /** Expo Push API로 실제 발송한다 */
  EXPO = 'expo',
}

/** 오디오 바이트를 누가 나르는가 — 배포 토폴로지가 정한다 */
export enum AudioDelivery {
  /** 우리 서버가 서명하고 우리 스트리밍 라우트가 내보낸다(개발·단일 서버) */
  LOCAL = 'local',
  /** CloudFront 서명 URL. 바이트는 CloudFront→S3가 나르고 API 서버는 관여하지 않는다 */
  CLOUDFRONT = 'cloudfront',
}

/** 이메일 발송 방식 — 기본 logging(발송 안 함, 개발용) */
export enum MailDelivery {
  LOGGING = 'logging',
  SES = 'ses',
}

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

  /**
   * 파이프라인 웹 SSO 어서션 서명 키(HS256) — 파이프라인 웹 서버(`EAR_SSO_SECRET`)와만
   * 공유한다. **JWT_SECRET과 겹쳐 쓰지 않는다**(아래 pepper 원칙과 동일). 비우면
   * `/auth/pipeline-login`이 비활성화된다 — 그래서 선택값이다.
   */
  @ValidateIf(
    (env: EnvironmentVariables) =>
      env.PIPELINE_SSO_SECRET !== undefined && env.PIPELINE_SSO_SECRET !== '',
  )
  @IsString()
  @MinLength(32)
  PIPELINE_SSO_SECRET?: string;

  /**
   * 자원 임계(CPU 70%·메모리 80%) Slack 알림 웹훅 — 파이프라인 워커의 ERROR 감시와
   * 같은 채널을 쓴다. 비우면 감시 자체가 꺼진다(로컬 기본) — 그래서 선택값이다.
   */
  @IsOptional()
  @IsString()
  SLACK_ERROR_WEBHOOK_URL?: string;

  /**
   * Sentry DSN. **비우면 Sentry 가 초기화되지 않는다**(로컬·테스트 기본) — 그래서 선택값이다.
   * 값 자체는 클라이언트에도 박히는 준공개 값이지만, 환경별로 프로젝트가 갈리므로 env 로 둔다.
   * 실제 읽는 곳은 `src/instrument.ts` 다 — Nest 부팅 전에 돌아야 해서 ConfigService 를 못 쓴다.
   * 여기 선언은 **"이 서비스가 쓰는 env 목록"의 단일 창구**를 유지하기 위한 것이다.
   */
  @IsOptional()
  @IsString()
  SENTRY_DSN?: string;

  /**
   * 클러스터 워커 수(`cluster.ts`) — `auto`(코어 수) 또는 1~8. 부팅 전에 읽는 값이지만 선언은 여기 둔다(9.5
   * "기본값으로 조용히 넘어가지 않는다" — 오타면 `cluster.util`이 조용히 1워커로 만들어 운영이 2워커라고
   * 믿는 채로 돌았다, 2026-09-26 감사). 없으면 단일 프로세스.
   */
  @IsOptional()
  @Matches(/^(auto|[1-8])$/, {
    message: 'CLUSTER_WORKERS must be "auto" or an integer 1-8',
  })
  CLUSTER_WORKERS?: string;

  /** 프라이머리가 스케줄러 워커에만 `true`로 박는다 — 사람이 넣는 값이 아니다(`cluster.util`) */
  @IsOptional()
  @IsIn(['true', 'false'])
  EAR_SCHEDULER_WORKER?: string;

  /** Sentry 환경 이름. 비우면 `NODE_ENV` 를 쓴다 — 운영/개발계를 가르려면 명시한다 */
  @IsOptional()
  @IsString()
  SENTRY_ENVIRONMENT?: string;

  /**
   * 성능 추적 표본 비율(0~1). **비우거나 0 이면 성능 계측 자체를 등록하지 않는다** —
   * 0 을 SDK 에 그대로 넘기면 계측은 켜지고 표본만 0 이라 CPU 만 쓴다(`common/sentry-options.ts`).
   * 느린 엔드포인트를 쫓을 때 **개발계에서만** 잠깐 올린다. 운영은 켜지 않는다.
   */
  @IsOptional()
  @Type(() => Number)
  @Min(0)
  @Max(1)
  SENTRY_TRACES_SAMPLE_RATE?: number;

  /** 푸시 발송 구현 — 위 `PushDelivery` 주석 참고. 운영만 `expo`로 둔다 */
  @IsEnum(PushDelivery)
  PUSH_DELIVERY: PushDelivery = PushDelivery.LOG;

  /**
   * Expo Push 보안 발송 토큰(EAS 프로젝트 설정의 "Enhanced security for push notifications").
   * 그 설정을 켜지 않았으면 비워도 발송된다 — 켜는 순간 이 값이 없으면 전부 거부되므로 선택값이다.
   */
  @IsOptional()
  @IsString()
  EXPO_ACCESS_TOKEN?: string;

  /**
   * 랜딩 페이지 Try 섹션이 **로그인 없이** 들려주는 샘플 콘텐츠의 `contents.id`
   * (`public-api.md` 2.2). 발행 상태·라이선스 유효인 콘텐츠여야 한다 — 회수·만료되면
   * `GET /public/sample`이 404를 내고 랜딩은 "준비 중" 상태를 그린다. 비워 두면 같은 404다.
   */
  @IsOptional()
  @IsUUID()
  PUBLIC_SAMPLE_CONTENT_ID?: string;

  /**
   * 애플 identity token의 `aud`로 실려 오는 값 — iOS 앱의 Bundle ID다(`auth-api.md` 4.1).
   *
   * **비밀값이 아니지만 검증에 반드시 필요하다.** 확인하지 않으면 다른 앱을 향해 발급된,
   * 서명은 정상인 토큰으로 우리 계정에 로그인할 수 있다. 애플은 **제공자 API 호출 없이
   * 토큰만으로 검증이 끝나므로**, `aud`가 사실상 유일한 "우리 앱을 향한 토큰인가" 판정이다.
   */
  @IsString()
  @IsNotEmpty()
  APPLE_CLIENT_ID: string;

  /**
   * 안드로이드 애플 로그인(웹 OAuth)의 `aud` — **Services ID**다(`auth-api.md` 4.1).
   *
   * 안드로이드에는 애플 네이티브 SDK가 없어 웹 OAuth로 가며, 그때 발급되는 identity
   * token의 `aud`는 앱 번들 ID가 아니라 Services ID다. **두 값을 모두 유효한 `aud`로
   * 받아야** iOS 네이티브와 안드로이드 웹이 같은 엔드포인트를 쓸 수 있다.
   */
  @IsString()
  @IsNotEmpty()
  APPLE_SERVICES_ID: string;

  /**
   * 구글 ID 토큰의 `aud`로 실려 오는 값 — **웹 클라이언트 ID**다(`auth-api.md` 4.1).
   *
   * 안드로이드·iOS 클라이언트 ID가 아니다. `@react-native-google-signin/google-signin`이
   * `webClientId`로 받은 ID 토큰을 발급하므로 `aud`에도 그 값이 들어온다.
   *
   * **비밀값이 아니지만 검증에 반드시 필요하다.** 확인하지 않으면 다른 앱을 향해 발급된,
   * 서명은 정상인 토큰으로 우리 계정에 로그인할 수 있다.
   */
  @IsString()
  @IsNotEmpty()
  GOOGLE_WEB_CLIENT_ID: string;

  /**
   * 카카오 앱 ID(숫자 문자열) — 토큰 정보 조회의 `app_id`와 대조한다(`auth-api.md` 4.1).
   *
   * **네이티브 앱 키가 아니다.** 카카오 액세스 토큰에는 대상 앱 정보가 실려 있지 않아,
   * 이 대조가 구글·애플의 `aud` 검증에 해당하는 자리다.
   */
  @IsString()
  @IsNotEmpty()
  KAKAO_APP_ID: string;

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
  @IsNotEmpty()
  @Matches(/^https?:\/\//, {
    message: 'AUDIO_URL_BASE_URL must be an absolute http(s) URL',
  })
  @MaxLength(2048)
  AUDIO_URL_BASE_URL: string;

  /**
   * 오디오 원본이 놓인 로컬 디렉터리. `contents.audio_path`가 이 아래의 상대 키다.
   *
   * **오브젝트 스토리지 확정 전까지의 자리다**(`architecture.md` 미결). 스토리지가 붙으면
   * 스트리밍 라우트째 CDN 서명 URL로 대체되며 이 변수도 함께 사라진다.
   */
  @ValidateIf(
    (env: EnvironmentVariables) =>
      env.AUDIO_DELIVERY !== AudioDelivery.CLOUDFRONT,
  )
  @IsString()
  @MaxLength(512)
  AUDIO_STORAGE_ROOT: string;

  /**
   * 오디오 전달 방식. 기본 `local`. `cloudfront`면 아래 두 값이 필수이고
   * `AUDIO_URL_BASE_URL`은 CloudFront 배포 도메인(+prefix)이어야 한다.
   */
  @IsEnum(AudioDelivery)
  AUDIO_DELIVERY: AudioDelivery = AudioDelivery.LOCAL;

  /** CloudFront 공개 키의 ID(Key-Pair-Id). 비밀값이 아니지만 서명에 반드시 실린다 */
  @ValidateIf(
    (env: EnvironmentVariables) =>
      env.AUDIO_DELIVERY === AudioDelivery.CLOUDFRONT,
  )
  @IsString()
  @IsNotEmpty()
  CLOUDFRONT_KEY_PAIR_ID: string;

  /**
   * 위 공개 키와 짝인 RSA 개인 키(PEM)를 **base64 한 줄**로. PEM의 줄바꿈이 env에 실리지
   * 않아서다. `base64 -w0 private_key.pem`으로 만든다. 비밀값이다 — 시크릿 매니저에서 주입.
   */
  @ValidateIf(
    (env: EnvironmentVariables) =>
      env.AUDIO_DELIVERY === AudioDelivery.CLOUDFRONT,
  )
  @IsString()
  @MinLength(64)
  CLOUDFRONT_PRIVATE_KEY_BASE64: string;

  /**
   * 관리자 업로드(admin.md 4.2)가 오디오·썸네일을 올리는 S3 버킷(`deploy/aws/README.md`).
   * `cloudfront` 모드에서만
   * 필수다 — `local` 모드는 `AUDIO_STORAGE_ROOT`에 파일을 쓴다.
   *
   * 자격증명은 env에 두지 않는다 — EC2 인스턴스 롤(IMDS)이 준다.
   */
  @ValidateIf(
    (env: EnvironmentVariables) =>
      env.AUDIO_DELIVERY === AudioDelivery.CLOUDFRONT ||
      env.MAIL_DELIVERY === MailDelivery.SES,
  )
  @IsString()
  @IsNotEmpty()
  AWS_REGION: string;

  /**
   * 이메일 인증 코드 발송 방식(auth.md 미결이던 발송 인프라 — SES로 확정 2026-08-31).
   * `ses`면 발신 주소가 필수고, SES에서 검증된 도메인/주소여야 한다.
   */
  @IsEnum(MailDelivery)
  MAIL_DELIVERY: MailDelivery = MailDelivery.LOGGING;

  /** 예: `이어 <no-reply@earcast.co.kr>` */
  @ValidateIf(
    (env: EnvironmentVariables) => env.MAIL_DELIVERY === MailDelivery.SES,
  )
  @IsString()
  @IsNotEmpty()
  MAIL_FROM_ADDRESS: string;

  @ValidateIf(
    (env: EnvironmentVariables) =>
      env.AUDIO_DELIVERY === AudioDelivery.CLOUDFRONT,
  )
  @IsString()
  @IsNotEmpty()
  AUDIO_BUCKET: string;

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
 * **서로 같은 값이면 안 되는 비밀값들.** 각각의 이유는 위 필드 주석에 있고, 요지는 둘이다 —
 * 하나가 유출될 때 피해 범위가 함께 넓어지는 것(pepper 두 개 · 오디오 서명 키), 그리고
 * **신뢰 경계를 넘는 것**(`PIPELINE_SSO_SECRET`은 파이프라인 웹 서버와 공유한다. 이 값이
 * `JWT_SECRET`과 같으면 그 서버가 `role: 'admin'` access token을 직접 서명해 발급할 수 있고,
 * `/auth/pipeline-login`이 관리자 계정으로 좁혀 둔 제한이 통째로 우회된다).
 *
 * **길이 검증만으로는 이 규칙이 지켜지지 않는다** — 같은 값을 넣어도 전부 통과한다.
 * 그리고 이미 그 값으로 쓰인 해시·토큰은 나중에 키를 바꿔도 되돌릴 수 없으므로,
 * 경고가 아니라 **기동 실패**로 막는다(이 파일 상단의 원칙 — 누락과 같은 등급의 설정 오류다).
 */
const MUTUALLY_DISTINCT_SECRETS = [
  'JWT_SECRET',
  'ARCHIVE_HASH_PEPPER',
  'WITHDRAWAL_HASH_PEPPER',
  'AUDIO_URL_SIGNING_KEY',
  'PIPELINE_SSO_SECRET',
  'CLOUDFRONT_PRIVATE_KEY_BASE64',
] as const satisfies readonly (keyof EnvironmentVariables)[];

/**
 * 값이 겹치는 묶음을 전부 찾아 변수 이름만 돌려준다.
 *
 * **값을 절대 담지 않는다** — 부팅 로그·CI 출력에 살아 있는 키가 그대로 찍힌다.
 * 비교는 평범한 문자열 동등성으로 한다. 양쪽 다 우리가 주입한 설정값이라 공격자가 관측할
 * 타이밍 채널이 없고, 상수 시간 비교를 쓰면 의도만 흐려진다.
 */
function findDuplicatedSecrets(env: EnvironmentVariables): string[][] {
  const byValue = new Map<string, string[]>();

  for (const name of MUTUALLY_DISTINCT_SECRETS) {
    const value = env[name];
    // 선택값(비활성)은 검사 대상이 아니다 — 없는 것끼리 같다고 볼 이유가 없다
    if (typeof value !== 'string' || value === '') {
      continue;
    }
    byValue.set(value, [...(byValue.get(value) ?? []), name]);
  }

  return [...byValue.values()].filter((names) => names.length > 1);
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

  const reasons = errors.map(
    (error) =>
      ` - ${error.property}: ${Object.values(error.constraints ?? {}).join(', ')}`,
  );

  // 개별 필드가 전부 통과해도 **서로 같으면** 설정이 잘못된 것이다
  for (const names of findDuplicatedSecrets(validated)) {
    reasons.push(` - ${names.join(', ')}: 서로 다른 값이어야 합니다`);
  }

  if (reasons.length > 0) {
    throw new Error(`environment validation failed\n${reasons.join('\n')}`);
  }

  return validated;
}
