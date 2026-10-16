/** domain.md 3.1 — 계정 식별은 `provider + provider_user_id`가 한다 */
export enum SocialProvider {
  KAKAO = 'kakao',
  GOOGLE = 'google',
  NAVER = 'naver',
  /** App Store 심사 가이드라인 4.8 — iOS에서 다른 소셜 로그인을 제공하면 필수다(auth.md 1) */
  APPLE = 'apple',
}

export enum UserRole {
  USER = 'user',
  ADMIN = 'admin',
}

/**
 * domain.md 1.3 — `users.tier` · `plans.tier` · `subscriptions.tier`가 같은 값 집합을 쓴다.
 *
 * **`trial`은 저장되는 티어가 아니다**(가입 체험 — `subscription.md` 4.8). `plans`에 정책 행이 있고
 * 응답의 `tier`에 나갈 뿐, `users.tier` · `subscriptions.tier`에는 쓰지 않는다. `users.tier`는 결제가
 * 구독 상태로 덮어쓰는 캐시라(domain.md 3.1) 거기에 두면 구독 동기화 한 번에 지워진다 — 체험은
 * `users.trial_ends_at`이 들고, 판정 시점에 이 값으로 환산한다(`resolveEffectiveTier`).
 */
export enum UserTier {
  LIGHT = 'light',
  DAILY = 'daily',
  PRO = 'pro',
  TRIAL = 'trial',
}

export enum UserStatus {
  ACTIVE = 'active',
  WITHDRAWN = 'withdrawn',
}

/**
 * 커리어 연차 — 정수가 아니라 **구간값**으로 주고받는다
 * (`career.md` 3장 · `onboarding-api.md` 4.4 · `profile-api.md` 4.1).
 *
 * `users.years_of_experience`가 이 모듈 소유이므로 값 체계도 여기에 둔다. 온보딩·커리어
 * 화면·프로필이 **같은 구간 정의**를 봐야 같은 컬럼에 다른 체계가 쌓이지 않는다.
 */
export enum YearsOfExperienceRange {
  ZERO_TO_ONE = '0-1',
  TWO_TO_THREE = '2-3',
  FOUR_TO_SIX = '4-6',
  SEVEN_PLUS = '7+',
}

export enum OnboardingStep {
  TOPIC = 'topic',
  CAREER = 'career',
  PICK = 'pick',
  DONE = 'done',
}

/**
 * 탈퇴 사유 — `auth-api.md` 9장에서 확정한 목록. 값은 클라이언트 계약이므로 임의로 바꾸지 않는다.
 *
 * `CONTENT_QUALITY`의 값이 `content_quailty`인 것은 **오타가 아니라 문서에 확정된 문자열 그대로**다.
 * 고치려면 클라이언트와 함께 바꿔야 하므로 `auth-api.md` 담당자에게 전달한다.
 */
export enum WithdrawalReason {
  /** 콘텐츠 품질이 기대에 못 미쳤어요 */
  CONTENT_QUALITY = 'content_quailty',
  /** 제 관심사와 맞지 않는 콘텐츠가 왔어요 */
  RECOMMENDATION_MISMATCH = 'recommendation_mismatch',
  /** 들을 시간이 없거나 잘 안 쓰게 됐어요 */
  LOW_USAGE = 'low_usage',
  /** 구독 가격이 부담됐어요 */
  PRICE = 'price',
  /** 듣고 싶은 주제 콘텐츠가 부족했어요 */
  NOT_ENOUGH_CONTENT = 'not_enough_content',
  /** 앱 오류나 사용이 불편했어요 */
  APP_ISSUE = 'app_issue',
  /** 다른 서비스를 이용하게 됐어요 */
  ALTERNATIVE = 'alternative',
  /** 기타 (직접 입력) */
  OTHER = 'other',
}

/**
 * domain.md 3.1 `market` — 사용자가 속한 시장. **가입 시 1회** 서버가 정하고 바꾸지 않는다(`global-api.md` 2.1).
 * KR 사용자의 응답은 글로벌 트랙으로 바뀌지 않는다 — 모든 시장 필터는 `kr` 행만 있을 때 결과가 같아야 한다.
 */
export enum UserMarket {
  KR = 'kr',
  GLOBAL = 'global',
}

/** 서버가 고르는 문구(푸시·인증 메일)의 언어 — `global-api.md` 2.3 */
export enum MessageLanguage {
  KO = 'ko',
  EN = 'en',
}

/** 가입 화면에서 사용자가 고른 콘텐츠 언어(`global-api.md` 4.1 `locale.preferred_language`) — 시장 판정의 입력 */
export enum PreferredLanguage {
  KO = 'ko',
  EN = 'en',
}

/** domain.md 3.6 — 기기 플랫폼 */
export enum DevicePlatform {
  IOS = 'ios',
  ANDROID = 'android',
}

/** domain.md 3.2 — 동의 종류를 축으로 쪼갠다. 개정 시점이 서로 다르다 */
export enum ConsentType {
  TERMS = 'terms',
  PRIVACY = 'privacy',
  MARKETING = 'marketing',
  /**
   * 만 18세 이상 자기 선언 (개인정보 보호법 22조의2 대응 — 약관 5조).
   * 열람할 문서가 없는 선언이라 버전이 없다. 화면 게이트만으로는 그 사용자가
   * 확인했다는 증거가 남지 않아 이력으로 기록한다
   * (tickets/backend/pending/age-confirmation-consent.md).
   */
  AGE_CONFIRMATION = 'age_confirmation',
  /**
   * 국외 이전 동의 — **GLOBAL 시장만 가입 필수**(KAN-215). 해외 사용자 정보는 서울 서버와 해외 외부 서비스(미국)로
   * 넘어가고, 싱가포르·인도네시아·태국은 이용자 동의가 가장 쉬운 근거다. 이전 내용은 영어 처리방침이 고지하고
   * 별도 문서가 없어 버전이 없다. KR은 한국어 처리방침의 국외 이전 고지로 갈음해 받지 않는다.
   */
  CROSS_BORDER_TRANSFER = 'cross_border_transfer',
}

/**
 * domain.md 3.5 — 기본 배속의 허용값. **서버가 검증한다**(`settings-api.md` 7장) —
 * 클라이언트를 우회해 임의 배속을 저장할 수 없어야 한다.
 *
 * `float` 컬럼에 저장하지만 값 집합이 닫혀 있으므로 enum으로 둔다. 숫자 enum인 이유는
 * 저장 타입이 숫자이기 때문이다 — 문자열로 두면 DTO·Entity 경계마다 변환이 생긴다.
 */
export enum PlaybackRate {
  SLOW = 0.8,
  NORMAL = 1.0,
  FAST = 1.2,
  FASTER = 1.5,
  FASTEST = 2.0,
}
