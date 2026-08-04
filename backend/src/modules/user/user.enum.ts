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

/** domain.md 3.2 — 동의 종류를 축으로 쪼갠다. 개정 시점이 서로 다르다 */
export enum ConsentType {
  TERMS = 'terms',
  PRIVACY = 'privacy',
  MARKETING = 'marketing',
}
