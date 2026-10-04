/**
 * 가입 체험 안내(P11)가 열려도 되는 자리인가 — 앞서 뜨는 안내·팝업이 하나도 없어야 한다(profile-uiux.md 4.11).
 *
 * P11 은 "알리기만 하는" 팝업이라 순서상 가장 뒤다. 다른 모달과 동시에 뜨면 둘이 겹치고(iOS 는 두 번째 모달이
 * 아예 안 뜨기도 한다), 사용자가 먼저 고른 일(푸시를 눌러 들어옴)을 가로막는다.
 *
 * - **신규 가입**: 첫 사용 튜토리얼 → 알림 사전 안내 → P11(onboarding-uiux.md 4.6). 앞의 둘이 끝나야 열린다.
 * - **기존 가입자(앱 시작)**: 튜토리얼·알림 안내는 없다. 실행 관문이 띄운 권장 업데이트 안내(splash.md 4.1)가 먼저이고,
 *   푸시를 눌러 들어온 재생 확인 팝업·한도 안내 시트가 떠 있으면 그것이 끝난 뒤다 — 사용자가 고른 동작이 우선이다.
 *
 * 신호들은 각 feature 소유라(app-update·player·notification·shared walkthrough) 묶는 일은 app 이 한다 —
 * profile 은 `isReady` 하나만 받는다(architecture.md 4.4 profile 행).
 */
export const isSignupTrialNoticeReady = (signals: {
  /** 첫 사용 튜토리얼(코치마크)이 남아 있다 — 신규 가입 직후만 */
  isWalkthroughPending: boolean;
  /** 알림 사전 안내(O10)가 남아 있다 — 신규 가입 직후만 */
  isPrePromptPending: boolean;
  /** 권장 업데이트 안내가 떠 있다 — 실행 관문 통과 직후 */
  isUpdateRecommendVisible: boolean;
  /** 푸시 딥링크의 재생 확인 팝업이 떠 있다 */
  isPushPlayConfirmVisible: boolean;
  /** 한도 안내 시트가 떠 있다 */
  isLimitNoticeVisible: boolean;
}): boolean =>
  !signals.isWalkthroughPending &&
  !signals.isPrePromptPending &&
  !signals.isUpdateRecommendVisible &&
  !signals.isPushPlayConfirmVisible &&
  !signals.isLimitNoticeVisible;
