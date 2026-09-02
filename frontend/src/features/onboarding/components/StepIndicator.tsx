import { StyleSheet, Text, View } from 'react-native';

import { theme } from '@/shared/theme';

/** 인디케이터에 들어가는 것은 입력 단계뿐 — 항상 3단계다(onboarding.md 4 단계 구성) */
const TOTAL_STEPS = 3;

interface StepIndicatorProps {
  current: 1 | 2 | 3;
}

/**
 * O1–O8 전용 스텝 인디케이터. 완료 대기·완료·알림 화면에는 그리지 않는다(onboarding-uiux.md 5).
 * 세그먼트 막대는 장식으로 두고 "3단계 중 N단계" 텍스트로 읽히게 한다(onboarding-uiux.md 7).
 */
export default function StepIndicator({ current }: StepIndicatorProps) {
  return (
    <View
      style={styles.container}
      accessibilityLabel={`${TOTAL_STEPS}단계 중 ${current}단계`}
      accessibilityRole="text"
    >
      <View style={styles.segments} accessibilityElementsHidden importantForAccessibility="no">
        {Array.from({ length: TOTAL_STEPS }, (_, index) => (
          <View
            key={index}
            style={[styles.segment, index < current && styles.segmentActive]}
          />
        ))}
      </View>
      <Text style={styles.label} accessibilityElementsHidden importantForAccessibility="no">
        {current}/{TOTAL_STEPS}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  segments: {
    flexDirection: 'row',
    flex: 1,
    gap: theme.spacing.xs,
  },
  segment: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.color.border,
  },
  segmentActive: {
    backgroundColor: theme.color.primary,
  },
  label: {
    fontSize: theme.font.size.sm,
    fontWeight: '600',
    color: theme.color.textSecondary,
  },
});
