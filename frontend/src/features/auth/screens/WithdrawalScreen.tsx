import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { theme } from '@/shared/theme';
import FullScreenError from '@/shared/ui/FullScreenError';

import { WITHDRAWAL_REASON_CODES } from '../auth.constants';
import { AUTH_COPY } from '../auth.copy';
import WithdrawalCheckRow from '../components/WithdrawalCheckRow';
import { useWithdrawalScreen } from '../hooks/useWithdrawalScreen';

const COPY = AUTH_COPY.withdrawal;

/**
 * A7 탈퇴 안내 → A8 처리 중(auth.md 4.3 · auth-uiux.md 4.5~4.6).
 *
 * 화면 구성은 **서버 판정(`withdrawal-preview`)으로 갈린다** — 결제 이력이 있으면 보존
 * 섹션을, 없으면 "모든 데이터가 즉시 삭제됩니다"를 그린다. 보존 섹션을 회색 처리하거나
 * "해당 없음"으로 남기지 않는다: **섹션 자체를 그리지 않는다.**
 * 스토어 해지 안내는 **텍스트만**이며 이동 버튼·딥링크를 두지 않는다(탈퇴 도중 외부 앱으로
 * 이탈하면 돌아오지 못한다 — 해지 진입점은 설정 > 구독 관리에 이미 있다).
 */
