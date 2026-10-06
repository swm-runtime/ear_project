import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { theme } from '@/shared/theme';
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

const featureLine = (plan: Plan): string =>
  [
    SUBSCRIPTION_COPY.plans.playLimit(plan.entitlements.dailyPlayLimit),
    SUBSCRIPTION_COPY.plans.dripCount(plan.entitlements.dailyDripCount),
    SUBSCRIPTION_COPY.plans.ads(plan.entitlements.adsEnabled),
  ].join(' · ');

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
}

function PlanCard({ card, disabled, isPurchasing, onPurchase }: PlanCardProps) {
  const { plan } = card;
  const price = priceText(card);
  const features = featureLine(plan);
  const isCurrent = plan.action === 'current';
  const actionLabel =
    plan.action === 'purchase' || plan.action === 'upgrade' || plan.action === 'downgrade'
      ? ACTION_LABEL[plan.action]
      : null;

  return (
    <View
      style={[styles.card, isCurrent ? styles.cardCurrent : null]}
      accessible={plan.action === 'none' || isCurrent}
      accessibilityLabel={SUBSCRIPTION_COPY.plans.cardA11y(plan.name, price ?? '', features)}
    >
      <View style={styles.cardHeader}>
        <Text style={styles.planName}>{plan.name}</Text>
        {price !== null ? <Text style={styles.price}>{price}</Text> : null}
      </View>
      {plan.description ? <Text style={styles.description}>{plan.description}</Text> : null}
      <Text style={styles.features}>{features}</Text>

      {isCurrent ? (
        // "이용 중"은 버튼이 아니라 상태 표시다 — 색만이 아니라 글자로 밝힌다
        <View style={styles.currentBadge}>
          <Text style={styles.currentBadgeLabel}>{SUBSCRIPTION_COPY.plans.current}</Text>
        </View>
      ) : actionLabel === null ? null : (
        <>
          <Pressable
            style={({ pressed }) => [
              styles.button,
              plan.action === 'downgrade' ? styles.buttonSecondary : null,
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
                style={[
                  styles.buttonLabel,
                  plan.action === 'downgrade' ? styles.buttonLabelSecondary : null,
                ]}
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
}

/**
 * 요금제 비교 카드(SB2 · 페이월) — 가격·일 청취 편수·이어 PICK 편수·광고(paywall.md 5장 "바텀시트 구성").
 * 가격은 스토어 현지 가격만 그린다. 조회 실패면 카드 대신 "요금제를 불러올 수 없어요" + [다시 시도].
 */
export default function PlanList({
  state,
  isBusy,
  purchasingPlanId,
  onPurchase,
  onRetry,
  isRetrying,
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
  // 이용 중 — 테두리로 구분하고 "이용 중" 글자를 함께 둔다(색만으로 구분하지 않는다)
  cardCurrent: {
    borderWidth: 1.5,
    borderColor: theme.color.primary,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
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
  features: {
    fontSize: theme.font.size.xs,
    color: theme.color.textSecondary,
  },
  button: {
    marginTop: theme.spacing.sm,
    minHeight: theme.touchTarget.minHeight,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.md,
    borderCurve: 'continuous',
    backgroundColor: theme.color.primary,
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
  buttonLabel: {
    fontSize: theme.font.size.md,
    fontWeight: '600',
    color: theme.color.onPrimary,
  },
  buttonLabelSecondary: {
    color: theme.color.textPrimary,
  },
  hint: {
    fontSize: theme.font.size.xs,
    color: theme.color.textSecondary,
    textAlign: 'center',
  },
  currentBadge: {
    alignSelf: 'flex-start',
    marginTop: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 2,
    borderRadius: theme.radius.full,
    backgroundColor: theme.color.primary,
  },
  currentBadgeLabel: {
    fontSize: theme.font.size.xs,
    fontWeight: '700',
    color: theme.color.onPrimary,
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
