import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, PanResponder, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { useAnimatedValue } from '@/shared/hooks/useAnimatedValue';
import { motion, theme, useThemePalette } from '@/shared/theme';
import ChevronIcon from '@/shared/ui/ChevronIcon';
import { pillButton } from '@/shared/ui/pill-button.styles';
import { SkeletonBlock, SkeletonGroup } from '@/shared/ui/Skeleton';
import { Text } from '@/shared/ui/Typography';

import type { WeeklyNavigation } from '../hooks/useWeeklyNavigation';
import { PROFILE_COPY } from '../profile.copy';
import {
  isWeekAllZero,
  toBarRatios,
  toDailyAverageSec,
  toListenedDayParts,
} from '../profile.format';
import type { WeeklyListening } from '../profile.types';

interface WeeklyChartProps {
  weekly: WeeklyNavigation;
  /** 카드 맨 아래 구획 — 주제 분포(PM 2026-09-28 00:47 합침). 주 전환·로딩·빈 주와 무관하게 늘 그린다 */
  footer?: ReactNode;
  /**
   * 그래프를 가로로 끄는 동안 true — 화면이 세로 스크롤을 잠근다(PM 2026-10-09 "그래프 스와이프할 때 화면 스크롤은 작동 안
   * 하게"). 잡은 뒤 손이 세로로 흘러도 화면이 같이 움직이지 않는다
   */
  onSwipingChange?: (isSwiping: boolean) => void;
}
const CHART_HEIGHT = 144;
const ZERO_BAR_HEIGHT = 3;
/** 요일 막대 위 모서리 반지름 — radius 토큰(sm 8)보다 작은 값이 필요해 따로 둔다 */
const BAR_RADIUS = 4;
const DAYS_IN_WEEK = 7;
/** 요일 원(선택 시 검은 원) 지름 */
const DAY_BADGE_SIZE = theme.spacing.xl;
/**
 * 서비스 날짜 경계 05시 — 표시용 오늘 요일을 서버와 같은 날로 맞춘다(toWeekView). 2026-10-12 05:00 에 04시 → 05시로
 * 바뀐다(KAN-149·150). 이 번들은 1.2.0 빌드부터 닿아 그 전환 뒤에 쓰인다 — 판정이 아니라 오늘 강조·평균의 표시용이다
 */
const SERVICE_DAY_OFFSET_MS = 5 * 60 * 60 * 1000;
/**
 * 막대 위 말풍선 자리의 **최소** 높이 — 실제 높이는 실측값이 이긴다(`annotationHeight`). 말풍선은 14pt 글자 +
 * 위아래 8 여백이라 34 안팎이므로 44 는 10 넘게 과하게 비웠고, 아무 막대도 고르지 않은 기본 상태에서는 그 자리가
 * 그냥 빈 공간으로 보였다(PM 2026-09-28 01:28 "하루 청취 시간 아래 공백이 많다"). 실측이 더 크면(200% 글꼴) 그 값을 쓴다
 */
/** 맨 위 막대와 카드 위쪽 사이 — 말풍선 자리 대신 남기는 여백 */
const BAR_TOP_INSET = 8;
const GRID_RATIOS = [0, 0.5, 1] as const;
/**
 * 오른쪽 축(PM 2026-09-28 02:36 — 애플 건강) — 격자 오른쪽 끝에 **위 = 이 주의 최대값, 평균 점선 옆 = "평균", 아래 = 0**.
 * 넘김 구획 오른쪽 고정 칸의 폭 — 11pt "평균" · "180분" + 왼쪽 xs + 카드 오른쪽 여백 md
 */
// 64 → 48(PM 2026-09-28 03:59 "도표 오른쪽 공백이 많다") — 최대값을 분 단위("72분")로 줄여 "평균"과 폭을 맞췄다
const AXIS_WIDTH = 48;
/** 축 글자 줄 높이 — 선에 세로 가운데를 맞추고, 평균 라벨과 이만큼 가까운 최대·0 라벨은 숨긴다(겹침) */
const AXIS_LABEL_HEIGHT = 14;
/**
 * 격자선 — 1pt 회색. hairline(0.33pt)은 systemSeparator 색이어도 회색 카드 위에서 안 보였다(PM 2026-09-28 03:11 "격자 안 보인다").
 * 세로선(요일 경계)은 한 단 옅게 — 가로선(값 눈금)이 주인공이다
 */
const GRID_COLOR = theme.color.separator;
const GRID_COLUMN_COLOR = theme.color.separatorFaint;
/** 주 이동 화살표 원 — 보이는 크기만 줄이고 터치는 hitSlop 으로 44 를 지킨다(PM 2026-09-28 00:32 "버튼 크기 줄이자") */
const ARROW_SIZE = 28;
const ARROW_HIT_SLOP = (theme.touchTarget.minHeight - ARROW_SIZE) / 2;
/** 가로 스와이프로 주 넘기기 — 이만큼 가로로 움직여야 잡고(세로 스크롤 우선), 이만큼 밀거나 이 속도면 넘긴다 */
const SWIPE_CLAIM_DISTANCE = 12;
const SWIPE_COMMIT_DISTANCE = 48;
const SWIPE_COMMIT_VELOCITY = 0.3;
/** 더 갈 주가 없는 쪽으로 끌 때 손가락 대비 따라오는 비율 — 고무줄 */
const SWIPE_RUBBER = 0.25;

