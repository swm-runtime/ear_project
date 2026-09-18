import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useAnimatedValue } from '@/shared/hooks/useAnimatedValue';
import { theme } from '@/shared/theme';

import { PLAYER_COPY } from '../player.copy';
import { formatPlaybackTime } from '../player.format';
import { playerColor } from '../player.theme';
import type { QueueItem } from '../player.types';
import { ReorderIcon } from './PlayerIcons';

interface PlayerQueuePanelProps {
  items: QueueItem[];
  isLoading: boolean;
  isError: boolean;
  /** 지금 재생 중인 콘텐츠 — 굵게 표시하고 낭독에도 "재생 중"을 붙인다(색만으로 구분하지 않는다) */
  currentContentId: string;
  onSelect: (item: QueueItem) => void;
  onRetry: () => void;
  /** 항목 위에서 오른쪽으로 밀면 접는다 — 아트워크 화면으로 "돌아가는" 방향 */
  onSwipeRight: () => void;
  /** 손잡이를 끌어 `from` 줄을 `to` 줄로 옮겼다 — 순서의 저장은 부모(useQueueOrder) 몫이다 */
  onReorder: (from: number, to: number) => void;
  /** 줄의 카테고리(주제 이름) — 이름 해석은 주제 목록을 가진 화면 몫이다. 없으면 길이만 보인다 */
  categoryOf?: (item: QueueItem) => string | null;
  /** 시트 안에서는 손잡이 라벨이 제목 역할이라 패널 제목을 다시 그리지 않는다 */
  showHeader?: boolean;
}

const SWIPE_RIGHT_DISTANCE = 40;
const SWIPE_AXIS_RATIO = 1.5;
const THUMBNAIL_SIZE = 48;
/** 행 높이는 고정이다 — 끌어 옮길 때 "몇 칸 움직였나"를 거리에서 바로 센다(썸네일 48 + 위아래 sm) */
const ROW_HEIGHT = THUMBNAIL_SIZE + theme.spacing.sm * 2;
const ROW_GAP = theme.spacing.xs;
const ROW_STEP = ROW_HEIGHT + ROW_GAP;
const REORDER_ICON_SIZE = 22;
/** 끄는 줄의 확대 비율 — 떠 있다는 단서만 줄 만큼 */
const DRAG_SCALE = 1.03;
/** 끄는 줄의 면 — 플레이어 면(surface)보다 한 단 밝은 불투명 회색 */
const DRAG_SURFACE_COLOR = '#35353B';
/** 비켜 주는 행이 한 칸 움직이는 시간 · 놓은 행이 제자리에 앉는 시간 */
const ROW_SHIFT_MS = 140;
const ROW_SETTLE_MS = 120;
/** 끄는 행이 뷰포트 끝에서 이 거리 안에 들어오면 자동 스크롤이 시작된다 */
const AUTO_SCROLL_EDGE = 56;
/** 자동 스크롤 속도(px/프레임) — 끝에 깊이 들어갈수록 빨라지고 이 값에서 멈춘다 */
const AUTO_SCROLL_MAX_SPEED = 14;
const speedOf = (depth: number): number =>
  Math.max(2, Math.min(AUTO_SCROLL_MAX_SPEED, (depth / AUTO_SCROLL_EDGE) * AUTO_SCROLL_MAX_SPEED));

const toMinutes = (durationSec: number | null): number =>
  durationSec === null ? 0 : Math.max(1, Math.round(durationSec / 60));

interface QueueRowProps {
  item: QueueItem;
  /** 제목 아래 보조 줄 앞에 붙는 카테고리 — "AI·테크 트렌드 · 5:00" */
  category: string | null;
  index: number;
  total: number;
  isCurrent: boolean;
  /** 이 행이 지금 끌려가는 중인가 */
  isDragging: boolean;
  /** 끌려가는 행에게 자리를 비켜 주는 이동량(px). 끄는 중이 아니면 0 */
  shift: number;
  /** 비켜 주기를 애니메이션할지 — 순서가 확정돼 레이아웃이 바뀌는 순간에는 즉시 0 으로 돌린다 */
  animateShift: boolean;
  /** 끌려가는 행의 손가락 이동량 */
  dragY: Animated.Value;
  onSelect: (item: QueueItem) => void;
  onDragStart: (index: number) => void;
  onDragMove: (dy: number) => void;
  onDragEnd: () => void;
  onNudge: (index: number, direction: -1 | 1) => void;
}

