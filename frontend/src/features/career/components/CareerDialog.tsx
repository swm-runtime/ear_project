import ConfirmDialog, { type DialogAction } from '@/shared/ui/ConfirmDialog';

interface CareerDialogProps {
  isVisible: boolean;
  title: string;
  /** 왼쪽 보조 액션([계속 편집]) — 안전한 쪽이 보조다 */
  secondaryAction: DialogAction;
  /** 오른쪽 주 액션([나가기]) — 위험색으로 그리지 않는다(interest IM7과 동일) */
  primaryAction: DialogAction;
  /** Android 하드웨어 백 — 보조 액션과 같다(팝업만 닫고 편집 유지) */
  onCloseRequest: () => void;
}

/**
 * CR5 이탈 확인 다이얼로그 — 공용 `ConfirmDialog` 의 껍데기(2026-09-27 통일). **딤 영역 탭으로는 닫히지 않는다**
 * (career-uiux.md 4.6 — 파괴적 결과가 걸린 팝업이 의도 없는 탭으로 닫히면 어느 쪽을 고른 것인지 알 수 없다)
 */
export default function CareerDialog(props: CareerDialogProps) {
  return <ConfirmDialog {...props} dismissOnBackdrop={false} />;
}
