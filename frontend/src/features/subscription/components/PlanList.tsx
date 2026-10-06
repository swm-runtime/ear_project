import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { theme } from '@/shared/theme';
import { pillButton } from '@/shared/ui/pill-button.styles';
import { SkeletonBlock, SkeletonGroup } from '@/shared/ui/Skeleton';
import { Text } from '@/shared/ui/Typography';

import type { PlanCardVM } from '../hooks/plan-catalog';
import type { PlanCatalogState } from '../hooks/usePlanCatalog';
import { SUBSCRIPTION_COPY } from '../subscription.copy';
import type { Plan, PlanAction } from '../subscription.types';

const SKELETON_CARD_COUNT = 3;
const SKELETON_CARD_HEIGHT = 112;

/** 버튼 문구 — action 은 서버 판정이다. 클라이언트가 티어 순서를 비교하지 않는다(subscription-api.md 4.1) */
const ACTION_LABEL: Record<Exclude<PlanAction, 'none' | 'current'>, string> = {
  purchase: SUBSCRIPTION_COPY.plans.purchase,
  upgrade: SUBSCRIPTION_COPY.plans.upgrade,
  downgrade: SUBSCRIPTION_COPY.plans.downgrade,
};

const priceText = (card: PlanCardVM): string | null => {
  if (card.priceLabel === null) return null;
  return card.plan.storeProductId === null
    ? card.priceLabel
    : SUBSCRIPTION_COPY.plans.perMonth(card.priceLabel);
};

interface PlanCardProps {
  card: PlanCardVM;
  disabled: boolean;
  isPurchasing: boolean;
  onPurchase: (plan: Plan) => void;
  /** 이용 중 카드에만 — 현재 구독 정보·스토어 버튼(CurrentSubscriptionDetail) */
  currentDetail?: ReactNode;
}

function PlanCard({ card, disabled, isPurchasing, onPurchase, currentDetail }: PlanCardProps) {
  const { plan } = card;
  const price = priceText(card);
  const isCurrent = plan.action === 'current';
  const actionLabel =
    plan.action === 'purchase' || plan.action === 'upgrade' || plan.action === 'downgrade'
      ? ACTION_LABEL[plan.action]
      : null;

  return (
    <View style={styles.card}>
      {/* 요약(이름·가격·설명·이용 중)은 한 문장으로 읽는다 — 버튼·구독 정보는 따로 포커스를 받는다 */}
      <View
        style={styles.summary}
        accessible
        accessibilityLabel={SUBSCRIPTION_COPY.plans.cardA11y(
          plan.name,
          price ?? '',
          plan.description,
          isCurrent,
        )}
      >
        <View style={styles.cardHeader}>
          <Text style={[styles.planName, isCurrent ? styles.textMuted : null]}>{plan.name}</Text>
          {price !== null ? (
            <Text style={[styles.price, isCurrent ? styles.textMuted : null]}>{price}</Text>
          ) : null}
        </View>
        {plan.description ? (
          <Text style={[styles.description, isCurrent ? styles.descriptionMuted : null]}>
            {plan.description}
          </Text>
        ) : null}
        {isCurrent ? (
          // "이용 중"은 버튼이 아니라 상태 표시다 — 버튼 자리의 회색 알약. 색만이 아니라 글자로 밝힌다(누를 수 없다)
          <View style={[pillButton.base, styles.button, styles.currentPill]}>
            <Text style={[pillButton.secondaryLabel, styles.currentPillLabel]}>
              {SUBSCRIPTION_COPY.plans.current}
            </Text>
          </View>
        ) : null}
      </View>

      {isCurrent ? (
        currentDetail
      ) : actionLabel === null ? null : (
        <>
          <Pressable
            style={({ pressed }) => [
              pillButton.base,
              plan.action === 'downgrade' ? styles.buttonSecondary : pillButton.primary,
              styles.button,
              pressed ? styles.buttonPressed : null,
              disabled ? styles.buttonDisabled : null,
            ]}
            onPress={() => onPurchase(plan)}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={`${plan.name} ${actionLabel}`}
            accessibilityState={{ disabled, busy: isPurchasing }}
          >
            {isPurchasing ? (
              <ActivityIndicator
                color={
                  plan.action === 'downgrade' ? theme.color.textPrimary : theme.color.onPrimary
                }
              />
            ) : (
              <Text
                style={
                  plan.action === 'downgrade' ? pillButton.secondaryLabel : pillButton.primaryLabel
                }
              >
                {actionLabel}
              </Text>
            )}
          </Pressable>
          {plan.action === 'downgrade' ? (
            <Text style={styles.hint}>{SUBSCRIPTION_COPY.plans.downgradeHint}</Text>
          ) : null}
        </>
      )}
    </View>
  );
}

