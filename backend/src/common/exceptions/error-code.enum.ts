/**
 * architecture.md 7.5 — 모든 에러 코드는 이 enum 한 곳에서 관리한다.
 * 문자열 리터럴을 직접 던지지 않는다.
 *
 * 도메인 코드를 추가·변경하면 해당 API 명세와
 * `docs/features/common-error-handling.md` 6장 표를 함께 갱신한다.
 */
export enum ErrorCode {
  // --- 기반 코드 (도메인 무관) ---
  /** 예상하지 못한 5xx. 내부 사유를 노출하지 않기 위해 항상 이 코드로 고정한다 */
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  /** 요청 형식·검증 실패 (400) */
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  /** 인증 없음·만료 (401) */
  UNAUTHORIZED = 'UNAUTHORIZED',
  /** 권한 없음 (403) */
  FORBIDDEN = 'FORBIDDEN',
  /** 리소스 없음 (404) */
  NOT_FOUND = 'NOT_FOUND',
  /** 상태 충돌 (409) */
  CONFLICT = 'CONFLICT',
  /** 레이트 리밋 (429) */
  TOO_MANY_REQUESTS = 'TOO_MANY_REQUESTS',
  /** 외부 연동 실패 — AI 서버·스토어·스토리지 */
  EXTERNAL_SERVICE_ERROR = 'EXTERNAL_SERVICE_ERROR',

  // --- 인증·계정 (auth-api.md 5장) ---
  AUTH_PROVIDER_TOKEN_INVALID = 'AUTH_PROVIDER_TOKEN_INVALID',
  AUTH_PROVIDER_UNAVAILABLE = 'AUTH_PROVIDER_UNAVAILABLE',
  AUTH_SIGNUP_TOKEN_EXPIRED = 'AUTH_SIGNUP_TOKEN_EXPIRED',
  CONSENT_REQUIRED = 'CONSENT_REQUIRED',
  CONSENT_VERSION_STALE = 'CONSENT_VERSION_STALE',
  AUTH_REFRESH_TOKEN_INVALID = 'AUTH_REFRESH_TOKEN_INVALID',
  AUTH_REFRESH_TOKEN_REUSED = 'AUTH_REFRESH_TOKEN_REUSED',

  // --- 회원 탈퇴 ---
  WITHDRAWAL_CONFIRM_REQUIRED = 'WITHDRAWAL_CONFIRM_REQUIRED',
  WITHDRAWAL_SUBSCRIPTION_EXPIRY_NOT_AGREED = 'WITHDRAWAL_SUBSCRIPTION_EXPIRY_NOT_AGREED',
  WITHDRAWAL_ARCHIVE_IDENTITY_MISSING = 'WITHDRAWAL_ARCHIVE_IDENTITY_MISSING',

  // --- 이메일 인증 ---
  EMAIL_FORMAT_INVALID = 'EMAIL_FORMAT_INVALID',
  EMAIL_ALREADY_REGISTERED = 'EMAIL_ALREADY_REGISTERED',
  EMAIL_VERIFICATION_RESEND_COOLDOWN = 'EMAIL_VERIFICATION_RESEND_COOLDOWN',
  EMAIL_VERIFICATION_SEND_LIMIT = 'EMAIL_VERIFICATION_SEND_LIMIT',
  EMAIL_SEND_FAILED = 'EMAIL_SEND_FAILED',
  EMAIL_VERIFICATION_CODE_MISMATCH = 'EMAIL_VERIFICATION_CODE_MISMATCH',
  EMAIL_VERIFICATION_CODE_EXPIRED = 'EMAIL_VERIFICATION_CODE_EXPIRED',
  EMAIL_VERIFICATION_ATTEMPTS_EXCEEDED = 'EMAIL_VERIFICATION_ATTEMPTS_EXCEEDED',
  EMAIL_VERIFICATION_NOT_FOUND = 'EMAIL_VERIFICATION_NOT_FOUND',

  // --- 온보딩 (onboarding-api.md 5장) ---
  /** 1단계는 건너뛸 수 없다 — `topic_ids`가 비었음 */
  ONBOARDING_INTEREST_REQUIRED = 'ONBOARDING_INTEREST_REQUIRED',
  /** 관심 주제 상한(3개) 초과. 초과분을 잘라내지 않고 거부한다 (onboarding-api.md 4.3) */
  ONBOARDING_INTEREST_LIMIT_EXCEEDED = 'ONBOARDING_INTEREST_LIMIT_EXCEEDED',
  /**
   * 존재하지 않거나 `is_visible = false`인 주제.
   * **두 경우를 구분하지 않는다** — 구분하면 임의 UUID로 비노출 주제의 존재를 탐침할 수 있다.
   */
  ONBOARDING_TOPIC_UNAVAILABLE = 'ONBOARDING_TOPIC_UNAVAILABLE',
  /** 1단계를 마치지 않은 계정의 호출. 클라이언트는 1단계로 되돌린다 */
  ONBOARDING_INTERESTS_NOT_SET = 'ONBOARDING_INTERESTS_NOT_SET',
  /** 완료 요청 전에 첫 드립 상태를 조회함. 대기는 완료 이후에만 존재한다 */
  ONBOARDING_NOT_COMPLETED = 'ONBOARDING_NOT_COMPLETED',
  /** 완료된 계정의 온보딩 API 호출. 클라이언트는 라이브러리로 진입한다 */
  ONBOARDING_ALREADY_COMPLETED = 'ONBOARDING_ALREADY_COMPLETED',

