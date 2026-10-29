import { Pressable, StyleSheet, View } from 'react-native';

import { theme } from '@/shared/theme';
import ChevronIcon, { chevronTrailingGutter } from '@/shared/ui/ChevronIcon';
import { Text } from '@/shared/ui/Typography';

import type { PlanRowStatusVM, PlanRowVM, SectionState } from '../hooks/useSettingsScreen';
import { SETTINGS_COPY } from '../settings.copy';

const CHEVRON_SIZE = 16;

interface PlanSummaryCardProps {
  state: SectionState<PlanRowVM>;
  onPress: () => void;
  onRetry: () => void;
  isRetrying: boolean;
  /**
   * false 면 이동 없는 정보 카드다 — 결제 UI 가 꺼진 바이너리(KAN-66)에서 초대 코드 지급 줄만 보일 때(KAN-182).
   * 요금제 관리 화면이 없으니 [>] 도 누름도 없다
   */
  isNavigable?: boolean;
}

/**
 * 카드에 그릴 줄들 — 초대 코드 지급 중이면 프로모션 줄을 더한다(KAN-182). **구독 없이(무료) 지급 중이면 프로모션 줄 하나만**
 * 그린다 — "무료 이용 중"과 "Pro 프로모션 이용 중"이 함께 보이면 서로 어긋난다. 구독 중이면 구독 줄 밑에 프로모션 줄
 */
export const planLines = (vm: PlanRowVM): string[] => {
  if (vm.eventLine === null) return [valueText(vm)];
  return vm.kind === 'free' ? [vm.eventLine] : [valueText(vm), vm.eventLine];
};

/** 상태별 본문 — 프로필 플랜 카드와 같은 문구·같은 톤을 쓴다(settings-uiux.md 4.1 표) */
export const valueText = (vm: PlanRowStatusVM): string => {
  switch (vm.kind) {
    case 'free':
      // 체험 여부는 서버의 plan.trial로만 본다 — tier === 'trial' 분기 금지(settings-api.md 4.1)
      return vm.trialLastFreeDate === null
        ? SETTINGS_COPY.plan.free(vm.dailyPlayLimit)
        : SETTINGS_COPY.plan.trial(vm.trialLastFreeDate);
    case 'subscribed':
      if (vm.pendingPlan !== null) {
        return `${vm.planName} · ${SETTINGS_COPY.plan.pendingPlan(vm.pendingPlan.effectiveAt, vm.pendingPlan.planName)}`;
      }
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
 * "요금제 관리" 섹션의 요약 카드 → 요금제 관리 화면(settings.md 4.1).
 * 해지 예약은 중립 톤, 경고색은 결제 문제(유예)에만 쓴다(settings-uiux.md 4.1).
 */
export default function PlanSummaryCard({
  state,
  onPress,
  onRetry,
  isRetrying,
  isNavigable = true,
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
  const lines = planLines(vm);
  const body = (
    <View style={styles.lines}>
      {lines.map((line, index) => (
        <Text
          key={line}
          style={[
            index === 0 ? styles.value : styles.subValue,
            index === 0 && vm.kind === 'grace' && styles.valueDanger,
          ]}
        >
          {line}
        </Text>
      ))}
    </View>
  );
  if (!isNavigable) {
    return (
      <View style={styles.card} accessible accessibilityLabel={lines.join(', ')}>
        {body}
      </View>
    );
  }
  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${lines.join(', ')}, ${SETTINGS_COPY.plan.a11y}`}
    >
      {body}
      {/* 모든 상태가 같은 [>] — 무료의 [구독 알아보기] 알약은 뺐다(PM 2026-10-09 "> 이거로 퉁치자"). 카드 전체가 같은 목적지다 */}
      <View style={styles.chevron} accessibilityElementsHidden importantForAccessibility="no">
        <ChevronIcon direction="right" size={CHEVRON_SIZE} color={theme.color.textSecondary} />
      </View>
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
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    flexWrap: 'wrap',
    // wrap 아래에서는 alignContent 가 줄의 세로 위치를 정한다 — 없으면 flex-start 로 위에 붙는다(SettingsRow 와 같은 이유)
    alignContent: 'center',
  },
  pressed: {
    backgroundColor: theme.color.border,
  },
  // 항목 행의 셰브론과 같은 끝선(SettingsRow 와 같은 이유)
  chevron: {
    marginRight: -chevronTrailingGutter(CHEVRON_SIZE),
  },
  errorCard: {
    justifyContent: 'space-between',
  },
  errorText: {
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
    flexShrink: 1,
  },
  retry: {
    minHeight: theme.touchTarget.minHeight,
    minWidth: theme.touchTarget.minWidth,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.sm,
  },
  retryLabel: {
    fontSize: theme.font.size.sm,
    fontWeight: '600',
    color: theme.color.primary,
  },
  /** 줄 묶음 — [>] 와 나란히 남은 폭을 쓴다 */
  lines: {
    flexShrink: 1,
    gap: 2,
  },
  value: {
    fontSize: theme.font.size.md,
    fontWeight: '600',
    color: theme.color.textPrimary,
    flexShrink: 1,
  },
  /** 프로모션 줄(KAN-182) — 구독 줄 밑의 보조 정보 */
  subValue: {
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
    flexShrink: 1,
  },
  valueDanger: {
    color: theme.color.danger,
  },
  // 버튼 모양 칩 — 공용 알약(pillButton). 여백만 여기서
});
