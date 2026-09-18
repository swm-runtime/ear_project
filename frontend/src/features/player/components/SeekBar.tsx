import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, StyleSheet, Text, View } from 'react-native';

import { useAnimatedValue } from '@/shared/hooks/useAnimatedValue';
import { theme } from '@/shared/theme';

import { SEEK_STEP_SEC } from '../player.constants';
import { PLAYER_COPY } from '../player.copy';
import { formatPlaybackTime, formatPlaybackTimeA11y } from '../player.format';
import { playerColor } from '../player.theme';

interface SeekBarProps {
  positionSec: number;
  durationSec: number;
  /** 오디오 준비 전에는 조작을 받지 않는다(player-uiux.md 4.3) */
  disabled: boolean;
  onSeekTo: (targetSec: number) => void;
  /** 사진 위에 얹힐 때(재생 목록 열림) — 트랙을 흰색 계열로. 시간 라벨은 사진 밖이라 그대로다 */
  tone?: 'default' | 'onImage';
  /** 트랙 선의 세로 중심(이 컴포넌트 기준 y) — 재생 목록이 열리면 앨범 커버 하한을 여기에 맞춰 썸이 밑변에 걸친다 */
  onTrackCenter?: (center: number) => void;
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
  tone = 'default',
  onTrackCenter,
}: SeekBarProps) {
  const onImage = tone === 'onImage';
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
  const isDragging = dragPositionSec !== null;
  // 썸은 잡고 있는 동안만 — 평소엔 채움과 트랙의 경계가 위치를 말해 주고, 사진 밑변에 걸친 썸만 튀어 보였다
  // (2026-09-18 PM, 애플 뮤직 방식). 손가락 밑에서 어디를 끌고 있는지는 썸이 커지며 보여 준다
  const thumbProgress = useAnimatedValue(0);
  useEffect(() => {
    // 나타날 땐 스프링으로 살짝 튀며 커지고, 사라질 땐 짧게 흐려진다 — 손을 뗀 뒤 튀는 건 어색하다
    const animation = isDragging
      ? Animated.spring(thumbProgress, {
          toValue: 1,
          friction: 6,
          tension: 140,
          useNativeDriver: true,
        })
      : Animated.timing(thumbProgress, {
          toValue: 0,
          duration: THUMB_HIDE_MS,
          useNativeDriver: true,
        });
    animation.start();
    return () => animation.stop();
  }, [isDragging, thumbProgress]);
  const ratio = durationSec > 0 ? Math.min(1, Math.max(0, displaySec / durationSec)) : 0;

  return (
    <View>
      <View
        style={styles.touchArea}
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
        <View
          style={[styles.track, onImage && styles.trackOnImage]}
          // touchArea 가 첫 자식이라 touchArea 기준 y == 컴포넌트 기준 y
          onLayout={(event) =>
            onTrackCenter?.(event.nativeEvent.layout.y + event.nativeEvent.layout.height / 2)
          }
        >
          <View style={[styles.fill, { width: `${ratio * 100}%` }]} />
          {/* 전체 폭으로 흘리면 0%·100%에서 손잡이 절반이 화면 밖으로 나간다 —
              측정한 폭 안으로 가둬 항상 온전히 보이게 한다 */}
          <Animated.View
            pointerEvents="none"
            style={[
              styles.thumb,
              {
                opacity: thumbProgress,
                transform: [
                  {
                    scale: thumbProgress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.3, 1],
                    }),
                  },
                ],
                left:
                  trackWidth > 0
                    ? Math.min(
                        Math.max(ratio * trackWidth, THUMB_SIZE / 2),
                        trackWidth - THUMB_SIZE / 2,
                      )
                    : 0,
              },
              disabled && (onImage ? styles.thumbDisabledOnImage : styles.thumbDisabled),
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
/** 손을 뗀 뒤 썸이 사라지는 시간 */
const THUMB_HIDE_MS = 140;
/*
 * 사진 위(재생 목록 열림) 트랙 — 선이 사진 밑변에 걸쳐 위 절반은 사진, 아래 절반은 플레이어의 검정 바탕이다.
 * 반투명 흰색은 두 바탕 모두에서 같은 "어두운 위의 옅은 선"으로 읽힌다(밝은 바탕이던 때는 아래 절반에서
 * 사라져 불투명 색을 썼다 — 2026-09-18 검정 플레이어로 바뀌며 되돌렸다). 채움·썸은 기본과 같은 흰색
 */
const ON_IMAGE_TRACK_COLOR = 'rgba(255, 255, 255, 0.35)';

const styles = StyleSheet.create({
  touchArea: {
    // 시크바 히트 영역도 44pt를 지킨다(player-uiux.md 7장)
    minHeight: theme.touchTarget.minHeight,
    justifyContent: 'center',
  },
  track: {
    height: 4,
    borderRadius: 2,
    backgroundColor: playerColor.border,
  },
  fill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: playerColor.primary,
  },
  thumb: {
    position: 'absolute',
    top: -(THUMB_SIZE - 4) / 2,
    marginLeft: -THUMB_SIZE / 2,
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    backgroundColor: playerColor.primary,
  },
  thumbDisabled: {
    backgroundColor: playerColor.border,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  timeLabel: {
    fontSize: theme.font.size.xs,
    color: playerColor.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  // 사진 위 — 색의 근거는 위 ON_IMAGE_* 상수 주석
  trackOnImage: {
    backgroundColor: ON_IMAGE_TRACK_COLOR,
  },
  thumbDisabledOnImage: {
    backgroundColor: ON_IMAGE_TRACK_COLOR,
  },
});
