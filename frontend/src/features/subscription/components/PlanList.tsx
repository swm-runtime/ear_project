import { useState, type ReactNode } from 'react';
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

/** 라디오 원 — iOS 선택 목록 크기. 안 점은 선택일 때만 */
const RADIO_SIZE = 22;
const RADIO_DOT_SIZE = 10;
/** 라디오 칸과 이름 사이 */
const RADIO_GAP = 10;
/** 선택 테두리 — 고르지 않은 카드·이용 중 카드에도 투명으로 깔아 안쪽 시작점이 선택에 따라 움직이지 않게 한다 */
const SELECTED_BORDER_WIDTH = 2;

type SelectableAction = Exclude<PlanAction, 'none' | 'current'>;
/**
 * 목록 아래 버튼이 하는 일 — 서버 action 에 더해 `current`: 이용 중 카드를 고르면 화면이 준 일(해지 예약이면 "구독 다시 시작",
 * 결제 문제면 "결제 수단 확인" — 스토어 구독 관리). 카드 안에는 버튼을 두지 않는다(PM 2026-10-08)
 */
type CtaKind = SelectableAction | 'current';

/** 이용 중 카드를 골랐을 때 아래 버튼 — 화면이 서버 구독 상태로 정한다 */
export interface CurrentPlanCta {
  label: string;
  onPress: () => void;
}

/**
 * 고를 수 있는 카드 — action 은 서버 판정이다. 클라이언트가 티어 순서를 비교하지 않는다(subscription-api.md 4.1).
 * `cancel`(유료 구독자의 무료 요금제)은 해지 경로를 받은 화면(요금제 관리)에서만 고를 수 있다 — 페이월에서는 고를 수 없다
 */
const isSelectableAction = (action: PlanAction, canCancel: boolean): action is SelectableAction =>
  action === 'purchase' ||
  action === 'upgrade' ||
  action === 'downgrade' ||
  (action === 'cancel' && canCancel);

const priceText = (card: PlanCardVM): string | null => {
  if (card.priceLabel === null) return null;
  return card.plan.storeProductId === null
    ? card.priceLabel
    : SUBSCRIPTION_COPY.plans.perMonth(card.priceLabel);
};

interface PlanCardProps {
  card: PlanCardVM;
  /**
   * 고를 수 있는 카드에만. 없어도 라디오는 그린다 — 흐린 빈 원(누를 수 없음). 칸만 비우면 그 카드만 라디오가 "사라진" 것처럼
   * 보였다(PM 2026-10-08)
   */
  onSelect?: () => void;
  isSelected: boolean;
  disabled: boolean;
  /** 이용 중 카드에만 — 현재 구독 정보·스토어 버튼(CurrentSubscriptionDetail) */
  currentDetail?: ReactNode;
}

