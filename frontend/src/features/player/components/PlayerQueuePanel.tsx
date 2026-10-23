import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { useAnimatedValue } from '@/shared/hooks/useAnimatedValue';
import { useDelayedVisible } from '@/shared/hooks/useDelayedVisible';
import { motion, theme } from '@/shared/theme';
import RemoteImage from '@/shared/ui/RemoteImage';
import { SkeletonBlock, SkeletonGroup, SkeletonLine } from '@/shared/ui/Skeleton';
import { Text } from '@/shared/ui/Typography';

import { PLAYER_COPY } from '../player.copy';
import { formatPlaybackTime } from '../player.format';
import { playerColor } from '../player.theme';
import type { QueueEntry } from '../player.types';
import { PlusIcon, ReorderIcon, TrashIcon } from './PlayerIcons';

/** 목록의 정체(player.md 4.2-1, KAN-241) — 라이브러리(조회·끌기) / 탐색 스냅샷(담기·추천 블록) */
export type QueuePanelMode = 'library' | 'explore';

interface PlayerQueuePanelProps {
  items: QueueEntry[];
  isLoading: boolean;
  isError: boolean;
  /** 지금 재생 중인 콘텐츠 — 굵게 표시하고 낭독에도 "재생 중"을 붙인다(색만으로 구분하지 않는다) */
  currentContentId: string;
  onSelect: (item: QueueEntry) => void;
  onRetry: () => void;
  /**
   * 줄을 왼쪽으로 밀어 삭제했다(KAN-241 "3번") — 라이브러리 맥락은 서버 소프트 삭제 + 실행 취소 스낵바, 탐색 맥락은 스냅샷에서
   * 빼기. 둘 다 부모 몫이다. 지금 재생 중인 줄은 밀리지 않는다. 종전 "목록 위 오른쪽 스와이프 = 패널 닫힘"은 걷었다 —
   * 오른쪽 스와이프가 담기가 되면서 같은 제스처가 둘이 된다(닫기 = 손잡이 탭·시트 아래로 끌기)
   */
  onDelete?: (item: QueueEntry) => void;
  /** 손잡이를 끌어 `from` 줄을 `to` 줄로 옮겼다 — 순서의 저장은 부모(useQueueOrder) 몫이다. 라이브러리 맥락에만 */
  onReorder: (from: number, to: number) => void;
  /** 줄의 카테고리(주제 이름) — 이름 해석은 주제 목록을 가진 화면 몫이다. 없으면 길이만 보인다 */
  categoryOf?: (item: QueueEntry) => string | null;
  /** 시트 안에서는 손잡이 라벨이 제목 역할이라 패널 제목을 다시 그리지 않는다 */
  showHeader?: boolean;
  /** 기본 `library`. `explore` 면 순서 손잡이 대신 담기 버튼(라이브러리에 없는 줄만), 아래에 추천 블록 */
  mode?: QueuePanelMode;
  /** 탐색 맥락의 헤더 글자("주간 인기 콘텐츠") — 없으면 "재생 목록" */
  sourceLabel?: string;
  /** 라이브러리에 없는 줄의 담기(탐색 맥락) — 낙관 반영·토스트는 부모 몫 */
  onSave?: (item: QueueEntry) => void;
  /**
   * "다음에 들어볼 만한"(player.md 4.2-2) — 라이브러리·탐색 맥락 모두, 목록 **아래**에 붙는다. 비면 섹션을 그리지 않는다.
   * 끝이 없다(PM 2026-10-23 "유튜브 뮤직처럼 무한으로") — 바닥 가까이 내리면 `onEndReached` 로 다음 장을 부른다
   */
  upNext?: {
    items: QueueEntry[];
    isLoading: boolean;
    /** 다음 장을 받는 중 — 바닥에 줄 스켈레톤 */
    isFetchingMore?: boolean;
    onEndReached?: () => void;
  };
  onSelectUpNext?: (item: QueueEntry) => void;
  /**
   * 목록 바닥 여백(KAN-241 "4번") — 시트 틀이 2단 높이로 서 있어 1단에서는 아래가 화면 밖으로 밀려 있다. 그만큼 바닥 여백을 줘
   * 1단에서도 마지막 줄까지 스크롤된다. 2단에서는 0
   */
  bottomInset?: number;
  /**
   * 시트가 열려 있는가(기본 true). **닫혀 있는 동안 목록을 지금 재생 중인 줄로 맞춰 둔다**(PM 2026-10-23 "열었을 때 재생 중인 콘텐츠로
   * 포커싱돼야지 맨 앞을 띄우면 어떡해") — 탭으로 열든 끌어 올리든 처음부터 그 줄이 맨 위다. 열려 있는 동안은 보던 자리를 건드리지 않는다
   */
  isOpen?: boolean;
  /**
   * 시트 모션 중 그릴 줄 수 — 주면 **재생 중인 줄 바로 앞 줄부터** 이만큼만 그리고 나머지는 같은 높이의 빈 자리로 둔다(행 수십 개를 모션 중에
   * 마운트하면 프레임이 밀린다 — PlayerScreen isQueueSettled). 앞 몇 줄이 아니라 재생 중인 줄 주변이라, 맞춰 둔 스크롤 위치에서 비지 않는다
   */
  previewCount?: number;
}

/** 줄의 키 — 라이브러리 항목 id 가 없는(담기지 않은) 스냅샷 줄은 콘텐츠 id 로 */
const rowKey = (item: QueueEntry): string => item.itemId ?? `content-${item.contentId}`;

