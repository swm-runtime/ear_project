import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LayoutChangeEvent, ScrollView } from 'react-native';
import { Animated, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAnimatedValue } from '@/shared/hooks/useAnimatedValue';
import { motion, theme } from '@/shared/theme';

import { PLAYER_COPY } from '../player.copy';
import { formatPlaybackTime } from '../player.format';
import { playerColor } from '../player.theme';
import type { ScriptSegment } from '../player.types';

interface PlayerScriptPanelProps {
  segments: ScriptSegment[];
  positionSec: number;
  /** 문단 탭 → 그 구간 시작으로 seek. 패널은 닫지 않는다 — 듣던 채로 따라 읽는 화면이다 */
  onSeek: (sec: number) => void;
  /** 문단 위에서 오른쪽으로 밀면 접는다 — 아트워크 화면으로 "돌아가는" 방향(2026-09-16) */
  onSwipeRight: () => void;
  /**
   * 펼침 애니메이션이 끝났는가. **문단은 그 뒤에 그린다** — 펼침은 높이·위치를 움직여 JS 스레드에서 도는데,
   * 같은 순간에 문단 수십~수백 개를 마운트하면 그 프레임들이 밀려 끊긴다(2026-09-21 iOS 실기기).
   * 한 번 그린 뒤에는 접히는 동안에도 그대로 둔다.
   */
  isSettled: boolean;
}

/** 문단이 나타나는 페이드 — 펼침이 끝난 뒤 빈 자리가 툭 채워지지 않게 한다 */
const ROWS_FADE_IN_MS = 160;
/**
 * 뷰포트 높이를 상태에 반영하기까지의 지연. 펼침·접힘 동안 패널 높이는 **매 프레임** 바뀌는데, 그때마다 상태를
 * 바꾸면 모든 문단이 다시 그려지고 페이드 보간을 새로 만든다 — 끊김의 큰 몫이었다. 멈춘 뒤의 값만 쓴다.
 */
const VIEWPORT_SETTLE_MS = 120;

/** 문단 위에서 오른쪽으로 이만큼 밀면 접는다. 세로 성분이 크면 목록 스크롤에 양보한다 */
const SWIPE_RIGHT_DISTANCE = 40;
const SWIPE_AXIS_RATIO = 1.5;
/** 현재 문단을 뷰포트의 이 비율 지점에 둔다 — 다음 문단이 미리 보여 읽기가 끊기지 않는다 */
const CURRENT_VIEW_POSITION = 0.3;

/** 현재가 아닌 문단의 글자 불투명도 — 보조 글자색 위에 한 번 더 낮춰 현재 문단과의 밝기 차이를 키운다 */
const DIMMED_OPACITY = 0.7;

/** 문단 하나의 자리(스크롤 콘텐츠 기준) */
interface SegmentBox {
  y: number;
  height: number;
}

/** 현재 구간 — 시작 초가 재생 위치를 넘지 않는 마지막 문단. 첫 문단 전이면 0 */
const currentIndexOf = (segments: ScriptSegment[], positionSec: number): number => {
  let index = 0;
  for (let i = 0; i < segments.length; i += 1) {
    if (segments[i].startSec <= positionSec) index = i;
    else break;
  }
  return index;
};

interface SegmentRowProps {
  segment: ScriptSegment;
  index: number;
  isCurrent: boolean;
  scrollY: Animated.Value;
  viewportHeight: number;
  onSeek: (sec: number) => void;
  onMeasure: (index: number, box: SegmentBox) => void;
}

/**
 * 문단 한 칸 — **가장자리에서 스스로 투명해진다**(2026-09-18 PM).
 *
 * 바탕이 흐린 커버(그림)라 배경색 띠로 덮는 페이드는 띠가 막대처럼 보였다. 마스크는 네이티브 모듈이
 * 필요해 못 쓴다. 대신 문단의 불투명도를 스크롤 위치에서 바로 계산한다 — 윗변이 뷰포트 위 끝에 닿는 순간부터
 * 흐려지기 시작해 가운데가 닿으면 0, 아래 끝도 대칭이다. 잘린 문단이 보이는 구간이 없고 어떤 바탕 위에서도 같다.
 * 네이티브 드라이버로 돌아 스크롤과 같은 프레임에 움직인다
 */
