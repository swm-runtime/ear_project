import { Pressable, StyleSheet, Switch } from 'react-native';

import { theme } from '@/shared/theme';
import { Text } from '@/shared/ui/Typography';

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
      style={({ pressed }) => [styles.row, pressed && !disabled && styles.pressed]}
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
        trackColor={{ false: theme.color.border, true: theme.color.primary }}
        thumbColor={theme.color.onPhoto}
        ios_backgroundColor={theme.color.border}
        style={[styles.switch, isDimmed && styles.switchDimmed]}
        // 행 전체가 하나의 스위치로 읽힌다 — 스위치 자체는 보조 표면이 아니다
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    // 일반 행(SettingsRow)과 같은 높이 — 한 섹션 안에서 행 높이가 다르면 줄이 어긋나 보인다
    minHeight: theme.touchTarget.minHeight + theme.spacing.sm + theme.spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    gap: theme.spacing.md,
  },
  pressed: {
    backgroundColor: theme.color.border,
  },
  label: {
    fontSize: theme.font.size.md,
    color: theme.color.textPrimary,
    flexShrink: 1,
  },
  labelDimmed: {
    color: theme.color.textSecondary,
  },
  /**
   * **RN 의 iOS Switch 는 `alignSelf: 'flex-start'` 를 스타일 밑에 깔고 나온다**(RN 0.86
   * `Libraries/Components/Switch/Switch.js` — `StyleSheet.compose({alignSelf:'flex-start'}, style)`).
   * 그래서 행의 `alignItems: 'center'` 가 스위치에만 먹지 않아 **위여백 8 / 아래여백 20** 으로 6pt 떠 있었다
   * (PM 2026-09-28 03:26 "제목하고 저 토글하고 세로 중앙정렬이 안 맞잖아" — 스크린샷 측정으로 확인).
   * 여기서 덮어야 라벨과 세로 중앙이 맞는다.
   */
  switch: {
    alignSelf: 'center',
  },
  switchDimmed: {
    opacity: 0.5,
  },
});
