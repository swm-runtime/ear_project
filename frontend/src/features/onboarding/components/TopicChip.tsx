import { Pressable, StyleSheet, Text } from 'react-native';

import { theme } from '@/shared/theme';

import { ONBOARDING_COPY } from '../onboarding.copy';

interface TopicChipProps {
  label: string;
  isSelected: boolean;
  /** 3개를 채운 뒤의 미선택 칩 — 비활성 스타일을 입히되 탭은 받아 토스트를 띄운다(onboarding-uiux.md 4.1) */
  isDimmed: boolean;
  onPress: () => void;
}

export default function TopicChip({ label, isSelected, isDimmed, onPress }: TopicChipProps) {
  return (
    <Pressable
      style={[styles.chip, isSelected && styles.chipSelected, isDimmed && styles.chipDimmed]}
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: isSelected, disabled: isDimmed }}
      accessibilityLabel={label}
      accessibilityHint={isDimmed ? ONBOARDING_COPY.topic.limitToast : undefined}
    >
      {/* 색만으로 상태를 구분하지 않는다 — 선택 시 체크 마크를 함께 그린다(onboarding-uiux.md 7) */}
      {isSelected ? <Text style={styles.check}>✓</Text> : null}
      <Text
        style={[styles.label, isSelected && styles.labelSelected, isDimmed && styles.labelDimmed]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    // 칩은 글자 수에 따라 폭이 달라지므로 최소 높이를 고정한다(onboarding-uiux.md 7)
    minHeight: theme.touchTarget.minHeight,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.lg + theme.radius.sm,
    borderWidth: 1.5,
    borderColor: theme.color.border,
    backgroundColor: theme.color.background,
  },
  chipSelected: {
    borderColor: theme.color.primary,
    backgroundColor: theme.color.primary,
  },
  chipDimmed: {
    backgroundColor: theme.color.surface,
  },
  check: {
    fontSize: theme.font.size.sm,
    fontWeight: '700',
    color: theme.color.onPrimary,
  },
  label: {
    fontSize: theme.font.size.md,
    color: theme.color.textPrimary,
  },
  labelSelected: {
    color: theme.color.onPrimary,
    fontWeight: '600',
  },
  labelDimmed: {
    color: theme.color.textSecondary,
  },
});
