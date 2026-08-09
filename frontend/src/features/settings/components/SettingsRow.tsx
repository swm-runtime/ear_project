import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/shared/theme';

interface SettingsRowProps {
  label: string;
  /** 항목 우측 보조 값("1.2×"·"3개 선택"·버전 문자열) */
  value?: string | null;
  /** 배지(미인증·업데이트) — 색 + 텍스트. 색만으로 구분하지 않는다(settings-uiux.md 5장) */
  badge?: string | null;
  /** 우측 커스텀 슬롯(버튼 묶음 등) — value·셰브론 대신 그린다 */
  rightSlot?: ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  /** 파괴적·보조 항목(회원 탈퇴)의 낮은 시각 비중(settings-uiux.md 4.1) */
  isSubdued?: boolean;
  a11yLabel?: string;
}

/** 섹션 리스트의 항목 한 줄 — 항목 전체가 탭 영역이다(settings-uiux.md 5장, 44pt) */
export default function SettingsRow({
  label,
  value,
  badge,
  rightSlot,
  onPress,
  disabled = false,
  isSubdued = false,
  a11yLabel,
}: SettingsRowProps) {
  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && onPress !== undefined && styles.pressed]}
      onPress={onPress}
      disabled={disabled || onPress === undefined}
      accessibilityRole={onPress === undefined ? undefined : 'button'}
      accessibilityLabel={a11yLabel ?? label}
      accessibilityState={{ disabled }}
    >
      <Text
        style={[styles.label, isSubdued && styles.labelSubdued, disabled && styles.labelDimmed]}
      >
        {label}
      </Text>
      <View style={styles.right}>
        {badge !== undefined && badge !== null ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badge}</Text>
          </View>
        ) : null}
        {value !== undefined && value !== null ? <Text style={styles.value}>{value}</Text> : null}
        {rightSlot}
        {onPress !== undefined && rightSlot === undefined ? (
          <Text style={styles.chevron} accessibilityElementsHidden importantForAccessibility="no">
            ›
          </Text>
        ) : null}
      </View>
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
    gap: theme.spacing.sm,
    // 동적 텍스트 200%에서 항목명·값이 겹치지 않게 두 줄 배치를 허용한다(settings-uiux.md 7장)
    flexWrap: 'wrap',
    paddingVertical: theme.spacing.sm,
  },
  pressed: {
    backgroundColor: theme.color.surface,
  },
  label: {
    fontSize: theme.font.size.md,
    color: theme.color.textPrimary,
    flexShrink: 1,
  },
  labelSubdued: {
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
  },
  labelDimmed: {
    color: theme.color.textSecondary,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    flexShrink: 1,
  },
  value: {
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
  },
  badge: {
    borderRadius: theme.radius.sm,
    backgroundColor: theme.color.surface,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
  badgeText: {
    fontSize: theme.font.size.xs,
    fontWeight: '600',
    color: theme.color.danger,
  },
  chevron: {
    fontSize: theme.font.size.lg,
    color: theme.color.textSecondary,
  },
});