const SegmentRow = memo(function SegmentRow({
  segment,
  index,
  isCurrent,
  scrollY,
  viewportHeight,
  onSeek,
  onMeasure,
}: SegmentRowProps) {
  const [box, setBox] = useState<SegmentBox | null>(null);
  const time = formatPlaybackTime(segment.startSec);

  const onLayout = (event: LayoutChangeEvent) => {
    const { y, height } = event.nativeEvent.layout;
    setBox((prev) => (prev && prev.y === y && prev.height === height ? prev : { y, height }));
    onMeasure(index, { y, height });
  };

  // 뷰포트보다 큰 문단은 양끝에 동시에 걸린다 — 구간이 뒤집혀 보간이 성립하지 않으므로 그대로 둔다
  const canFade =
    box !== null && viewportHeight > 0 && box.height > 0 && box.height < viewportHeight;
  const opacity = canFade
    ? scrollY.interpolate({
        inputRange: [
          box.y + box.height / 2 - viewportHeight, // 가운데가 아래 끝 — 안 보임
          box.y + box.height - viewportHeight, // 밑변이 아래 끝 — 다 보임
          box.y, // 윗변이 위 끝 — 다 보임
          box.y + box.height / 2, // 가운데가 위 끝 — 안 보임
        ],
        outputRange: [0, 1, 1, 0],
        extrapolate: 'clamp',
      })
    : 1;

  return (
    <Animated.View style={{ opacity }} onLayout={onLayout}>
      <Pressable
        style={styles.segment}
        onPress={() => onSeek(segment.startSec)}
        accessibilityRole="button"
        accessibilityLabel={PLAYER_COPY.scriptSheet.segmentA11y(time, segment.speaker)}
        accessibilityState={{ selected: isCurrent }}
      >
        <View style={styles.segmentHead}>
          {segment.speaker ? (
            <Text style={[styles.speaker, isCurrent ? styles.speakerCurrent : styles.dimmed]}>
              {segment.speaker}
            </Text>
          ) : null}
          <Text style={[styles.time, !isCurrent && styles.dimmed]}>{time}</Text>
        </View>
        <Text
          style={[styles.text, isCurrent ? styles.textCurrent : styles.dimmed]}
          selectable={false}
        >
          {segment.text}
        </Text>
      </Pressable>
    </Animated.View>
  );
});

/**
 * PL6 스크립트 — 시트가 아니라 **플레이어 안에서 펼쳐지는 패널**(2026-09-16 개정).
 * 펼치면 아트워크가 한 줄 헤더로 압축되고 이 패널이 남은 높이를 채운다. 컨트롤은 바닥에 그대로 있어
 * 읽으면서 조작한다. 현재 구간 하이라이트(배경 + 굵기, 7장)·자동 스크롤·문단 탭 seek는 uiux 4.6 그대로.
 * 텍스트 선택·복사는 막는다(FR-33).
 *
 * 목록은 FlatList 가 아니라 ScrollView 다(2026-09-18) — 문단마다 콘텐츠 기준 y 가 있어야 가장자리 페이드를
 * 계산하는데, FlatList 의 칸은 셀 래퍼에 싸여 y 가 늘 0 이다. 대본 한 편의 문단 수는 가상화가 필요한 규모가 아니다
 */
