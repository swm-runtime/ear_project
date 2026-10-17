import DripFeedbackDialog from './DripFeedbackDialog';
import { useDripFeedbackDialog } from '../hooks/useDripFeedbackDialog';

interface DripFeedbackPromptProps {
  /** 앞서 뜨는 안내·팝업(알림 사전 안내·권장 업데이트·푸시 재생 확인·한도 안내·가입 체험 안내)이 모두 없는가 — app(MainNavigator)이 묶어 넘긴다 */
  isReady: boolean;
}

/**
 * 추천 별점 팝업(KAN-224). 조회는 라이브러리 진입 때 하고(`useDripFeedbackEntry`), 그리기는 MainNavigator 가 한다 —
 * 다른 앱 시작 팝업과 순서를 맞춰야 해서다(겹치면 iOS 는 두 번째 모달을 띄우지 않기도 한다). 가입 체험 안내와 같은 자리.
 */
export default function DripFeedbackPrompt({ isReady }: DripFeedbackPromptProps) {
  const dialog = useDripFeedbackDialog(isReady);
  // 띄울 것이 없으면 그리지 않는다. 닫은 뒤에도 편은 남아 있어 퇴장 페이드가 끊기지 않는다
  if (dialog.items.length === 0) return null;
  return (
    <DripFeedbackDialog
      isVisible={dialog.isVisible}
      items={dialog.items}
      starsByContentId={dialog.starsByContentId}
      isSending={dialog.isSending}
      hasSendError={dialog.hasSendError}
      onStarsChange={dialog.changeStars}
      onSend={dialog.send}
      onClose={dialog.close}
      onMuteThisWeek={dialog.muteThisWeek}
    />
  );
}
