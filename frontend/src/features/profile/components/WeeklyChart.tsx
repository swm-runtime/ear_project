import { Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/shared/theme';

import type { WeeklyNavigation } from '../hooks/useWeeklyNavigation';
import { PROFILE_COPY } from '../profile.copy';
import { isWeekAllZero, toBarRatios } from '../profile.format';

interface WeeklyChartProps {
  weekly: WeeklyNavigation;
}

/** 막대 영역 높이 — 주 내 최댓값 막대가 이 높이다(상대 스케일, profile-uiux.md 4.6) */
const CHART_HEIGHT = 120;
/** 0 막대의 자리 표시 높이 — 값 생략 없이 요일 자리를 유지한다 */
const ZERO_BAR_HEIGHT = 3;
/** 말풍선이 막대 최상단에서도 그래프 영역 안에 머물게 하는 상한 여유 */
const TOOLTIP_HEIGHT = 26;

interface ArrowButtonProps {
  glyph: string;
  a11yLabel: string;
  enabled: boolean;
  onPress: () => void;
}

function ArrowButton({ glyph, a11yLabel, enabled, onPress }: ArrowButtonProps) {
  return (
    <Pressable
      style={styles.arrow}
      onPress={onPress}
      disabled={!enabled}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      // 비활성 상태가 라벨과 함께 읽힌다(profile-uiux.md 7장)
      accessibilityState={{ disabled: !enabled }}
    >
      <Text style={[styles.arrowGlyph, !enabled && styles.arrowDisabled]}>{glyph}</Text>
    </Pressable>
  );
}

/**
 * 주간 청취 그래프(profile-uiux.md 4.6~4.7) — 월~일 7막대, 표시 중인 주의 최댓값 기준 상대 높이.
 * 막대에 수치 라벨을 상시 표시하지 않는다(좁은 7분할에 숫자가 겹친다) — 값은 막대 탭 시
 * 말풍선으로, 스크린리더에는 막대 라벨로 제공한다(개정 근거: changes/pending
 * profile-uiux-weekly-bar-tooltip). 주 이동의 판정(가입 주·이번 주)은 서버 토큰의 null 여부뿐이다.
 */
export default function WeeklyChart({ weekly }: WeeklyChartProps) {
  const { displayed, weekLabelStart } = weekly;
  const isEmptyWeek = displayed !== null && isWeekAllZero(displayed.dailyListenedSec);
  const ratios = displayed === null ? [] : toBarRatios(displayed.dailyListenedSec);

  // 오늘 요일 라벨 강조는 이번 주에서만 의미가 있다(uiux 4.6). 서버가 이번 주임을 알려주고
  // (nextWeekStart null), 요일 위치만 기기 시각으로 고른다 — 표기 전용이라 판정 금지에 걸리지 않는다
  const todayIndex =
    displayed !== null && displayed.nextWeekStart === null ? (new Date().getDay() + 6) % 7 : null;

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>{PROFILE_COPY.stats.weeklyTitle}</Text>
        <View style={styles.weekControls}>
          <ArrowButton
            glyph="◀"
            a11yLabel={PROFILE_COPY.stats.prevWeekA11y}
            enabled={weekly.canGoPrev}
            onPress={weekly.goPrev}
          />
          <Text style={styles.weekRange}>
            {weekLabelStart === null ? '' : PROFILE_COPY.stats.weekRange(weekLabelStart)}
          </Text>
          <ArrowButton
            glyph="▶"
            a11yLabel={PROFILE_COPY.stats.nextWeekA11y}
            enabled={weekly.canGoNext}
            onPress={weekly.goNext}
          />
        </View>
      </View>

      {weekly.hasSwitchError ? (
        // 주 단위 조회 실패 — 그래프 자리만 인라인 에러, 요약·분포는 건드리지 않는다(uiux 4.7)
        <View style={styles.stateBox}>
          <Text style={styles.stateText}>{PROFILE_COPY.cardError}</Text>
          <Pressable
            style={styles.retryButton}
            onPress={weekly.retrySwitch}
            accessibilityRole="button"
            accessibilityLabel={PROFILE_COPY.retry}
          >
            <Text style={styles.retryText}>{PROFILE_COPY.retry}</Text>
          </Pressable>
        </View>
      ) : weekly.isSwitching || displayed === null ? (
        // 주 이동 로딩 — 그래프 자리만 스켈레톤(uiux 4.7)
        <View
          style={[styles.stateBox, styles.skeletonBox]}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
      ) : isEmptyWeek ? (
        // 한 주 전체 0 — 그래프 대신 빈 상태 문구, 영역은 유지한다(uiux 4.6·4.8)
        <View style={styles.stateBox}>
          <Text style={styles.stateText}>{PROFILE_COPY.stats.emptyState}</Text>
        </View>
      ) : (
        <View
          style={styles.chartRow}
          accessibilityLabel={PROFILE_COPY.stats.weeklyA11y(displayed.weekStart)}
        >
          {ratios.map((ratio, dayIndex) => {
            const barHeight =
              ratio === 0 ? ZERO_BAR_HEIGHT : Math.max(ratio * CHART_HEIGHT, ZERO_BAR_HEIGHT);
            const isSelected = dayIndex === weekly.selectedBarIndex;
            return (
              <Pressable
                key={dayIndex}
                style={styles.barColumn}
                onPress={() => weekly.toggleBar(dayIndex)}
                accessible
                accessibilityRole="button"
                // 막대별 개별 읽기 — "화요일, 32분"(profile-uiux.md 7장). 라벨이 이미 값을 읽으므로
                // 말풍선은 보조기기에 별도 노출하지 않는다(4.6 개정)
                accessibilityLabel={PROFILE_COPY.stats.dayBarA11y(
                  dayIndex,
                  displayed.dailyListenedSec[dayIndex],
                )}
              >
                <View style={styles.barTrack}>
                  {isSelected ? (
                    <View
                      style={[
                        styles.tooltip,
                        // 막대 위에 붙이되 최상단 막대에서도 그래프 영역 안에 머문다
                        { bottom: Math.min(barHeight + 4, CHART_HEIGHT - TOOLTIP_HEIGHT) },
                      ]}
                      accessibilityElementsHidden
                      importantForAccessibility="no-hide-descendants"
                    >
                      <Text style={styles.tooltipText}>
                        {PROFILE_COPY.stats.dayValue(displayed.dailyListenedSec[dayIndex])}
                      </Text>
                    </View>
                  ) : null}
                  <View
                    style={[
                      styles.bar,
                      ratio === 0
                        ? { height: ZERO_BAR_HEIGHT, backgroundColor: theme.color.border }
                        : { height: barHeight },
                      isSelected && styles.barSelected,
                    ]}
                  />
                </View>
                <Text style={[styles.dayName, dayIndex === todayIndex && styles.dayNameToday]}>
                  {PROFILE_COPY.stats.dayNames[dayIndex]}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
    flexWrap: 'wrap',
  },
  title: {
    fontSize: theme.font.size.md,
    fontWeight: '600',
    color: theme.color.textPrimary,
  },
  weekControls: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  weekRange: {
    fontSize: theme.font.size.xs,
    color: theme.color.textSecondary,
    minWidth: 110,
    textAlign: 'center',
  },
  arrow: {
    minHeight: theme.touchTarget.minHeight,
    minWidth: theme.touchTarget.minWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowGlyph: {
    fontSize: theme.font.size.sm,
    color: theme.color.textPrimary,
  },
  arrowDisabled: {
    color: theme.color.border,
  },
  stateBox: {
    height: CHART_HEIGHT + theme.spacing.lg,
    borderRadius: theme.radius.md,
    backgroundColor: theme.color.surface,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
  },
  skeletonBox: {
    opacity: 0.6,
  },
  stateText: {
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
  },
  retryButton: {
    minHeight: theme.touchTarget.minHeight,
    minWidth: theme.touchTarget.minWidth,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.sm,
  },
  retryText: {
    fontSize: theme.font.size.sm,
    fontWeight: '600',
    color: theme.color.primary,
  },
  chartRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: theme.spacing.xs,
  },
  barColumn: {
    flex: 1,
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  barTrack: {
    height: CHART_HEIGHT,
    justifyContent: 'flex-end',
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  bar: {
    width: '55%',
    borderTopLeftRadius: theme.radius.sm,
    borderTopRightRadius: theme.radius.sm,
    backgroundColor: theme.color.primary,
  },
  /** 선택 막대 강조 — 색이 아니라 테두리 형태 단서(색만으로 구분 금지) */
  barSelected: {
    borderWidth: 2,
    borderColor: theme.color.textPrimary,
  },
  tooltip: {
    position: 'absolute',
    alignSelf: 'center',
    zIndex: 1,
    backgroundColor: theme.color.textPrimary,
    borderRadius: theme.radius.sm,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
  tooltipText: {
    fontSize: theme.font.size.xs,
    fontWeight: '600',
    color: theme.color.background,
  },
  dayName: {
    fontSize: theme.font.size.xs,
    color: theme.color.textSecondary,
  },
  dayNameToday: {
    color: theme.color.textPrimary,
    fontWeight: '700',
  },
});
