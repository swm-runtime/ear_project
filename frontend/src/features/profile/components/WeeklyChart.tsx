import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { PanResponder, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/shared/theme';
import ChevronIcon from '@/shared/ui/ChevronIcon';

import type { WeeklyNavigation } from '../hooks/useWeeklyNavigation';
import { PROFILE_COPY } from '../profile.copy';
import { isWeekAllZero, toBarRatios, toDailyAverageSec } from '../profile.format';

interface WeeklyChartProps {
  weekly: WeeklyNavigation;
  /** 카드 맨 아래 구획 — 주제 분포(PM 2026-09-28 00:47 합침). 주 전환·로딩·빈 주와 무관하게 늘 그린다 */
  footer?: ReactNode;
}
const CHART_HEIGHT = 144;
const ZERO_BAR_HEIGHT = 3;
const DAYS_IN_WEEK = 7;
/**
 * 막대 위 말풍선 자리의 **최소** 높이 — 실제 높이는 실측값이 이긴다(`annotationHeight`). 말풍선은 14pt 글자 +
 * 위아래 8 여백이라 34 안팎이므로 44 는 10 넘게 과하게 비웠고, 아무 막대도 고르지 않은 기본 상태에서는 그 자리가
 * 그냥 빈 공간으로 보였다(PM 2026-09-28 01:28 "하루 청취 시간 아래 공백이 많다"). 실측이 더 크면(200% 글꼴) 그 값을 쓴다
 */
const ANNOTATION_MIN_HEIGHT = 32;
const GRID_RATIOS = [0, 0.5, 1] as const;
/** 주 이동 화살표 원 — 보이는 크기만 줄이고 터치는 hitSlop 으로 44 를 지킨다(PM 2026-09-28 00:32 "버튼 크기 줄이자") */
const ARROW_SIZE = 28;
const ARROW_HIT_SLOP = (theme.touchTarget.minHeight - ARROW_SIZE) / 2;
/** 가로 스와이프로 주 넘기기 — 이만큼 가로로 움직여야 잡고(세로 스크롤 우선), 이만큼 밀거나 이 속도면 넘긴다 */
const SWIPE_CLAIM_DISTANCE = 12;
const SWIPE_COMMIT_DISTANCE = 48;
const SWIPE_COMMIT_VELOCITY = 0.3;

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

/** P8/P9: 서버 주 경계·상대 높이를 유지하고 탭한 요일의 값을 보여준다. */
export default function WeeklyChart({ weekly, footer }: WeeklyChartProps) {
  const { displayed, weekLabelStart, selectedBarIndex: selectedIndex } = weekly;
  const isEmptyWeek = displayed !== null && isWeekAllZero(displayed.dailyListenedSec);
  const ratios = displayed === null ? [] : toBarRatios(displayed.dailyListenedSec);
  // 오늘 요일 강조에만 기기 달력을 쓴다. 주 이동은 서버 토큰으로 판정한다.
  const todayIndex =
    displayed !== null && displayed.nextWeekStart === null ? (new Date().getDay() + 6) % 7 : null;
  const averageSec =
    displayed === null
      ? 0
      : toDailyAverageSec(
          displayed.dailyListenedSec,
          todayIndex === null ? DAYS_IN_WEEK : todayIndex + 1,
        );
  const maxSec = displayed === null ? 0 : Math.max(...displayed.dailyListenedSec, 0);
  const averageRatio = maxSec === 0 ? 0 : Math.min(1, averageSec / maxSec);
  /*
   * 카드를 가로로 밀어 주를 넘긴다(PM 2026-09-28 01:40) — 애플 건강·스크린 타임과 같은 방향: 손가락을 **오른쪽으로 밀면
   * 이전 주**(왼쪽 < 와 같은 쪽), 왼쪽으로 밀면 다음 주. 화살표와 같은 판정(canGoPrev/Next · 전환 중 막힘)을 거친다.
   * 세로 움직임이 더 크면 잡지 않는다 — 프로필 화면의 세로 스크롤이 우선이다
   */
  const weeklyRef = useRef(weekly);
  useEffect(() => {
    weeklyRef.current = weekly;
  });
  const swipeResponder = useMemo(
    () =>
      // eslint-disable-next-line react-hooks/refs -- 콜백은 렌더가 아니라 제스처 시점에 실행된다(표준 PanResponder 패턴, PlayerScreen 과 같다)
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) =>
          Math.abs(gesture.dx) > SWIPE_CLAIM_DISTANCE &&
          Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.5,
        onPanResponderRelease: (_, gesture) => {
          const current = weeklyRef.current;
          if (current.isSwitching) return;
          const toPrev = gesture.dx > SWIPE_COMMIT_DISTANCE || gesture.vx > SWIPE_COMMIT_VELOCITY;
          const toNext = gesture.dx < -SWIPE_COMMIT_DISTANCE || gesture.vx < -SWIPE_COMMIT_VELOCITY;
          if (toPrev && current.canGoPrev) current.goPrev();
          else if (toNext && current.canGoNext) current.goNext();
        },
      }),
    [],
  );
  const [chartWidth, setChartWidth] = useState(0);
  const [tooltipSize, setTooltipSize] = useState({ width: 0, height: ANNOTATION_MIN_HEIGHT });
  const annotationHeight = Math.max(ANNOTATION_MIN_HEIGHT, tooltipSize.height) + theme.spacing.sm;
  const selectedCenter = ((selectedIndex ?? 0) + 0.5) * (chartWidth / DAYS_IN_WEEK);
  // 좁은 요일 칸 대신 말풍선 전체를 실측하고, 양 끝 요일도 카드 안에 담는다.
  const tooltipLeft = Math.max(
    theme.spacing.sm,
    Math.min(
      selectedCenter - tooltipSize.width / 2,
      chartWidth - tooltipSize.width - theme.spacing.sm,
    ),
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
              onPress={weekly.goPrev}
            />
            <Text style={styles.weekRange} numberOfLines={1}>
              {weekLabelStart === null ? '' : PROFILE_COPY.stats.weekRange(weekLabelStart)}
            </Text>
            <ArrowButton
              direction="right"
              enabled={weekly.canGoNext && !weekly.isSwitching}
              onPress={weekly.goNext}
            />
          </View>
        </View>
        {weekly.hasSwitchError ? (
          <View style={styles.stateBox}>
            <Text style={styles.stateText}>{PROFILE_COPY.cardError}</Text>
            <Pressable
              style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
              onPress={weekly.retrySwitch}
              accessibilityRole="button"
              accessibilityLabel={PROFILE_COPY.retry}
            >
              <Text style={styles.retryText}>{PROFILE_COPY.retry}</Text>
            </Pressable>
          </View>
        ) : weekly.isSwitching || displayed === null ? (
          <View
            style={styles.stateBox}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <View style={styles.skeletonValue} />
            <View style={styles.skeletonChart} />
          </View>
        ) : isEmptyWeek ? (
          <View style={styles.stateBox}>
            <Text style={styles.emptyValue}>{PROFILE_COPY.stats.dayValue(0)}</Text>
            <Text style={styles.stateText}>{PROFILE_COPY.stats.emptyState}</Text>
          </View>
        ) : (
          <>
            <View
              style={styles.summary}
              accessible
              accessibilityLabel={PROFILE_COPY.stats.averageA11y(averageSec)}
            >
              {/* 점선 범례(─ ─)는 뺐다(PM 2026-09-28 00:23) — 라벨만 */}
              <Text style={styles.summaryLabel}>{PROFILE_COPY.stats.dailyAverageTitle}</Text>
              <Text style={styles.summaryValue}>{PROFILE_COPY.stats.dayValue(averageSec)}</Text>
            </View>
            {/* 보통 화면은 7일을 한 번에, 좁은 화면은 스크롤로 44pt 터치 영역을 유지한다. */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chartScrollContent}
            >
              <View
                style={styles.chartArea}
                onLayout={({ nativeEvent }) => setChartWidth(nativeEvent.layout.width)}
                accessibilityLabel={PROFILE_COPY.stats.weeklyA11y(displayed.weekStart)}
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
                  <View style={[styles.averageRule, { top: (1 - averageRatio) * CHART_HEIGHT }]} />
                </View>
                <View style={styles.chartRow}>
                  {ratios.map((ratio, dayIndex) => {
                    const isSelected = dayIndex === selectedIndex;
                    return (
                      <Pressable
                        key={dayIndex}
                        style={styles.barColumn}
                        onPress={() => weekly.toggleBar(dayIndex)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: isSelected }}
                        accessibilityLabel={PROFILE_COPY.stats.dayBarA11y(
                          dayIndex,
                          displayed.dailyListenedSec[dayIndex],
                        )}
                      >
                        <View style={{ height: annotationHeight }} />
                        <View style={styles.barTrack}>
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
                              dayIndex === todayIndex && styles.dayNameToday,
                              isSelected && styles.dayNameSelected,
                            ]}
                          >
                            {PROFILE_COPY.stats.dayNames[dayIndex]}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
                {selectedIndex !== null ? (
                  <View
                    pointerEvents="none"
                    accessibilityElementsHidden
                    importantForAccessibility="no-hide-descendants"
                    style={[
                      styles.tooltip,
                      {
                        transform: [{ translateX: tooltipLeft - theme.spacing.sm }],
                        maxWidth: chartWidth > 0 ? chartWidth - theme.spacing.md : undefined,
                        opacity: chartWidth > 0 ? 1 : 0,
                      },
                    ]}
                    onLayout={({ nativeEvent: { layout } }) => {
                      const width = Math.ceil(layout.width);
                      const height = Math.ceil(layout.height);
                      setTooltipSize((previous) =>
                        previous.width === width && previous.height === height
                          ? previous
                          : { width, height },
                      );
                    }}
                  >
                    <Text style={styles.tooltipText}>
                      {PROFILE_COPY.stats.dayBarA11y(
                        selectedIndex,
                        displayed.dailyListenedSec[selectedIndex],
                      )}
                    </Text>
                  </View>
                ) : null}
              </View>
            </ScrollView>
          </>
        )}
        {footer}
      </View>
    </View>
  );
}

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
  summaryValue: {
    fontSize: theme.font.size.xxl,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    color: theme.color.textPrimary,
  },
  stateBox: {
    minHeight: CHART_HEIGHT + ANNOTATION_MIN_HEIGHT + theme.spacing.xxl * 2,
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
  emptyValue: {
    fontSize: theme.font.size.xxl,
    fontWeight: '600',
    color: theme.color.textSecondary,
  },
  retryButton: {
    minHeight: theme.touchTarget.minHeight,
    minWidth: theme.touchTarget.minWidth,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.md,
    borderCurve: 'continuous',
    backgroundColor: theme.color.background,
  },
  retryText: { fontSize: theme.font.size.sm, fontWeight: '600', color: theme.color.primary },
  skeletonValue: {
    width: 120,
    height: theme.font.size.xxl,
    alignSelf: 'flex-start',
    borderRadius: theme.radius.sm,
    borderCurve: 'continuous',
    backgroundColor: theme.color.border,
  },
  skeletonChart: {
    alignSelf: 'stretch',
    height: CHART_HEIGHT,
    marginTop: theme.spacing.lg,
    borderRadius: theme.radius.sm,
    borderCurve: 'continuous',
    backgroundColor: theme.color.border,
  },
  chartScrollContent: { flexGrow: 1 },
  chartArea: { flex: 1, minWidth: DAYS_IN_WEEK * theme.touchTarget.minWidth },
  grid: { position: 'absolute', left: theme.spacing.md, right: theme.spacing.md },
  gridLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: theme.color.border,
  },
  averageRule: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderTopWidth: 1,
    borderColor: theme.color.textSecondary,
    borderStyle: 'dashed',
  },
  chartRow: { flexDirection: 'row', alignItems: 'flex-end' },
  barColumn: {
    flex: 1,
    minWidth: theme.touchTarget.minWidth,
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
    borderTopLeftRadius: theme.radius.sm,
    borderTopRightRadius: theme.radius.sm,
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
  tooltip: {
    position: 'absolute',
    top: 0,
    left: theme.spacing.sm,
    borderRadius: theme.radius.md,
    borderCurve: 'continuous',
    backgroundColor: theme.color.background,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
  },
  tooltipText: {
    fontSize: theme.font.size.sm,
    fontWeight: '600',
    color: theme.color.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  dayBadge: {
    marginTop: theme.spacing.sm,
    minWidth: theme.spacing.xl,
    minHeight: theme.spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.xs,
    borderRadius: theme.radius.full,
    borderCurve: 'continuous',
  },
  dayBadgeSelected: { backgroundColor: theme.color.primary },
  dayName: { fontSize: theme.font.size.xs, color: theme.color.textSecondary },
  dayNameToday: { color: theme.color.textPrimary, fontWeight: '700' },
  dayNameSelected: { color: theme.color.onPrimary, fontWeight: '600' },
});
