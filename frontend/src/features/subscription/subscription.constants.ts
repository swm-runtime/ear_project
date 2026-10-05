/**
 * 백엔드 준비 후 실서버로 붙일 때는 EXPO_PUBLIC_SUBSCRIPTION_API=real 로 전환한다.
 * `__DEV__` 가드라 릴리스 번들은 값과 무관하게 실서버다(다른 feature 와 같은 규칙).
 */
export const IS_SUBSCRIPTION_API_MOCKED =
  __DEV__ && process.env.EXPO_PUBLIC_SUBSCRIPTION_API !== 'real';

/** 복원 요청 배열의 상한(subscription-api.md 4.5 — 0~10건) */
export const RESTORE_MAX_ITEMS = 10;

/**
 * 영수증 제출이 일시 실패(503·네트워크)했을 때의 재시도 간격 — 거래를 끝내지 않은 채 다시 보낸다.
 * 마지막 값으로 계속 반복한다(**폐기하지 않는다** — architecture.md 5.4). 앱이 꺼지면 다음 실행의
 * 미완료 거래 제출이 같은 일을 이어받는다(스토어가 끝나지 않은 거래를 보관하는 것이 곧 큐다).
 */
export const SUBMIT_RETRY_DELAYS_MS = [5_000, 15_000, 30_000, 60_000, 300_000] as const;

/**
 * 페이월의 "구독을 확인하고 있어요" 최대 유지 시간(paywall.md 5장 — 최대 30초).
 * 넘기면 "잠시 후 자동 반영됩니다" 안내 후 시트를 닫는다. 재시도는 뒤에서 계속된다.
 */
export const PAYWALL_VERIFY_TIMEOUT_MS = 30_000;

/**
 * 이메일 인증을 거쳐 결제로 돌아오는 요청의 유효 시간 — 인증 화면을 그냥 떠났다가 한참 뒤 다른 경로로
 * 인증했을 때 페이월이 불쑥 다시 뜨지 않게 한다(정책 판정이 아니라 화면 복귀 범위다).
 */
export const EMAIL_RESUME_TTL_MS = 10 * 60_000;

/** Android 앱 패키지 — Play 구독 관리 딥링크에 필요하다(subscription.md 4.5) */
export const ANDROID_PACKAGE_NAME = 'com.runtime.ear';