function PlanCard({ card, onSelect, isSelected, disabled, currentDetail }: PlanCardProps) {
  const { plan } = card;
  const price = priceText(card);
  const isCurrent = plan.action === 'current';
  const isSelectable = onSelect !== undefined;
  const a11yLabel = SUBSCRIPTION_COPY.plans.cardA11y(
    plan.name,
    price ?? '',
    plan.description,
    isCurrent,
  );

  const summary = (
    <>
      <View style={styles.cardHeader}>
        <View style={styles.radioSlot}>
          <View
            style={[
              styles.radio,
              isSelected ? styles.radioSelected : null,
              isSelectable ? null : styles.radioDisabled,
            ]}
          >
            {isSelected ? <View style={styles.radioDot} /> : null}
          </View>
        </View>
        <View style={styles.nameGroup}>
          <Text style={[styles.planName, isCurrent ? styles.textMuted : null]}>{plan.name}</Text>
          {isCurrent ? (
            // "이용 중"은 버튼이 아니라 상태 표시다 — 이름 옆 작은 배지. 색만이 아니라 글자로 밝힌다
            <View style={styles.currentBadge}>
              <Text style={styles.currentBadgeLabel}>{SUBSCRIPTION_COPY.plans.current}</Text>
            </View>
          ) : null}
        </View>
        {price !== null ? (
          <Text style={[styles.price, isCurrent ? styles.textMuted : null]}>{price}</Text>
        ) : null}
      </View>
      {plan.description ? (
        <Text
          style={[styles.description, styles.indent, isCurrent ? styles.descriptionMuted : null]}
        >
          {plan.description}
        </Text>
      ) : null}
    </>
  );

  if (isSelectable) {
    // 카드 전체가 라디오 하나 — 누르면 고르기만 하고, 결제는 목록 아래 버튼이 한다
    return (
      <Pressable
        style={[styles.card, isSelected ? styles.cardSelected : null]}
        onPress={onSelect}
        disabled={disabled}
        accessibilityRole="radio"
        accessibilityLabel={a11yLabel}
        accessibilityState={{ selected: isSelected, disabled }}
      >
        {summary}
      </Pressable>
    );
  }

  return (
    <View style={styles.card}>
      {/* 요약(이름·가격·설명·이용 중)은 한 문장으로 읽는다 — 구독 정보의 버튼은 따로 포커스를 받는다 */}
      <View style={styles.summary} accessible accessibilityLabel={a11yLabel}>
        {summary}
      </View>
      {isCurrent && currentDetail ? <View style={styles.indent}>{currentDetail}</View> : null}
    </View>
  );
}

interface PlanCardsProps {
  cards: PlanCardVM[];
  isBusy: boolean;
  purchasingPlanId: string | null;
  onPurchase: (plan: Plan) => void;
  onCancel?: () => void;
  cancelHint?: string | null;
  currentCta?: CurrentPlanCta;
  currentDetail?: ReactNode;
}

function PlanCards({
  cards,
  isBusy,
  purchasingPlanId,
  onPurchase,
  onCancel,
  cancelHint = null,
  currentCta,
  currentDetail,
}: PlanCardsProps) {
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const canCancel = onCancel !== undefined;
  const ctaOf = (card: PlanCardVM): CtaKind | null => {
    if (isSelectableAction(card.plan.action, canCancel)) return card.plan.action;
    if (card.plan.action === 'current' && currentCta !== undefined) return 'current';
    return null;
  };
  const selectable = cards.filter((card) => ctaOf(card) !== null);
  // 기본 선택 — 이용 중 카드에 할 일이 있으면(해지 예약·결제 문제) 그 카드, 아니면 고를 수 있는 첫 유료 카드(서버 순서).
  // 해지(무료로 바꾸기)는 사용자가 직접 골라야만 선택된다. 티어명으로 고르지 않는다. 고른 카드가 목록에서 빠지면 기본으로 돌아간다
  const selected =
    selectable.find((card) => card.plan.planId === selectedPlanId) ??
    selectable.find((card) => ctaOf(card) === 'current') ??
    selectable.find((card) => card.plan.action !== 'cancel') ??
    selectable[0] ??
    null;
  const selectedAction = selected !== null ? ctaOf(selected) : null;
  // 변경(다운그레이드)·해지는 보조 버튼 — 주 버튼(검정)은 구독·업그레이드·다시 시작
  const isSecondary = selectedAction === 'downgrade' || selectedAction === 'cancel';
  const ctaLabel =
    selected === null || selectedAction === null
      ? ''
      : selectedAction === 'current'
        ? (currentCta?.label ?? '')
        : SUBSCRIPTION_COPY.plans.cta(selected.plan.name, selectedAction);
  const hint =
    selectedAction === 'downgrade'
      ? SUBSCRIPTION_COPY.plans.downgradeHint
      : selectedAction === 'cancel'
        ? cancelHint
        : null;
  const isPurchasing = selected !== null && purchasingPlanId === selected.plan.planId;

  return (
    <View style={styles.list}>
      <View
        style={styles.list}
        accessibilityRole={selectable.length > 0 ? 'radiogroup' : undefined}
        accessibilityLabel={selectable.length > 0 ? SUBSCRIPTION_COPY.plans.groupA11y : undefined}
      >
        {cards.map((card) => (
          <PlanCard
            key={card.plan.planId}
            card={card}
            onSelect={ctaOf(card) !== null ? () => setSelectedPlanId(card.plan.planId) : undefined}
            isSelected={selected !== null && card.plan.planId === selected.plan.planId}
            disabled={isBusy}
            currentDetail={currentDetail}
          />
        ))}
      </View>

      {selected !== null && selectedAction !== null ? (
        <>
          <Pressable
            style={({ pressed }) => [
              pillButton.base,
              isSecondary ? styles.buttonSecondary : pillButton.primary,
              styles.button,
              pressed ? styles.buttonPressed : null,
              isBusy ? styles.buttonDisabled : null,
            ]}
            // 해지·다시 시작은 스토어 구독 관리로 보낸다(해지 API 없음 — subscription.md 4.5). 나머지는 결제 흐름
            onPress={() =>
              selectedAction === 'cancel'
                ? onCancel?.()
                : selectedAction === 'current'
                  ? currentCta?.onPress()
                  : onPurchase(selected.plan)
            }
            disabled={isBusy}
            accessibilityRole="button"
            accessibilityLabel={ctaLabel}
            accessibilityState={{ disabled: isBusy, busy: isPurchasing }}
          >
            {isPurchasing ? (
              <ActivityIndicator
                color={isSecondary ? theme.color.textPrimary : theme.color.onPrimary}
              />
            ) : (
              <Text style={isSecondary ? pillButton.secondaryLabel : pillButton.primaryLabel}>
                {ctaLabel}
              </Text>
            )}
          </Pressable>
          {hint !== null ? <Text style={styles.hint}>{hint}</Text> : null}
        </>
      ) : null}
    </View>
  );
}

