import ConfirmDialog from '@/shared/ui/ConfirmDialog';

import { useSignupTrialNotice } from '../hooks/useSignupTrialNotice';
import { PROFILE_COPY } from '../profile.copy';

interface SignupTrialNoticeProps {
  /** 앞서 뜨는 안내·팝업(튜토리얼·알림 사전 안내·권장 업데이트·푸시 재생 확인·한도 안내)이 모두 없는가 — app(MainNavigator)이 묶어 넘긴다 */
  isReady: boolean;
}

/**
 * P11 가입 체험 안내 팝업 — 체험을 받은 계정에 한 번(profile-uiux.md 4.11 · subscription.md 4.8). 신규 가입자는 온보딩 직후,
 * 체험 도입 전 가입자는 앱 시작에 뜬다(KAN-121).
 * 공용 확인 다이얼로그의 버튼 하나짜리 변형이다(design.md §5) — 고를 것이 없는 안내라 [확인]만 둔다.
 * 어느 탭으로 들어와도 떠야 해서 탭이 아니라 MainNavigator 가 그린다(알림 사전 안내와 같은 자리).
 */
export default function SignupTrialNotice({ isReady }: SignupTrialNoticeProps) {
  const { trial, isVisible, dismiss } = useSignupTrialNotice(isReady);
  // 체험 값이 없으면 그릴 것이 없다. 닫은 뒤에도 값은 남아 있어 퇴장 페이드가 끊기지 않는다
  if (trial === null) return null;
  return (
    <ConfirmDialog
      isVisible={isVisible}
      title={PROFILE_COPY.signupTrialNotice.title(trial.lastFreeDate)}
      body={PROFILE_COPY.signupTrialNotice.body(trial.dailyPlayLimitAfter)}
      primaryAction={{ label: PROFILE_COPY.signupTrialNotice.confirm, onPress: dismiss }}
      onCloseRequest={dismiss}
    />
  );
}
