import { useMiniPlayerResumeStore } from '../store/mini-player-resume.store';
import { usePlaybackStore } from '../store/playback.store';

/**
 * 미니플레이어가 **지금 보여야 하는가** — MiniPlayer 컴포넌트의 판정(활성 세션 loading·ready·ended, 아니면 라이브러리가
 * 올린 복원 스냅샷이 있고 이번 실행에서 치우지 않았을 때)을 스토어만으로 다시 계산한다.
 *
 * 시스템 탭 바(iOS 26)의 `bottomAccessory` 를 **붙일지 말지** 결정하는 데 쓴다(2026-09-25 PM "닫을 때 애플 물방울처럼").
 * 액세서리를 항상 붙여 두고 안에서만 사라지면 시스템 애니메이션이 안 나온다 — 액세서리 자체를 떼야 UIKit 이
 * `setBottomAccessory(nil, animated:)` 로 탭 바에 거둬들이는 모션을 그린다(react-native-screens 가 animated:YES 로 부른다)
 */
export const useIsMiniPlayerVisible = (): boolean => {
  const session = usePlaybackStore((s) => s.session);
  const isDismissed = usePlaybackStore((s) => s.isMiniPlayerDismissed);
  const fallback = useMiniPlayerResumeStore((s) => s.fallback);
  const isLiveVisible =
    session !== null &&
    (session.state === 'loading' || session.state === 'ready' || session.state === 'ended');
  return isLiveVisible || (!isDismissed && fallback !== null);
};
