import {
  ConsentType,
  OnboardingStep,
  YearsOfExperienceRange,
} from './user.enum';

/**
 * 재개 지점의 순서. **`onboarding_step`은 앞으로만 전진한다**(onboarding-api.md 4.1)는
 * 규칙을 비교 가능한 값으로 표현한 것이다.
 */
export const ONBOARDING_STEP_ORDER: Readonly<Record<OnboardingStep, number>> = {
  [OnboardingStep.TOPIC]: 0,
  [OnboardingStep.CAREER]: 1,
  [OnboardingStep.PICK]: 2,
  [OnboardingStep.DONE]: 3,
};

/**
 * 현행 약관 버전. 동의 화면에 보여줄 버전을 서버가 내려주고,
 * 재동의 판정도 이 값과 `consents` 최신 행을 비교해서 한다 (auth-api.md 4.1).
 *
 * 팀 확정: 정식 약관 확정 전이므로 `0.1`에서 시작한다.
 * 이 값을 올리면 기존 사용자에게 재동의가 요구된다(`consents` 최신 행과 비교 — auth-api.md 4.1).
 */
export const CURRENT_CONSENT_VERSIONS: Readonly<
  Record<ConsentType, string | null>
> = {
  [ConsentType.TERMS]: '0.1',
  [ConsentType.PRIVACY]: '0.1',
  /** 마케팅 동의는 버전이 없다 (domain.md 3.2) */
  [ConsentType.MARKETING]: null,
};

/** 계정 생성에 반드시 필요한 동의 (auth.md 4.1) */
export const REQUIRED_CONSENT_TYPES: readonly ConsentType[] = [
  ConsentType.TERMS,
  ConsentType.PRIVACY,
];

// --- 이메일 인증 코드 규칙 (auth.md 4.5) ---

/** 6자리 숫자 */
export const EMAIL_VERIFICATION_CODE_LENGTH = 6;
/** 코드 유효 시간 3분 — 발송 시각 기준 */
export const EMAIL_VERIFICATION_CODE_TTL_SEC = 180;
/** 재발송 쿨다운 30초 */
export const EMAIL_VERIFICATION_RESEND_COOLDOWN_SEC = 30;
/** 이메일 주소당 발송 5회 */
export const EMAIL_VERIFICATION_SEND_LIMIT = 5;
/** 5회 소진 시점으로부터 1시간 뒤 창이 초기화된다 */
export const EMAIL_VERIFICATION_SEND_WINDOW_SEC = 3600;
/** 코드당 검증 시도 5회 */
export const EMAIL_VERIFICATION_ATTEMPT_LIMIT = 5;
/**
 * 계정 단위 발송 상한 — 백스톱 (auth.md 4.5, 확정 2026-08-10).
 * 주소 무관 합산·슬라이딩 창이며 **클라이언트에 노출하지 않는다** — 초과 시
 * 전용 코드 없이 일반 오류로 거절하고 남은 횟수·해제 시각을 응답에 담지 않는다.
 * 정상 사용자는 주소당 5회·쿨다운 30초에 먼저 걸려 여기 도달할 수 없다.
 */
export const EMAIL_VERIFICATION_ACCOUNT_HOURLY_SEND_LIMIT = 20;
export const EMAIL_VERIFICATION_ACCOUNT_HOURLY_WINDOW_SEC = 3600;
export const EMAIL_VERIFICATION_ACCOUNT_DAILY_SEND_LIMIT = 50;
export const EMAIL_VERIFICATION_ACCOUNT_DAILY_WINDOW_SEC = 86400;
/**
 * 이메일 인증 응답의 최소 처리 시간(ms).
 * 존재 여부·검증 결과가 응답 시간으로 새지 않게 한다 (auth.md 4.5).
 */
export const EMAIL_VERIFICATION_MIN_RESPONSE_MS = 150;

/** 아카이브·탈퇴 로그 해시 버전 (domain.md 11.2 — 키 교체 시에만 올린다) */
export const USER_HASH_VERSION = 1;

/**
 * 구간 enum을 `users.years_of_experience`(int)에 저장할 때 쓰는
 * **구간 하한값**이다. 1:1이라 되돌릴 수 있다(`onboarding-api.md` 4.4 · `career.md` 3장).
 *
 * 컬럼 타입(int)과 화면 입력 방식(구간)이 어긋나 있어, **구간 정의가 바뀌면 환산표와
 * 저장된 값이 조용히 어긋난다.** 컬럼을 varchar enum으로 바꿀지는 미결이다
 * (`domain.md` 15.1 #4 · `profile-api.md` 9장).
 *
 * **컬럼을 소유한 이 모듈에 둔다.** 온보딩·커리어·프로필이 같은 환산을 쓰는데 화면 모듈마다
 * 복제하면 구간이 바뀔 때 한쪽만 고쳐지고, 저장된 값과 화면 표시가 조용히 어긋난다.
 */
export const YEARS_OF_EXPERIENCE_LOWER_BOUND: Readonly<
  Record<YearsOfExperienceRange, number>
> = {
  [YearsOfExperienceRange.ZERO_TO_ONE]: 0,
  [YearsOfExperienceRange.TWO_TO_THREE]: 2,
  [YearsOfExperienceRange.FOUR_TO_SIX]: 4,
  [YearsOfExperienceRange.SEVEN_PLUS]: 7,
};

/**
 * 직군 선택지 목록 — **서버 코드 상수로 시작한다**(career-api.md 9장 확정 2026-08-10.
 * 관리자가 목록을 바꿀 요구가 생기면 테이블로 승격한다). 온보딩 2단계와 커리어 정보 화면이
 * `GET /job-categories`로 **같은 목록**을 쓴다 — 클라이언트 상수 금지.
 *
 * 값은 FE 온보딩이 지금까지 노출해 온 선택지 그대로다(카피 미확정 — 확정되면 이 상수만
 * 바꾼다). 다른 목록으로 시작하면 온보딩에서 이미 저장된 `job_category`가 커리어 저장(PUT)의
 * 목록 소속 검증에 걸려 **다른 필드만 고친 재저장까지 막힌다**(전체 교체 계약).
 *
 * **배열 정의 순서가 곧 응답 순서다**(career-api.md 4.3 — 정렬 기준 미정, 상수 순서 사용).
 */
export const JOB_CATEGORIES: readonly string[] = [
  '개발',
  '기획',
  '디자인',
  '마케팅·영업',
  '운영·CS',
  '연구·교육',
  '기타',
];

/** 저장된 하한값을 구간으로 되돌린다. 경계 밖 값은 가장 가까운 아래 구간으로 본다 */
export function toYearsOfExperienceRange(
  value: number | null,
): YearsOfExperienceRange | null {
  if (value === null) {
    return null;
  }

  const ranges = Object.entries(YEARS_OF_EXPERIENCE_LOWER_BOUND) as [
    YearsOfExperienceRange,
    number,
  ][];

  let matched: YearsOfExperienceRange | null = null;

  for (const [range, lowerBound] of ranges) {
    if (value >= lowerBound) {
      matched = range;
    }
  }

  return matched;
}