export default function PlayerScriptPanel({
  segments,
  positionSec,
  onSeek,
  onSwipeRight,
  isSettled,
}: PlayerScriptPanelProps) {
  const scrollRef = useRef<ScrollView>(null);
  const scrollY = useAnimatedValue(0);
  const [viewportHeight, setViewportHeight] = useState(0);

  // 한 번 자리 잡으면 계속 그린다(접히는 동안 문단이 사라지지 않게). 렌더 중 상태 맞춤 — 값이 한 방향으로만 간다
  const [hasSettled, setHasSettled] = useState(isSettled);
  if (isSettled && !hasSettled) setHasSettled(true);
  const rowsOpacity = useAnimatedValue(isSettled ? 1 : 0);
  useEffect(() => {
    if (!hasSettled) return;
    Animated.timing(rowsOpacity, {
      toValue: 1,
      duration: ROWS_FADE_IN_MS,
      easing: motion.easing.easeOut,
      useNativeDriver: true,
    }).start();
  }, [hasSettled, rowsOpacity]);

  // 문단은 memo 다 — 재생 위치가 0.5초마다 바뀌어도 "현재 문단"이 바뀐 두 칸만 다시 그린다.
  // 그러려면 넘기는 콜백이 매 렌더 같은 함수여야 한다: 최신 onSeek 은 ref 로 들고 고정된 함수가 부른다
  const onSeekRef = useRef(onSeek);
  useEffect(() => {
    onSeekRef.current = onSeek;
  });
  const handleSeek = useCallback((sec: number) => onSeekRef.current(sec), []);

  // 높이는 움직임이 멈춘 뒤에만 상태로 올린다(VIEWPORT_SETTLE_MS)
  const viewportTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 스크롤 위치 계산은 지연 없는 최신 높이를 쓴다 — 상태(페이드 보간용)만 늦게 따라온다
  const viewportHeightRef = useRef(0);
  const onViewportLayout = useCallback((event: LayoutChangeEvent) => {
    const { height } = event.nativeEvent.layout;
    viewportHeightRef.current = height;
    if (viewportTimerRef.current) clearTimeout(viewportTimerRef.current);
    viewportTimerRef.current = setTimeout(() => setViewportHeight(height), VIEWPORT_SETTLE_MS);
  }, []);
  useEffect(
    () => () => {
      if (viewportTimerRef.current) clearTimeout(viewportTimerRef.current);
    },
    [],
  );
  const boxesRef = useRef<Record<number, SegmentBox>>({});
  const currentIndex = currentIndexOf(segments, positionSec);

  // 현재 문단을 화면 위쪽 1/3에 둔다
  const scrollToCurrent = useCallback(
    (animated: boolean) => {
      const box = boxesRef.current[currentIndex];
      const height = viewportHeightRef.current;
      if (!box || height <= 0) return;
      const y = Math.max(0, box.y - (height - box.height) * CURRENT_VIEW_POSITION);
      scrollRef.current?.scrollTo({ y, animated });
    },
    [currentIndex],
  );
  useEffect(() => {
    scrollToCurrent(true);
  }, [scrollToCurrent]);

  // 펼친 직후에는 현재 문단이 아직 측정 전이다 — 처음 측정되는 순간 한 번 맞춘다
  const hasInitialScrollRef = useRef(false);
  const currentIndexRef = useRef(currentIndex);
  const scrollToCurrentRef = useRef(scrollToCurrent);
  useEffect(() => {
    currentIndexRef.current = currentIndex;
    scrollToCurrentRef.current = scrollToCurrent;
  });
  const onMeasure = useCallback((index: number, box: SegmentBox) => {
    boxesRef.current[index] = box;
    if (!hasInitialScrollRef.current && index === currentIndexRef.current) {
      hasInitialScrollRef.current = true;
      // 같은 레이아웃 패스의 나머지 측정이 끝난 뒤에 움직인다
      requestAnimationFrame(() => scrollToCurrentRef.current(false));
    }
  }, []);

  const swipeRightRef = useRef(onSwipeRight);
  useEffect(() => {
    swipeRightRef.current = onSwipeRight;
  });
  // 목록은 세로 스크롤을 가져가므로 가로 이동만 부모가 가로챈다(capture) — 스크롤과 겹치지 않는다
  const swipeRightResponder = useMemo(
    () =>
      // eslint-disable-next-line react-hooks/refs -- 콜백은 렌더가 아니라 제스처 시점에 실행된다(표준 PanResponder 패턴)
      PanResponder.create({
        onMoveShouldSetPanResponderCapture: (_, gesture) =>
          gesture.dx > SWIPE_RIGHT_DISTANCE &&
          Math.abs(gesture.dx) > Math.abs(gesture.dy) * SWIPE_AXIS_RATIO,
        onPanResponderRelease: () => swipeRightRef.current(),
      }),
    [],
  );

  const onScroll = useMemo(
    () =>
      Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
        useNativeDriver: true,
      }),
    [scrollY],
  );

  return (
    <View style={styles.panel} {...swipeRightResponder.panHandlers}>
      <Animated.ScrollView
        ref={scrollRef}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        onLayout={onViewportLayout}
        onScroll={onScroll}
        scrollEventThrottle={16}
      >
        {hasSettled ? (
          <Animated.View style={[styles.rows, { opacity: rowsOpacity }]}>
            {segments.map((segment, index) => (
              <SegmentRow
                key={segment.startSec}
                segment={segment}
                index={index}
                isCurrent={index === currentIndex}
                scrollY={scrollY}
                viewportHeight={viewportHeight}
                onSeek={handleSeek}
                onMeasure={onMeasure}
              />
            ))}
          </Animated.View>
        ) : null}
      </Animated.ScrollView>
      {/* 손잡이는 서랍의 아랫단이다 — 접힌 상태의 바닥 손잡이와 같은 자리·같은 모양이라,
          위로 끌어 올린 것을 아래로 끌어 내리는 것으로 읽힌다. 탭도 접는다 */}
    </View>
  );
}

