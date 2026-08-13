import { useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/shared/theme';

import { SEEK_STEP_SEC } from '../player.constants';
import { PLAYER_COPY } from '../player.copy';
import { formatPlaybackTime, formatPlaybackTimeA11y } from '../player.format';

interface SeekBarProps {
  positionSec: number;
  durationSec: number;
  /** 오디오 준비 전에는 조작을 받지 않는다(player-uiux.md 4.3) */
  disabled: boolean;
  /**
   * 바깥 화면의 좌우 여백을 상쇄해 **바를 화면 끝까지 흘려보내는** 값.
   * 서비스명이 "이어"인 만큼 재생 진행이 화면을 가로질러 이어지는 것이 브랜드 표현이다.
   * 시간 라벨은 상쇄하지 않는다 — 글자가 화면 모서리에 붙으면 읽기 어렵다.
   */
  bleed?: number;
  onSeekTo: (targetSec: number) => void;
}

/**
 * 시크바 + 시간 라벨(PL1). 드래그 중에는 위치 라벨만 갱신하고 손을 뗀 시점에 seek한다
 * (player-uiux.md 4.2 — 드래그마다 오디오를 끊으면 위치를 고르는 동안 소리가 튄다).
 * 완청 기준선(90%) 등 판정 지점 표식은 그리지 않는다(8장 금지 사항).
 */
export default function SeekBar({
  positionSec,
  durationSec,
  disabled,
  onSeekTo,
  bleed = 0,
}: SeekBarProps) {
  const [trackWidth, setTrackWidth] = useState(0);
  const [dragPositionSec, setDragPositionSec] = useState<number | null>(null);

  // PanResponder 콜백은 생성 시점의 값을 캡처한다 — 최신 값은 ref로 읽고, 갱신은 렌더 밖에서 한다
  const stateRef = useRef({ trackWidth, durationSec, disabled });
  const onSeekToRef = useRef(onSeekTo);
  useEffect(() => {
    stateRef.current = { trackWidth, durationSec, disabled };
    onSeekToRef.current = onSeekTo;
  });

  const panResponder = useMemo(() => {
    const dragRef = { current: null as number | null };
    const positionFromX = (x: number): number => {
      const { trackWidth: width, durationSec: duration } = stateRef.current;
      if (width <= 0 || duration <= 0) return 0;
      const ratio = Math.min(1, Math.max(0, x / width));
      return ratio * duration;
    };

    // eslint-disable-next-line react-hooks/refs -- 콜백은 렌더가 아니라 제스처 시점에 실행된다(표준 PanResponder 패턴)
    return PanResponder.create({
      onStartShouldSetPanResponder: () => !stateRef.current.disabled,
      onMoveShouldSetPanResponder: () => !stateRef.current.disabled,
      onPanResponderGrant: (event) => {
        const next = positionFromX(event.nativeEvent.locationX);
        dragRef.current = next;
        setDragPositionSec(next);
      },
      onPanResponderMove: (event) => {
        const next = positionFromX(event.nativeEvent.locationX);
        dragRef.current = next;
        setDragPositionSec(next);
      },
      onPanResponderRelease: () => {
        if (dragRef.current !== null) onSeekToRef.current(dragRef.current);
        dragRef.current = null;
        setDragPositionSec(null);
      },
      onPanResponderTerminate: () => {
        dragRef.current = null;
        setDragPositionSec(null);
      },
    });
  }, []);

  const displaySec = dragPositionSec ?? positionSec;
  const ratio = durationSec > 0 ? Math.min(1, Math.max(0, displaySec / durationSec)) : 0;

  return (
    <View>
      <View
        style={[styles.touchArea, { marginHorizontal: -bleed }]}
        onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)}
        {...panResponder.panHandlers}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="재생 위치"
        accessibilityValue={{
          text: PLAYER_COPY.screen.seekBarA11yValue(
            formatPlaybackTimeA11y(displaySec),
            formatPlaybackTimeA11y(durationSec),
          ),
        }}
        accessibilityActions={[
          { name: 'increment', label: PLAYER_COPY.screen.seekForwardA11y },
          { name: 'decrement', label: PLAYER_COPY.screen.seekBackA11y },
        ]}
        onAccessibilityAction={(event) => {
          // 스크린리더 증감도 화면 버튼과 같은 ±10초다(player-uiux.md 7장)
          if (disabled) return;
          const delta =
            event.nativeEvent.actionName === 'increment' ? SEEK_STEP_SEC : -SEEK_STEP_SEC;
          onSeekTo(Math.max(0, positionSec + delta));
        }}
      >
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${ratio * 100}%` }]} />
          {/* 전체 폭으로 흘리면 0%·100%에서 손잡이 절반이 화면 밖으로 나간다 —
              측정한 폭 안으로 가둬 항상 온전히 보이게 한다 */}
          <View
            style={[
              styles.thumb,
              {
                left:
                  trackWidth > 0
                    ? Math.min(
                        Math.max(ratio * trackWidth, THUMB_SIZE / 2),
                        trackWidth - THUMB_SIZE / 2,
                      )
                    : 0,
              },
              disabled && styles.thumbDisabled,
            ]}
          />
        </View>
      </View>
      <View style={styles.timeRow} importantForAccessibility="no-hide-descendants">
        <Text style={styles.timeLabel}>{formatPlaybackTime(displaySec)}</Text>
        <Text style={styles.timeLabel}>{formatPlaybackTime(durationSec)}</Text>
      </View>
    </View>
  );
}

const THUMB_SIZE = 14;

const styles = StyleSheet.create({
  touchArea: {
    // 시크바 히트 영역도 44pt를 지킨다(player-uiux.md 7장)
    minHeight: theme.touchTarget.minHeight,
    justifyContent: 'center',
  },
  track: {
    height: 4,
    // 화면 끝까지 이어지는 선이라 모서리를 둥글리지 않는다 — 둥글면 거기서 끊겨 보인다
    backgroundColor: theme.color.border,
  },
  fill: {
    height: '100%',
    backgroundColor: theme.color.primary,
  },
  thumb: {
    position: 'absolute',
    top: -(THUMB_SIZE - 4) / 2,
    marginLeft: -THUMB_SIZE / 2,
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    backgroundColor: theme.color.primary,
  },
  thumbDisabled: {
    backgroundColor: theme.color.border,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  timeLabel: {
    fontSize: theme.font.size.xs,
    color: theme.color.textSecondary,
    fontVariant: ['tabular-nums'],
  },
});