/**
 * 재생 목록 한 줄 — 오른쪽 손잡이(가로줄 두 개)를 잡고 끌면 순서가 바뀐다(2026-09-18 PM).
 * 끌기 라이브러리(reanimated·gesture-handler)는 네이티브 모듈이라 새 빌드가 필요하다. 행 높이를 고정하고
 * PanResponder 로 직접 구현해 OTA 로 나간다. 본문 탭(재생)과 손잡이(순서)는 영역이 갈려 있어 서로 섞이지 않는다.
 */
function QueueRow({
  item,
  category,
  index,
  total,
  isCurrent,
  isDragging,
  shift,
  animateShift,
  dragY,
  onSelect,
  onDragStart,
  onDragMove,
  onDragEnd,
  onNudge,
}: QueueRowProps) {
  // 눌림 표시는 본문이 아니라 **줄 전체**(손잡이 포함)에 깐다 — 본문만 밝히면 줄이 알약과 아이콘으로 쪼개져 보인다
  const [isPressed, setIsPressed] = useState(false);
  const shiftY = useAnimatedValue(0);
  useEffect(() => {
    if (!animateShift) {
      shiftY.setValue(shift);
      return;
    }
    const animation = Animated.timing(shiftY, {
      toValue: shift,
      duration: ROW_SHIFT_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [shift, animateShift, shiftY]);

  // 제스처 콜백은 생성 시점 값을 캡처한다 — 최신 값은 ref 로 읽는다
  const latest = useRef({ index, onDragStart, onDragMove, onDragEnd });
  useEffect(() => {
    latest.current = { index, onDragStart, onDragMove, onDragEnd };
  });
  const handleResponder = useMemo(
    () =>
      // eslint-disable-next-line react-hooks/refs -- 콜백은 렌더가 아니라 제스처 시점에 실행된다(표준 PanResponder 패턴)
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        // 끄는 동안 목록 스크롤·플레이어 끌어내리기·시트 끌기에 터치를 내주지 않는다
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => latest.current.onDragStart(latest.current.index),
        onPanResponderMove: (_, gesture) => latest.current.onDragMove(gesture.dy),
        onPanResponderRelease: () => latest.current.onDragEnd(),
        onPanResponderTerminate: () => latest.current.onDragEnd(),
      }),
    [],
  );

  const tags: string[] = [];
  if (isCurrent) tags.push(PLAYER_COPY.queuePanel.nowPlayingA11y);
  if (item.isCompleted) tags.push(PLAYER_COPY.queuePanel.completedA11y);

  return (
    <Animated.View
      style={[
        styles.rowWrap,
        isPressed && styles.rowWrapPressed,
        isDragging && styles.rowWrapDragging,
        {
          transform: [
            { translateY: isDragging ? dragY : shiftY },
            // 끄는 줄은 살짝 커져 떠 있는 것으로 읽힌다
            { scale: isDragging ? DRAG_SCALE : 1 },
          ],
        },
      ]}
    >
      <Pressable
        style={styles.row}
        onPress={() => onSelect(item)}
        onPressIn={() => setIsPressed(true)}
        onPressOut={() => setIsPressed(false)}
        accessibilityRole="button"
        accessibilityLabel={PLAYER_COPY.queuePanel.itemA11y(
          item.title,
          toMinutes(item.durationSec),
          tags,
        )}
        accessibilityState={{ selected: isCurrent }}
      >
        {item.thumbnailUrl ? (
          <Image source={{ uri: item.thumbnailUrl }} style={styles.thumbnail} />
        ) : (
          <View style={styles.thumbnail} />
        )}
        <View style={styles.rowMeta}>
          <Text style={[styles.rowTitle, isCurrent && styles.rowTitleCurrent]} numberOfLines={1}>
            {item.title}
          </Text>
          {/* 카테고리 · 길이 한 줄(2026-09-19 PM) — 무슨 편인지가 길이보다 먼저 읽힌다 */}
          <Text style={styles.rowDuration} numberOfLines={1}>
            {[category, item.durationSec === null ? null : formatPlaybackTime(item.durationSec)]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        </View>
      </Pressable>
      {/* 손잡이 — 히트 영역 44pt. 끌기의 낭독기 대체 수단은 위/아래 이동 액션이다(uiux 7장) */}
      <View
        style={styles.reorderHandle}
        {...handleResponder.panHandlers}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={PLAYER_COPY.queuePanel.reorderA11y(item.title, index + 1, total)}
        accessibilityActions={[
          { name: 'decrement', label: PLAYER_COPY.queuePanel.moveUpA11y },
          { name: 'increment', label: PLAYER_COPY.queuePanel.moveDownA11y },
        ]}
        onAccessibilityAction={(event) =>
          onNudge(index, event.nativeEvent.actionName === 'decrement' ? -1 : 1)
        }
      >
        <ReorderIcon size={REORDER_ICON_SIZE} color={playerColor.textSecondary} />
      </View>
    </Animated.View>
  );
}

/**
 * 재생 목록 패널(2026-09-16) — 바닥 손잡이를 끌어올리면 아트워크가 압축되고 이 패널이 남은 높이를
 * 채운다(스크립트 패널과 같은 자리·같은 전환).
 *
 * **목록의 원천은 필터를 걸지 않은 라이브러리 첫 페이지다**(2026-09-17 — FE 워크트리 작업 통합). 패널은
 * 라이브러리 화면의 복제가 아니라 "지금 듣는 것의 이웃"을 보여주는 자리라 검색·탭·주제 필터를 두지 않는다.
 * library의 컴포넌트를 가져오지 않는다 — player → library 직접 의존이 되어 의존 표
 * (architecture.md 4.4)의 방향이 뒤집힌다. 한 줄 밀도가 이 자리에 맞기도 하다.
 *
 * 순서는 행 오른쪽 손잡이로 바꾼다(2026-09-18). 첫 페이지 분량이라 가상화 없이 ScrollView 로 그린다 —
 * 끄는 행이 다른 행 위로 떠야 하고(zIndex), 행마다 자리 이동을 따로 애니메이션해야 한다.
 *
 * 문서 반영 요청: changes/pending/player-queue-panel.md
 */
export default function PlayerQueuePanel({
  items,
  isLoading,
  isError,
  currentContentId,
  onSelect,
  onRetry,
  onSwipeRight,
  onReorder,
  categoryOf,
  showHeader = true,
}: PlayerQueuePanelProps) {
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

  /*
   * ── 끌어서 순서 바꾸기 ──
   * 끄는 행은 손가락을 그대로 따라가고(dragY), 지나친 행들은 한 칸씩 비켜 준다(shift). 놓으면 끄는 행을
   * 목표 칸에 앉힌 뒤 순서를 확정한다 — 확정 순간 레이아웃이 바뀌므로 이동량을 애니메이션 없이 0 으로 돌린다
   */
  const dragY = useAnimatedValue(0);
  const [drag, setDrag] = useState<{ from: number; hover: number } | null>(null);
  const dragRef = useRef<{ from: number; hover: number } | null>(null);
  const countRef = useRef(items.length);
  const onReorderRef = useRef(onReorder);
  useEffect(() => {
    countRef.current = items.length;
    onReorderRef.current = onReorder;
  });
  /*
   * 가장자리 자동 스크롤 — 끄는 행이 뷰포트 위·아래 끝에 가까워지면 목록이 그쪽으로 흘러, 한 번의 끌기로
   * 보이지 않는 칸까지 옮길 수 있다. 손가락은 가만히 있어도 목록이 밑에서 흐르므로 행의 이동량은
   * "손가락 이동 + 그동안 스크롤된 거리"다. 스크롤은 프레임마다 직접 옮긴다(끄는 동안 사용자 스크롤은 꺼져 있다)
   */
  const scrollRef = useRef<ScrollView>(null);
  const scrollState = useRef({
    offset: 0, // 현재 스크롤 위치
    startOffset: 0, // 끌기 시작 때의 스크롤 위치
    viewport: 0, // 목록 뷰포트 높이
    content: 0, // 목록 콘텐츠 높이
    rowsTop: 0, // 첫 행의 콘텐츠 기준 y(패딩·제목 아래)
    lastDy: 0, // 마지막 손가락 이동량
    frame: 0 as number | 0, // 자동 스크롤 루프(requestAnimationFrame id)
  });

  const applyRef = useRef<() => number>(() => 0);
  // 화면이 걷히는 중에 끌기가 남아 있어도 루프가 돌지 않게 한다
  useEffect(() => {
    const state = scrollState.current;
    return () => cancelAnimationFrame(state.frame);
  }, []);

  const handlers = useMemo(
    () => ({
      start: (index: number) => {
        dragY.setValue(0);
        dragRef.current = { from: index, hover: index };
        setDrag(dragRef.current);
        const state = scrollState.current;
        state.startOffset = state.offset;
        state.lastDy = 0;
        // 자동 스크롤 루프 — 끄는 동안 프레임마다 가장자리 근접을 본다
        const tick = () => {
          const current = dragRef.current;
          if (!current) return;
          const offset = apply();
          const rowTop = state.rowsTop + current.from * ROW_STEP + offset - state.offset;
          const rowBottom = rowTop + ROW_HEIGHT;
          const maxScroll = Math.max(0, state.content - state.viewport);
          let delta = 0;
          if (rowTop < AUTO_SCROLL_EDGE && state.offset > 0) {
            delta = -speedOf(AUTO_SCROLL_EDGE - rowTop);
          } else if (rowBottom > state.viewport - AUTO_SCROLL_EDGE && state.offset < maxScroll) {
            delta = speedOf(rowBottom - (state.viewport - AUTO_SCROLL_EDGE));
          }
          if (delta !== 0) {
            state.offset = Math.max(0, Math.min(maxScroll, state.offset + delta));
            scrollRef.current?.scrollTo({ y: state.offset, animated: false });
            apply();
          }
          state.frame = requestAnimationFrame(tick);
        };
        // 끄는 행의 이동량을 다시 계산해 반영하고 돌려준다
        const apply = (): number => {
          const current = dragRef.current;
          if (!current) return 0;
          // 목록 밖으로는 끌려 나가지 않는다
          const min = -current.from * ROW_STEP;
          const max = (countRef.current - 1 - current.from) * ROW_STEP;
          const raw = state.lastDy + (state.offset - state.startOffset);
          const clamped = Math.max(min, Math.min(max, raw));
          dragY.setValue(clamped);
          const hover = current.from + Math.round(clamped / ROW_STEP);
          if (hover !== current.hover) {
            dragRef.current = { from: current.from, hover };
            setDrag(dragRef.current);
          }
          return clamped;
        };
        applyRef.current = apply;
        state.frame = requestAnimationFrame(tick);
      },
      move: (dy: number) => {
        scrollState.current.lastDy = dy;
        applyRef.current();
      },
      end: () => {
        const current = dragRef.current;
        if (!current) return;
        dragRef.current = null;
        cancelAnimationFrame(scrollState.current.frame);
        Animated.timing(dragY, {
          toValue: (current.hover - current.from) * ROW_STEP,
          duration: ROW_SETTLE_MS,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start(() => {
          if (current.hover !== current.from) onReorderRef.current(current.from, current.hover);
          setDrag(null);
          dragY.setValue(0);
        });
      },
      nudge: (index: number, direction: -1 | 1) => {
        const target = index + direction;
        if (target < 0 || target >= countRef.current) return;
        onReorderRef.current(index, target);
      },
    }),
    [dragY],
  );

  const shiftOf = (index: number): number => {
    if (!drag || index === drag.from) return 0;
    if (drag.from < drag.hover && index > drag.from && index <= drag.hover) return -ROW_STEP;
    if (drag.hover < drag.from && index >= drag.hover && index < drag.from) return ROW_STEP;
    return 0;
  };

  const header = showHeader ? (
    <Text style={styles.title} accessibilityRole="header">
      {PLAYER_COPY.queuePanel.title}
    </Text>
  ) : null;

  if (isError) {
    return (
      <View style={styles.panel} {...swipeRightResponder.panHandlers}>
        {header}
        <View style={styles.placeholder}>
          <Text style={styles.placeholderText}>{PLAYER_COPY.queuePanel.loadFailed}</Text>
          <Pressable
            style={styles.retry}
            onPress={onRetry}
            accessibilityRole="button"
            accessibilityLabel={PLAYER_COPY.queuePanel.retry}
          >
            <Text style={styles.retryLabel}>{PLAYER_COPY.queuePanel.retry}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={styles.panel} {...swipeRightResponder.panHandlers}>
        {header}
        <View style={styles.placeholder}>
          <ActivityIndicator color={playerColor.textSecondary} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.panel} {...swipeRightResponder.panHandlers}>
      <ScrollView
        ref={scrollRef}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        // 끄는 동안 목록이 같이 스크롤되면 손가락과 행이 어긋난다 — 가장자리 자동 스크롤만 직접 옮긴다
        scrollEnabled={drag === null}
        scrollEventThrottle={16}
        onScroll={(event) => {
          // 끄는 중에는 자동 스크롤이 직접 적는 값이 기준이다(이벤트는 한 박자 늦다)
          if (dragRef.current === null) {
            scrollState.current.offset = event.nativeEvent.contentOffset.y;
          }
        }}
        onLayout={(event) => {
          scrollState.current.viewport = event.nativeEvent.layout.height;
        }}
        onContentSizeChange={(_, height) => {
          scrollState.current.content = height;
        }}
      >
        {header}
        {items.length === 0 ? (
          <View style={styles.placeholder}>
            <Text style={styles.placeholderText}>{PLAYER_COPY.queuePanel.empty}</Text>
          </View>
        ) : (
          <View
            style={styles.rows}
            onLayout={(event) => {
              scrollState.current.rowsTop = event.nativeEvent.layout.y;
            }}
          >
            {items.map((item, index) => (
              <QueueRow
                key={item.itemId}
                item={item}
                category={categoryOf ? categoryOf(item) : null}
                index={index}
                total={items.length}
                isCurrent={item.contentId === currentContentId}
                isDragging={drag !== null && drag.from === index}
                shift={shiftOf(index)}
                animateShift={drag !== null}
                dragY={dragY}
                onSelect={onSelect}
                onDragStart={handlers.start}
                onDragMove={handlers.move}
                onDragEnd={handlers.end}
                onNudge={handlers.nudge}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  // 구분선 없음(PM 2026-09-17) — 손잡이와 목록 사이는 여백으로만 가른다
  panel: {
    flex: 1,
    minHeight: 0,
  },
  list: {
    flex: 1,
  },
  // 좌우 여백은 행이 갖는다 — 눌림·끌기 배경이 화면 끝에서 끝까지 깔려야 한다(애플 뮤직 방식, 2026-09-18)
  listContent: {
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.md,
  },
  rows: {
    gap: ROW_GAP,
  },
  title: {
    fontSize: theme.font.size.xs,
    fontWeight: '600',
    color: playerColor.textSecondary,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.xs,
  },
  placeholder: {
    paddingVertical: theme.spacing.xl,
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  placeholderText: {
    fontSize: theme.font.size.sm,
    color: playerColor.textSecondary,
  },
  retry: {
    minHeight: theme.touchTarget.minHeight,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.md,
  },
  retryLabel: {
    fontSize: theme.font.size.sm,
    fontWeight: '600',
    color: playerColor.primary,
  },
  rowWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    height: ROW_HEIGHT,
    // 행 패딩(sm)과 합쳐 화면 여백(lg)
    paddingHorizontal: theme.spacing.md,
  },
  // 누르는 동안만 — 불투명 면이 아니라 옅은 흰색이라 바탕의 커버 색이 비친다. 선택 상태는 따로 두지 않는다
  rowWrapPressed: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  // 끄는 행은 다른 행 위로 뜬다 — 밝은 면 + 그림자. 면은 **불투명**이다: 빠르게 지나갈 때 비켜 주는 행이
  // 한 박자 늦어 잠깐 겹치는데, 반투명이면 밑의 글자가 비쳐 두 제목이 섞여 보인다
  rowWrapDragging: {
    zIndex: 1,
    elevation: 6,
    backgroundColor: DRAG_SURFACE_COLOR,
    shadowColor: '#000000',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  row: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    height: ROW_HEIGHT,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.radius.md,
  },
  thumbnail: {
    width: THUMBNAIL_SIZE,
    height: THUMBNAIL_SIZE,
    borderRadius: theme.radius.sm,
    backgroundColor: playerColor.surface,
  },
  rowMeta: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    fontSize: theme.font.size.md,
    fontWeight: '500',
    color: playerColor.textPrimary,
  },
  // 재생 중 — 굵기로 구분한다(색만으로 구분하지 않는다, uiux 7장)
  rowTitleCurrent: {
    fontWeight: '700',
  },
  rowDuration: {
    fontSize: theme.font.size.xs,
    color: playerColor.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  reorderHandle: {
    width: theme.touchTarget.minWidth,
    height: ROW_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
