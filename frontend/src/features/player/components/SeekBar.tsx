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
  /** 끄는 동안 손가락 아래 위치(초), 놓으면 null — 구간 카드가 따라간다 */
  onScrub?: (sec: number | null) => void;
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
  onScrub,
}: SeekBarProps) {
  const onImage = tone === 'onImage';
  const [trackWidth, setTrackWidth] = useState(0);
  const [dragPositionSec, setDragPositionSec] = useState<number | null>(null);
  // 구간 틈은 잡는 순간 벌어지고, 놓은 뒤 CHAPTER_HOLD_MS 가 지나면 닫힌다(애플 팟캐스트 — 평소엔 이어진 한 줄 바)
  const [isChapterOpen, setIsChapterOpen] = useState(false);
  // 조각으로 그리는 중인가 — 틈이 다 닫히면 이어진 바 하나로 돌아간다(조각끼리 맞닿은 소수점 경계에 이음선이 비쳐서)
  const [isSegmented, setIsSegmented] = useState(false);
  const chapterTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (chapterTimerRef.current !== null) clearTimeout(chapterTimerRef.current);
    },
    [],
  );

  // PanResponder 콜백은 생성 시점의 값을 캡처한다 — 최신 값은 ref로 읽고, 갱신은 렌더 밖에서 한다
  const stateRef = useRef({ trackWidth, durationSec, disabled });
  const onSeekToRef = useRef(onSeekTo);
  const onScrubRef = useRef(onScrub);
  useEffect(() => {
    stateRef.current = { trackWidth, durationSec, disabled };
    onSeekToRef.current = onSeekTo;
    onScrubRef.current = onScrub;
  });

  const panResponder = useMemo(() => {
    const dragRef = { current: null as number | null };
    /** 누른 지점(터치 영역 기준 x) — 그 뒤 위치는 이 값 + 이동량(dx)으로 잰다 */
    const grantXRef = { current: 0 };
    const openChapters = () => {
      if (chapterTimerRef.current !== null) clearTimeout(chapterTimerRef.current);
      chapterTimerRef.current = null;
      setIsSegmented(true);
      setIsChapterOpen(true);
    };
    const closeChaptersLater = () => {
      if (chapterTimerRef.current !== null) clearTimeout(chapterTimerRef.current);
      chapterTimerRef.current = setTimeout(() => {
        chapterTimerRef.current = null;
        setIsChapterOpen(false);
      }, CHAPTER_HOLD_MS);
    };
    const positionFromX = (x: number): number => {
      const { trackWidth: width, durationSec: duration } = stateRef.current;
      if (width <= 0 || duration <= 0) return 0;
      // 터치 영역 양 끝이 곧 0 과 끝이다 — 넓어진 바(양옆 ACTIVE_WIDEN) 기준으로 환산하면 왼쪽 끝이 0 보다
      // 조금 앞(10분짜리면 약 13초)에서 멈췄다(PM 2026-10-07 Android). 손가락이 영역 밖으로 나가면 끝에 붙는다
      const ratio = Math.min(1, Math.max(0, x / width));
      return ratio * duration;
    };

    // eslint-disable-next-line react-hooks/refs -- 콜백은 렌더가 아니라 제스처 시점에 실행된다(표준 PanResponder 패턴)
    return PanResponder.create({
      onStartShouldSetPanResponder: () => !stateRef.current.disabled,
      onMoveShouldSetPanResponder: () => !stateRef.current.disabled,
      // 한번 잡으면 끝까지 놓지 않는다 — 끄는 손가락이 조금만 아래로 가도 플레이어 끌어내리기(collapsePanResponder)가
      // 넘겨 달라고 요청해, 넘겨주면 바가 중간에 손가락을 안 따라왔다(PM 2026-10-07 실기기)
      onPanResponderTerminationRequest: () => false,
      // 바깥의 네이티브 제스처(스크롤·시스템 닫기)도 끄는 동안은 막는다
      onShouldBlockNativeResponder: () => true,
      onPanResponderGrant: (event) => {
        grantXRef.current = event.nativeEvent.locationX;
        const next = positionFromX(grantXRef.current);
        dragRef.current = next;
        setDragPositionSec(next);
        onScrubRef.current?.(next);
        openChapters();
      },
      // 움직이는 동안은 locationX 를 쓰지 않는다 — Android 는 손가락이 이 뷰 밖으로 나가면 locationX 가 음수가 되지
      // 않고 손가락 아래 다른 뷰 기준으로 와서, 왼쪽 끝까지 밀어도 0 으로 가지 않았다(PM 2026-10-07). 이동량은 정확하다
      onPanResponderMove: (_event, gesture) => {
        const next = positionFromX(grantXRef.current + gesture.dx);
        dragRef.current = next;
        setDragPositionSec(next);
        onScrubRef.current?.(next);
      },
      onPanResponderRelease: () => {
        if (dragRef.current !== null) onSeekToRef.current(dragRef.current);
        dragRef.current = null;
        setDragPositionSec(null);
        onScrubRef.current?.(null);
        closeChaptersLater();
      },
      onPanResponderTerminate: () => {
        dragRef.current = null;
        setDragPositionSec(null);
        onScrubRef.current?.(null);
        closeChaptersLater();
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
  // 잡으면 시간 숫자가 바에서 조금 떨어지며 커진다(애플 뮤직) — 바가 굵어지는 것과 같은 값으로 함께 움직인다
  const timeShift = grow.interpolate({ inputRange: [0, 1], outputRange: [0, TIME_ACTIVE_SHIFT] });
  const timeScale = grow.interpolate({ inputRange: [0, 1], outputRange: [1, TIME_ACTIVE_SCALE] });
  // 잡으면 바가 좌우로도 넓어지고 시간 숫자가 바 끝을 따라 바깥으로 벌어진다(애플 뮤직)
  const widen = grow.interpolate({ inputRange: [0, 1], outputRange: [0, -ACTIVE_WIDEN] });
  const timeLeftShift = grow.interpolate({ inputRange: [0, 1], outputRange: [0, -ACTIVE_WIDEN] });
  const timeRightShift = grow.interpolate({ inputRange: [0, 1], outputRange: [0, ACTIVE_WIDEN] });
  const trackRadius = grow.interpolate({
    inputRange: [0, 1],
    outputRange: [TRACK_HEIGHT_IDLE / 2, TRACK_HEIGHT_ACTIVE / 2],
  });
  const ratio = durationSec > 0 ? Math.min(1, Math.max(0, displaySec / durationSec)) : 0;
  const segments = chapterSegmentsOf(chapterStartsSec, durationSec, displaySec);
  // 틈 폭 — 레이아웃 값이라 JS 구동. 닫히면 조각들이 맞닿아 한 줄 바로 보인다(맞닿는 모서리는 직각)
  const chapterGap = useAnimatedValue(0);
  useEffect(() => {
    const animation = Animated.timing(chapterGap, {
      toValue: isChapterOpen ? CHAPTER_GAP : 0,
      duration: CHAPTER_GAP_MS,
      easing: motion.easing.easeOut,
      useNativeDriver: false,
    });
    animation.start(({ finished }) => {
      if (finished && !isChapterOpen) setIsSegmented(false);
    });
    return () => animation.stop();
  }, [isChapterOpen, chapterGap]);
  // 닫혀 있을 때 조각을 살짝 겹친다 — 소수점 폭이 맞닿으면 경계에 가는 이음선이 비친다
  const chapterMargin = chapterGap.interpolate({
    inputRange: [0, CHAPTER_GAP],
    outputRange: [-CHAPTER_SEAM_OVERLAP, CHAPTER_GAP],
  });
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
        <Animated.View
          style={[styles.trackSlot, { marginHorizontal: widen }]}
          // 바·조각은 터치를 받지 않는다 — 터치 영역 밖으로 넓어진 바가 손가락 아래에 오면 위치(locationX)가
          // 바 조각 기준으로 재어져 틀어진다. 늘 터치 영역 기준으로 잰다
          pointerEvents="none"
          // touchArea 가 첫 자식이라 touchArea 기준 y == 컴포넌트 기준 y
          onLayout={(event) =>
            onTrackCenter?.(event.nativeEvent.layout.y + event.nativeEvent.layout.height / 2)
          }
        >
          {isSegmented && segments.length > 0 ? (
            // 구간마다 조각 하나 — 잡았을 때 벌어지는 틈이 구간 경계다(애플 팟캐스트). 지난 조각은 꽉, 지금 조각은 비율만큼 찬다
            <View style={styles.chapterRow}>
              {segments.map((segment, index) => (
                <Animated.View
                  key={index}
                  style={[
                    trackStyle,
                    segmentCorners(index, segments.length),
                    { flex: segment.share, marginLeft: index === 0 ? 0 : chapterMargin },
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
        </Animated.View>
      </View>
      <Animated.View
        style={[styles.timeRow, { transform: [{ translateY: timeShift }] }]}
        importantForAccessibility="no-hide-descendants"
      >
        {/* 잡고 있는 동안 시간 숫자가 밝아지고 커진다 — 지금 고르는 위치를 읽게(애플 뮤직). 각자 바깥 끝을 기준으로
            커져야 양 끝 정렬이 흔들리지 않는다 */}
        <Animated.View
          style={{
            transformOrigin: 'left center',
            transform: [{ translateX: timeLeftShift }, { scale: timeScale }],
          }}
        >
          <Text style={[styles.timeLabel, isDragging && styles.timeLabelActive]}>
            {formatPlaybackTime(displaySec)}
          </Text>
        </Animated.View>
        <Animated.View
          style={{
            transformOrigin: 'right center',
            transform: [{ translateX: timeRightShift }, { scale: timeScale }],
          }}
        >
          <Text style={[styles.timeLabel, isDragging && styles.timeLabelActive]}>
            {formatPlaybackTime(durationSec)}
          </Text>
        </Animated.View>
      </Animated.View>
    </View>
  );
}

/** 평소 바 두께 · 잡았을 때 두께(애플 뮤직 재생 바 — 잡으면 두 배로 굵어진다) */
const TRACK_HEIGHT_IDLE = 6;
const TRACK_HEIGHT_ACTIVE = 12;
/** 손을 뗀 뒤 바가 얇아지는 시간 */
const TRACK_SHRINK_MS = 160;
/** 바(가장 굵을 때 기준)와 시간 숫자 사이 */
const TIME_GAP = 6;
/** 잡았을 때 시간 숫자가 더 내려가는 거리 · 커지는 배율 */
const TIME_ACTIVE_SHIFT = 4;
const TIME_ACTIVE_SCALE = 1.15;
/** 잡았을 때 바가 양옆으로 넓어지는 폭(한쪽) — 시간 숫자도 같은 만큼 바깥으로 */
const ACTIVE_WIDEN = 8;
/** 구간 조각 사이 틈 — 잡았을 때만 벌어진다 */
const CHAPTER_GAP = 3;
/** 닫힌 조각끼리 겹치는 폭 — 이음선 감춤 */
const CHAPTER_SEAM_OVERLAP = 1;
/** 놓은 뒤 틈이 닫히기까지 */
const CHAPTER_HOLD_MS = 2000;
/** 틈이 벌어지고 닫히는 시간 */
const CHAPTER_GAP_MS = 220;
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
  // 시간 숫자는 히트 영역(44) 아래 여백 안으로 끌어올려 바 바로 밑에 붙인다(PM 2026-10-07 "공백이 너무 많다") —
  // 바 아래 16 → TIME_GAP. 숫자는 누를 수 없어 히트 영역과 겹쳐도 된다
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: -((theme.touchTarget.minHeight - TRACK_HEIGHT_ACTIVE) / 2 - TIME_GAP),
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
