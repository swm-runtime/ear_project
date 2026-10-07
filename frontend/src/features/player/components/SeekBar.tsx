import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, StyleSheet, View } from 'react-native';

import { useAnimatedValue } from '@/shared/hooks/useAnimatedValue';
import { motion, theme } from '@/shared/theme';
import { Text } from '@/shared/ui/Typography';

import { SEEK_STEP_SEC } from '../player.constants';
import { PLAYER_COPY } from '../player.copy';
import { formatPlaybackTime, formatPlaybackTimeA11y } from '../player.format';
import { chapterSegmentsOf } from '../player.section';
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
  /** 구간 시작 시각(초) — 있으면 바를 구간별 조각으로 나눈다(애플 팟캐스트 챕터 바). 경계가 없으면 한 줄 바 */
  chapterStartsSec?: readonly number[];
}

/**
 * 시크바 + 시간 라벨(PL1). 드래그 중에는 위치 라벨만 갱신하고 손을 뗀 시점에 seek한다
 * (player-uiux.md 4.2 — 드래그마다 오디오를 끊으면 위치를 고르는 동안 소리가 튄다).
 * **애플 뮤직 재생 바 문법**(PM 2026-10-07): 손잡이(썸)가 없다. 평소엔 얇은 바, 손가락을 대면 바가 굵어지고(스프링)
 * 시간 숫자가 밝아지며, 놓으면 다시 얇아진다. 바 높이가 변해도 세로 중심은 그대로라 `onTrackCenter`가 흔들리지 않는다.
 * 완청 기준선(90%) 등 판정 지점 표식은 그리지 않는다(8장 금지 사항).
 */
export default function SeekBar({
  positionSec,
  durationSec,
  disabled,
  onSeekTo,
  tone = 'default',
  onTrackCenter,
  chapterStartsSec = NO_CHAPTERS,
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
  // 잡으면 바가 굵어진다(애플 뮤직) — 높이는 레이아웃 값이라 JS 구동. 짧은 전환이라 부담이 없다
  const grow = useAnimatedValue(0);
  useEffect(() => {
    const animation = isDragging
      ? Animated.spring(grow, { toValue: 1, ...motion.spring.snappy, useNativeDriver: false })
      : Animated.timing(grow, {
          toValue: 0,
          duration: TRACK_SHRINK_MS,
          easing: motion.easing.easeOut,
          useNativeDriver: false,
        });
    animation.start();
    return () => animation.stop();
  }, [isDragging, grow]);
  const trackHeight = grow.interpolate({
    inputRange: [0, 1],
    outputRange: [TRACK_HEIGHT_IDLE, TRACK_HEIGHT_ACTIVE],
  });
  const trackRadius = grow.interpolate({
    inputRange: [0, 1],
    outputRange: [TRACK_HEIGHT_IDLE / 2, TRACK_HEIGHT_ACTIVE / 2],
  });
  const ratio = durationSec > 0 ? Math.min(1, Math.max(0, displaySec / durationSec)) : 0;
  const segments = chapterSegmentsOf(chapterStartsSec, durationSec, displaySec);
  const trackStyle = [
    styles.track,
    onImage && styles.trackOnImage,
    { height: trackHeight, borderRadius: trackRadius },
  ];
  // 채움은 모서리를 따로 두지 않는다 — 바(부모)가 잘라 바깥 끝만 둥글고, 채움의 앞 끝은 직각이다
  const fillStyle = [
    styles.fill,
    disabled && (onImage ? styles.fillDisabledOnImage : styles.fillDisabled),
  ];
  /** 조각의 모서리 — 바 전체의 양 끝만 둥글고 구간끼리 맞닿는 쪽은 직각이다(PM 2026-10-07) */
  const segmentCorners = (index: number, count: number) => ({
    borderTopLeftRadius: index === 0 ? trackRadius : 0,
    borderBottomLeftRadius: index === 0 ? trackRadius : 0,
    borderTopRightRadius: index === count - 1 ? trackRadius : 0,
    borderBottomRightRadius: index === count - 1 ? trackRadius : 0,
  });

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
        {/* 가장 굵을 때 높이의 틀 — 바는 그 가운데서 자라므로 세로 중심(onTrackCenter)이 고정이다 */}
        <View
          style={styles.trackSlot}
          // touchArea 가 첫 자식이라 touchArea 기준 y == 컴포넌트 기준 y
          onLayout={(event) =>
            onTrackCenter?.(event.nativeEvent.layout.y + event.nativeEvent.layout.height / 2)
          }
        >
          {segments.length > 0 ? (
            // 구간마다 조각 하나 — 조각 사이 틈이 구간 경계다(애플 팟캐스트). 지난 조각은 꽉, 지금 조각은 비율만큼 찬다
            <View style={styles.chapterRow}>
              {segments.map((segment, index) => (
                <Animated.View
                  key={index}
                  style={[
                    trackStyle,
                    segmentCorners(index, segments.length),
                    { flex: segment.share },
                  ]}
                >
                  <Animated.View style={[fillStyle, { width: `${segment.fill * 100}%` }]} />
                </Animated.View>
              ))}
            </View>
          ) : (
            <Animated.View style={trackStyle}>
              <Animated.View style={[fillStyle, { width: `${ratio * 100}%` }]} />
            </Animated.View>
          )}
        </View>
      </View>
      <View style={styles.timeRow} importantForAccessibility="no-hide-descendants">
        {/* 잡고 있는 동안 시간 숫자가 밝아진다 — 지금 고르는 위치를 읽게(애플 뮤직) */}
        <Text style={[styles.timeLabel, isDragging && styles.timeLabelActive]}>
          {formatPlaybackTime(displaySec)}
        </Text>
        <Text style={[styles.timeLabel, isDragging && styles.timeLabelActive]}>
          {formatPlaybackTime(durationSec)}
        </Text>
      </View>
    </View>
  );
}

/** 평소 바 두께 · 잡았을 때 두께(애플 뮤직 재생 바 — 잡으면 두 배로 굵어진다) */
const TRACK_HEIGHT_IDLE = 6;
const TRACK_HEIGHT_ACTIVE = 12;
/** 손을 뗀 뒤 바가 얇아지는 시간 */
const TRACK_SHRINK_MS = 160;
/** 구간 조각 사이 틈 */
const CHAPTER_GAP = 3;
const NO_CHAPTERS: readonly number[] = [];
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
  trackSlot: {
    height: TRACK_HEIGHT_ACTIVE,
    justifyContent: 'center',
  },
  chapterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: CHAPTER_GAP,
  },
  track: {
    overflow: 'hidden',
    backgroundColor: playerColor.border,
  },
  fill: {
    height: '100%',
    backgroundColor: playerColor.primary,
  },
  fillDisabled: {
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
  timeLabelActive: {
    color: playerColor.textPrimary,
  },
  // 사진 위 — 색의 근거는 위 ON_IMAGE_* 상수 주석
  trackOnImage: {
    backgroundColor: ON_IMAGE_TRACK_COLOR,
  },
  fillDisabledOnImage: {
    backgroundColor: ON_IMAGE_TRACK_COLOR,
  },
});
