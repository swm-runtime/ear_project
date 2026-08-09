import { Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/shared/theme';

import type { PlanRowVM, SectionState } from '../hooks/useSettingsScreen';
import { SETTINGS_COPY } from '../settings.copy';

interface PlanSummaryCardProps {
  state: SectionState<PlanRowVM>;
  onPress: () => void;
  onRetry: () => void;
  isRetrying: boolean;
}

/** 상태별 본문 — 프로필 플랜 카드와 같은 문구·같은 톤을 쓴다(settings-uiux.md 4.1 표) */
const valueText = (vm: PlanRowVM): string => {
  switch (vm.kind) {
    case 'free':
      return SETTINGS_COPY.plan.free(vm.dailyPlayLimit);
    case 'subscribed':
      return vm.renewsAt === null
        ? vm.planName
        : `${vm.planName} · ${SETTINGS_COPY.plan.renewsAt(vm.renewsAt)}`;
    case 'cancelScheduled':
      return vm.expiresAt === null
        ? vm.planName
        : `${vm.planName} · ${SETTINGS_COPY.plan.cancelScheduled(vm.expiresAt)}`;
    case 'grace':
      return `${vm.planName} · ${SETTINGS_COPY.plan.paymentIssue}`;
  }
};

/**
 * 구독 섹션의 요약 카드 → 구독 관리(settings.md 4.1).
 * 해지 예약은 중립 톤, 경고색은 결제 문제(유예)에만 쓴다(settings-uiux.md 4.1).
 */
export default function PlanSummaryCard({
  state,
  onPress,
  onRetry,
  isRetrying,
}: PlanSummaryCardProps) {
  if (state.kind === 'error') {
    return (
      <View style={[styles.card, styles.errorCard]}>
        <Text style={styles.errorText}>{SETTINGS_COPY.summaryError}</Text>
        <Pressable
          style={styles.retry}
          onPress={onRetry}
          disabled={isRetrying}
          accessibilityRole="button"
          accessibilityLabel={SETTINGS_COPY.retry}
          accessibilityState={{ disabled: isRetrying }}
        >
          <Text style={styles.retryLabel}>{SETTINGS_COPY.retry}</Text>
        </Pressable>
      </View>
    );
  }

  const vm = state.data;
  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${valueText(vm)}, ${SETTINGS_COPY.plan.a11y}`}
    >
      <Text style={[styles.value, vm.kind === 'grace' && styles.valueDanger]}>{valueText(vm)}</Text>
      {vm.kind === 'free' ? (
        // 진입 유도 칩 — 카드 탭과 같은 목적지의 시각 강조일 뿐이다(settings.md 5장 무료 변형)
        <View style={styles.freeAction}>
          <Text style={styles.freeActionText}>{SETTINGS_COPY.plan.freeAction}</Text>
        </View>
      ) : (
        <Text style={styles.chevron} accessibilityElementsHidden importantForAccessibility="no">
          ›
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: theme.touchTarget.minHeight + theme.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
    marginHorizontal: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.md,
    backgroundColor: theme.color.surface,
  },
  pressed: {
    opacity: 0.7,
  },
  errorCard: {
    justifyContent: 'space-between',
  },
  errorText: {
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
  },
  retry: {
    minHeight: theme.touchTarget.minHeight,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.sm,
  },
  retryLabel: {
    fontSize: theme.font.size.sm,
    fontWeight: '600',
    color: theme.color.primary,
  },
  value: {
    fontSize: theme.font.size.md,
    fontWeight: '600',
    color: theme.color.textPrimary,
    flexShrink: 1,
  },
  valueDanger: {
    color: theme.color.danger,
  },
  freeAction: {
    borderRadius: theme.radius.sm,
    backgroundColor: theme.color.primary,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
  freeActionText: {
    fontSize: theme.font.size.sm,
    fontWeight: '600',
    color: theme.color.onPrimary,
  },
  chevron: {
    fontSize: theme.font.size.lg,
    color: theme.color.textSecondary,
  },
});
