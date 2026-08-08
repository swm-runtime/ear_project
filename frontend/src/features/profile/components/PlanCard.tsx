import { StyleSheet, Text, View } from 'react-native';

import { theme } from '@/shared/theme';

import type { PlanCardVM, SectionState } from '../hooks/useProfileScreen';
import { PROFILE_COPY } from '../profile.copy';
import ProfileCard from './ProfileCard';

interface PlanCardProps {
  state: SectionState<PlanCardVM>;
  onPress: () => void;
  onRetry: () => void;
  isRetrying: boolean;
}

/** 상태별 본문 문구 — 서버가 정규화한 4분기를 그대로 그린다(재판정 금지, profile-uiux.md 4.4) */
const valueText = (vm: PlanCardVM): string => {
  switch (vm.kind) {
    case 'free':
      return PROFILE_COPY.plan.free(vm.dailyPlayLimit);
    case 'subscribed':
      return vm.renewsAt === null
        ? vm.planName
        : `${vm.planName} · ${PROFILE_COPY.plan.renewsAt(vm.renewsAt)}`;
    case 'cancelScheduled':
      return vm.expiresAt === null
        ? vm.planName
        : `${vm.planName} · ${PROFILE_COPY.plan.cancelScheduled(vm.expiresAt)}`;
    case 'grace':
      return `${vm.planName} · ${PROFILE_COPY.plan.paymentIssue}`;
  }
};

/**
 * [현재 플랜] 카드 — 구독 관리 진입점(profile-uiux.md 4.1·4.2·4.4).
 * [해지]·[요금제 변경] 버튼을 두지 않는다 — 결제 조작의 진입점은 구독 관리 하나다(8장 금지).
 * 해지 예약은 중립 톤, 경고색은 결제 문제(사용자가 조치해야 하는 상태)에만 쓴다.
 */
export default function PlanCard({ state, onPress, onRetry, isRetrying }: PlanCardProps) {
  const hasError = state.kind === 'error';
  return (
    <ProfileCard
      label={PROFILE_COPY.cardLabels.plan}
      onPress={onPress}
      a11yLabel={
        hasError
          ? null
          : PROFILE_COPY.cardA11y(
              PROFILE_COPY.cardLabels.plan,
              valueText(state.data),
              PROFILE_COPY.destinations.plan,
            )
      }
      hasError={hasError}
      onRetry={onRetry}
      isRetrying={isRetrying}
    >
      {state.kind === 'data' ? (
        <View style={styles.content}>
          <Text style={[styles.value, state.data.kind === 'grace' && styles.valueDanger]}>
            {valueText(state.data)}
          </Text>
          {state.data.kind === 'free' ? (
            // 진입 유도 칩 — 카드 탭과 같은 목적지의 시각 강조일 뿐, 별도 결제 시작이 아니다(uiux 4.2)
            <View style={styles.freeAction}>
              <Text style={styles.freeActionText}>{PROFILE_COPY.plan.freeAction}</Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </ProfileCard>
  );
}

const styles = StyleSheet.create({
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
    flexWrap: 'wrap',
  },
  value: {
    fontSize: theme.font.size.md,
    color: theme.color.textPrimary,
    flexShrink: 1,
  },
  valueDanger: {
    color: theme.color.danger,
  },
  freeAction: {
    backgroundColor: theme.color.primary,
    borderRadius: theme.radius.sm,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
  freeActionText: {
    fontSize: theme.font.size.sm,
    fontWeight: '600',
    color: theme.color.onPrimary,
  },
});