const styles = StyleSheet.create({
  // 헤더·컨트롤과의 경계는 선도 띠도 아니다 — 문단이 가장자리에서 스스로 투명해진다(SegmentRow)
  panel: {
    flex: 1,
    minHeight: 0,
  },
  list: {
    flex: 1,
  },
  listContent: {},
  // 문단 묶음 — 여백과 간격을 여기에 둔다. 문단의 y 는 **이 묶음 기준**으로 측정되고 묶음은 스크롤 콘텐츠의
  // 맨 위(y = 0)에 있으므로, 위 여백을 여기 두어야 측정값이 스크롤 위치와 같은 좌표가 된다(가장자리 페이드 계산)
  rows: {
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.md,
    gap: theme.spacing.xs,
  },
  segment: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.md,
    borderCurve: 'continuous',
    gap: theme.spacing.xs,
  },
  /*
   * 현재 문단은 상자로 감싸지 않는다(2026-09-18 PM — 애플 뮤직·팟캐스트·유튜브 뮤직 가사 방식). 흐린 커버 바탕
   * 위에 불투명 카드가 올라가면 그 문단만 덩어리져 보이고 바탕의 색을 가린다. 구분은 글자가 한다: 현재 문단은
   * 흰색 + 굵게, 나머지는 한 단 더 흐리게. 굵기 차이가 있어 색만으로 구분하지 않는다(uiux 7장)
   */
  dimmed: {
    opacity: DIMMED_OPACITY,
  },
  segmentHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: theme.spacing.sm,
  },
  speaker: {
    fontSize: theme.font.size.xs,
    fontWeight: '600',
    color: playerColor.textSecondary,
  },
  speakerCurrent: {
    color: playerColor.primary,
  },
  time: {
    fontSize: theme.font.size.xs,
    color: playerColor.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  text: {
    fontSize: theme.font.size.md,
    lineHeight: theme.font.size.md * 1.55,
    color: playerColor.textSecondary,
    userSelect: 'none',
  },
  textCurrent: {
    fontWeight: '600',
    color: playerColor.textPrimary,
  },
});