interface PlanListProps {
  state: PlanCatalogState;
  /** 결제·복원 진행 중 — 전체 버튼 비활성(paywall.md 5장) */
  isBusy: boolean;
  /** 결제 시트를 연 요금제 — 그 요금제를 고른 상태면 버튼에 스피너를 둔다 */
  purchasingPlanId: string | null;
  onPurchase: (plan: Plan) => void;
  /**
   * 해지 경로(요금제 관리 화면만) — 서버가 `cancel` 을 준 카드(유료 구독자의 무료 요금제)를 고를 수 있게 하고, 버튼
   * "{이름}로 변경"이 이걸 부른다. 페이월은 넘기지 않는다 — 그때 `cancel` 카드는 `none` 처럼 고를 수 없다
   */
  onCancel?: () => void;
  /** `cancel` 카드를 골랐을 때 버튼 밑 안내("지금 요금제는 N월 N일까지…") — 날짜를 모르면 null */
  cancelHint?: string | null;
  /**
   * 이용 중 카드에 할 일이 있을 때만(요금제 관리 화면 — 해지 예약 "구독 다시 시작" · 결제 문제 "결제 수단 확인") 그 카드를
   * 고를 수 있게 하고 아래 버튼이 이걸 부른다. 카드 안 버튼을 대신한다(PM 2026-10-08 — 조작은 "카드 고르기 + 아래 버튼 하나")
   */
  currentCta?: CurrentPlanCta;
  onRetry: () => void;
  isRetrying: boolean;
  /**
   * 이용 중(`action = current`) 카드 안에 넣을 현재 구독 정보(요금제 관리 화면만 — 페이월은 넘기지 않는다).
   * 서버가 `current` 카드를 주지 않으면 그려지지 않는다 — 그때는 화면이 목록 밑에 따로 그린다
   */
  currentDetail?: ReactNode;
}

