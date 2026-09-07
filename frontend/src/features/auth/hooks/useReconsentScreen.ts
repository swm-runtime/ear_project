import { useState } from 'react';

import { logger } from '@/shared/lib/logger';
import { useToastStore } from '@/shared/ui/toast.store';

import { submitConsents } from '../api/auth.api';
import { AUTH_COPY } from '../auth.copy';
import type { ConsentType } from '../auth.types';
import { openPolicyDocument } from '../services/policy-document.service';
import { sessionService } from '../services/session.service';
import { useSessionStore } from '../store/session.store';

/**
 * A20 재동의(auth-uiux.md 4.3-1) — **A4와 규칙이 다르다.**
 *
 * - 항목이 전체가 아니라 서버가 준 `pending_consents`뿐이다.
 * - 계정이 이미 있으므로 성공해도 세션을 새로 시작하지 않는다. 신호만 지우면
 *   관문(RootNavigator)이 다음 목적지로 넘긴다.
 * - 거절 경로가 **로그아웃**이다(확정 2026-09-07 — `auth.md` 7).
 */
export const useReconsentScreen = () => {
  const pendingConsents = useSessionStore((s) => s.pendingConsents);
  const clearPendingConsents = useSessionStore((s) => s.clearPendingConsents);
  const showToast = useToastStore((s) => s.show);

  /** 기본값 전부 해제 — 재동의도 동의다(auth-uiux.md 8장 금지) */
  const [checkedMap, setCheckedMap] = useState<Partial<Record<ConsentType, boolean>>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLogoutConfirmVisible, setIsLogoutConfirmVisible] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const items = pendingConsents.map((consent) => ({
    ...consent,
    label: AUTH_COPY.consent.label[consent.consentType],
    description:
      consent.consentType === 'marketing' ? AUTH_COPY.consent.marketingDescription : null,
    isChecked: checkedMap[consent.consentType] ?? false,
  }));

  const isAllChecked = items.length > 0 && items.every((item) => item.isChecked);
  /** 필수만 게이트다 — 선택(마케팅)이 섞여 있어도 체크 없이 진행할 수 있다 */
  const canSubmit = items.filter((item) => item.isRequired).every((item) => item.isChecked);

  const toggleConsent = (consentType: ConsentType) => {
    setCheckedMap((prev) => ({ ...prev, [consentType]: !(prev[consentType] ?? false) }));
  };

  const toggleAll = () => {
    const next = !isAllChecked;
    setCheckedMap(Object.fromEntries(items.map((item) => [item.consentType, next])));
  };

  /** [보기] — 열람은 동의가 아니다. 연령 확인·마케팅은 열 문서가 없어 화면이 셰브론을 그리지 않는다 */
  const handleViewPress = (consentType: ConsentType) => {
    if (consentType !== 'terms' && consentType !== 'privacy') return;
    void openPolicyDocument(consentType);
  };

  const handleSubmit = async () => {
    if (!canSubmit || isSubmitting) return;
    setIsSubmitting(true);
    try {
      // 화면이 그린 항목 그대로 보낸다. 선택 항목은 체크 여부가 그대로 is_agreed 다
      await submitConsents({
        consents: items.map((item) => ({
          consentType: item.consentType,
          version: item.version,
          isAgreed: item.isChecked,
        })),
      });
      // 신호를 지우면 관문이 다음 목적지(온보딩 또는 라이브러리)로 넘긴다
      clearPendingConsents();
    } catch (error) {
      // 동의를 못 받은 채 통과시키지 않는다 — 화면에 머물며 알린다(auth-uiux.md 4.3-1)
      logger.error('[auth] reconsent submit failed', error);
      showToast(AUTH_COPY.reconsent.submitFailed);
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmLogout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      // 탈퇴가 아니다 — 계정·데이터는 그대로 두고 세션만 끊는다(auth-uiux.md 4.3-1)
      await sessionService.logout();
    } finally {
      setIsLoggingOut(false);
      setIsLogoutConfirmVisible(false);
    }
  };

  return {
    items,
    isAllChecked,
    canSubmit,
    isSubmitting,
    toggleConsent,
    toggleAll,
    handleViewPress,
    handleSubmit,
    isLogoutConfirmVisible,
    isLoggingOut,
    requestLogout: () => setIsLogoutConfirmVisible(true),
    cancelLogout: () => setIsLogoutConfirmVisible(false),
    confirmLogout,
  };
};
