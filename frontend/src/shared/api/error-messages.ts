/**
 * 서버 `error_code` 의 영어 문구(KAN-194 — `spec/api/global-api.md` 2.3 "에러 `message`는 클라이언트가 `error_code`로 번역").
 *
 * 서버 `message` 는 **한국어 폴백**이라 영어 사용자에게 보이면 안 된다 — 표시 언어가 `en` 이면 `toApiError` 가 이 표의 문구로
 * 바꿔 넣는다. 한국어는 종전대로 서버 문구를 쓴다.
 *
 * **`common-error-handling.md` 9장 표의 모든 코드가 여기 있어야 한다** — 빠지면 `error-messages.test.ts` 가 실패한다. 코드를
 * 추가하는 PR 은 이 표에도 한 줄을 더한다. 사용자에게 노출하지 않는 코드(커서·관리자 전용 등)도 넣는다 — 화면이 서버 문구를
 * 그대로 띄우는 경로가 생겨도 한국어가 새지 않게.
 */
export const ERROR_MESSAGES_EN: Readonly<Record<string, string>> = {
  // 9.1 공통 — 기반
  VALIDATION_FAILED: "Something doesn't look right. Please check and try again.",
  UNAUTHORIZED: 'Your session has expired. Please sign in again.',
  FORBIDDEN: "You don't have access to this.",
  NOT_FOUND: "We couldn't find that.",
  CONFLICT: 'This was changed elsewhere. Refresh and try again.',
  TOO_MANY_REQUESTS: 'Too many requests. Please try again in a moment.',
  INTERNAL_ERROR: 'Something went wrong. Please try again.',
  EXTERNAL_SERVICE_ERROR: "We couldn't reach a connected service. Please try again.",
  APP_UPDATE_REQUIRED: 'Please update Ear to the latest version.',
  // 9.2 공통 — 콘텐츠 · 9.2-1 시장
  CONTENT_NOT_FOUND: "This episode isn't available.",
  CONTENT_WITHDRAWN: 'This episode is no longer available.',
  MARKET_MISMATCH: 'Something went wrong. Please try again.',
  // 9.3 인증·계정
  AUTH_PROVIDER_TOKEN_INVALID: "Sign-in didn't go through. Please try again.",
  AUTH_PROVIDER_UNAVAILABLE: "We couldn't reach the sign-in service. Please try again.",
  AUTH_SIGNUP_TOKEN_EXPIRED: 'Sign-up timed out. Please sign in again.',
  CONSENT_REQUIRED: 'Please agree to the required terms.',
  CONSENT_VERSION_STALE: 'Our terms have been updated. Please review and agree again.',
  AUTH_REFRESH_TOKEN_INVALID: 'Your session has expired. Please sign in again.',
  AUTH_REFRESH_TOKEN_REUSED: 'For your security, please sign in again.',
  WITHDRAWAL_CONFIRM_REQUIRED: 'Please confirm before deleting your account.',
  WITHDRAWAL_SUBSCRIPTION_EXPIRY_NOT_AGREED:
    'Please confirm that your subscription will end when you delete your account.',
  WITHDRAWAL_ARCHIVE_IDENTITY_MISSING:
    "We couldn't delete your account. Nothing was changed — please try again.",
  EMAIL_FORMAT_INVALID: 'Please check the email format.',
  EMAIL_ALREADY_REGISTERED: 'This email is already registered.',
  EMAIL_VERIFICATION_RESEND_COOLDOWN: 'Please wait a moment before resending.',
  EMAIL_VERIFICATION_SEND_LIMIT: 'Too many attempts. Please try again later.',
  EMAIL_SEND_FAILED: "We couldn't send the email. Please try again.",
  EMAIL_VERIFICATION_CODE_MISMATCH: "That code doesn't match.",
  EMAIL_VERIFICATION_CODE_EXPIRED: 'This code has expired. Request a new one.',
  EMAIL_VERIFICATION_ATTEMPTS_EXCEEDED: 'Too many tries. Please request a new code.',
  EMAIL_VERIFICATION_NOT_FOUND: 'Please enter your email again.',
  // 9.4 온보딩
  ONBOARDING_INTEREST_REQUIRED: 'Choose at least one topic.',
  ONBOARDING_INTEREST_LIMIT_EXCEEDED: 'You can choose up to 3 topics.',
  ONBOARDING_TOPIC_UNAVAILABLE: 'Some topics are no longer available. Please choose again.',
  ONBOARDING_INTERESTS_NOT_SET: 'Please choose your topics first.',
  ONBOARDING_NOT_COMPLETED: "Setup isn't finished yet. Please try again.",
  ONBOARDING_ALREADY_COMPLETED: "You're all set up.",
  // 9.5 라이브러리·재생
  LIBRARY_CURSOR_INVALID: 'Something went wrong. Please try again.',
  LIBRARY_ITEM_NOT_FOUND: "This episode isn't in your library anymore.",
  LIBRARY_COMPLETION_NOT_REACHED: 'Keep listening to finish this episode.',
  PLAY_LIMIT_EXCEEDED: "You've used today's listens.",
  PLAY_LIMIT_REACHED: "You've used today's listens.",
  // 9.6 탐색 · 9.7 프로필
  EXPLORE_CURSOR_INVALID: 'Something went wrong. Please try again.',
  STATS_WEEK_OUT_OF_RANGE: "That week isn't available.",
  // 9.8 관심사 관리
  INTEREST_REQUIRED: 'Choose at least one topic.',
  INTEREST_LIMIT_EXCEEDED: 'You can choose up to 3 topics.',
  INTEREST_TOPIC_UNAVAILABLE: 'Some topics are no longer available. Please choose again.',
  CAREER_JOB_CATEGORY_UNAVAILABLE: 'That job category is no longer available. Please choose again.',
  // 관리자(콘솔 전용 — 앱 노출 경로 없음)
  ADMIN_AUDIO_UNREADABLE: "We couldn't read this audio file. Please upload another one.",
  ADMIN_TOPIC_NOT_FOUND: 'A topic no longer exists. Please choose again.',
  ADMIN_LICENSE_EXPIRED: 'The content license has expired.',
  ADMIN_TOPIC_HAS_CONTENTS: 'This topic still has episodes.',
  ADMIN_TOPIC_HAS_NO_CONTENTS: 'This topic has no episodes to show.',
  ADMIN_STORAGE_FAILED: 'Storage failed. Please try again.',
  ADMIN_RECOMMEND_TEST_DISABLED: 'Recommendation testing is only available in development.',
  INVITE_CODE_DUPLICATE: 'This code already exists.',
  // 공지 · 추천 별점
  NOTICE_CURSOR_INVALID: 'Something went wrong. Please try again.',
  NOTICE_NOT_FOUND: 'This notice has been removed.',
  DRIP_FEEDBACK_NOT_RATEABLE: "This episode can't be rated anymore.",
  // 구독
  EMAIL_REQUIRED_FOR_PURCHASE: 'Please verify your email to subscribe.',
  SUBSCRIPTION_PLAN_UNAVAILABLE: "This plan isn't available right now.",
  SUBSCRIPTION_STORE_MISMATCH:
    "You're subscribed through another store. Please make changes on that device.",
  SUBSCRIPTION_RECEIPT_INVALID: "We couldn't verify your subscription. Please contact us.",
  SUBSCRIPTION_OWNED_BY_ANOTHER_ACCOUNT: 'This subscription is already in use on another account.',
  SUBSCRIPTION_ALREADY_SUBSCRIBED: "You're already subscribed. Use Change plan to switch.",
  SUBSCRIPTION_STORE_UNAVAILABLE: "We're confirming your subscription. It'll update shortly.",
  // 이벤트(초대) 코드
  INVITE_CODE_NOT_FOUND: "This code can't be used.",
  INVITE_CODE_EXPIRED: 'This code has expired.',
  INVITE_CODE_EXHAUSTED: 'This code has reached its limit.',
  INVITE_CODE_ALREADY_USED: "You've already used this code.",
  INVITE_GRANT_ALREADY_ACTIVE: 'Another code is still active on your account.',
};

/** 표에 없는 코드(새로 생겼는데 앱이 아직 모름)에 쓰는 문구 — 한국어 서버 문구 대신 */
export const FALLBACK_ERROR_MESSAGE_EN = 'Something went wrong. Please try again.';

/** 영어 사용자용 문구 — 표에 있으면 그 문구, 없으면 공통 문구 */
export const errorMessageEn = (errorCode: string): string =>
  ERROR_MESSAGES_EN[errorCode] ?? FALLBACK_ERROR_MESSAGE_EN;
