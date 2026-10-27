import { useNavigation } from '@react-navigation/native';
import { useCallback, useEffect } from 'react';

import { toTab } from '@/shared/navigation/to-tab';
import { useToastStore } from '@/shared/ui/toast.store';

import { usePlayGate } from '@/features/player';

import { NOTIFICATION_COPY } from '../notification.copy';
import { useNotificationStore } from '../store/notification.store';

/**
 * 푸시 딥링크 게이트(notification.md 4.4 · architecture.md 6.4) — **Main 안에서만** 호출한다.
 *
 * Main 이 떴다는 것이 곧 관문 통과다(세션 복원 → 재동의 → 온보딩 완료, `RootNavigator`).
 * 그 전에 탭된 알림은 store 에서 기다리다가 Main 이 뜨는 순간 여기서 집힌다 — 콜드 스타트의
 * "스플래시 판정을 먼저 통과"와 "온보딩 미완료면 보류 후 이동"이 같은 구조로 풀린다.
 *
 * 콘텐츠 목적지는 **재생 단일 게이트**를 그대로 탄다(paywall.md 4.2) — 발급만 받고 **멈춘 플레이어**를 연다(2026-10-27
 * 박준현 — KAN-273, 알림을 누르자마자 소리가 나면 놀란다). 차감 확인 팝업은 사용자가 플레이어에서 ▶를 누를 때 플레이어가
 * 띄운다. 한도 소진이면 발급 403 으로 페이월 안내가 뜬다. 호출부는 반환한 팝업 상태로 `PlayConfirmDialog`를 그린다
 * (푸시 경로에서는 이제 뜨지 않지만 게이트 계약상 그대로 둔다).
 */
export const usePushLinkGate = () => {
  const navigation = useNavigation();
  const showToast = useToastStore((s) => s.show);
  const pendingTarget = useNotificationStore((s) => s.pendingPushTarget);
  const clearPendingTarget = useNotificationStore((s) => s.clearPendingPushTarget);
  const { confirmState, requestPlay, confirmPlay, cancelConfirm, suppressAndPlay } = usePlayGate();

  const goToLibrary = useCallback(() => {
    navigation.navigate('Main', toTab('Library'));
  }, [navigation]);
  // 주간 순위 알림 — 이번 주 청취·상위 % 카드가 있는 프로필 탭(KAN-273, notification.md 4.6)
  const goToProfile = useCallback(() => {
    navigation.navigate('Main', toTab('Profile'));
  }, [navigation]);

  const fallBackToLibrary = useCallback(() => {
    // 플레이어는 열린 적이 없다(`openAfterIssue`) — 탭만 옮기고 바로 알린다
    goToLibrary();
    showToast(NOTIFICATION_COPY.push.contentUnavailableToast);
  }, [goToLibrary, showToast]);

  // 무엇과 동기화하나: 탭된 알림의 목적지(외부 이벤트) → 내비게이션. 집는 즉시 비워 한 번만 이동한다
  useEffect(() => {
    if (pendingTarget === null) return;
    clearPendingTarget();
    if (pendingTarget.kind === 'library') {
      goToLibrary();
      return;
    }
    if (pendingTarget.kind === 'profile') {
      goToProfile();
      return;
    }
    requestPlay(
      {
        contentId: pendingTarget.contentId,
        // 방금 도착한 콘텐츠다 — 오늘 재생한 적이 없다. 힌트일 뿐이고 판정은 서버가 한다
        isCountedToday: false,
        // 회수·삭제된 콘텐츠 — 라이브러리로 폴백한다(4.4-4). 플레이어의 안내 화면 위에 머물지 않는다
        onWithdrawn: fallBackToLibrary,
        onNotFound: fallBackToLibrary,
        // 재생 가능하다는 답을 받은 뒤에만 플레이어를 연다 — 없는 콘텐츠로 모달을 띄웠다 닫지 않는다
        openAfterIssue: true,
        // 소리 없이 연다 — ▶는 사용자가 누른다(차감 팝업도 그때)
        openPaused: true,
      },
      'push',
    );
  }, [pendingTarget, clearPendingTarget, goToLibrary, goToProfile, fallBackToLibrary, requestPlay]);

  return { confirmState, confirmPlay, cancelConfirm, suppressAndPlay };
};