/*
 * 줄 스와이프(KAN-241 "3번" → 동그라미, PM 2026-10-23 "동그라미로 삭제·보관, 아이콘으로") — 애플 메일 문법. 가로 이동이 세로의
 * 1.5배를 넘고 몇 px 움직였을 때 잡는다(목록 스크롤과 가른다). 왼쪽으로 밀면 오른쪽 끝에 **삭제 동그라미**, 오른쪽으로 밀면
 * 왼쪽 끝에 **담기 동그라미**가 드러난다. 열린 자리의 절반 넘게 밀고 놓으면 열린 채 머물고(동그라미 탭 = 실행, 줄 탭 = 닫기),
 * **끝까지 밀고 놓으면 바로 실행**한다. 삭제는 줄이 왼쪽으로 빠져나간 뒤 부모가 걷고, 담기는 제자리로 돌아오며 실행된다
 */
const SWIPE_AXIS_RATIO = 1.5;
const SWIPE_CLAIM_DISTANCE = 8;
const SWIPE_CIRCLE_SIZE = 44;
const SWIPE_ICON_SIZE = 22;
/** 열린 자리 — 동그라미 + 좌우 여백 md */
const SWIPE_OPEN_DISTANCE = SWIPE_CIRCLE_SIZE + theme.spacing.md * 2;
const SWIPE_OPEN_THRESHOLD = SWIPE_OPEN_DISTANCE / 2;
/** 이만큼 넘게 밀고 놓으면 열지 않고 바로 실행(끝까지 밀기) */
const SWIPE_FULL_DISTANCE = 200;
const SWIPE_DISMISS_DISTANCE = 480;
const SWIPE_SETTLE_MS = 160;
/**
 * 삭제한 줄이 빠져나간 뒤 **줄 높이를 0 으로 접는다** — 아래 줄들이 한 번에 툭 올라오지 않고 같이 미끄러져 올라온다
 * (PM 2026-10-23 "삭제됐을 때 아래 재생목록이 올라오는 애니메이션이 더 자연스러워야"). 애플 메일처럼 빠져나가기 → 접기 순서,
 * 접기는 시작·끝이 부드러운 곡선으로
 */
const ROW_COLLAPSE_MS = 280;
const THUMBNAIL_SIZE = 48;
/** 행 높이는 고정이다 — 끌어 옮길 때 "몇 칸 움직였나"를 거리에서 바로 센다(썸네일 48 + 위아래 sm) */
const ROW_HEIGHT = THUMBNAIL_SIZE + theme.spacing.sm * 2;
const ROW_GAP = theme.spacing.xs;
const ROW_STEP = ROW_HEIGHT + ROW_GAP;
/** 놓은 뒤 새 순서를 기다리는 상한 — 보통은 다음 틱에 온다 */
const SETTLE_FALLBACK_MS = 600;
/** 닫힌 뒤 재생 중인 줄로 다시 맞추기까지 — 닫힘 스프링(약 0.45초)이 끝나 목록이 숨은 뒤에 옮긴다(움직이는 게 보이지 않게) */
const CLOSED_REFOCUS_DELAY_MS = 500;
/** 두 목록이 같은 줄을 같은 순서로 담았는지 */
const isSameOrder = (a: QueueEntry[], b: QueueEntry[]): boolean =>
  a === b || (a.length === b.length && a.every((item, index) => rowKey(item) === rowKey(b[index])));
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

/** 로딩 스켈레톤 행 수 — 패널을 연 첫 화면을 채울 만큼 */
const SKELETON_ROW_COUNT = 5;
/** 추천 블록 스켈레톤 — 목록 아래라 둘이면 "뭔가 온다"는 단서로 충분하다 */
const UP_NEXT_SKELETON_ROW_COUNT = 2;
/** 바닥에서 이 줄 수만큼 남으면 추천 다음 장을 부른다 — 닿기 전에 받아 두어 끊기지 않게 */
const UP_NEXT_PREFETCH_ROWS = 4;

/**
 * 대기열 로딩 스켈레톤 — 실제 행과 같은 높이·여백(썸네일 48 + 제목 줄 + 보조 줄). 손잡이 자리는 비워 둔다.
 * 면 색은 플레이어 토큰(`playerColor.skeleton`)이다 — 바탕이 어둡고 커버 색이 비친다.
 */
function QueueSkeleton() {
  return (
    <SkeletonGroup style={styles.rows} color={playerColor.skeleton}>
      {Array.from({ length: SKELETON_ROW_COUNT }, (_, index) => (
        <View key={index} style={styles.rowWrap}>
          <View style={styles.row}>
            <SkeletonBlock width={THUMBNAIL_SIZE} height={THUMBNAIL_SIZE} radius="sm" />
            <View style={styles.skeletonMeta}>
              <SkeletonLine width="72%" height={theme.font.size.md} />
              <SkeletonLine width="36%" height={theme.font.size.xs} />
            </View>
          </View>
        </View>
      ))}
    </SkeletonGroup>
  );
}

const toMinutes = (durationSec: number | null): number =>
  durationSec === null ? 0 : Math.max(1, Math.round(durationSec / 60));

