import { Pressable, StyleSheet, Text } from 'react-native';

import { theme } from '@/shared/theme';

interface TopicChipProps {
  label: string;
  isSelected: boolean;
  /** 상한을 채운 뒤의 미선택 칩 — 비활성 스타일을 입히되 탭은 받아 토스트를 띄운다(uiux 공통 규칙) */
  isDimmed: boolean;
  /** 비활성 이유의 낭독 힌트 — IM2는 상한 토스트, IM6은 초과 안내 문구를 쓴다(interest-management-uiux.md 7장) */
  dimmedHint?: string;
  onPress: () => void;
}

/**
 * 주제 선택 칩 — 온보딩 1단계와 관심사 관리가 같은 컴포넌트를 쓴다
 * (interest-management-uiux.md 5장 — 같은 목록·같은 순서·같은 칩 동작).
 */
export default function TopicChip({
  label,
  isSelected,
  isDimmed,
  dimmedHint,
  onPress,
}: TopicChipProps) {
  return (
    <Pressable
      style={[styles.chip, isSelected && styles.chipSelected, isDimmed && styles.chipDimmed]}
      onPress={onPress}
      accessibilityRole="checkbox"
      // disabled를 선언하지 않는다 — 상한 도달 칩도 탭을 받아 토스트를 띄우는 것이 규칙인데(uiux 4.1),
      // disabled로 알리면 낭독기 사용자는 "사용 안 함"으로 듣고 아예 누르지 않아 그 안내를 못 받는다.
      // 이유는 아래 hint로 미리 알린다.
      accessibilityState={{ checked: isSelected }}
      accessibilityLabel={label}
      accessibilityHint={isDimmed ? dimmedHint : undefined}
    >
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
    // 칩은 글자 수에 따라 폭이 달라지므로 최소 높이를 고정한다(uiux 7장 — 터치 타깃 44pt)
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
  label: {
    fontSize: theme.font.size.md,
    // 선택 여부와 무관하게 굵기를 고정한다 — 선택 시 굵어지면 칩 폭이 변해
    // flexWrap 그리드 전체가 재배치되고, 연속으로 고르는 동안 표적이 움직인다
    fontWeight: '600',
    color: theme.color.textPrimary,
  },
  labelSelected: {
    color: theme.color.onPrimary,
  },
  labelDimmed: {
    color: theme.color.textSecondary,
  },
});
