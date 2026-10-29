import { useEffect } from 'react';

import { useOnboardingLandingStore } from '@/features/onboarding';
import { usePlaybackStore, usePlayGate } from '@/features/player';

/**
 * 여는 중인데 플레이어도 실패 신호도 오지 않을 때 대기를 푸는 상한 — 발급 응답이 끝내 오지 않는 경우의 안전판이다.
 * 이게 없으면 알림 사전 안내(O10)가 영영 뜨지 않는다(OS 권한을 물을 한 번뿐인 자리다)
 */
export const ONBOARDING_LANDING_HOLD_MAX_MS = 15_000;

/** 발급이 실패로 끝난 세션 상태 — 플레이어가 열리지 않는다(`openAfterIssue`) */
const FAILED_STATES = new Set(['load_failed', 'withdrawn', 'blocked']);

/**
 * 온보딩 직후 착지(KAN-295 — experiments-api.md 4.1) — **Main 안에서만** 호출한다.
 *
 * 첫 드립이 열 편을 정해 줬으면(`exitOnboarding`이 착지 store 에 적는다) **푸시 탭과 같은 길**로 멈춘 플레이어를 연다 —
 * 재생 단일 게이트의 `openAfterIssue` + `openPaused`(KAN-273). 발급만 받고 소리는 내지 않으며, 차감 확인 팝업은 사용자가
 * 플레이어에서 ▶를 누를 때 플레이어가 띄운다(PM 2026-10-29 — 자동재생하면 누르지 않은 재생이 섞여 이탈률을 못 잰다).
 * 열 편이 없거나(no_candidates·queued·대기 상한 초과·옛 서버) 발급이 실패하면 착지 탭(탐색) 그대로다 — 플레이어는 열린 적이
 * 없으므로 따로 이동하지 않고 알리지도 않는다(사용자는 무엇이 열릴지 몰랐다).
 *
 * 반환값 `isOpening` — 열 편이 있는데 플레이어가 아직 스택에 오르지 않은 동안 true. 알림 사전 안내(O10)·가입 체험 안내(P11)가
 * 이 사이에 뜨면 곧이어 올라오는 플레이어 모달과 겹친다 — 호출부가 "플레이어가 스택에 있음"과 합쳐 그 안내들을 붙든다.
 *
 * @param isPlayerInStack Main 스택에 플레이어 라우트가 있는가 — 오르면 여는 중이 끝난다
 */
export const useOnboardingLanding = (isPlayerInStack: boolean): { isOpening: boolean } => {
  const pendingContentId = useOnboardingLandingStore((s) => s.pendingFirstContentId);
  const openingContentId = useOnboardingLandingStore((s) => s.openingContentId);
  const { requestPlay } = usePlayGate();

  // 무엇과 동기화하나: 착지 store 의 열 편(외부 신호) → 재생 게이트. 집으면 여는 중으로 옮겨 한 번만 연다
  useEffect(() => {
    if (pendingContentId === null) return;
    const contentId = useOnboardingLandingStore.getState().takePendingFirstContentId();
    if (contentId === null) return;
    const release = () => useOnboardingLandingStore.getState().finishOpening();
    requestPlay(
      {
        contentId,
        // 방금 첫 드립이 담은 편이다 — 오늘 재생한 적이 없다. 힌트일 뿐이고 판정은 서버가 한다
        isCountedToday: false,
        // 그 사이 회수·삭제됐다 — 착지(탐색)에 그대로 둔다. 플레이어는 열린 적이 없다
        onWithdrawn: release,
        onNotFound: release,
        // 재생 가능하다는 답을 받은 뒤에만 연다 — 없는 콘텐츠로 네이티브 모달을 띄웠다 닫으면 iOS 에서 굳는다
        openAfterIssue: true,
        // 소리 없이 연다 — ▶는 사용자가 누른다(차감 팝업도 그때)
        openPaused: true,
      },
      'onboarding',
    );
  }, [pendingContentId, requestPlay]);

  // 무엇과 동기화하나: 플레이어 라우트 → 여는 중 종료. 오른 뒤로는 호출부의 `isPlayerInStack`이 붙든다
  useEffect(() => {
    if (openingContentId !== null && isPlayerInStack) {
      useOnboardingLandingStore.getState().finishOpening();
    }
  }, [openingContentId, isPlayerInStack]);

  // 무엇과 동기화하나: 재생 세션(외부 store) → 여는 중 종료. 발급이 실패하면 플레이어는 뜨지 않는다
  useEffect(() => {
    if (openingContentId === null) return undefined;
    let hasSeenSession = false;
    const check = (session: ReturnType<typeof usePlaybackStore.getState>['session']) => {
      if (session?.contentId === openingContentId) {
        hasSeenSession = true;
        // 네트워크·한도 403 등으로 발급이 실패했다
        if (FAILED_STATES.has(session.state)) useOnboardingLandingStore.getState().finishOpening();
        return;
      }
      // 이 편의 세션이 섰다가 내려갔다(한도 403 은 세션을 내리고 페이월만 띄운다)
      if (hasSeenSession) useOnboardingLandingStore.getState().finishOpening();
    };
    check(usePlaybackStore.getState().session);
    const unsubscribe = usePlaybackStore.subscribe((state) => check(state.session));
    // 안전판 — 어떤 신호도 오지 않으면 상한 뒤 푼다
    const timer = setTimeout(
      () => useOnboardingLandingStore.getState().finishOpening(),
      ONBOARDING_LANDING_HOLD_MAX_MS,
    );
    return () => {
      unsubscribe();
      clearTimeout(timer);
    };
  }, [openingContentId]);

  return { isOpening: pendingContentId !== null || openingContentId !== null };
};
