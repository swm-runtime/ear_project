/** domain.md 3.1 — 계정 식별은 `provider + provider_user_id`가 한다 */
export enum SocialProvider {
  KAKAO = 'kakao',
  GOOGLE = 'google',
  NAVER = 'naver',
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

/** domain.md 3.2 — 동의 종류를 축으로 쪼갠다. 개정 시점이 서로 다르다 */
export enum ConsentType {
  TERMS = 'terms',
  PRIVACY = 'privacy',
  MARKETING = 'marketing',
}
