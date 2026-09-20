import { useNavigation } from '@react-navigation/native';
import { useCallback, useEffect } from 'react';

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
 * 콘텐츠 목적지는 **재생 단일 게이트**를 그대로 탄다(paywall.md 4.2): 차감되는 재생이면 확인
 * 팝업이 뜨고, 한도 소진이면 발급 403 을 플레이어가 받아 페이월로 전환한다. 호출부는 반환한
 * 팝업 상태로 `PlayConfirmDialog`를 그린다.
 */
/** 플레이어 모달이 걷히고 라이브러리가 자리 잡을 때까지 — 토스트가 전환에 묻히지 않게 한다 */
const FALLBACK_TOAST_DELAY_MS = 600;

export const usePushLinkGate = () => {
  const navigation = useNavigation();
  const showToast = useToastStore((s) => s.show);
  const pendingTarget = useNotificationStore((s) => s.pendingPushTarget);
  const clearPendingTarget = useNotificationStore((s) => s.clearPendingPushTarget);
  const { confirmState, requestPlay, confirmPlay, cancelConfirm, suppressAndPlay } = usePlayGate();

  const goToLibrary = useCallback(() => {
    navigation.navigate('Main', { screen: 'Tabs', params: { screen: 'Library' } });
  }, [navigation]);

  const fallBackToLibrary = useCallback(() => {
    goToLibrary();
    /*
     * 토스트는 **플레이어가 내려간 뒤에** 띄운다. 플레이어는 네이티브 모달이라 떠 있는 동안 루트의 토스트를
     * 덮는다 — 같은 틱에 띄우면 모달이 걷히는 사이에 3초가 지나가거나 아예 가려진 채 끝난다
     * (2026-09-20 실기기: 서버에는 404 가 찍혔고 라이브러리로는 갔는데 토스트가 안 보였다).
     */
    setTimeout(
      () => showToast(NOTIFICATION_COPY.push.contentUnavailableToast),
      FALLBACK_TOAST_DELAY_MS,
    );
  }, [goToLibrary, showToast]);

  // 무엇과 동기화하나: 탭된 알림의 목적지(외부 이벤트) → 내비게이션. 집는 즉시 비워 한 번만 이동한다
  useEffect(() => {
    if (pendingTarget === null) return;
    clearPendingTarget();
    if (pendingTarget.kind === 'library') {
      goToLibrary();
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
      },
      'push',
    );
  }, [pendingTarget, clearPendingTarget, goToLibrary, fallBackToLibrary, requestPlay]);

  return { confirmState, confirmPlay, cancelConfirm, suppressAndPlay };
};