function ArrowButton({
  direction,
  enabled,
  onPress,
}: {
  direction: 'left' | 'right';
  enabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.arrow, pressed && enabled && styles.pressed]}
      onPress={onPress}
      disabled={!enabled}
      hitSlop={ARROW_HIT_SLOP}
      accessibilityRole="button"
      accessibilityLabel={
        direction === 'left' ? PROFILE_COPY.stats.prevWeekA11y : PROFILE_COPY.stats.nextWeekA11y
      }
      accessibilityState={{ disabled: !enabled }}
    >
      <ChevronIcon
        direction={direction}
        size={12}
        color={enabled ? theme.color.textPrimary : theme.color.border}
      />
    </Pressable>
  );
}

/** 한 주의 차트 몸통에 필요한 파생값 — 가운데 주와 이웃 주(끌 때 옆에 보이는 주)가 같은 계산을 쓴다 */
const toWeekView = (week: WeeklyListening) => {
  /*
   * 오늘 요일 — 표시(오늘 강조 · 평균의 지난 날 수)에만 쓴다. 주 경계·이동은 서버 토큰으로 판정한다.
   * **서비스 날짜는 05시에 넘어간다**(features/paywall.md) — 기기 자정 기준이면 0~5시에 오늘이 하루 앞서, 서버는 아직 지난주를
   * 주는데 월요일로 읽어 평균을 1일로 나눴다(PM 2026-09-28 03:43 스샷: 주 합계가 그대로 하루 평균 · 평균선이 막대 위).
   * 그래서 기기 시각에서 5시간을 빼 요일을 잡고, 기록이 있는 마지막 요일까지는 반드시 지난 날로 센다(데이터 하한)
   */
  const serviceNow = new Date(Date.now() - SERVICE_DAY_OFFSET_MS);
  const todayIndex = week.nextWeekStart === null ? (serviceNow.getDay() + 6) % 7 : null;
  const lastListenedIndex = week.dailyListenedSec.reduce(
    (last, sec, index) => (sec > 0 ? index : last),
    -1,
  );
  const elapsedDayCount =
    todayIndex === null ? DAYS_IN_WEEK : Math.max(todayIndex, lastListenedIndex) + 1;
  const averageSec = toDailyAverageSec(week.dailyListenedSec, elapsedDayCount);
  const maxSec = Math.max(...week.dailyListenedSec, 0);
  const averageRatio = maxSec === 0 ? 0 : Math.min(1, averageSec / maxSec);
  return {
    todayIndex,
    averageSec,
    maxSec,
    /**
     * **지난 날이 하루뿐이면 평균선을 그리지 않는다**(KAN-114 (a), 박준현 개발계 확인). 월요일에는 1로 나누므로
     * 평균 = 그날 값이라 점선이 유일한 막대 꼭대기와 정확히 겹치고, 축의 최대값 라벨도 평균 라벨에 가려 사라진다.
     * 한 점을 자기 자신과 견주는 선은 전할 것이 없다 — 이틀째부터 그린다(하루 평균 요약 지표는 그대로다)
     */
    hasAverageRule: elapsedDayCount > 1,
    averageTop: (1 - averageRatio) * CHART_HEIGHT,
    ratios: toBarRatios(week.dailyListenedSec),
    isEmpty: isWeekAllZero(week.dailyListenedSec),
  };
};

interface WeekBodyProps {
  week: WeeklyListening;
  annotationHeight: number;
  /** 가운데 주만 — 이웃 주는 탭·말풍선이 없다(끌리는 동안 보이는 그림일 뿐이다) */
  selectedIndex?: number | null;
  onToggleBar?: (dayIndex: number) => void;
  onChartLayout?: (width: number) => void;
  /**
   * 평균 점선의 등장 — 오른쪽 축("평균"·"0")과 **같은 값**(axisFade)으로 나타난다(PM 2026-09-29 13:45 "평균선을 애니메이션으로,
   * 주 이동할 때 평균·분·0 나올 때 같이"). 가운데 주만 준다 — 이웃 주(끌리는 동안의 그림)에는 점선을 그리지 않아, 새 주가
   * 미끄러져 들어온 뒤 축과 함께 왼쪽부터 그어진다
   */
  averageAppear?: Animated.Value;
}