  // --- 관심사 관리 (interest-management-api.md 5장) ---
  // `ONBOARDING_INTEREST_*`를 재사용하지 않는다 — 상한 판정 규칙이 다르다(온보딩은 상수 3,
  // 여기는 "저장 전 활성 개수보다 늘지 않으면 통과"). 같은 코드가 화면에 따라 다른 조건에서
  // 나오면 코드의 의미가 갈라진다(architecture.md 7.5).
  /** `topic_ids`가 비었음 — 0개 저장의 서버 방어(정상 클라이언트는 [저장] 비활성이 선행) */
  INTEREST_REQUIRED = 'INTEREST_REQUIRED',
  /** 저장 전 활성 개수보다 늘면서 3개 초과. 초과분을 잘라내지 않고 거부한다 */
  INTEREST_LIMIT_EXCEEDED = 'INTEREST_LIMIT_EXCEEDED',
  /** 존재하지 않거나 숨겨진 주제 포함 — 두 경우를 구분하지 않는다(비노출 주제 탐침 방지) */
  INTEREST_TOPIC_UNAVAILABLE = 'INTEREST_TOPIC_UNAVAILABLE',

  // --- 커리어 정보 (career-api.md 5장) ---
  /**
   * `job_category`가 직군 목록에 없는 값. `VALIDATION_FAILED`와 구분하는 이유 —
   * 형식 위반은 입력을 고치라는 뜻이지만, 목록 밖 직군은 **클라이언트가 든 목록이 낡았다**는
   * 뜻이라 목록 재조회가 복구 경로다(`ONBOARDING_TOPIC_UNAVAILABLE`과 같은 구분).
   */
  CAREER_JOB_CATEGORY_UNAVAILABLE = 'CAREER_JOB_CATEGORY_UNAVAILABLE',

  // --- 라이브러리 (library-api.md 5장) ---
  /** 커서 형식 오류, 또는 발급 시점과 다른 `filter`·`sort`·`topic_filter` */
  LIBRARY_CURSOR_INVALID = 'LIBRARY_CURSOR_INVALID',
  /**
   * `:id`가 없거나 **요청자의 항목이 아님**.
   * 남의 항목에 403을 주면 "그 항목이 존재한다"를 알려주게 되므로 404로 통일한다
   * (library-api.md 7장 — IDOR 방지).
   */
  LIBRARY_ITEM_NOT_FOUND = 'LIBRARY_ITEM_NOT_FOUND',
  /**
   * 도달 위치가 완청 기준에 못 미침. **상태를 바꾸지 않는다.**
   * 요청 형식이 아니라 현재 상태가 전이 조건을 만족하지 않는 것이라 400이 아니라 409다.
   */
  LIBRARY_COMPLETION_NOT_REACHED = 'LIBRARY_COMPLETION_NOT_REACHED',

  // --- 탐색 (explore-api.md 5장) ---
  /**
   * 커서 형식 오류, 또는 발급 시점과 다른 `topic_ids`.
   * 조건이 바뀐 커서를 이어 쓰면 두 조건이 섞인 목록이 된다.
   *
   * 라이브러리와 코드를 공유하지 않는 이유는 **클라이언트가 복구하는 화면이 다르기**
   * 때문이다 — 탐색은 필터 목록을 첫 페이지부터 다시 조회한다
   * (`common-error-handling.md` 9.6에 이미 등재된 코드다).
   */
  EXPLORE_CURSOR_INVALID = 'EXPLORE_CURSOR_INVALID',

  // --- 프로필 통계 (profile-api.md 5장 · common-error-handling.md 9.7) ---
  /**
   * 주간 그래프에서 **가입 주 이전 또는 미래 주**를 조회했다.
   *
   * 정상 UI에서는 도달하지 않는다 — 화살표가 `previous_week_start` · `next_week_start`의
   * `null` 여부로 비활성화되기 때문이다(`profile.md` 4.6). 방어적 거절이므로 클라이언트는
   * 사용자에게 노출하지 않고 현재 표시 주를 유지한다.
   *
   * `VALIDATION_FAILED`와 나누는 이유는 **클라이언트 동작이 다르기** 때문이다 — 형식 오류는
   * 요청을 고쳐야 하지만 이쪽은 요청이 옳고 범위만 벗어난 것이라 화살표 상태를 되돌린다
   * (`common-error-handling.md` 9.7에 계약이 이미 등재돼 있다).
   */
  STATS_WEEK_OUT_OF_RANGE = 'STATS_WEEK_OUT_OF_RANGE',

  // --- 재생 한도 (paywall.md 4.1 · library-api.md 5장) ---
  /**
   * 무료 티어 한도 소진 → 클라이언트는 **페이월 바텀시트**를 연다.
   * 아래 `PLAY_LIMIT_REACHED`와 합치지 않는다 — 결제 유도와 안내는 화면이 다르다.
   */
  PLAY_LIMIT_EXCEEDED = 'PLAY_LIMIT_EXCEEDED',
  /** 최상위 티어의 한도 소진 → 페이월이 아니라 한도 안내. 더 팔 것이 없다 */
  PLAY_LIMIT_REACHED = 'PLAY_LIMIT_REACHED',

  // --- 콘텐츠 (공용 — common-error-handling.md 4.1) ---
  /** 담기 등에서 **건별 결과**로도 전달된다 (onboarding-api.md 4.6 `failed[]`) */
  CONTENT_NOT_FOUND = 'CONTENT_NOT_FOUND',
  /** 회수·만료된 콘텐츠 (`status != published`) */
  CONTENT_WITHDRAWN = 'CONTENT_WITHDRAWN',
}
