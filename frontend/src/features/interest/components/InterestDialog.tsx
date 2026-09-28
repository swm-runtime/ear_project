import ConfirmDialog, { type DialogAction } from '@/shared/ui/ConfirmDialog';

interface InterestDialogProps {
  isVisible: boolean;
  /** 제목 — 해제 확인(IM4)은 본문 한 줄이라 생략한다 */
  title?: string;
  message?: string;
  secondaryAction: DialogAction;
  /** 오른쪽 주 액션(uiux 5장 — 주 액션 오른쪽). [나가기]도 위험색으로 그리지 않는다(4.6) */
  primaryAction: DialogAction;
  /** 딤 탭·뒤로가기는 보조 액션과 같다(팝업만 닫고 편집 유지) */
  onCloseRequest: () => void;
}

/**
 * 관심사 관리의 다이얼로그 — 해제 확인(IM4)·이탈 확인(IM7)이 함께 쓴다. 겹쳐 쌓지 않는다(uiux 3장).
 * 공용 `ConfirmDialog` 의 껍데기(2026-09-27 통일) — `message` 는 `body` 다
 */
export default function InterestDialog({ message, ...props }: InterestDialogProps) {
  return <ConfirmDialog {...props} body={message} />;
}
