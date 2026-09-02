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

/** domain.md 1.3 — `users.tier` · `plans.tier` · `subscriptions.tier`가 같은 값 집합을 쓴다 */
export enum UserTier {
  LIGHT = 'light',
  DAILY = 'daily',
  PRO = 'pro',
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
