import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/shared/theme';

import { PROFILE_COPY } from '../profile.copy';

interface ProfileCardProps {
  label: string;
  /** 카드가 에러여도 내비게이션은 동작한다(profile-uiux.md 4.9) — 하위 화면은 자기 데이터를 직접 조회한다 */
  onPress: () => void;
  /**
   * 카드 전체를 한 문장으로 읽는 라벨(profile-uiux.md 7장). null이면 자식이 개별 포커스를
   * 갖는다 — 버튼이 여러 개인 이메일 카드의 예외. 에러 상태에서는 [다시 시도]가 개별 포커스를
   * 가져야 하므로 무시된다
   */
  a11yLabel: string | null;
  hasError: boolean;
  onRetry: () => void;
  isRetrying: boolean;
  children: ReactNode;
}

/**
 * 요약 카드 셸(profile-uiux.md 5장) — 카드 전체가 탭 영역 + 우측 셰브론.
 * 카드별 독립 에러 상태를 가진다. 인라인 편집·토글·저장 버튼은 두지 않는다(8장 금지).
 */
export default function ProfileCard({
  label,
  onPress,
  a11yLabel,
  hasError,
  onRetry,
  isRetrying,
  children,
}: ProfileCardProps) {
  const readsAsSingleUnit = a11yLabel !== null && !hasError;
  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={onPress}
      accessible={readsAsSingleUnit}
      accessibilityRole={readsAsSingleUnit ? 'button' : undefined}
      accessibilityLabel={readsAsSingleUnit ? a11yLabel : undefined}
    >
      <View style={styles.body}>
        <Text style={styles.label}>{label}</Text>
        {hasError ? (
          <View style={styles.errorRow}>
            <Text style={styles.errorText}>{PROFILE_COPY.cardError}</Text>
            <Pressable
              style={styles.retryButton}
              onPress={onRetry}
              disabled={isRetrying}
              accessibilityRole="button"
              accessibilityLabel={PROFILE_COPY.retry}
              accessibilityState={{ disabled: isRetrying }}
            >
              <Text style={styles.retryText}>{PROFILE_COPY.retry}</Text>
            </Pressable>
          </View>
        ) : (
          children
        )}
      </View>
      {/* 이동 가능 표시 — 장식이다(카드 라벨이 목적지를 읽는다) */}
      <Text style={styles.chevron} accessibilityElementsHidden importantForAccessibility="no">
        ›
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    marginHorizontal: theme.spacing.md,
    // 터치 타깃 최소 44pt(profile-uiux.md 7장)
    minHeight: theme.touchTarget.minHeight,
  },
  cardPressed: {
    opacity: 0.7,
  },
  body: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  label: {
    fontSize: theme.font.size.xs,
    color: theme.color.textSecondary,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
    // 동적 텍스트 200%에서 줄바꿈을 허용한다 — 고정 높이를 두지 않는다(convention.md 3.4)
    flexWrap: 'wrap',
  },
  errorText: {
    fontSize: theme.font.size.md,
    color: theme.color.textSecondary,
  },
  retryButton: {
    minHeight: theme.touchTarget.minHeight,
    minWidth: theme.touchTarget.minWidth,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.sm,
  },
  retryText: {
    fontSize: theme.font.size.sm,
    fontWeight: '600',
    color: theme.color.primary,
  },
  chevron: {
    fontSize: theme.font.size.lg,
    color: theme.color.textSecondary,
    marginLeft: theme.spacing.sm,
  },
});