interface QueueRowProps {
  item: QueueEntry;
  /** 제목 아래 보조 줄 앞에 붙는 카테고리 — "AI·테크 트렌드 · 5:00" */
  category: string | null;
  index: number;
  total: number;
  isCurrent: boolean;
  /**
   * 오른쪽 칸 — `reorder`(목록 줄: 끌기 손잡이 — 라이브러리·탐색 맥락 모두) / `none`(추천 줄: 자리만 비운다 — 줄 폭이 흔들리지
   * 않게). 종전 탐색 맥락의 담기 버튼(+)은 걷었다(PM 2026-10-23 "+ 버튼 없애고 =로") — 담기는 오른쪽 스와이프·낭독 액션이 맡는다
   */
  trailing: 'reorder' | 'none';
  /** 오른쪽 스와이프 담기 — 라이브러리에 없는 줄만 */
  canSave: boolean;
  onSave?: (item: QueueEntry) => void;
  /** 왼쪽 스와이프 삭제 — 지금 재생 중인 줄은 false. 낭독기 액션의 글자는 맥락(라이브러리에서 삭제 / 목록에서 빼기)을 따른다 */
  canDelete: boolean;
  deleteA11yLabel: string;
  onDelete?: (item: QueueEntry) => void;
  /** 이 행이 지금 끌려가는 중인가 */
  isDragging: boolean;
  /** 끌려가는 행에게 자리를 비켜 주는 이동량(px). 끄는 중이 아니면 0 */
  shift: number;
  /** 비켜 주기를 애니메이션할지 — 순서가 확정돼 레이아웃이 바뀌는 순간에는 즉시 0 으로 돌린다 */
  animateShift: boolean;
  /** 끌려가는 행의 손가락 이동량 */
  dragY: Animated.Value;
  /** 끌려가는 행이 떠 있는 정도(1 떠 있음 → 0 내려앉음) — 확대·면·그림자가 이 값으로 같이 내려앉는다 */
  dragLift: Animated.Value;
  onSelect: (item: QueueEntry) => void;
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
  trailing,
  canSave,
  onSave,
  canDelete,
  deleteA11yLabel,
  onDelete,
  isDragging,
  shift,
  animateShift,
  dragY,
  dragLift,
  onSelect,
  onDragStart,
  onDragMove,
  onDragEnd,
  onNudge,
}: QueueRowProps) {
  // 눌림 표시는 본문이 아니라 **줄 전체**(손잡이 포함)에 깐다 — 본문만 밝히면 줄이 알약과 아이콘으로 쪼개져 보인다
  const [isPressed, setIsPressed] = useState(false);
  const shiftY = useAnimatedValue(0);
  // 그리기 전에 맞춘다(useLayoutEffect) — 놓아서 순서가 바뀐 렌더에서 비켜 줬던 몫이 한 프레임 남으면 줄이 두 칸 튀어 깜박였다
  useLayoutEffect(() => {
    if (!animateShift) {
      shiftY.setValue(shift);
      return;
    }
    const animation = Animated.timing(shiftY, {
      toValue: shift,
      duration: ROW_SHIFT_MS,
      easing: motion.easing.easeOut,
      // JS 드라이버 — 같은 뷰의 translateY 가 끄는 동안엔 dragY(손가락마다 setValue 하는 JS 값)로 바뀐다.
      // 이 값을 네이티브로 돌리면 뷰가 네이티브 구동으로 넘어가 **JS 값의 변화가 화면에 반영되지 않는다** —
      // 실기기에서 줄이 들리기만 하고 손가락을 따라오지 않았다(2026-09-19 아이폰). 웹엔 네이티브 드라이버가 없어 안 잡혔다
      useNativeDriver: false,
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
        // Android — 네이티브 스크롤뷰가 이 터치를 가로채지 못하게 한다
        onShouldBlockNativeResponder: () => true,
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

  /*
   * ── 줄 스와이프(KAN-241 "3번") — 본문에서 시작한 가로 이동. 왼쪽(삭제)은 canDelete, 오른쪽(담기)은 canSave.
   * 손잡이(순서 변경)는 자기 영역에서 먼저 잡고, 세로 이동은 목록 스크롤에 둔다. 잡은 뒤에는 스크롤·시트 끌기에 내주지 않는다 ──
   */
  const swipeX = useAnimatedValue(0);
  /** 줄 높이 — 삭제 때만 접힌다(ROW_COLLAPSE_MS). 평소엔 ROW_HEIGHT 고정이라 끌어 옮기기의 칸 계산이 그대로다 */
  const rowHeight = useAnimatedValue(ROW_HEIGHT);
  const [isCollapsing, setIsCollapsing] = useState(false);
  /** 열려 머문 쪽 — -1 삭제(왼쪽으로 밀림) · 1 담기 · 0 닫힘. 제스처는 이 자리에서 이어 민다 */
  const openSideRef = useRef<-1 | 0 | 1>(0);
  const [isSwipeOpen, setIsSwipeOpen] = useState(false);
  const swipeLatest = useRef({ canDelete, canSave, onDelete, onSave, item });
  useEffect(() => {
    swipeLatest.current = { canDelete, canSave, onDelete, onSave, item };
  });
  const swipeActions = useMemo(() => {
    const animateTo = (toValue: number, done?: () => void) =>
      Animated.timing(swipeX, {
        toValue,
        duration: SWIPE_SETTLE_MS,
        easing: motion.easing.easeOut,
        // 가로 이동만 있는 값이지만 같은 뷰의 translateY 가 JS 값(dragY·shiftY)이라 드라이버를 맞춘다(위 shiftY 주석)
        useNativeDriver: false,
      }).start(done);
    const setOpenSide = (side: -1 | 0 | 1) => {
      openSideRef.current = side;
      setIsSwipeOpen(side !== 0);
    };
    const close = () => {
      setOpenSide(0);
      animateTo(0);
    };
    const open = (side: -1 | 1) => {
      setOpenSide(side);
      animateTo(side * SWIPE_OPEN_DISTANCE);
    };
    // 줄이 왼쪽으로 빠져나간 뒤 부모가 목록에서 걷는다 — 걷히면 이 줄은 마운트 해제된다
    const runDelete = () => {
      const { onDelete: remove, item: target } = swipeLatest.current;
      setOpenSide(0);
      animateTo(-SWIPE_DISMISS_DISTANCE, () => {
        // 빠져나간 자리를 접는다 — 다 접힌 뒤에 걷어야 걷히는 순간 아래 줄이 튀지 않는다
        setIsCollapsing(true);
        Animated.timing(rowHeight, {
          toValue: 0,
          duration: ROW_COLLAPSE_MS,
          easing: motion.easing.easeInOut,
          // 높이는 레이아웃 속성이라 네이티브 드라이버가 못 다룬다
          useNativeDriver: false,
        }).start(() => remove?.(target));
      });
    };
    const runSave = () => {
      const { onSave: save, item: target } = swipeLatest.current;
      close();
      save?.(target);
    };
    /** 열린 자리에서 이어 민 위치 — 막힌 쪽(삭제·담기 불가)으로는 0 에서 멈춘다 */
    const positionOf = (dx: number): number => {
      const { canDelete: deletable, canSave: savable } = swipeLatest.current;
      const x = openSideRef.current * SWIPE_OPEN_DISTANCE + dx;
      if (x < 0 && !deletable) return 0;
      if (x > 0 && !savable) return 0;
      return x;
    };
    return { close, open, runDelete, runSave, positionOf };
  }, [swipeX, rowHeight]);
  const swipeResponder = useMemo(
    () =>
      // eslint-disable-next-line react-hooks/refs -- 콜백은 렌더가 아니라 제스처 시점에 실행된다(표준 PanResponder 패턴)
      PanResponder.create({
        // capture 로 잡는다 — 본문이 Pressable 이라 손을 대는 순간 Pressable 이 응답자가 되고, bubble 질의
        // (onMoveShouldSetPanResponder)는 아예 불리지 않는다. 그래서 줄 스와이프가 한 번도 안 잡혔다(PM 2026-10-23).
        // 손잡이(순서 변경)는 잡은 뒤 내주지 않아(terminationRequest false) 세로 끌기를 뺏기지 않는다
        onMoveShouldSetPanResponderCapture: (_, gesture) => {
          const { canDelete: deletable, canSave: savable } = swipeLatest.current;
          if (Math.abs(gesture.dx) < SWIPE_CLAIM_DISTANCE) return false;
          if (Math.abs(gesture.dx) < Math.abs(gesture.dy) * SWIPE_AXIS_RATIO) return false;
          // 열려 있으면 어느 쪽이든 잡는다 — 닫는 끌기도 같은 제스처다
          if (openSideRef.current !== 0) return true;
          return gesture.dx < 0 ? deletable : savable;
        },
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,
        onPanResponderMove: (_, gesture) => swipeX.setValue(swipeActions.positionOf(gesture.dx)),
        onPanResponderRelease: (_, gesture) => {
          const x = swipeActions.positionOf(gesture.dx);
          if (x <= -SWIPE_FULL_DISTANCE) swipeActions.runDelete();
          else if (x >= SWIPE_FULL_DISTANCE) swipeActions.runSave();
          else if (x <= -SWIPE_OPEN_THRESHOLD) swipeActions.open(-1);
          else if (x >= SWIPE_OPEN_THRESHOLD) swipeActions.open(1);
          else swipeActions.close();
        },
        onPanResponderTerminate: () => swipeActions.close(),
      }),
    [swipeX, swipeActions],
  );
  // 동그라미는 열린 자리까지 밀리는 동안 커지며 나타난다
  const saveCircleProgress = swipeX.interpolate({
    inputRange: [0, SWIPE_OPEN_DISTANCE],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  const deleteCircleProgress = swipeX.interpolate({
    inputRange: [-SWIPE_OPEN_DISTANCE, 0],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });
  const saveCircleScale = saveCircleProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.6, 1],
  });
  const deleteCircleScale = deleteCircleProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.6, 1],
  });
  // 낭독기 — 스와이프 대신 줄의 액션으로 같은 일을 한다
  const rowActions = [
    ...(canDelete ? [{ name: 'delete', label: deleteA11yLabel }] : []),
    ...(canSave ? [{ name: 'save', label: PLAYER_COPY.queuePanel.saveA11y }] : []),
  ];

  return (
    <Animated.View
      style={[
        styles.rowWrap,
        isPressed && styles.rowWrapPressed,
        isDragging && styles.rowWrapDragging,
        isDragging && {
          // 그림자도 떠 있는 만큼 — 놓을 때 한 번에 꺼지면 줄이 번쩍인다(PM 2026-10-23 "놓으면 깜박인다")
          shadowOpacity: dragLift.interpolate({ inputRange: [0, 1], outputRange: [0, 0.35] }),
          elevation: dragLift.interpolate({ inputRange: [0, 1], outputRange: [0, 6] }),
        },
        // 접는 동안만 잘라 낸다 — 평소에 자르면 끄는 줄의 그림자까지 잘린다
        isCollapsing && styles.rowWrapCollapsing,
        {
          height: rowHeight,
          transform: [
            // 비켜 주기를 애니메이션하지 않을 때는 **숫자 그대로** 준다 — 애니메이션 값을 effect 에서 맞추면 새 순서가 그려진
            // 프레임과 어긋나 한 프레임 동안 줄이 한 칸 더 밀려 보였다. 숫자면 순서와 같은 렌더에 들어간다
            { translateY: isDragging ? dragY : animateShift ? shiftY : shift },
            // 끄는 줄은 살짝 커져 떠 있는 것으로 읽힌다 — 놓으면 내려앉으며 제 크기로
            {
              scale: isDragging
                ? dragLift.interpolate({ inputRange: [0, 1], outputRange: [1, DRAG_SCALE] })
                : 1,
            },
          ],
        },
      ]}
    >
      {/* 끄는 줄의 면 — 불투명(아래 rowWrapDragging 주석). 떠 있는 만큼 보이고 내려앉으며 걷힌다 */}
      {isDragging ? (
        <Animated.View style={[styles.dragSurface, { opacity: dragLift }]} pointerEvents="none" />
      ) : null}
      {/* 재생 중인 줄의 띠 — 화면 폭 전체(유튜브 뮤직, PM 2026-10-23). 줄 사이 틈의 절반씩 위아래로 넓혀 띠가 줄에 꼭 맞지 않고
        여유 있게 감싼다. 굵기·낭독 꼬리표는 그대로 둔다(색만으로 구분하지 않는다) */}
      {isCurrent ? <View style={styles.rowCurrentBand} pointerEvents="none" /> : null}
      {/* 스와이프로 드러나는 동그라미 — 왼쪽 끝은 담기(오른쪽으로 밀 때), 오른쪽 끝은 삭제(왼쪽으로 밀 때). 줄 뒤에 깔리고, 줄이
        밀려나 드러난 자리에서만 탭이 닿는다. 낭독기는 줄의 액션으로 같은 일을 한다(동그라미는 낭독 대상에서 뺀다) */}
      {canSave || canDelete ? (
        <View style={styles.swipeFaces} pointerEvents={isSwipeOpen ? 'box-none' : 'none'}>
          {canSave ? (
            <Animated.View
              style={[
                styles.swipeCircleSlot,
                styles.swipeCircleSlotSave,
                { opacity: saveCircleProgress, transform: [{ scale: saveCircleScale }] },
              ]}
            >
              <Pressable
                style={[styles.swipeCircle, styles.swipeCircleSave]}
                onPress={swipeActions.runSave}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              >
                <PlusIcon size={SWIPE_ICON_SIZE} color={playerColor.onPrimary} />
              </Pressable>
            </Animated.View>
          ) : null}
          {canDelete ? (
            <Animated.View
              style={[
                styles.swipeCircleSlot,
                styles.swipeCircleSlotDelete,
                { opacity: deleteCircleProgress, transform: [{ scale: deleteCircleScale }] },
              ]}
            >
              <Pressable
                style={[styles.swipeCircle, styles.swipeCircleDelete]}
                onPress={swipeActions.runDelete}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              >
                <TrashIcon size={SWIPE_ICON_SIZE} color="#FFFFFF" />
              </Pressable>
            </Animated.View>
          ) : null}
        </View>
      ) : null}
      <Animated.View
        style={[styles.rowSwipe, { transform: [{ translateX: swipeX }] }]}
        {...swipeResponder.panHandlers}
      >
        <Pressable
          style={styles.row}
          // 열려 있으면 줄 탭은 재생이 아니라 닫기다(애플 메일과 같다)
          onPress={() => (isSwipeOpen ? swipeActions.close() : onSelect(item))}
          onPressIn={() => setIsPressed(true)}
          onPressOut={() => setIsPressed(false)}
          accessibilityRole="button"
          accessibilityLabel={PLAYER_COPY.queuePanel.itemA11y(
            item.title,
            toMinutes(item.durationSec),
            tags,
          )}
          accessibilityState={{ selected: isCurrent }}
          accessibilityActions={rowActions.length > 0 ? rowActions : undefined}
          onAccessibilityAction={(event) => {
            if (event.nativeEvent.actionName === 'delete' && canDelete) onDelete?.(item);
            if (event.nativeEvent.actionName === 'save' && canSave) onSave?.(item);
          }}
        >
          {item.thumbnailUrl ? (
            <RemoteImage
              uri={item.thumbnailUrl}
              recyclingKey={item.contentId}
              style={styles.thumbnail}
            />
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
        {trailing === 'reorder' ? (
          // 손잡이 — 히트 영역 44pt. 끌기의 낭독기 대체 수단은 위/아래 이동 액션이다(uiux 7장)
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
        ) : (
          <View style={styles.reorderHandle} />
        )}
      </Animated.View>
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
  onDelete,
  onReorder,
  categoryOf,
  showHeader = true,
  mode = 'library',
  sourceLabel,
  onSave,
  upNext,
  onSelectUpNext,
  bottomInset = 0,
  isOpen = true,
  previewCount,
}: PlayerQueuePanelProps) {
  const isExplore = mode === 'explore';
  // 담기 스와이프는 탐색 맥락의 라이브러리에 없는 줄만(라이브러리 맥락은 전부 담긴 편)
  const canSaveOf = (item: QueueEntry) => isExplore && item.itemId === null;
  // 삭제 낭독 글자 — 라이브러리 맥락은 서버 삭제, 탐색 맥락은 목록에서 빼기(KAN-241 "3번")
  const deleteA11yLabel = isExplore
    ? PLAYER_COPY.queuePanel.removeFromListA11y
    : PLAYER_COPY.queuePanel.deleteFromLibraryA11y;
  // 0.3초 안에 오면 빈 패널만 잠깐 보인다 — 스켈레톤이 번쩍이지 않게(common-error-handling.md 5)
  const showSkeleton = useDelayedVisible(isLoading);
  const listContentStyle = [styles.listContent, { paddingBottom: theme.spacing.md + bottomInset }];

  /*
   * ── 끌어서 순서 바꾸기 ──
   * 끄는 행은 손가락을 그대로 따라가고(dragY), 지나친 행들은 한 칸씩 비켜 준다(shift). 놓으면 끄는 행을
   * 목표 칸에 앉힌 뒤 순서를 확정한다 — 확정 순간 레이아웃이 바뀌므로 이동량을 애니메이션 없이 0 으로 돌린다
   */
  const dragY = useAnimatedValue(0);
  const dragLift = useAnimatedValue(0);
  const [drag, setDrag] = useState<{ from: number; hover: number } | null>(null);
  const dragRef = useRef<{ from: number; hover: number } | null>(null);
  /*
   * 놓은 뒤 새 순서가 들어올 때까지 끌던 모습(끄는 줄은 목표 칸, 나머지는 비켜 선 채)을 붙잡아 둔다(PM 2026-10-23 "위에다 놓으면
   * 깜박인다"). 라이브러리 맥락의 순서는 쿼리 캐시라 갱신이 **다음 틱**에 온다 — 그 사이 끌기 표시를 먼저 지우면 한 프레임 동안
   * 옛 순서 그대로 그려져 줄이 제자리로 튀었다가 새 자리로 갔다. `items` 가 바뀐 그 렌더에서 함께 놓는다
   */
  const [settle, setSettle] = useState<{
    from: number;
    hover: number;
    items: QueueEntry[];
  } | null>(null);
  // 같은 배열인지가 아니라 **같은 순서인지**로 본다 — 재생 위치 갱신 등으로 부모가 새 배열을 만들어도 순서는 그대로일 수 있다
  const isAwaitingOrder = settle !== null && isSameOrder(settle.items, items);
  const shownDrag = drag ?? (isAwaitingOrder ? settle : null);
  const countRef = useRef(items.length);
  const itemsRef = useRef(items);
  const onReorderRef = useRef(onReorder);
  const currentIdRef = useRef(currentContentId);
  const isOpenRef = useRef(isOpen);
  useEffect(() => {
    countRef.current = items.length;
    itemsRef.current = items;
    onReorderRef.current = onReorder;
    currentIdRef.current = currentContentId;
    isOpenRef.current = isOpen;
  });
  const currentIndex = items.findIndex((item) => item.contentId === currentContentId);
  // 모션 중 그릴 창 — 재생 중인 줄 바로 앞 줄부터(반쯤 보이는 줄)(끝 근처면 끝에서 previewCount 만큼). 창 밖은 같은 높이의 빈 자리
  const windowStart =
    previewCount === undefined
      ? 0
      : Math.max(0, Math.min(Math.max(currentIndex - 1, 0), items.length - previewCount));
  const windowEnd = previewCount === undefined ? items.length : windowStart + previewCount;
  /*
   * 붙잡은 기록은 잠시 뒤 지운다 — 새 순서가 그려지는 렌더에서는 위 shownDrag 가 이미 null 이라 화면엔 영향이 없고, 순서가 끝내 안
   * 바뀌어 오면(저장 실패로 되돌림 등) 이때 붙잡은 모습이 풀린다. 그새 다음 끌기가 시작됐으면 그 끌기의 dragY 는 건드리지 않는다
   */
  useEffect(() => {
    if (settle === null) return;
    const timer = setTimeout(() => {
      if (dragRef.current === null) dragY.setValue(0);
      setSettle(null);
    }, SETTLE_FALLBACK_MS);
    return () => clearTimeout(timer);
  }, [settle, dragY]);
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
    rowsTop: -1, // 첫 행의 콘텐츠 기준 y(패딩·제목 아래). 실측 전 -1
    lastDy: 0, // 마지막 손가락 이동량
    frame: 0 as number | 0, // 자동 스크롤 루프(requestAnimationFrame id)
  });

  /*
   * 재생 중인 줄을 뷰포트 맨 위로 — 줄 위치는 실측(rowsTop) + 칸 수라, 실측 전이면 false(나중에 다시). 목록 끝 근처면 끝까지만 내린다
   */
  const pendingFocusRef = useRef(true);
  const focusCurrent = (): boolean => {
    const state = scrollState.current;
    if (state.rowsTop < 0) return false;
    const index = itemsRef.current.findIndex((item) => item.contentId === currentIdRef.current);
    if (index < 0) return itemsRef.current.length > 0;
    const maxScroll =
      state.content > 0 && state.viewport > 0 ? Math.max(0, state.content - state.viewport) : null;
    // 바로 앞 줄을 반쯤 보이게 덜 내린다(PM 2026-10-23) — 맨 위가 딱 재생 중인 줄이면 앞 편들이 없어진 것처럼 보였다.
    // 첫 줄이면 위 여백(sm)만 — 종전처럼 목록 맨 위다
    const peek = index > 0 ? ROW_STEP / 2 : theme.spacing.sm;
    const target = Math.max(0, state.rowsTop + index * ROW_STEP - peek);
    const y = maxScroll === null ? target : Math.min(target, maxScroll);
    scrollRef.current?.scrollTo({ y, animated: false });
    state.offset = y;
    return true;
  };
  const focusCurrentRef = useRef(focusCurrent);
  useEffect(() => {
    focusCurrentRef.current = focusCurrent;
  });
  useEffect(() => {
    if (isOpen) {
      // 처음 열자마자 마운트된 경우(닫힌 채로는 아직 목록이 없었다) — 실측되면 한 번 맞춘다(아래 rows onLayout)
      if (pendingFocusRef.current && focusCurrentRef.current()) pendingFocusRef.current = false;
      return;
    }
    // 닫힘 — 다 내려가 목록이 숨은 뒤 재생 중인 줄로 맞춰 둔다. 닫힌 채 다음 편으로 넘어가도 다시 맞춘다
    pendingFocusRef.current = true;
    const timer = setTimeout(() => {
      if (focusCurrentRef.current()) pendingFocusRef.current = false;
    }, CLOSED_REFOCUS_DELAY_MS);
    return () => clearTimeout(timer);
  }, [isOpen, currentContentId]);

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
        dragLift.setValue(1);
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
        // 목표 칸으로 가면서 같이 내려앉는다(확대·면·그림자) — 다 앉은 뒤 순서를 확정하므로 확정 순간엔 보이는 변화가 없다
        Animated.parallel([
          Animated.timing(dragY, {
            toValue: (current.hover - current.from) * ROW_STEP,
            duration: ROW_SETTLE_MS,
            easing: motion.easing.easeOut,
            // 위 shiftY 와 같은 이유 — dragY 는 끄는 내내 JS 에서 직접 움직이는 값이다
            useNativeDriver: false,
          }),
          Animated.timing(dragLift, {
            toValue: 0,
            duration: ROW_SETTLE_MS,
            easing: motion.easing.easeOut,
            useNativeDriver: false,
          }),
        ]).start(() => {
          if (current.hover !== current.from) {
            // 끌던 모습을 붙잡은 채 순서를 넘긴다 — 새 순서가 그려질 때 함께 놓는다(위 settle)
            setSettle({ ...current, items: itemsRef.current });
            onReorderRef.current(current.from, current.hover);
            setDrag(null);
            return;
          }
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
    [dragY, dragLift],
  );

  const shiftOf = (index: number): number => {
    if (!shownDrag || index === shownDrag.from) return 0;
    const { from, hover } = shownDrag;
    if (from < hover && index > from && index <= hover) return -ROW_STEP;
    if (hover < from && index >= hover && index < from) return ROW_STEP;
    return 0;
  };

  const header = showHeader ? (
    <Text style={styles.title} accessibilityRole="header" numberOfLines={1}>
      {sourceLabel ?? PLAYER_COPY.queuePanel.title}
    </Text>
  ) : null;

  const upNextSkeleton = (
    <SkeletonGroup style={styles.rows} color={playerColor.skeleton}>
      {Array.from({ length: UP_NEXT_SKELETON_ROW_COUNT }, (_, index) => (
        <View key={index} style={styles.rowWrap}>
          <View style={styles.row}>
            <SkeletonBlock width={THUMBNAIL_SIZE} height={THUMBNAIL_SIZE} radius="sm" />
            <View style={styles.skeletonMeta}>
              <SkeletonLine width="72%" height={theme.font.size.md} />
              <SkeletonLine width="36%" height={theme.font.size.xs} />
            </View>
          </View>
        </View>
      ))}
    </SkeletonGroup>
  );
  /*
   * "다음에 들어볼 만한"(player.md 4.2-2) — 목록 아래 두 번째 섹션(라이브러리·탐색 맥락 모두 — PM 2026-10-23 "항상 켜 두자").
   * 로딩은 줄 스켈레톤 둘, 0건·실패는 섹션 자체를 그리지 않는다(목록은 멀쩡하다 — 패널 안 오류 표시 없음). 다음 장을 받는 동안은
   * 바닥에 스켈레톤 둘. 자동 재생은 없다 — 줄 탭이 재생 시작(게이트)이다
   */
  const upNextSection =
    upNext && (upNext.isLoading || upNext.items.length > 0) ? (
      <View style={styles.upNext}>
        <Text style={styles.upNextTitle} accessibilityRole="header">
          {PLAYER_COPY.queuePanel.upNextTitle}
        </Text>
        {upNext.isLoading && upNext.items.length === 0 ? (
          upNextSkeleton
        ) : (
          <View style={styles.rows}>
            {upNext.items.map((item, index) => (
              <QueueRow
                key={`up-next-${rowKey(item)}`}
                item={item}
                category={categoryOf ? categoryOf(item) : null}
                index={index}
                total={upNext.items.length}
                isCurrent={false}
                // 추천 줄은 목록이 아니라 손잡이가 없다 — 자리만 비운다
                trailing="none"
                canSave={item.itemId === null}
                onSave={onSave}
                // 추천 줄은 목록이 아니라 지우지 않는다 — 오른쬭(담기)만
                canDelete={false}
                deleteA11yLabel={deleteA11yLabel}
                isDragging={false}
                shift={0}
                animateShift={false}
                dragY={dragY}
                dragLift={dragLift}
                onSelect={(selected) => onSelectUpNext?.(selected)}
                onDragStart={() => undefined}
                onDragMove={() => undefined}
                onDragEnd={() => undefined}
                onNudge={() => undefined}
              />
            ))}
          </View>
        )}
        {upNext.isFetchingMore && upNext.items.length > 0 ? upNextSkeleton : null}
      </View>
    ) : null;
  // 바닥 가까이 왔으면 추천 다음 장 — 스크롤·내용 크기·화면 크기가 바뀔 때마다 본다(목록이 짧아 스크롤이 없어도 부른다)
  const onUpNextEnd = upNext?.onEndReached;
  const upNextCount = upNext?.items.length ?? 0;
  const checkUpNextEnd = useCallback(() => {
    if (!onUpNextEnd) return;
    const { offset, viewport, content } = scrollState.current;
    if (viewport <= 0 || content <= 0) return;
    if (offset + viewport >= content - UP_NEXT_PREFETCH_ROWS * ROW_STEP) onUpNextEnd();
  }, [onUpNextEnd]);
  // 시트가 열린 순간(부를 수 있게 된 순간)·장이 붙은 뒤에도 한 번 본다 — 스크롤 없이 바닥이 보이는 짧은 목록
  useEffect(() => {
    checkUpNextEnd();
  }, [checkUpNextEnd, upNextCount]);

  if (isError) {
    return (
      <View style={styles.panel}>
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
      <View style={styles.panel}>
        {header}
        {showSkeleton ? (
          <View style={listContentStyle}>
            <QueueSkeleton />
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.panel}>
      <ScrollView
        ref={scrollRef}
        // 끝에서 고무줄처럼 늘어나지 않는다(PM 2026-10-23 "올라가는 게 왜 끝도 없이 돼? 빈 공간이 나오고") — 시트 안 목록이라
        // 맨 위에서 끌어내리면 목록 위로 빈 바탕이 한없이 드러났다. 시트 단계 이동은 손잡이가 맡는다
        bounces={false}
        overScrollMode="never"
        style={styles.list}
        contentContainerStyle={listContentStyle}
        showsVerticalScrollIndicator={false}
        // 끄는 동안 목록이 같이 스크롤되면 손가락과 행이 어긋난다 — 가장자리 자동 스크롤만 직접 옮긴다
        scrollEnabled={drag === null}
        scrollEventThrottle={16}
        onScroll={(event) => {
          // 끄는 중에는 자동 스크롤이 직접 적는 값이 기준이다(이벤트는 한 박자 늦다)
          if (dragRef.current === null) {
            scrollState.current.offset = event.nativeEvent.contentOffset.y;
            checkUpNextEnd();
          }
        }}
        onLayout={(event) => {
          scrollState.current.viewport = event.nativeEvent.layout.height;
          checkUpNextEnd();
        }}
        onContentSizeChange={(_, height) => {
          scrollState.current.content = height;
          checkUpNextEnd();
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
              // 열면서 처음 마운트됐다 — 실측이 끝난 지금 재생 중인 줄로(닫힌 채 맞추기는 위 타이머 몫)
              if (isOpenRef.current && pendingFocusRef.current && focusCurrentRef.current()) {
                pendingFocusRef.current = false;
              }
            }}
          >
            {windowStart > 0 ? <View style={{ height: windowStart * ROW_STEP - ROW_GAP }} /> : null}
            {items.slice(windowStart, windowEnd).map((item, offset) => {
              const index = windowStart + offset;
              return (
                <QueueRow
                  key={rowKey(item)}
                  item={item}
                  category={categoryOf ? categoryOf(item) : null}
                  index={index}
                  total={items.length}
                  isCurrent={item.contentId === currentContentId}
                  trailing="reorder"
                  canSave={canSaveOf(item)}
                  onSave={onSave}
                  // 지금 듣는 줄은 밀리지 않는다(재생 중인 것을 목록에서 지우는 조작은 없다). 라이브러리 항목이 없는 줄은
                  // 라이브러리 맥락에서 올 일이 없다(전부 담긴 편) — 탐색 맥락은 스냅샷 빼기라 itemId 와 무관
                  canDelete={
                    item.contentId !== currentContentId && (isExplore || item.itemId !== null)
                  }
                  deleteA11yLabel={deleteA11yLabel}
                  onDelete={onDelete}
                  isDragging={shownDrag !== null && shownDrag.from === index}
                  shift={shiftOf(index)}
                  animateShift={drag !== null}
                  dragY={dragY}
                  dragLift={dragLift}
                  onSelect={onSelect}
                  onDragStart={handlers.start}
                  onDragMove={handlers.move}
                  onDragEnd={handlers.end}
                  onNudge={handlers.nudge}
                />
              );
            })}
            {windowEnd < items.length ? (
              <View style={{ height: (items.length - windowEnd) * ROW_STEP - ROW_GAP }} />
            ) : null}
          </View>
        )}
        {upNextSection}
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
  // 누르는 동안만 — 불투명 면이 아니라 옅은 흰색이라 바탕의 커버 색이 비친다. 재생 중 줄은 아래 띠(rowCurrentBand)
  rowWrapPressed: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  rowWrapCollapsing: {
    overflow: 'hidden',
  },
  // 끄는 행은 다른 행 위로 뜬다 — 밝은 면 + 그림자. 면은 **불투명**이다: 빠르게 지나갈 때 비켜 주는 행이
  // 한 박자 늦어 잠깐 겹치는데, 반투명이면 밑의 글자가 비쳐 두 제목이 섞여 보인다
  // 면·그림자 세기·배율은 dragLift 로 움직인다(놓을 때 내려앉게) — 여기는 고정값만
  rowWrapDragging: {
    zIndex: 1,
    shadowColor: '#000000',
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  dragSurface: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: DRAG_SURFACE_COLOR,
  },
  // 재생 중 줄의 띠 — 반투명 흰색(fill 10%)이라 1단(흐린 커버)·2단(시트 면) 어느 바탕에서도 한 단 밝게 읽힌다
  rowCurrentBand: {
    position: 'absolute',
    top: -ROW_GAP / 2,
    bottom: -ROW_GAP / 2,
    left: 0,
    right: 0,
    backgroundColor: playerColor.fill,
  },
  row: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    height: ROW_HEIGHT,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.radius.md,
    borderCurve: 'continuous',
  },
  thumbnail: {
    width: THUMBNAIL_SIZE,
    height: THUMBNAIL_SIZE,
    borderRadius: theme.radius.sm,
    borderCurve: 'continuous',
    backgroundColor: playerColor.surface,
  },
  rowMeta: {
    flex: 1,
    gap: 2,
  },
  // 글자 줄의 줄 높이만큼 — 막대는 글자 크기라 실제 두 줄(제목·보조)과 높이를 맞추려면 간격이 더 필요하다
  skeletonMeta: {
    flex: 1,
    gap: theme.spacing.sm,
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
  // 스와이프로 미는 본문 — 행 전체(본문 + 오른쪽 칸)가 함께 움직이고, 면은 그 뒤 rowWrap 에 깔린다
  rowSwipe: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    height: ROW_HEIGHT,
  },
  // 드러나는 동그라미의 자리 — 줄 높이 전체, 화면 끝에서 여백 md 안쪽
  swipeFaces: {
    ...StyleSheet.absoluteFill,
  },
  swipeCircleSlot: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: SWIPE_CIRCLE_SIZE,
    justifyContent: 'center',
  },
  swipeCircleSlotSave: {
    left: theme.spacing.md,
  },
  swipeCircleSlotDelete: {
    right: theme.spacing.md,
  },
  swipeCircle: {
    width: SWIPE_CIRCLE_SIZE,
    height: SWIPE_CIRCLE_SIZE,
    borderRadius: SWIPE_CIRCLE_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // 담기는 흰 동그라미·검은 더하기(주 동작), 삭제는 위험색·흰 휴지통
  swipeCircleSave: {
    backgroundColor: playerColor.primary,
  },
  swipeCircleDelete: {
    backgroundColor: playerColor.danger,
  },
  // 추천 블록(KAN-241) — 목록과 여백 lg 로 가른다. 제목은 패널 제목과 같은 꼴
  upNext: {
    paddingTop: theme.spacing.lg,
  },
  upNextTitle: {
    fontSize: theme.font.size.xs,
    fontWeight: '600',
    color: playerColor.textSecondary,
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.xs,
  },
});
