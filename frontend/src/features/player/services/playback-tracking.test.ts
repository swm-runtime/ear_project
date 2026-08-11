/**
 * 재생 트래킹 값 계산의 정책 로직 테스트(convention.md 7.2 — 완청·청취 시간 계산은 필수 대상).
 * 규칙 소유: player.md 4.4(연속 도달) · 4.4-1(실제 청취 시간) · player-api.md 4.3(delta 정의).
 */
import { describe, expect, it } from '@jest/globals';

import {
  commitListenedDelta,
  createTrackingState,
  markSeek,
  observePosition,
  peekListenedDelta,
  type PlaybackTrackingState,
} from './playback-tracking';

/** 0.5초 주기 상태 이벤트를 흉내 내 연속 재생을 관측시킨다 */
const playThrough = (
  state: PlaybackTrackingState,
  fromSec: number,
  toSec: number,
  { rate = 1.0, stepSec = 0.5 }: { rate?: number; stepSec?: number } = {},
): PlaybackTrackingState => {
  let next = observePosition(state, { positionSec: fromSec, isPlaying: true, playbackRate: rate });
  for (let pos = fromSec + stepSec * rate; pos <= toSec + 1e-9; pos += stepSec * rate) {
    next = observePosition(next, { positionSec: pos, isPlaying: true, playbackRate: rate });
  }
  return next;
};

describe('playback-tracking', () => {
  describe('observePosition', () => {
    it('연속 재생하면 max_reached가 위치를 따라 늘고 실제 경과 시간이 누적된다', () => {
      // given
      const initial = createTrackingState(0);
      // when — 0초부터 10초까지 1배속 연속 재생
      const result = playThrough(initial, 0, 10);
      // then
      expect(result.maxReachedSec).toBeCloseTo(10);
      expect(result.pendingListenedSec).toBeCloseTo(10);
    });

    it('2배속으로 재생하면 도달 위치는 그대로이고 청취 시간은 절반으로 계산된다', () => {
      // given — 10분짜리를 2배속으로 끝까지 들으면 max=600, listened≈300 (player.md 4.4-1)
      const initial = createTrackingState(0);
      // when — 0초부터 60초 구간을 2배속으로
      const result = playThrough(initial, 0, 60, { rate: 2.0 });
      // then
      expect(result.maxReachedSec).toBeCloseTo(60);
      expect(result.pendingListenedSec).toBeCloseTo(30);
    });

    it('시크로 점프한 위치는 도달·청취로 계산되지 않는다', () => {
      // given — 10초까지 연속 재생한 상태
      let state = playThrough(createTrackingState(0), 0, 10);
      // when — 90% 지점(540초)으로 점프한 관측이 도착한다
      state = observePosition(state, { positionSec: 540, isPlaying: true, playbackRate: 1.0 });
      // then — max_reached는 10 그대로다(시크로 끝까지 점프한 것은 완청으로 인정하지 않는다)
      expect(state.maxReachedSec).toBeCloseTo(10);
      expect(state.pendingListenedSec).toBeCloseTo(10);
      // then — 점프 이후의 연속 재생은 다시 인정된다
      state = playThrough(state, 540, 545);
      expect(state.maxReachedSec).toBeCloseTo(545);
    });

    it('뒤로 시크(역행)는 도달·청취를 줄이지도 늘리지도 않는다', () => {
      // given
      let state = playThrough(createTrackingState(0), 0, 30);
      // when — 5초 지점으로 되감는다
      state = observePosition(state, { positionSec: 5, isPlaying: true, playbackRate: 1.0 });
      // then
      expect(state.maxReachedSec).toBeCloseTo(30);
      expect(state.pendingListenedSec).toBeCloseTo(30);
    });

    it('일시정지 상태의 관측은 청취 시간을 누적하지 않는다', () => {
      // given
      let state = playThrough(createTrackingState(0), 0, 10);
      // when — 정지 상태에서 같은 위치 근처의 관측이 반복된다
      state = observePosition(state, { positionSec: 10.2, isPlaying: false, playbackRate: 1.0 });
      state = observePosition(state, { positionSec: 10.2, isPlaying: false, playbackRate: 1.0 });
      // then
      expect(state.pendingListenedSec).toBeCloseTo(10);
    });

    it('서버 진행이 있던 콘텐츠는 이어듣기 중에도 기존 max_reached를 유지한다', () => {
      // given — 서버가 내려준 max_reached 300에서 100초 지점부터 이어듣는다(되감아 듣는 경우)
      const initial = createTrackingState(300);
      // when
      const result = playThrough(initial, 100, 110);
      // then — 300보다 뒤로 간 재생이 도달값을 깎지 않는다
      expect(result.maxReachedSec).toBeCloseTo(300);
    });
  });

  describe('markSeek', () => {
    it('시크 직후 첫 관측은 기준점만 갱신하고 그다음 관측부터 누적한다', () => {
      // given
      let state = playThrough(createTrackingState(0), 0, 10);
      // when — 100초로 시크 후 연속 재생
      state = markSeek(state, 100);
      state = observePosition(state, { positionSec: 100.5, isPlaying: true, playbackRate: 1.0 });
      // then — 시크 폭(90초)은 빠지고 이후 0.5초만 누적된다
      expect(state.pendingListenedSec).toBeCloseTo(10.5);
      expect(state.maxReachedSec).toBeCloseTo(100.5);
    });
  });

  describe('peekListenedDelta · commitListenedDelta', () => {
    it('전송분은 정수 초로 내림하고, 반영 성공분만 누적에서 차감한다', () => {
      // given — 7.8초 누적
      let state = playThrough(createTrackingState(0), 0, 7.8, { stepSec: 0.6 });
      const delta = peekListenedDelta(state);
      // then — 정수 초 전송(player-api.md 4.3 — int ≥ 0)
      expect(delta).toBe(Math.floor(state.pendingListenedSec));
      // when — 반영 성공
      state = commitListenedDelta(state, delta);
      // then — 소수 잔여분은 다음 delta로 이월된다(직전 반영 성공 이후 정의)
      expect(state.pendingListenedSec).toBeGreaterThanOrEqual(0);
      expect(state.pendingListenedSec).toBeLessThan(1);
    });

    it('반영에 실패하면 누적이 그대로 남아 다음 저장에 합산된다', () => {
      // given
      const state = playThrough(createTrackingState(0), 0, 5);
      const delta = peekListenedDelta(state);
      // when — commit을 호출하지 않는다(실패 경로)
      // then — 누적 유지: 같은 delta를 다시 뽑아도 줄지 않는다
      expect(peekListenedDelta(state)).toBe(delta);
      expect(state.pendingListenedSec).toBeCloseTo(5);
    });
  });
});
