import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { USES_SYSTEM_PUSHED_HEADER } from '@/shared/navigation/pushed-screen-header';
import { useSystemLargeTitle } from '@/shared/navigation/useSystemLargeTitle';
import { theme } from '@/shared/theme';
import ChevronIcon from '@/shared/ui/ChevronIcon';
import { HEADER_CONTROL_HEIGHT } from '@/shared/ui/GlassCapsule';
import GlassIconButton from '@/shared/ui/GlassIconButton';
import InlineNotice from '@/shared/ui/InlineNotice';
import InsetGroup from '@/shared/ui/InsetGroup';
import { pillButton } from '@/shared/ui/pill-button.styles';
import { Text } from '@/shared/ui/Typography';

import { InviteCodeForm } from '@/features/subscription';

import { CONTENT_REVIEW_COPY } from '../content-review.copy';
import type { Promotion } from '../content-review.types';
import { promotionReasonLine, usePromotionsScreen } from '../hooks/usePromotionsScreen';

const COPY = CONTENT_REVIEW_COPY.promotions;
const BACK_ICON_SIZE = 20;

/**
 * S12 프로모션(settings-uiux.md 4.8 — KAN-280, 종전 "프로모션 코드 입력" KAN-182). 설정 > [프로모션] · 발급 안내 [지금 쓰기]에서 온다.
 * **결제 UI 플래그와 무관하게 늘 있다** — 지급은 스토어 결제가 아니다. 후기 기능 스위치가 꺼져 있어도 열린다(가진 프로모션은 쓴다).
 *
 * 위에서 아래로: 이용 중 / 사용 가능한 프로모션 / 받을 수 있는 프로모션 / 프로모션 코드. 앞의 셋은 서버가 줄 때만 그린다.
 * 화면 문법은 설정의 하위 화면과 같다 — iOS 26 시스템 큰 제목(그 외는 앱바), 본문은 인셋 그룹. 화면 문구에 "쿠폰"을 쓰지 않는다.
 */
export default function PromotionsScreen() {
  const screen = usePromotionsScreen();
  useSystemLargeTitle(COPY.title, null);

  return (
    <SafeAreaView
      style={styles.container}
      edges={USES_SYSTEM_PUSHED_HEADER ? ['bottom'] : undefined}
    >
      {USES_SYSTEM_PUSHED_HEADER ? null : (
        <View style={styles.appBar}>
          <GlassIconButton onPress={screen.goBack} accessibilityLabel={COPY.backA11y}>
            <ChevronIcon direction="left" size={BACK_ICON_SIZE} color={theme.color.textPrimary} />
          </GlassIconButton>
          <Text style={styles.appBarTitle} accessibilityRole="header">
            {COPY.title}
          </Text>
          <View style={styles.appBarSpacer} />
        </View>
      )}

      <ScrollView
        contentContainerStyle={styles.body}
        contentInsetAdjustmentBehavior={USES_SYSTEM_PUSHED_HEADER ? 'automatic' : 'never'}
        keyboardShouldPersistTaps="handled"
      >
        {screen.grantLine !== null ? (
          <InsetGroup title={COPY.activeSection}>
            <View style={styles.row}>
              <Text style={styles.rowText}>{screen.grantLine}</Text>
            </View>
          </InsetGroup>
        ) : null}

        {screen.promotions.length > 0 ? (
          <InsetGroup title={COPY.availableSection}>
            {screen.promotions.map((promotion) => (
              <PromotionCard
                key={promotion.id}
                promotion={promotion}
                isRedeeming={screen.redeemingId === promotion.id}
                isAnyRedeeming={screen.redeemingId !== null}
                errorMessage={
                  screen.redeemError?.promotionId === promotion.id
                    ? screen.redeemError.message
                    : null
                }
                onRedeem={screen.requestRedeem}
              />
            ))}
          </InsetGroup>
        ) : null}

        {screen.rewardProgress !== null ? (
          <InsetGroup title={COPY.earnSection}>
            <View style={styles.row}>
              <Text style={styles.rowText}>
                {CONTENT_REVIEW_COPY.sheet.rewardLine(
                  screen.rewardProgress.current,
                  screen.rewardProgress.required,
                )}
              </Text>
            </View>
          </InsetGroup>
        ) : null}

        {screen.isLoadFailed ? (
          <View style={styles.notice}>
            <InlineNotice
              message={COPY.loadFailed}
              tone="error"
              action={{ label: COPY.retry, onPress: screen.retry, busy: screen.isRetrying }}
            />
          </View>
        ) : screen.isLoading ? (
          <ActivityIndicator style={styles.loading} color={theme.color.textSecondary} />
        ) : null}

        {/* 코드 입력 — 지금 그대로(즉시 적용, 보관하지 않는다). 프로모션 조회와 무관하게 늘 동작한다 */}
        <InviteCodeForm title={COPY.codeSection} onApplied={screen.handleCodeApplied} />
      </ScrollView>
    </SafeAreaView>
  );
}