/** 하루 평균 + 막대 그래프(격자·오른쪽 축·요일) — 빈 주면 빈 상태 */
function WeekBody({
  week,
  annotationHeight,
  selectedIndex = null,
  onToggleBar,
  onChartLayout,
  averageAppear,
}: WeekBodyProps) {
  const view = toWeekView(week);
  if (view.isEmpty) {
    return (
      <View style={styles.stateBox}>
        <Text style={styles.stateText}>{PROFILE_COPY.stats.emptyState}</Text>
      </View>
    );
  }
  return (
    <>
      {/*
        7칸은 늘 칸 폭에 맞춰 나눈다 — 가로 스크롤을 두지 않는다. 축을 고정 칸으로 뺀 뒤(#912) 넘김 칸이 7×44(308)보다
        좁아져 스크롤이 켜졌고, 월요일이 잘리고 세로선이 한 칸 밀려 그려졌다(PM 2026-09-28 03:43 "좌표가 안 맞는다").
        요일 칸이 44 보다 좁아도 칸 높이(막대 + 요일) 전체가 탭 영역이라 누르기 어렵지 않다
      */}
      <View
        style={styles.chartArea}
        onLayout={
          onChartLayout ? ({ nativeEvent }) => onChartLayout(nativeEvent.layout.width) : undefined
        }
        accessibilityLabel={PROFILE_COPY.stats.weeklyA11y(week.weekStart)}
      >
        <View
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[styles.grid, { top: annotationHeight }]}
        >
          {GRID_RATIOS.map((ratio) => (
            <View key={ratio} style={[styles.gridLine, { top: ratio * CHART_HEIGHT }]} />
          ))}
          {view.hasAverageRule && averageAppear ? (
            <Animated.View
              style={[
                styles.averageRule,
                {
                  top: view.averageTop,
                  opacity: averageAppear,
                  // 왼쪽에서 오른쪽 축("평균" 라벨) 쪽으로 그어진다
                  transform: [{ scaleX: averageAppear }],
                },
              ]}
            />
          ) : null}
        </View>
        <View style={styles.chartRow}>
          {view.ratios.map((ratio, dayIndex) => {
            const isSelected = dayIndex === selectedIndex;
            const column = (
              <>
                <View style={{ height: annotationHeight }} />
                <View style={styles.barTrack}>
                  {/* 세로 격자 — 요일 칸 경계. 첫 칸은 왼쪽 선 대신 가로 격자가 끝난다 */}
                  {/* 첫 칸도 긋는다 — 주 경계가 요일 경계와 같은 선이라 옆 주와 한 줄로 이어진다 */}
                  <View style={styles.columnRule} />
                  {isSelected ? <View style={styles.selectionRule} /> : null}
                  <View
                    style={[
                      styles.bar,
                      { height: Math.max(ratio * CHART_HEIGHT, ZERO_BAR_HEIGHT) },
                      ratio === 0 && styles.zeroBar,
                      selectedIndex !== null && !isSelected && styles.barMuted,
                    ]}
                  />
                </View>
                <View style={[styles.dayBadge, isSelected && styles.dayBadgeSelected]}>
                  <Text
                    style={[
                      styles.dayName,
                      dayIndex === view.todayIndex && styles.dayNameToday,
                      isSelected && styles.dayNameSelected,
                    ]}
                  >
                    {PROFILE_COPY.stats.dayNames[dayIndex]}
                  </Text>
                </View>
              </>
            );
            return onToggleBar ? (
              <Pressable
                key={dayIndex}
                style={styles.barColumn}
                onPress={() => onToggleBar(dayIndex)}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={PROFILE_COPY.stats.dayBarA11y(
                  dayIndex,
                  week.dailyListenedSec[dayIndex],
                )}
              >
                {column}
              </Pressable>
            ) : (
              <View key={dayIndex} style={styles.barColumn}>
                {column}
              </View>
            );
          })}
        </View>
      </View>
    </>
  );
}

/**
 * 값이 바뀌면 이전 값에서 새 값까지 **숫자가 굴러가듯** 바뀐다(PM 2026-09-28 03:22 "분은 가만히 있고 숫자만 자연스럽게").
 * 0.45초 ease-out — 끝으로 갈수록 느려져 새 값에 내려앉는다. 처음 값은 굴리지 않는다
 */
