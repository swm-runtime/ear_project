import { useLimitNoticeStore } from './limit-notice.store';
import { useMiniPlayerLayoutStore } from './mini-player-layout.store';
import { useMiniPlayerResumeStore } from './mini-player-resume.store';
import { usePlayLimitStore } from './play-limit.store';
import { usePlaybackStore } from './playback.store';
import { usePlayerOpenGestureStore } from './player-open-gesture.store';
import { useScrubPositionStore } from './scrub-position.store';
import { useSleepTimerStore } from './sleep-timer.store';

/**
 * 백그라운드 재렌더 진단(`shared/monitoring/background-store-probe.ts`)에 넘기는 player 스토어 묶음 — 읽기(구독)만 한다.
 * 백그라운드에서 화면에 남아 있는 것은 미니플레이어·플레이어라 이 feature 의 스토어가 1차 용의자다(EAR-APP-H·K).
 * 내부 스토어를 하나씩 공개하지 않고 이 묶음만 내보낸다 — 쓰기 규칙(PlaybackService 만)은 그대로다.
 */
export const playerProbeStores = {
  playback: usePlaybackStore,
  scrubPosition: useScrubPositionStore,
  sleepTimer: useSleepTimerStore,
  miniPlayerLayout: useMiniPlayerLayoutStore,
  miniPlayerResume: useMiniPlayerResumeStore,
  playerOpenGesture: usePlayerOpenGestureStore,
  playLimit: usePlayLimitStore,
  limitNotice: useLimitNoticeStore,
};
