import { Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/shared/theme';

import { EXPLORE_COPY } from '../explore.copy';
import type { ExplorePeriod } from '../explore.types';

interface PopularPeriodToggleProps {
  /** 선택 상태의 근거는 서버 응답의 period다 — 클라이언트 기본값이 없다(uiux 4.10) */
  selected: ExplorePeriod;
  onSelect: (period: ExplorePeriod) => void;
  /** 전환 중 중복 탭 차단(uiux 4.10) */
  disabled: boolean;
}

/** 라벨은 화면 문구, 값은 전송값 — 순서는 uiux 4.10의 "주간 · 월간 · 전체"다 */
const PERIODS: ExplorePeriod[] = ['week', 'month', 'all'];

/**
 * E13 인기 구간 토글 — 인기 섹션 제목 줄에만 붙는 3택 1 세그먼트 컨트롤.
 * 확정 구간이 없어도 세 구간 모두 항상 고를 수 있다 — 탭을 숨기거나 비활성화하지 않는다
 * (explore.md 4.1-1 · uiux 8장). 선택 상태는 색만이 아니라 채움·굵기 형태로도 드러낸다.
 */
export default function PopularPeriodToggle({
  selected,
  onSelect,
  disabled,
}: PopularPeriodToggleProps) {
  return (
    <View
      style={styles.container}
      accessibilityRole="radiogroup"
      accessibilityLabel={EXPLORE_COPY.popular.toggleA11y}
    >
      {PERIODS.map((period) => {
        const isSelected = period === selected;
        return (
          <Pressable
            key={period}
            style={[styles.segment, isSelected && styles.segmentSelected]}
            onPress={() => onSelect(period)}
            disabled={disabled}
            accessibilityRole="radio"
            accessibilityLabel={EXPLORE_COPY.popular.periodLabels[period]}
            accessibilityState={{ checked: isSelected, disabled }}
          >
            <Text style={[styles.label, isSelected && styles.labelSelected]}>
              {EXPLORE_COPY.popular.periodLabels[period]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.md,
    padding: 2,
  },
  segment: {
    // 터치 타깃 최소 44×44pt — 제목 줄이 살짝 높아지더라도 줄이지 않는다(uiux 7)
    minHeight: theme.touchTarget.minHeight,
    minWidth: theme.touchTarget.minWidth,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.radius.md - 2,
  },
  segmentSelected: {
    backgroundColor: theme.color.background,
  },
  label: {
    fontSize: theme.font.size.xs,
    color: theme.color.textSecondary,
  },
  labelSelected: {
    color: theme.color.textPrimary,
    fontWeight: '600',
  },
});