interface PromotionCardProps {
  promotion: Promotion;
  isRedeeming: boolean;
  isAnyRedeeming: boolean;
  errorMessage: string | null;
  onRedeem: (promotion: Promotion) => void;
}

/** 사용 가능한 프로모션 한 장 — "{이름} 프로모션" / "{요금제} {N}일 · {N월 N일}까지 사용" + [사용하기]. 쓸 수 없으면 흐린 버튼 + 사유 줄 */
function PromotionCard({
  promotion,
  isRedeeming,
  isAnyRedeeming,
  errorMessage,
  onRedeem,
}: PromotionCardProps) {
  const reasonLine = promotion.redeemable
    ? null
    : promotionReasonLine(promotion.reason, promotion.planName);
  const isDisabled = !promotion.redeemable || isAnyRedeeming;
  return (
    <View style={styles.card}>
      <View style={styles.cardMain}>
        <View style={styles.cardText}>
          <Text style={styles.cardTitle}>{COPY.cardTitle(promotion.name)}</Text>
          <Text style={styles.cardDetail}>
            {COPY.cardDetail(promotion.planName, promotion.grantDays, promotion.lastUsableDate)}
          </Text>
        </View>
        <Pressable
          style={[
            pillButton.base,
            pillButton.primary,
            styles.redeem,
            !promotion.redeemable && styles.redeemDimmed,
          ]}
          onPress={() => onRedeem(promotion)}
          disabled={isDisabled}
          accessibilityRole="button"
          accessibilityLabel={COPY.redeem}
          // 흐린 이유를 이어 읽는다 — 흐림(색)만으로 알리지 않는다
          accessibilityHint={reasonLine ?? undefined}
          accessibilityState={{ disabled: isDisabled, busy: isRedeeming }}
        >
          {isRedeeming ? (
            <ActivityIndicator color={theme.color.onPrimary} />
          ) : (
            <Text style={[pillButton.primaryLabel, styles.redeemLabel]}>{COPY.redeem}</Text>
          )}
        </Pressable>
      </View>
      {reasonLine !== null ? <Text style={styles.reason}>{reasonLine}</Text> : null}
      {errorMessage !== null ? (
        <Text style={styles.error} accessibilityLiveRegion="assertive">
          {errorMessage}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.color.background,
  },
  appBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    minHeight: theme.touchTarget.minHeight + theme.spacing.sm,
  },
  appBarTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: theme.font.size.md,
    fontWeight: '700',
    color: theme.color.textPrimary,
  },
  /** 타이틀을 가운데 두기 위한 뒤로가기 대칭 여백 */
  appBarSpacer: {
    minWidth: HEADER_CONTROL_HEIGHT,
  },
  body: {
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.lg,
    gap: theme.spacing.lg,
  },
  /** 그룹 안의 정보 한 줄 — 설정 행과 같은 높이 · 여백 */
  row: {
    minHeight: theme.touchTarget.minHeight + theme.spacing.sm + theme.spacing.xs,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  rowText: {
    fontSize: theme.font.size.md,
    color: theme.color.textPrimary,
  },
  card: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  cardMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  cardText: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  cardTitle: {
    fontSize: theme.font.size.md,
    fontWeight: '600',
    color: theme.color.textPrimary,
  },
  cardDetail: {
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
  },
  redeem: {
    minHeight: theme.touchTarget.minHeight,
    minWidth: 88,
    paddingHorizontal: theme.spacing.md,
  },
  /** 쓸 수 없음 — 검정을 흐리지 않고 회색 면으로 내린다(코드 입력 [확인]의 비활성과 같다) */
  redeemDimmed: {
    backgroundColor: theme.color.fillMuted,
  },
  redeemLabel: {
    fontSize: theme.font.size.sm,
  },
  reason: {
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
  },
  error: {
    fontSize: theme.font.size.sm,
    color: theme.color.danger,
  },
  notice: {
    marginHorizontal: theme.spacing.md,
  },
  loading: {
    marginVertical: theme.spacing.md,
  },
});