const COUNT_DURATION_MS = 450;
function useCountTo(target: number | null): number | null {
  const [shown, setShown] = useState(target);
  const shownRef = useRef(target);
  useEffect(() => {
    if (target === null) return undefined;
    const from = shownRef.current;
    if (from === null || from === target) {
      shownRef.current = target;
      const frame = requestAnimationFrame(() => setShown(target));
      return () => cancelAnimationFrame(frame);
    }
    const startedAt = Date.now();
    let frame = 0;
    const tick = () => {
      const t = Math.min(1, (Date.now() - startedAt) / COUNT_DURATION_MS);
      const eased = 1 - (1 - t) ** 3;
      const value = from + (target - from) * eased;
      shownRef.current = value;
      setShown(value);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target]);
  return shown;
}

/** P8/P9: 서버 주 경계·상대 높이를 유지하고 탭한 요일의 값을 보여준다. */
export default function WeeklyChart({ weekly, footer, onSwipingChange }: WeeklyChartProps) {
  const { displayed, weekLabelStart, selectedBarIndex: selectedIndex } = weekly;
  /*
   * 하루 평균은 **넘김 구획 밖에 고정**하고 숫자만 굴린다(PM 2026-09-28 03:22) — 차트만 옆 주로 미끄러지고, 평균은
   * 제자리에서 새 주 값으로 바뀐다. 전환 중(조회)에는 직전 값을 붙들고 있다가 도착하면 굴린다
   */
  const targetAverageSec =
    displayed !== null && !weekly.isSwitching ? toWeekView(displayed).averageSec : null;
  const shownAverageSec = useCountTo(targetAverageSec);
  /** 상위 % — 평균과 같이 전환 중엔 숨긴다(옆 주 값이 남아 있으면 엉뚱한 주의 순위로 읽힌다) */
  const topPercent =
    displayed !== null && !weekly.isSwitching ? displayed.listeningTopPercent : null;
  // 막대를 고른 요일의 청취 시간 — 있으면 요약 줄이 그 요일로 바뀐다(스크린 타임)
  const selectedDaySec =
    selectedIndex !== null && displayed !== null
      ? (displayed.dailyListenedSec[selectedIndex] ?? null)
      : null;
  /*
   * 카드를 가로로 밀어 주를 넘긴다(PM 2026-09-28 01:40) — 애플 건강·스크린 타임과 같은 방향: 손가락을 **오른쪽으로 밀면
   * 이전 주**(왼쪽 < 와 같은 쪽), 왼쪽으로 밀면 다음 주. 화살표와 같은 판정(canGoPrev/Next · 전환 중 막힘)을 거친다.
   * 세로 움직임이 더 크면 잡지 않는다 — 프로필 화면의 세로 스크롤이 우선이다
   */
  const weeklyRef = useRef(weekly);
  useEffect(() => {
    weeklyRef.current = weekly;
  });
  /*
   * **페이지처럼 이어진다**(PM 2026-09-28 03:11 "전 주가 완전히 이어진 것처럼") — 차트 구획에 [이전 주 | 이 주 | 다음 주]
   * 세 칸을 카드 폭으로 나란히 두고, 끄는 만큼 줄 전체가 따라온다. 옆 칸은 미리 받아 둔 이웃 주(아직 없으면 스켈레톤)라
   * 끌면 그 주가 실제로 딸려 들어온다. 놓으면 넘기는 쪽 칸이 가운데에 설 때까지 스프링(손가락 속도 이어받음)이 밀고,
   * 도착하면 표시 주를 바꾸면서 줄을 가운데로 되돌린다(같은 그림이라 이음새가 안 보인다). 헤더·주제 구획은 고정.
   * 전부 transform 이라 네이티브 드라이버다
   */
  const [pageWidth, setPageWidth] = useState(0);
  const pageWidthRef = useRef(0);
  useEffect(() => {
    pageWidthRef.current = pageWidth;
  });
  const swipeX = useAnimatedValue(0);
  const pagerX = useMemo(() => Animated.add(swipeX, -pageWidth), [swipeX, pageWidth]);
  /*
   * 오른쪽 축(최대·평균·0)은 **넘김 구획 밖 고정 칸**이다(PM 2026-09-28 03:36 "도표가 이어져 있는 것처럼, 평균·0 은 나중에
   * 생기게") — 주마다 축 칸이 붙어 있으면 옆 주 사이에 틈이 생겼다. 끌기 시작하면 사라지고, 새 주(또는 제자리)에
   * 앉은 뒤 조금 늦게 나타난다 — 축 값은 주마다 다르므로 미끄러지는 동안 옛 값이 새 막대 옆에 있으면 안 된다
   */
  const axisFade = useAnimatedValue(1);
  const hideAxis = () =>
    Animated.timing(axisFade, {
      toValue: 0,
      duration: motion.duration.fast / 2,
      useNativeDriver: true,
    }).start();
  const showAxis = () =>
    Animated.timing(axisFade, {
      toValue: 1,
      duration: motion.duration.normal,
      delay: motion.duration.fast,
      useNativeDriver: true,
    }).start();
  // 표시 주(라벨)가 바뀌면 — 스와이프 도착 · 화살표 · 이동 실패 모두 — 줄을 가운데로. 그리기 전에 해야 한 프레임도 안 튄다.
  // 조회 중이면 축을 숨겨 두고, 자리 잡으면(조회 끝 포함) 늦게 나타낸다
  useLayoutEffect(() => {
    swipeX.stopAnimation();
    swipeX.setValue(0);
    if (weekly.isSwitching) axisFade.setValue(0);
    else showAxis();
    // showAxis 는 매 렌더 새로 만들어지지만 값(axisFade)만 쓴다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekLabelStart, weekly.isSwitching, swipeX, axisFade]);
  const settleSwipe = (velocity = 0) =>
    Animated.spring(swipeX, {
      toValue: 0,
      velocity,
      ...motion.spring.snappy,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) showAxis();
    });
  const turnWeek = (direction: 'prev' | 'next', velocity = 0) => {
    const width = pageWidthRef.current;
    const go = () => {
      const current = weeklyRef.current;
      if (direction === 'prev') current.goPrev();
      else current.goNext();
    };
    if (width === 0) {
      go();
      return;
    }
    hideAxis();
    Animated.spring(swipeX, {
      toValue: direction === 'prev' ? width : -width,
      velocity,
      ...motion.spring.smooth,
      overshootClamping: true,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished) return;
      // 그사이 다른 이동이 걸려 있으면 넘기지 않고 제자리로
      if (weeklyRef.current.isSwitching) {
        settleSwipe();
        return;
      }
      go();
    });
  };
  const swipeActionsRef = useRef({ settleSwipe, turnWeek, hideAxis, onSwipingChange });
  useEffect(() => {
    swipeActionsRef.current = { settleSwipe, turnWeek, hideAxis, onSwipingChange };
  });
  const swipeResponder = useMemo(
    () =>
      // eslint-disable-next-line react-hooks/refs -- 콜백은 렌더가 아니라 제스처 시점에 실행된다(표준 PanResponder 패턴, PlayerScreen 과 같다)
      PanResponder.create({
        /*
         * **capture 단계로 묻는다**(PM 2026-09-28 01:54 "스와이프 안 먹어"). 막대(Pressable)와 화면을 감싼 Pressable 이 손을
         * 대는 순간 responder 가 되는데, 그 뒤 조상이 빼앗으려면 capture 변형이어야 한다 — bubble 의
         * onMoveShouldSetPanResponder 는 조회되지 않는다(바텀시트 끌기 #825 와 같은 함정). 가로가 확실할 때만 빼앗으므로
         * 막대 탭은 그대로다
         */
        onMoveShouldSetPanResponderCapture: (_, gesture) =>
          Math.abs(gesture.dx) > SWIPE_CLAIM_DISTANCE &&
          Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.5,
        // 잡은 뒤에는 세로 스크롤 뷰가 가져가지 못하게 한다 — 가로로 판정된 끌기다
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          swipeX.stopAnimation();
          swipeActionsRef.current.hideAxis();
          swipeActionsRef.current.onSwipingChange?.(true);
        },
        onPanResponderMove: (_, gesture) => {
          const current = weeklyRef.current;
          const canFollow =
            !current.isSwitching && (gesture.dx > 0 ? current.canGoPrev : current.canGoNext);
          swipeX.setValue(canFollow ? gesture.dx : gesture.dx * SWIPE_RUBBER);
        },
        onPanResponderRelease: (_, gesture) => {
          const current = weeklyRef.current;
          const { settleSwipe: settle, turnWeek: turn } = swipeActionsRef.current;
          swipeActionsRef.current.onSwipingChange?.(false);
          const width = pageWidthRef.current;
          const commit = Math.min(SWIPE_COMMIT_DISTANCE, width * 0.3 || SWIPE_COMMIT_DISTANCE);
          const toPrev = gesture.dx > commit || gesture.vx > SWIPE_COMMIT_VELOCITY;
          const toNext = gesture.dx < -commit || gesture.vx < -SWIPE_COMMIT_VELOCITY;
          if (!current.isSwitching && toPrev && current.canGoPrev) turn('prev', gesture.vx);
          else if (!current.isSwitching && toNext && current.canGoNext) turn('next', gesture.vx);
          else settle(gesture.vx);
        },
        onPanResponderTerminate: () => {
          swipeActionsRef.current.onSwipingChange?.(false);
          swipeActionsRef.current.settleSwipe();
        },
      }),
    [swipeX],
  );
  /*
   * **막대를 눌러도 말풍선을 띄우지 않는다 — 위 요약 줄이 그 요일로 바뀐다**(애플 스크린 타임, PM 2026-10-11 A안). 종전엔 말풍선
   * 자리(약 42)를 처음부터 비워 둬서 숫자와 그래프 사이에 빈 띠가 늘 있었다. 이제 막대 위는 맨 위 막대가 카드에 닿지 않을 만큼만
   */
  const annotationHeight = BAR_TOP_INSET;
  // 축은 가운데 주가 그래프로 보일 때만 — 조회 중·실패·빈 주에는 비운다
  const axisView =
    displayed !== null && !weekly.isSwitching && !weekly.hasSwitchError
      ? toWeekView(displayed)
      : null;
  const axisLabels =
    axisView === null || axisView.isEmpty
      ? []
      : [
          { key: 'max', top: 0, text: PROFILE_COPY.stats.axisMax(axisView.maxSec) },
          // 평균선을 그리지 않는 주(지난 날 하루)에는 "평균" 라벨도 두지 않는다 — 가리킬 선이 없다
          ...(axisView.hasAverageRule
            ? [{ key: 'average', top: axisView.averageTop, text: PROFILE_COPY.stats.axisAverage }]
            : []),
          { key: 'zero', top: CHART_HEIGHT, text: PROFILE_COPY.stats.axisZero },
        ].filter(
          (label) =>
            !axisView.hasAverageRule ||
            label.key === 'average' ||
            Math.abs(label.top - axisView.averageTop) >= AXIS_LABEL_HEIGHT,
        );
  // 카드가 surface 면이라 블록은 한 단 진한 border 색이다 — surface 위 surface 는 보이지 않는다
  const skeleton = (
    <SkeletonGroup style={styles.stateBox} color={theme.color.border}>
      <SkeletonBlock style={styles.skeletonChart} />
    </SkeletonGroup>
  );
  // 이웃 칸 — 있는 쪽만. 아직 받는 중이면 스켈레톤, 갈 수 없는 쪽은 비운다(끌어도 고무줄이라 거의 안 보인다)
  const renderNeighbor = (week: WeeklyListening | null, exists: boolean) =>
    week !== null ? (
      <WeekBody week={week} annotationHeight={annotationHeight} />
    ) : exists ? (
      skeleton
    ) : null;

  const current = weekly.hasSwitchError ? (
    <View style={styles.stateBox}>
      <Text style={styles.stateText}>{PROFILE_COPY.cardError}</Text>
      <Pressable
        style={({ pressed }) => [pillButton.base, styles.retryButton, pressed && styles.pressed]}
        onPress={weekly.retrySwitch}
        accessibilityRole="button"
        accessibilityLabel={PROFILE_COPY.retry}
      >
        <Text style={styles.retryText}>{PROFILE_COPY.retry}</Text>
      </Pressable>
    </View>
  ) : weekly.isSwitching || displayed === null ? (
    skeleton
  ) : (
    <WeekBody
      week={displayed}
      annotationHeight={annotationHeight}
      selectedIndex={selectedIndex}
      onToggleBar={weekly.toggleBar}
      averageAppear={axisFade}
    />
  );

  return (
    <View style={styles.container}>
      <View style={styles.card} {...swipeResponder.panHandlers}>
        <View style={styles.headerRow}>
          <Text style={styles.title} accessibilityRole="header">
            {PROFILE_COPY.stats.weeklyTitle}
          </Text>
          <View style={styles.weekControls}>
            <ArrowButton
              direction="left"
              enabled={weekly.canGoPrev && !weekly.isSwitching}
              onPress={() => turnWeek('prev')}
            />
            <Text style={styles.weekRange} numberOfLines={1}>
              {weekLabelStart === null ? '' : PROFILE_COPY.stats.weekRange(weekLabelStart)}
            </Text>
            <ArrowButton
              direction="right"
              enabled={weekly.canGoNext && !weekly.isSwitching}
              onPress={() => turnWeek('next')}
            />
          </View>
        </View>
        {shownAverageSec === null ? (
          <SkeletonGroup style={styles.summary} color={theme.color.border}>
            <SkeletonBlock style={styles.skeletonValue} />
          </SkeletonGroup>
        ) : (
          <View
            style={styles.summary}
            accessible
            // 요약 줄은 한 덩어리로 읽힌다 — 상위 % 도 같은 낭독에 잇는다
            accessibilityLabel={
              selectedDaySec !== null && selectedIndex !== null
                ? PROFILE_COPY.stats.dayBarA11y(selectedIndex, selectedDaySec)
                : [
                    PROFILE_COPY.stats.averageA11y(targetAverageSec ?? shownAverageSec),
                    topPercent !== null ? PROFILE_COPY.stats.topPercentA11y(topPercent) : null,
                  ]
                    .filter(Boolean)
                    .join(', ')
            }
            accessibilityLiveRegion="polite"
          >
            {/* 점선 범례(─ ─)는 뺐다(PM 2026-09-28 00:23) — 라벨만 */}
            <Text style={styles.summaryLabel}>
              {selectedDaySec !== null && selectedIndex !== null
                ? PROFILE_COPY.stats.selectedDayTitle(selectedIndex)
                : PROFILE_COPY.stats.dailyAverageTitle}
            </Text>
            {/*
              상위 % 는 **큰 숫자와 같은 줄 오른쪽, 회색 글자 + 원 화살표**(PM 2026-10-11 00:28 스크린 타임 스샷 "지난주 대비 8%"
              처럼). 종전 라벨 줄 흰 알약에서 옮겼다. 긴 평균값이면 숫자 쪽이 줄어든다(오른쪽은 줄지 않는다)
            */}
            <View style={styles.valueRow}>
              <View style={styles.valueBox}>
                <AverageValue sec={selectedDaySec ?? Math.round(shownAverageSec)} />
              </View>
              {/* 요일을 고른 동안엔 순위를 숨긴다 — 하루 값에는 순위가 없다 */}
              {topPercent !== null && selectedDaySec === null ? (
                // 두 줄 고정(PM 2026-10-11 02:05) — 평균 길이와 무관하게 모양이 같고, 두 줄 높이가 큰 숫자 높이를 채운다
                <View style={styles.rankBlock}>
                  <Text style={styles.rankLead} numberOfLines={1}>
                    {PROFILE_COPY.stats.topPercentLead}
                  </Text>
                  <View style={styles.rankInline}>
                    <RankUpIcon />
                    <Text style={styles.rankText} numberOfLines={1}>
                      {PROFILE_COPY.stats.topPercent(topPercent)}
                    </Text>
                  </View>
                </View>
              ) : null}
            </View>
          </View>
        )}
        <View style={styles.chartStrip}>
          <View
            style={styles.pager}
            onLayout={({ nativeEvent }) => setPageWidth(nativeEvent.layout.width)}
          >
            {pageWidth === 0 ? (
              current
            ) : (
              <Animated.View
                style={[
                  styles.pagerRow,
                  { width: pageWidth * 3, transform: [{ translateX: pagerX }] },
                ]}
              >
                <View
                  style={{ width: pageWidth }}
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                >
                  {renderNeighbor(weekly.prevWeek, weekly.canGoPrev)}
                </View>
                <View style={{ width: pageWidth }}>{current}</View>
                <View
                  style={{ width: pageWidth }}
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                >
                  {renderNeighbor(weekly.nextWeek, weekly.canGoNext)}
                </View>
              </Animated.View>
            )}
          </View>
          <Animated.View
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={[styles.axis, { opacity: axisFade }]}
          >
            {axisLabels.map((label) => (
              <Text
                key={label.key}
                numberOfLines={1}
                style={[
                  styles.axisLabel,
                  label.key === 'average' && styles.axisLabelAverage,
                  { top: annotationHeight + label.top - AXIS_LABEL_HEIGHT / 2 },
                ]}
              >
                {label.text}
              </Text>
            ))}
          </Animated.View>
        </View>
        {footer}
      </View>
    </View>
  );
}

