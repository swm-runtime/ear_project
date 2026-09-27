import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/shared/theme';
import ChevronIcon from '@/shared/ui/ChevronIcon';

import type { WeeklyNavigation } from '../hooks/useWeeklyNavigation';
import { PROFILE_COPY } from '../profile.copy';
import { isWeekAllZero, toBarRatios, toDailyAverageSec } from '../profile.format';

interface WeeklyChartProps {
  weekly: WeeklyNavigation;
}
const CHART_HEIGHT = 144;
const ZERO_BAR_HEIGHT = 3;
const DAYS_IN_WEEK = 7;
const ANNOTATION_MIN_HEIGHT = 44;
const GRID_RATIOS = [0, 0.5, 1] as const;

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
      accessibilityRole="button"
      accessibilityLabel={
        direction === 'left' ? PROFILE_COPY.stats.prevWeekA11y : PROFILE_COPY.stats.nextWeekA11y
      }
      accessibilityState={{ disabled: !enabled }}
    >
      <ChevronIcon
        direction={direction}
        size={16}
        color={enabled ? theme.color.textPrimary : theme.color.border}
      />
    </Pressable>
  );
}

/** P8/P9: 서버 주 경계·상대 높이를 유지하고 탭한 요일의 값을 보여준다. */
export default function WeeklyChart({ weekly }: WeeklyChartProps) {
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
      <View style={styles.card}>
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
              <View style={styles.summaryLabelRow}>
                <View style={styles.averageKey} />
                <Text style={styles.summaryLabel}>{PROFILE_COPY.stats.dailyAverageTitle}</Text>
              </View>
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
    // 화살표 글리프(16)는 44 터치 영역 가운데라 보이는 간격은 이보다 14 넓다 — 날짜 칸을 넓힌 만큼 여기서 줄인다
    gap: theme.spacing.xs,
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
    width: theme.touchTarget.minWidth,
    height: theme.touchTarget.minHeight,
    borderRadius: theme.radius.full,
    borderCurve: 'continuous',
    backgroundColor: theme.color.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.5 },
  summary: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.lg,
    gap: theme.spacing.xs,
  },
  summaryLabelRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  summaryLabel: { fontSize: theme.font.size.sm, color: theme.color.textSecondary, flexShrink: 1 },
  summaryValue: {
    fontSize: theme.font.size.xxl,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    color: theme.color.textPrimary,
  },
  averageKey: {
    width: theme.spacing.md,
    borderTopWidth: 1,
    borderColor: theme.color.textSecondary,
    borderStyle: 'dashed',
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
