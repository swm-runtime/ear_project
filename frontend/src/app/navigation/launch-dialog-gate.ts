/**
 * 가입 체험 안내(P11)가 열려도 되는 자리인가 — 앞서 뜨는 안내·팝업이 하나도 없어야 한다(profile-uiux.md 4.11).
 *
 * P11 은 "알리기만 하는" 팝업이라 순서상 가장 뒤다. 다른 모달과 동시에 뜨면 둘이 겹치고(iOS 는 두 번째 모달이
 * 아예 안 뜨기도 한다), 사용자가 먼저 고른 일(푸시를 눌러 들어옴)을 가로막는다.
 *
 * - **신규 가입**: 알림 사전 안내 → P11(onboarding-uiux.md 4.6). 앞의 것이 끝나야 열린다(첫 사용 튜토리얼은
 *   2026-10-11 뺐다).
 * - **기존 가입자(앱 시작)**: 알림 안내는 없다. 실행 관문이 띄운 권장 업데이트 안내(splash.md 4.1)가 먼저이고,
 *   푸시를 눌러 들어온 재생 확인 팝업·한도 안내 시트가 떠 있으면 그것이 끝난 뒤다 — 사용자가 고른 동작이 우선이다.
 *
 * - **추천 별점 팝업(KAN-224)이 떠 있으면** 그것이 끝난 뒤다(아래 `isDripFeedbackPromptReady`의 비대칭 규칙).
 * - **플레이어가 떠 있거나 여는 중이면** 그것이 닫힌 뒤다(KAN-295). 온보딩 직후 첫 콘텐츠를 멈춘 플레이어로 열고, 푸시도
 *   멈춘 플레이어를 연다(KAN-273) — 플레이어는 네이티브 모달이라 그 위에 RN 모달을 띄우면 iOS 에서 화면이 굳는다.
 *
 * 신호들은 각 feature 소유라(app-update·player·notification·library) 묶는 일은 app 이 한다 —
 * profile 은 `isReady` 하나만 받는다(architecture.md 4.4 profile 행).
 */
export const isSignupTrialNoticeReady = (signals: {
  /** 알림 사전 안내(O10)가 남아 있다 — 신규 가입 직후만 */
  isPrePromptPending: boolean;
  /** 권장 업데이트 안내가 떠 있다 — 실행 관문 통과 직후 */
  isUpdateRecommendVisible: boolean;
  /** 푸시 딥링크의 재생 확인 팝업이 떠 있다 */
  isPushPlayConfirmVisible: boolean;
  /** 한도 안내 시트가 떠 있다 */
  isLimitNoticeVisible: boolean;
  /** 추천 별점 팝업(KAN-224)이 떠 있다 — 먼저 뜬 쪽이 끝난 뒤에 연다 */
  isDripFeedbackVisible: boolean;
  /** 콘텐츠 후기의 먼저 묻는 시트(L18 — KAN-280) 또는 그 뒤의 발급 안내가 떠 있다 — 추천 별점과 같은 비대칭 규칙 */
  isContentReviewPromptVisible: boolean;
  /** 플레이어(네이티브 모달)가 스택에 있거나 온보딩 착지가 여는 중이다(KAN-295) */
  isPlayerOpen: boolean;
}): boolean =>
  !signals.isPrePromptPending &&
  !signals.isUpdateRecommendVisible &&
  !signals.isPushPlayConfirmVisible &&
  !signals.isLimitNoticeVisible &&
  !signals.isDripFeedbackVisible &&
  !signals.isContentReviewPromptVisible &&
  !signals.isPlayerOpen;

/**
 * 추천 별점 팝업(KAN-224 — drip-feedback.md 5장)이 열려도 되는 자리인가. 라이브러리 진입 때 서버가 `show=true`를 준 뒤의
 * "언제 보일지"다 — 띄울지는 서버가 이미 정했다.
 *
 * P11 과 같은 앞선 팝업들(알림 사전 안내·권장 업데이트·푸시 재생 확인·한도 안내)이 없어야 하고, **가입 체험 안내(P11)가
 * 뜰 차례이거나 떠 있으면 그 뒤다** — 계정에 한 번뿐인 안내가 먼저다. 둘이 서로를 기다리지 않게 비대칭으로 둔다:
 * 별점 팝업은 P11 이 "뜰 차례(active)"이기만 해도 기다리고, P11 은 별점 팝업이 "떠 있을(visible)" 때만 기다린다.
 * 그래서 먼저 뜬 쪽이 끝날 때까지 다른 쪽이 기다리고, 둘이 동시에 뜨지 않는다.
 */
export const isDripFeedbackPromptReady = (signals: {
  isPrePromptPending: boolean;
  isUpdateRecommendVisible: boolean;
  isPushPlayConfirmVisible: boolean;
  isLimitNoticeVisible: boolean;
  /** 가입 체험 안내(P11)가 뜰 차례이거나 떠 있다 */
  isSignupTrialNoticeActive: boolean;
  /** 플레이어(네이티브 모달)가 스택에 있거나 온보딩 착지가 여는 중이다 — P11 과 같은 이유로 기다린다(KAN-295) */
  isPlayerOpen: boolean;
}): boolean =>
  !signals.isPrePromptPending &&
  !signals.isUpdateRecommendVisible &&
  !signals.isPushPlayConfirmVisible &&
  !signals.isLimitNoticeVisible &&
  !signals.isSignupTrialNoticeActive &&
  !signals.isPlayerOpen;

/**
 * 콘텐츠 후기의 먼저 묻는 시트(L18 — KAN-280 · content-review.md 4.3)가 열려도 되는 자리인가. 서버가 `show=true`를 준 뒤의
 * "언제 보일지"다. 추천 별점 팝업과 **같은 조건**(앞선 안내 · 플레이어가 없고 P11 이 뜰 차례가 아님 — P11 은 이 시트가 떠 있을 때만
 * 기다린다, 같은 비대칭 규칙)에 더해 **추천 별점 팝업이 떠 있지 않아야 한다.** 같은 세션에 추천 별점이 떴는지 · 그 판정이 끝났는지는
 * 시트 쪽(content-review `decideContentReviewPromptStep`)이 따로 본다 — 이 함수는 지금 화면이 비어 있는지만 본다.
 */
export const isContentReviewPromptReady = (signals: {
  isPrePromptPending: boolean;
  isUpdateRecommendVisible: boolean;
  isPushPlayConfirmVisible: boolean;
  isLimitNoticeVisible: boolean;
  /** 가입 체험 안내(P11)가 뜰 차례이거나 떠 있다 */
  isSignupTrialNoticeActive: boolean;
  /** 추천 별점 팝업(L16)이 떠 있다 */
  isDripFeedbackVisible: boolean;
  /** 플레이어(네이티브 모달)가 스택에 있거나 여는 중이다 — 플레이어 화면 · 완청 순간에는 묻지 않는다(content-review.md 2.1) */
  isPlayerOpen: boolean;
}): boolean => isDripFeedbackPromptReady(signals) && !signals.isDripFeedbackVisible;
