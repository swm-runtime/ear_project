import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/shared/theme';
import ChevronIcon, { chevronTrailingGutter } from '@/shared/ui/ChevronIcon';

const CHEVRON_SIZE = 16;

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
  /** 보조 항목(개발계 진단 행 등)의 낮은 시각 비중 — 작은 회색 글자 */
  isSubdued?: boolean;
  /**
   * 파괴적 항목(회원 탈퇴) — **항목명과 같은 크기의 빨강**(PM 2026-09-27 22:45 "회원탈퇴 빨간색으로, 로그아웃이랑
   * 글씨 크기 똑같게"). iOS 설정의 "계정 삭제"와 같은 문법이다. 종전엔 `isSubdued`(작은 회색)였다 —
   * `changes/pending/settings-withdraw-destructive.md`
   */
  isDestructive?: boolean;
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
  isDestructive = false,
  a11yLabel,
}: SettingsRowProps) {
  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && onPress !== undefined && styles.pressed]}
      onPress={onPress}
      // 값만 표시하는 행도 우측 업데이트 버튼은 조작할 수 있어야 한다.
      disabled={disabled}
      focusable={onPress !== undefined && !disabled}
      accessibilityRole={onPress === undefined ? undefined : 'button'}
      accessibilityLabel={a11yLabel ?? label}
      accessibilityState={{ disabled }}
    >
      <Text
        style={[
          styles.label,
          isSubdued && styles.labelSubdued,
          isDestructive && styles.labelDestructive,
          disabled && styles.labelDimmed,
        ]}
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
          <View style={styles.chevron} accessibilityElementsHidden importantForAccessibility="no">
            <ChevronIcon direction="right" size={CHEVRON_SIZE} color={theme.color.textSecondary} />
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: theme.touchTarget.minHeight + theme.spacing.sm + theme.spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    gap: theme.spacing.sm,
    // 동적 텍스트 200%에서 항목명·값이 겹치지 않게 두 줄 배치를 허용한다(settings-uiux.md 7장)
    flexWrap: 'wrap',
    // wrap 이 켜지면 줄의 세로 위치는 alignItems 가 아니라 alignContent 가 정한다. RN 기본값이 flex-start 라서
    // 내용이 minHeight 보다 짧은 행은 위에 붙어 보였다(PM 2026-09-28 02:40 "각 항목들이 위쪽에 정렬돼있다")
    alignContent: 'center',
    paddingVertical: theme.spacing.sm,
  },
  pressed: {
    backgroundColor: theme.color.border,
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
  /** 파괴적 항목 — 크기는 항목명 그대로, 색만 빨강(design.md §1 의미색) */
  labelDestructive: {
    color: theme.color.danger,
  },
  labelDimmed: {
    color: theme.color.textSecondary,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    flexShrink: 1,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    marginLeft: 'auto',
    maxWidth: '100%',
  },
  // 셰브론의 빈 여백만큼 당겨 **보이는 끝**을 줄의 끝선(16)에 세운다 — 토글 행의 스위치 끝과 같은 선이 된다
  chevron: {
    marginRight: -chevronTrailingGutter(CHEVRON_SIZE),
  },
  // 우측 값은 보조색으로 낮추고 숫자 폭을 고정한다.
  value: {
    fontSize: theme.font.size.sm,
    fontVariant: ['tabular-nums'],
    color: theme.color.textSecondary,
    flexShrink: 1,
    textAlign: 'right',
  },
  badge: {
    borderRadius: theme.radius.full,
    borderCurve: 'continuous',
    backgroundColor: theme.color.background,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
  badgeText: {
    fontSize: theme.font.size.xs,
    fontWeight: '600',
    color: theme.color.danger,
  },
});