/**
 * 하루 평균 숫자 — **숫자는 크게, 단위는 작게**(애플 건강·스크린 타임, PM 2026-10-10 "시간이 많으면 넘칠 것 같다"). 단위가
 * 숫자와 같은 34pt 면 "23시간 59분"이 카드 폭을 거의 다 쓴다. 그래도 넘치면 한 줄 안에서 글자를 줄인다
 */
function AverageValue({ sec }: { sec: number }) {
  // 1분 미만은 숫자가 없는 문구 그대로(profile-uiux 4.6)
  if (sec > 0 && sec < 60) {
    return <Text style={styles.summaryValue}>{PROFILE_COPY.stats.dayValue(sec)}</Text>;
  }
  const { hours, minutes } = toListenedDayParts(sec);
  return (
    <Text style={styles.summaryValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
      {hours > 0 ? (
        <>
          {hours}
          <Text style={styles.summaryUnit}>시간 </Text>
        </>
      ) : null}
      {minutes}
      <Text style={styles.summaryUnit}>분</Text>
    </Text>
  );
}

/** 원 안 위 화살표 — 스크린 타임의 arrow.down.circle.fill 문법(채운 회색 원 + 카드 색 화살표) */
function RankUpIcon() {
  // SVG 는 문자열 색만 받는다 — 지금 모드의 값(다크 모드)
  const palette = useThemePalette();
  return (
    <Svg width={RANK_ICON_SIZE} height={RANK_ICON_SIZE} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={12} fill={palette.textSecondary} />
      <Path
        d="M12 18V7M7 11.5l5-5 5 5"
        stroke={palette.surface}
        strokeWidth={2.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

const RANK_ICON_SIZE = 20;

const styles = StyleSheet.create({
  container: { paddingHorizontal: theme.spacing.md, gap: theme.spacing.sm },
  card: {
    borderRadius: theme.radius.xl,
    borderCurve: 'continuous',
    backgroundColor: theme.color.surface,
    paddingVertical: theme.spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
  },
  title: {
    flexShrink: 0,
    fontSize: theme.font.size.xs,
    color: theme.color.textSecondary,
  },
  weekControls: {
    flexDirection: 'row',
    alignItems: 'center',
    // 화살표 원(28)과 날짜 사이 — 터치 영역은 hitSlop 이 원 밖으로 8씩 넓힌다
    gap: theme.spacing.sm,
    flexShrink: 0,
    maxWidth: '100%',
  },
  // 가장 긴 주("10월 26일 – 11월 1일")도 한 줄에 — 110 에서는 접혔다(PM 2026-09-28 00:14). 폭 고정은 주를 넘길 때
  // 화살표가 좌우로 뛰지 않게 하려는 것
  weekRange: {
    width: 140,
    minWidth: 140,
    flexShrink: 1,
    fontVariant: ['tabular-nums'],
    fontSize: theme.font.size.xs,
    fontWeight: '500',
    color: theme.color.textPrimary,
    textAlign: 'center',
  },
  arrow: {
    width: ARROW_SIZE,
    height: ARROW_SIZE,
    borderRadius: theme.radius.full,
    borderCurve: 'continuous',
    backgroundColor: theme.color.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.5 },
  // 헤더 줄 바로 밑 — 화살표를 28 로 줄인 뒤 lg(24)가 헤더와 떨어져 보였다(PM 2026-09-28 00:59 "하루평균 위에 공백이 너무 많다")
  summary: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm,
    gap: theme.spacing.xs,
  },
  summaryLabel: { fontSize: theme.font.size.sm, color: theme.color.textSecondary, flexShrink: 1 },
  // 큰 숫자 + 상위 % — 아래 변을 맞춘다(스크린 타임처럼 오른쪽 글자가 숫자 밑줄에 앉는다)
  valueRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  // 숫자 쪽만 줄어든다 — 오른쪽 상위 % 는 제 폭을 지킨다
  valueBox: {
    flexShrink: 1,
  },
  // 오른쪽 정렬 두 줄 — 숫자(34)의 글자 아래 여백만큼 올려 아랫줄 밑변을 숫자 밑변에 맞춘다
  rankBlock: {
    alignItems: 'flex-end',
    marginBottom: 6,
  },
  // 윗줄 "다른 사용자 대비" — 라벨(하루 평균)과 같은 위계
  // 한 단계 크게(PM 2026-10-11 "조금만 더 키우자") — 14 → 15
  rankLead: {
    fontSize: 15,
    color: theme.color.textSecondary,
  },
  // 아랫줄 아이콘 + "상위 N%" — 아이콘은 이 줄에만(설명 문구가 아니라 순위를 가리킨다)
  rankInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs + 2,
  },
  // 회색 그대로 한 단계 크고 진하게 — 강조색 없이 굵기로만 위계(design.md §1)
  // 16 → 18(PM 2026-10-11) — 아이콘도 18 → 20
  rankText: {
    fontSize: 18,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    color: theme.color.textSecondary,
  },
  // 단위 — 숫자(34) 옆 20pt 회색. 숫자와 같은 줄 기준선에 앉는다(중첩 Text)
  summaryUnit: {
    fontSize: theme.font.size.lg,
    fontWeight: '600',
    color: theme.color.textSecondary,
  },
  summaryValue: {
    fontSize: theme.font.size.xxl,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    color: theme.color.textPrimary,
  },
  stateBox: {
    minHeight: CHART_HEIGHT + BAR_TOP_INSET + theme.spacing.xxl,
    padding: theme.spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
  },
  stateText: {
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
    textAlign: 'center',
  },
  // 흰 알약(회색 면 위) — 모양은 공용 알약(pillButton.base), 면 색·크기만 여기서
  retryButton: {
    minHeight: theme.touchTarget.minHeight,
    minWidth: theme.touchTarget.minWidth,
    paddingHorizontal: theme.spacing.md,
    backgroundColor: theme.color.background,
  },
  retryText: { fontSize: theme.font.size.sm, fontWeight: '600', color: theme.color.primary },
  skeletonValue: {
    width: 120,
    height: theme.font.size.xxl,
    alignSelf: 'flex-start',
    borderRadius: theme.radius.sm,
  },
  skeletonChart: {
    alignSelf: 'stretch',
    height: CHART_HEIGHT,
    marginTop: theme.spacing.lg,
    borderRadius: theme.radius.sm,
  },
  chartArea: { flex: 1 },
  // 격자는 칸 끝에서 끝까지 — 옆 주 칸의 선과 이어진다
  grid: { position: 'absolute', left: 0, right: 0 },
  gridLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderTopWidth: 1,
    borderColor: GRID_COLOR,
  },
  // 요일 칸 경계 세로선 — 막대 칸(barTrack) 왼쪽 변에 칸 높이만큼
  columnRule: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: GRID_COLUMN_COLOR,
  },
  // [넘김 구획 | 고정 축] — 넘김 구획은 카드 왼쪽 여백부터 축 앞까지만 보이고 양옆 주는 잘린다
  chartStrip: { flexDirection: 'row', paddingLeft: theme.spacing.md },
  pager: { flex: 1, overflow: 'hidden' },
  pagerRow: { flexDirection: 'row', alignItems: 'flex-start' },
  axis: {
    width: AXIS_WIDTH,
    paddingRight: theme.spacing.md,
  },
  axisLabel: {
    position: 'absolute',
    left: theme.spacing.xs,
    right: theme.spacing.md,
    height: AXIS_LABEL_HEIGHT,
    lineHeight: AXIS_LABEL_HEIGHT,
    fontSize: 11,
    color: theme.color.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  axisLabelAverage: { fontWeight: '600' },
  averageRule: {
    position: 'absolute',
    transformOrigin: 'left',
    left: 0,
    right: 0,
    borderTopWidth: 1,
    borderColor: theme.color.textSecondary,
    borderStyle: 'dashed',
  },
  chartRow: { flexDirection: 'row', alignItems: 'flex-end' },
  barColumn: {
    flex: 1,
    alignItems: 'center',
  },
  barTrack: {
    height: CHART_HEIGHT,
    justifyContent: 'flex-end',
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  bar: {
    width: '48%',
    maxWidth: theme.spacing.xl,
    // 위 모서리만 둥글게 — 폭 20pt 안팎 막대에 8은 반원처럼 보였다(PM 2026-09-28 04:26 "곡률이 너무 심하다"). 연속 곡률
    borderTopLeftRadius: BAR_RADIUS,
    borderTopRightRadius: BAR_RADIUS,
    borderCurve: 'continuous',
    backgroundColor: theme.color.primary,
  },
  zeroBar: { backgroundColor: theme.color.border },
  barMuted: { opacity: 0.24 },
  selectionRule: {
    position: 'absolute',
    top: -theme.spacing.sm,
    bottom: 0,
    width: StyleSheet.hairlineWidth,
    backgroundColor: theme.color.textSecondary,
  },
  /*
   * 요일 원 — **크기를 고정**(최소값 아님)하고 반지름을 그 절반으로, 넘치는 건 자른다. Android 에서 선택 원이 사각형으로
   * 칠해졌다(PM 2026-09-29 13:56 → 반지름 16 으로도 14:10 "안 됨"): 최소 크기 + 안쪽 여백이면 Android 글꼴 여백(includeFontPadding)
   * 만큼 판이 원보다 커질 수 있고, 연속 곡률(borderCurve)은 iOS 전용이다. 원 지름·반지름·자르기를 모두 고정한다
   */
  dayBadge: {
    marginTop: theme.spacing.sm,
    width: DAY_BADGE_SIZE,
    height: DAY_BADGE_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: DAY_BADGE_SIZE / 2,
    overflow: 'hidden',
  },
  dayBadgeSelected: { backgroundColor: theme.color.primary },
  dayName: {
    fontSize: theme.font.size.xs,
    color: theme.color.textSecondary,
    // Android 글꼴 위아래 여백을 빼서 원 가운데에 선다
    includeFontPadding: false,
  },
  dayNameToday: { color: theme.color.textPrimary, fontWeight: '700' },
  dayNameSelected: { color: theme.color.onPrimary, fontWeight: '600' },
});
