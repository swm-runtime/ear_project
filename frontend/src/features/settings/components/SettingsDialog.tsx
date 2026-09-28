import type { ReactNode } from 'react';

import ConfirmDialog, { type DialogAction } from '@/shared/ui/ConfirmDialog';

interface SettingsDialogProps {
  isVisible: boolean;
  title: string;
  /** 본문 슬롯 — 선택 가능한 연락처처럼 문자열로 못 적는 본문 */
  children?: ReactNode;
  secondaryAction: DialogAction;
  primaryAction: DialogAction;
  onCloseRequest: () => void;
}

/**
 * 설정의 확인 다이얼로그(로그아웃·탈퇴 진입·문의) — 공용 `ConfirmDialog` 의 껍데기(2026-09-27 통일).
 * 본문 슬롯은 공용의 `children` 으로 그대로 넘어간다
 */
export default function SettingsDialog(props: SettingsDialogProps) {
  return <ConfirmDialog {...props} />;
}
