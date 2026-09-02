/**
 * 재생 트래킹 값 계산(player.md 4.3·4.4·4.4-1) — 순수 함수 모듈.
 * PlaybackService가 상태 이벤트마다 호출하며, 판정 로직이므로 단위 테스트 대상이다(convention.md 7.2).
 *
 * - max_reached_sec: 연속 도달 최대 위치. 시크로 점프한 위치는 도달로 치지 않는다
 *   (2배속으로 끝까지 = 완청, 시크로 끝까지 점프 = 완청 아님 — 판정 자체는 서버 몫)
 * - listened(pending): 재생기가 실제로 소리를 낸 시간. 배속 무관 실시간이며 시크 구간 제외.
 *   위치 증분 ÷ 배속으로 계산한다 — JS 타이머가 백그라운드에서 지연돼도 위치는 정확하다
 */
import { PLAYBACK_CONTINUITY_GAP_SEC } from '../player.constants';

export interface PlaybackTrackingState {
  /** 연속 도달 최대 위치(초). 서버 판정(90%)의 입력값이다 */
  maxReachedSec: number;
  /** 직전 관측 위치 — null이면 다음 관측은 기준점 갱신만 한다(시크 직후·시작 직후) */
  lastObservedPositionSec: number | null;
  /** 직전 반영 성공 이후 실제 청취 시간의 미반영 누적(초, 소수 포함) */
  pendingListenedSec: number;
}

export const createTrackingState = (maxReachedSec: number): PlaybackTrackingState => ({
  maxReachedSec,
  lastObservedPositionSec: null,
  pendingListenedSec: 0,
});

/**
 * 상태 이벤트의 위치 관측 하나를 반영한다.
 * 직전 관측 대비 전진 폭이 연속 허용 간격 안일 때만 도달·청취로 인정하고,
 * 그 밖(시크 점프·역행·일시정지)은 기준점만 옮긴다.
 */
export const observePosition = (
  state: PlaybackTrackingState,
  input: { positionSec: number; isPlaying: boolean; playbackRate: number },
): PlaybackTrackingState => {
  const { positionSec, isPlaying, playbackRate } = input;

  if (state.lastObservedPositionSec === null) {
    return { ...state, lastObservedPositionSec: positionSec };
  }

  const delta = positionSec - state.lastObservedPositionSec;
  const isContinuous = isPlaying && delta > 0 && delta <= PLAYBACK_CONTINUITY_GAP_SEC;

  if (!isContinuous) {
    return { ...state, lastObservedPositionSec: positionSec };
  }

  // 실제 경과 시간 = 위치 증분 ÷ 배속 (10분을 2배속으로 끝까지 = listened 약 5분 — player.md 4.4-1)
  const realElapsedSec = delta / Math.max(playbackRate, 0.1);
  return {
    maxReachedSec: Math.max(state.maxReachedSec, positionSec),
    lastObservedPositionSec: positionSec,
    pendingListenedSec: state.pendingListenedSec + realElapsedSec,
  };
};

/** 시크 직후 호출한다 — 점프 폭이 다음 관측에서 도달·청취로 계산되지 않게 기준점을 옮긴다 */
export const markSeek = (
  state: PlaybackTrackingState,
  positionSec: number,
): PlaybackTrackingState => ({ ...state, lastObservedPositionSec: positionSec });

/** 이번 저장에 실을 listened_sec_delta(정수 초). 반영 성공 전에는 누적을 줄이지 않는다 */
export const peekListenedDelta = (state: PlaybackTrackingState): number =>
  Math.floor(state.pendingListenedSec);

/** 저장 성공 시 전송분만큼 누적을 되돌린다 — delta 정의가 "직전 반영 성공 이후"다(player-api.md 4.3) */
export const commitListenedDelta = (
  state: PlaybackTrackingState,
  sentSec: number,
): PlaybackTrackingState => ({
  ...state,
  pendingListenedSec: Math.max(0, state.pendingListenedSec - sentSec),
});