export default function WithdrawalScreen() {
  const screen = useWithdrawalScreen();

  // A8 — 전체 화면 로딩. 취소할 수 없고 뒤로가기·제스처도 막혀 있다(훅이 소유).
  // 서버가 이관과 파기를 하나의 트랜잭션으로 수행하는 구간이다
  if (screen.isSubmitting) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.processing} accessibilityLiveRegion="polite">
          <ActivityIndicator size="large" color={theme.color.primary} />
          <Text style={styles.processingTitle}>{COPY.processing.title}</Text>
          <Text style={styles.processingDescription}>{COPY.processing.description}</Text>
        </View>
      </SafeAreaView>
    );
  }

  // 아카이브 식별자 누락 — 공통 오류 화면. **탈퇴가 진행되지 않았음**을 반드시 알린다
  // (common-error-handling.md 9.3). 재시도가 의미 없는 데이터 정합성 문제라 주 액션은
  // [다시 시도]가 아니라 [돌아가기]다
  if (screen.isArchiveIdentityMissing) {
    return (
      <SafeAreaView style={styles.container}>
        <FullScreenError
          title={COPY.archiveIdentityMissing.title}
          description={COPY.archiveIdentityMissing.description}
          retryLabel={COPY.archiveIdentityMissing.back}
          onRetry={screen.goBack}
        />
      </SafeAreaView>
    );
  }

  const preview = screen.preview;

  return (
    <SafeAreaView style={styles.container}>
      {/* 앱바 — 서버 응답과 무관하므로 로딩 중에도 먼저 그린다. 뒤로가기가 취소 경로다 */}
      <View style={styles.appBar}>
        <Pressable
          style={styles.backButton}
          onPress={screen.goBack}
          accessibilityRole="button"
          accessibilityLabel={COPY.backA11y}
        >
          <Text style={styles.backGlyph}>‹</Text>
        </Pressable>
        <Text style={styles.appBarTitle} accessibilityRole="header">
          {COPY.appBarTitle}
        </Text>
        <View style={styles.appBarSpacer} />
      </View>

      {screen.isLoadError ? (
        // 진입 조회 실패는 차단형이다 — 어느 변형인지 모르는 채로 고지를 그릴 수 없다
        <FullScreenError
          title={COPY.loadFailed}
          retryLabel={COPY.retry}
          isRetrying={screen.isRetryingLoad}
          onRetry={screen.retryLoad}
        />
      ) : (
        <>
          <ScrollView contentContainerStyle={styles.body}>
            {preview === null ? (
              screen.showSkeleton ? (
                <>
                  <View style={styles.skeletonCard} />
                  <View style={styles.skeletonCard} />
                </>
              ) : null
            ) : (
              <>
                <Text style={styles.headline}>{COPY.headline}</Text>

                {/* 1. 삭제되는 데이터 — 두 변형 공통 */}
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>{COPY.deleted.title}</Text>
                  {COPY.deleted.items.map((item) => (
                    <Text key={item} style={styles.cardItem}>
                      {item}
                    </Text>
                  ))}
                </View>

                {/* 2. 보존되는 데이터 — **결제 이력이 있을 때만 그린다.** 삭제 항목과 나란히
                    노출해야 "전부 지워진다"고 이해한 채 탈퇴하는 일이 없다(auth.md 4.3-1) */}
                {preview.retained !== null ? (
                  <View style={[styles.card, styles.retainedCard]}>
                    <Text style={styles.cardTitle}>
                      {COPY.retained.title(preview.retained.years)}
                    </Text>
                    {preview.retained.items.map((item) => (
                      <Text key={item} style={styles.cardItem}>
                        {/* 모르는 항목 키는 키 자체를 노출한다 — 고지에서 조용히 빠지면 안 된다 */}
                        {COPY.retained.item[item] ?? item}
                      </Text>
                    ))}
                    <Text style={styles.cardFootnote}>{COPY.retained.basis}</Text>
                  </View>
                ) : null}

                {/* 2'. 보존할 것이 없으면 즉시 파기 고지만 남는다(보존 섹션 없음) */}
                {!preview.hasPaymentHistory ? (
                  <Text style={styles.immediateNotice}>{COPY.immediateDeletionNotice}</Text>
                ) : null}

                {/* 3. 활성 구독 안내 — 텍스트만. 스토어로 보내는 버튼·딥링크를 두지 않는다 */}
                {preview.hasActiveSubscription ? (
                  <View style={styles.warningBanner}>
                    <Text style={styles.warningTitle}>{COPY.activeSubscription.title}</Text>
                    <Text style={styles.warningDescription}>
                      {COPY.activeSubscription.description}
                    </Text>
                  </View>
                ) : null}

                {/* 4. 구독 만료 동의 — 이 체크 없이는 [탈퇴하기]가 활성되지 않는다.
                    필요 여부 판정은 서버 응답이다(auth-api.md 4.6) */}
                {preview.subscriptionExpiryAgreementRequired ? (
                  <WithdrawalCheckRow
                    label={COPY.activeSubscription.agreement}
                    isChecked={screen.isSubscriptionExpiryAgreed}
                    isHighlighted={screen.highlightedCheck === 'subscriptionExpiry'}
                    onToggle={screen.toggleSubscriptionExpiryAgreement}
                  />
                ) : null}

                {/* 5. 탈퇴 사유(선택) — 식별자 없이 해시로만 남는다(domain.md 3.4) */}
                <Text style={styles.sectionLabel}>{COPY.reason.label}</Text>
                <View style={styles.chipRow}>
                  {WITHDRAWAL_REASON_CODES.map((code) => {
                    const isSelected = screen.reasonCode === code;
                    return (
                      <Pressable
                        key={code}
                        style={[styles.chip, isSelected && styles.chipSelected]}
                        onPress={() => screen.toggleReason(code)}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: isSelected }}
                        accessibilityLabel={COPY.reason.option[code]}
                      >
                        <Text style={[styles.chipLabel, isSelected && styles.chipLabelSelected]}>
                          {COPY.reason.option[code]}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                {/* 자유 입력은 [기타]에서만 연다 — 선택형 사유만 고른 사용자에게 빈 칸을 주지 않는다 */}
                {screen.reasonCode === 'other' ? (
                  <TextInput
                    style={styles.reasonInput}
                    value={screen.reasonText}
                    onChangeText={screen.changeReasonText}
                    placeholder={COPY.reason.textPlaceholder}
                    placeholderTextColor={theme.color.textSecondary}
                    maxLength={screen.reasonTextMaxLength}
                    multiline
                    accessibilityLabel={COPY.reason.textLabel}
                  />
                ) : null}

                {/* 6. 최종 확인 */}
                <WithdrawalCheckRow
                  label={COPY.confirm}
                  isChecked={screen.isConfirmed}
                  isHighlighted={screen.highlightedCheck === 'confirm'}
                  onToggle={screen.toggleConfirm}
                />
              </>
            )}
          </ScrollView>

          {/* 7. 하단 독 — [탈퇴하기]는 파괴적 액션 스타일이고, 취소 경로를 같은 화면에 남긴다 */}
          <View style={styles.dock}>
            {screen.submitError !== null ? (
              // 사용자가 시작한 요청의 직접 결과라 assertive다(auth-uiux.md 7장)
              <Text style={styles.dockError} accessibilityLiveRegion="assertive">
                {screen.submitError}
              </Text>
            ) : null}
            <Pressable
              style={[styles.submit, !screen.canSubmit && styles.submitDisabled]}
              disabled={!screen.canSubmit}
              onPress={screen.handleSubmitPress}
              accessibilityRole="button"
              accessibilityLabel={COPY.submit}
              accessibilityState={{ disabled: !screen.canSubmit }}
            >
              <Text style={styles.submitLabel}>{COPY.submit}</Text>
            </Pressable>
            <Pressable
              style={styles.cancel}
              onPress={screen.goBack}
              accessibilityRole="button"
              accessibilityLabel={COPY.cancel}
            >
              <Text style={styles.cancelLabel}>{COPY.cancel}</Text>
            </Pressable>
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.color.background,
  },
  /** A8 — 전체 화면 로딩. 앱바도 그리지 않는다(돌아갈 수단이 없는 구간이다) */
  processing: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.xl,
    gap: theme.spacing.sm,
  },
  processingTitle: {
    marginTop: theme.spacing.md,
    fontSize: theme.font.size.md,
    fontWeight: '600',
    color: theme.color.textPrimary,
    textAlign: 'center',
  },
  processingDescription: {
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
    textAlign: 'center',
  },
  appBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.sm,
    minHeight: theme.touchTarget.minHeight + theme.spacing.sm,
  },
  backButton: {
    minWidth: theme.touchTarget.minWidth,
    minHeight: theme.touchTarget.minHeight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backGlyph: {
    fontSize: theme.font.size.xl,
    color: theme.color.textPrimary,
    lineHeight: theme.font.size.xl + 2,
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
    minWidth: theme.touchTarget.minWidth,
  },
  body: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  headline: {
    fontSize: theme.font.size.lg,
    fontWeight: '700',
    color: theme.color.textPrimary,
  },
  card: {
    backgroundColor: theme.color.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.color.border,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    gap: theme.spacing.xs,
  },
  /** 보존 섹션 — 삭제 섹션과 같은 무게로 나란히 둔다(테두리만 또렷하게) */
  retainedCard: {
    backgroundColor: theme.color.background,
    borderColor: theme.color.textSecondary,
  },
  cardTitle: {
    fontSize: theme.font.size.sm,
    fontWeight: '700',
    color: theme.color.textPrimary,
    marginBottom: theme.spacing.xs,
  },
  cardItem: {
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
    lineHeight: theme.font.size.sm * 1.6,
  },
  cardFootnote: {
    marginTop: theme.spacing.sm,
    fontSize: theme.font.size.xs,
    color: theme.color.textSecondary,
  },
  immediateNotice: {
    fontSize: theme.font.size.sm,
    fontWeight: '700',
    color: theme.color.textPrimary,
  },
  warningBanner: {
    backgroundColor: theme.color.surface,
    borderLeftWidth: 3,
    borderLeftColor: theme.color.danger,
    borderRadius: theme.radius.sm,
    padding: theme.spacing.md,
    gap: theme.spacing.xs,
  },
  warningTitle: {
    fontSize: theme.font.size.sm,
    fontWeight: '700',
    color: theme.color.textPrimary,
  },
  warningDescription: {
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
    lineHeight: theme.font.size.sm * 1.5,
  },
  sectionLabel: {
    fontSize: theme.font.size.sm,
    fontWeight: '600',
    color: theme.color.textPrimary,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  chip: {
    minHeight: theme.touchTarget.minHeight,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.lg + theme.radius.sm,
    borderWidth: 1.5,
    borderColor: theme.color.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipSelected: {
    borderColor: theme.color.primary,
    backgroundColor: theme.color.primary,
  },
  chipLabel: {
    fontSize: theme.font.size.sm,
    // 선택 시 굵어지면 글자 폭이 변해 flexWrap 줄의 뒤 칩들이 밀린다(커리어와 같은 규칙)
    fontWeight: '600',
    color: theme.color.textPrimary,
  },
  chipLabelSelected: {
    color: theme.color.onPrimary,
  },
  reasonInput: {
    minHeight: theme.touchTarget.minHeight * 2,
    borderWidth: 1.5,
    borderColor: theme.color.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    fontSize: theme.font.size.md,
    color: theme.color.textPrimary,
    textAlignVertical: 'top',
  },
  skeletonCard: {
    height: 120,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.color.surface,
  },
  dock: {
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.md,
  },
  dockError: {
    fontSize: theme.font.size.sm,
    color: theme.color.danger,
    textAlign: 'center',
  },
  /** 파괴적 액션 — 경고색(auth-uiux.md 4.5) */
  submit: {
    minHeight: theme.touchTarget.minHeight + theme.spacing.sm,
    borderRadius: theme.radius.md,
    backgroundColor: theme.color.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitDisabled: {
    backgroundColor: theme.color.border,
  },
  submitLabel: {
    fontSize: theme.font.size.md,
    fontWeight: '600',
    color: theme.color.onPrimary,
  },
  /** 취소 경로는 같은 화면에 남긴다 — 파괴적 버튼 옆의 되돌아갈 길 */
  cancel: {
    minHeight: theme.touchTarget.minHeight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelLabel: {
    fontSize: theme.font.size.sm,
    fontWeight: '600',
    color: theme.color.textSecondary,
  },
});
