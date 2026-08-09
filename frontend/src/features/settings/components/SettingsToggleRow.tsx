import { Pressable, StyleSheet, Switch, Text } from 'react-native';

import { theme } from '@/shared/theme';

interface SettingsToggleRowProps {
  label: string;
  value: boolean;
  /** 새 값(절대값)을 넘긴다 — 게이트 판정(OS 권한 등)은 호출부 몫이다 */
  onToggle: (next: boolean) => void;
  /** OS 권한이 없는 동안의 비활성 톤 — 조작은 가능하다(무반응 비활성 금지, settings-uiux.md 4.3) */
  isDimmed?: boolean;
  disabled?: boolean;
}

/**
 * 토글 항목 — 낙관적 전환, 실패 원복은 호출부가 한다(settings.md 4.2).
 * 항목명과 토글을 하나의 포커스로 묶는다("이어 PICK 알림, 켜짐" — settings-uiux.md 7장).
 */
export default function SettingsToggleRow({
  label,
  value,
  onToggle,
  isDimmed = false,
  disabled = false,
}: SettingsToggleRowProps) {
  const handlePress = (): void => {
    if (disabled) return;
    onToggle(!value);
  };

  return (
    <Pressable
      style={styles.row}
      onPress={handlePress}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value, disabled }}
    >
      <Text style={[styles.label, disabled && styles.labelDimmed]}>{label}</Text>
      <Switch
        value={value}
        onValueChange={handlePress}
        disabled={disabled}
        style={isDimmed && styles.switchDimmed}
        // 행 전체가 하나의 스위치로 읽힌다 — 스위치 자체는 보조 표면이 아니다
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: theme.touchTarget.minHeight + theme.spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  label: {
    fontSize: theme.font.size.md,
    color: theme.color.textPrimary,
    flexShrink: 1,
  },
  labelDimmed: {
    color: theme.color.textSecondary,
  },
  switchDimmed: {
    opacity: 0.5,
  },
});