/**
 * 요금제 비교 카드(SB2 · 페이월) — 고를 수 있는 카드는 라디오(카드 전체를 눌러 고른다), 결제는 목록 아래 버튼 하나
 * "<이름> 구독하기"(KAN-146 PM 미리보기 확정 2026-10-07). 이름·설명은 서버 값 그대로다(티어명 하드코딩 금지).
 * 이용 중 카드는 회색 + 이름 옆 [이용 중] 배지, 라디오 칸은 비워 둔다. 가격은 스토어 현지 가격만 그린다.
 * 조회 실패면 카드 대신 "요금제를 불러올 수 없어요" + [다시 시도].
 */
export default function PlanList({
  state,
  isBusy,
  purchasingPlanId,
  onPurchase,
  onCancel,
  cancelHint,
  currentCta,
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
    <PlanCards
      // 서버 상태가 바뀌면(해지·다시 시작·변경 예약) 선택을 처음부터 다시 정한다 — 해지하러 스토어에 갔다 돌아오면
      // 종전 선택(Light)이 남아 "Light로 변경"이 그대로 떠 있었다(PM 2026-10-08)
      key={`${state.cards.map((card) => card.plan.action).join(',')}|${currentCta?.label ?? ''}`}
      cards={state.cards}
      isBusy={isBusy}
      purchasingPlanId={purchasingPlanId}
      onPurchase={onPurchase}
      onCancel={onCancel}
      cancelHint={cancelHint}
      currentCta={currentCta}
      currentDetail={currentDetail}
    />
  );
}

const styles = StyleSheet.create({
  list: {
    gap: theme.spacing.sm,
  },
  card: {
    padding: theme.spacing.md - SELECTED_BORDER_WIDTH,
    gap: theme.spacing.xs,
    borderRadius: theme.radius.lg,
    borderCurve: 'continuous',
    borderWidth: SELECTED_BORDER_WIDTH,
    borderColor: 'transparent',
    backgroundColor: theme.color.surface,
  },
  cardSelected: {
    borderColor: theme.color.primary,
  },
  summary: {
    gap: theme.spacing.xs,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: RADIO_GAP,
  },
  radioSlot: {
    width: RADIO_SIZE,
    height: RADIO_SIZE,
  },
  radio: {
    width: RADIO_SIZE,
    height: RADIO_SIZE,
    borderRadius: RADIO_SIZE / 2,
    borderWidth: 2,
    borderColor: theme.color.textMutedSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // 지금 고를 수 없는 카드 — 원은 그리되 흐리게(누를 수 없음)
  radioDisabled: {
    borderColor: theme.color.border,
  },
  radioSelected: {
    borderColor: theme.color.primary,
  },
  radioDot: {
    width: RADIO_DOT_SIZE,
    height: RADIO_DOT_SIZE,
    borderRadius: RADIO_DOT_SIZE / 2,
    backgroundColor: theme.color.primary,
  },
  nameGroup: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  // 설명·구독 정보는 이름 밑에서 시작한다 — 라디오 칸 + 간격만큼 들인다
  indent: {
    marginLeft: RADIO_SIZE + RADIO_GAP,
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
  // [이용 중] — 이름 옆 회색 배지(누를 수 없음). 버튼과 헷갈리지 않게 작게 둔다(KAN-146 PM 2026-10-07)
  currentBadge: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 3,
    borderRadius: theme.radius.full,
    borderCurve: 'continuous',
    backgroundColor: theme.color.fillMuted,
  },
  currentBadgeLabel: {
    fontSize: theme.font.size.xs,
    fontWeight: '600',
    color: theme.color.textMuted,
  },
  // 크기만 — 모양·색은 공용 알약(pillButton)
  button: {
    marginTop: theme.spacing.sm,
    minHeight: theme.touchTarget.minHeight,
  },
  // 변경(다운그레이드·무료로 바꾸기) — 보조 버튼. 주 버튼(검정)과 위계를 가른다
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