interface PlanListProps {
  state: PlanCatalogState;
  /** 결제·복원 진행 중 — 전체 버튼 비활성(paywall.md 5장) */
  isBusy: boolean;
  /** 결제 시트를 연 요금제 — 그 버튼에만 스피너를 둔다 */
  purchasingPlanId: string | null;
  onPurchase: (plan: Plan) => void;
  onRetry: () => void;
  isRetrying: boolean;
  /**
   * 이용 중(`action = current`) 카드 안에 넣을 현재 구독 정보(요금제 관리 화면만 — 페이월은 넘기지 않는다).
   * 서버가 `current` 카드를 주지 않으면 그려지지 않는다 — 그때는 화면이 목록 밑에 따로 그린다
   */
  currentDetail?: ReactNode;
}

/**
 * 요금제 비교 카드(SB2 · 페이월) — 이름 · 가격 · 설명 한 줄 · 버튼(KAN-146 — 기능 줄 제거). 이름·설명은 서버 값 그대로다
 * (티어명 하드코딩 금지). 이용 중 카드는 회색 + [이용 중] 회색 알약. 가격은 스토어 현지 가격만 그린다.
 * 조회 실패면 카드 대신 "요금제를 불러올 수 없어요" + [다시 시도].
 */
export default function PlanList({
  state,
  isBusy,
  purchasingPlanId,
  onPurchase,
  onRetry,
  isRetrying,
  currentDetail,
}: PlanListProps) {
  if (state.kind === 'loading') {
    return (
      // 실제 카드와 같은 높이·모서리 — 로딩이 끝날 때 목록이 튀지 않게
      <SkeletonGroup style={styles.list} accessibilityLabel={SUBSCRIPTION_COPY.loadingA11y}>
        {Array.from({ length: SKELETON_CARD_COUNT }, (_, index) => (
          <SkeletonBlock key={index} height={SKELETON_CARD_HEIGHT} radius="lg" />
        ))}
      </SkeletonGroup>
    );
  }

  if (state.kind === 'error') {
    return (
      <View style={styles.errorBox}>
        <Text style={styles.errorText}>{SUBSCRIPTION_COPY.error.catalog}</Text>
        <Pressable
          style={styles.retry}
          onPress={onRetry}
          disabled={isRetrying}
          accessibilityRole="button"
          accessibilityLabel={SUBSCRIPTION_COPY.error.retry}
          accessibilityState={{ disabled: isRetrying }}
        >
          <Text style={styles.retryLabel}>{SUBSCRIPTION_COPY.error.retry}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.list}>
      {state.cards.map((card) => (
        <PlanCard
          key={card.plan.planId}
          card={card}
          disabled={isBusy}
          isPurchasing={purchasingPlanId === card.plan.planId}
          onPurchase={onPurchase}
          currentDetail={currentDetail}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: theme.spacing.sm,
  },
  card: {
    padding: theme.spacing.md,
    gap: theme.spacing.xs,
    borderRadius: theme.radius.lg,
    borderCurve: 'continuous',
    backgroundColor: theme.color.surface,
  },
  summary: {
    gap: theme.spacing.xs,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  planName: {
    flexShrink: 1,
    fontSize: theme.font.size.md,
    fontWeight: '700',
    color: theme.color.textPrimary,
  },
  price: {
    fontSize: theme.font.size.md,
    fontWeight: '700',
    color: theme.color.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  description: {
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
  },
  // 이용 중 카드 — 강조 테두리 없이 글자를 회색 단계로 내린다(KAN-146 PM 2026-10-06). 상태는 [이용 중] 글자가 말한다
  textMuted: {
    color: theme.color.textMuted,
  },
  descriptionMuted: {
    color: theme.color.textMutedSecondary,
  },
  // 크기만 — 모양·색은 공용 알약(pillButton)
  button: {
    marginTop: theme.spacing.sm,
    minHeight: theme.touchTarget.minHeight,
  },
  // 변경(다운그레이드) — 보조 버튼. 주 버튼(검정)과 위계를 가른다
  buttonSecondary: {
    backgroundColor: theme.color.background,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.color.border,
  },
  buttonPressed: {
    opacity: 0.8,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  // [이용 중] — 버튼 자리의 회색 알약(체크 없음, 누를 수 없음)
  currentPill: {
    backgroundColor: theme.color.fillMuted,
  },
  currentPillLabel: {
    color: theme.color.textMuted,
  },
  hint: {
    fontSize: theme.font.size.xs,
    color: theme.color.textSecondary,
    textAlign: 'center',
  },
  errorBox: {
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingVertical: theme.spacing.md,
  },
  errorText: {
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
    textAlign: 'center',
  },
  retry: {
    minHeight: theme.touchTarget.minHeight,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.md,
  },
  retryLabel: {
    fontSize: theme.font.size.sm,
    fontWeight: '600',
    color: theme.color.primary,
  },
});
