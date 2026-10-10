import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { IS_SUBSCRIPTION_UI_ENABLED } from '@/shared/lib/feature-flags';
import { USES_SYSTEM_PUSHED_HEADER } from '@/shared/navigation/pushed-screen-header';
import { useNativeHeaderInset } from '@/shared/navigation/useNativeHeaderInset';
import { useSystemLargeTitle } from '@/shared/navigation/useSystemLargeTitle';
import { theme } from '@/shared/theme';
import ChevronIcon from '@/shared/ui/ChevronIcon';
import FullScreenError from '@/shared/ui/FullScreenError';
import { HEADER_CONTROL_HEIGHT } from '@/shared/ui/GlassCapsule';
import GlassIconButton from '@/shared/ui/GlassIconButton';
import InsetGroup from '@/shared/ui/InsetGroup';
import { pillButton } from '@/shared/ui/pill-button.styles';
import { SkeletonBlock, SkeletonGroup } from '@/shared/ui/Skeleton';
import { Text, TextInput } from '@/shared/ui/Typography';

import { WITHDRAWAL_REASON_CODES } from '../auth.constants';
import { AUTH_COPY } from '../auth.copy';
import WithdrawalCheckRow from '../components/WithdrawalCheckRow';
import WithdrawalReasonRow from '../components/WithdrawalReasonRow';
import { useWithdrawalScreen } from '../hooks/useWithdrawalScreen';

const COPY = AUTH_COPY.withdrawal;

/**
 * A7 탈퇴 안내 → A8 처리 중(auth.md 4.3 · auth-uiux.md 4.5~4.6).
 *
 * **화면 문법은 iOS 설정의 "계정 삭제"다**(2026-10-10 개편, design.md §5 "회원 탈퇴"): 상단은 설정과 같은
 * 푸시 화면 상단(iOS 26 시스템 큰 제목, 그 외는 앱바), 본문은 **인셋 그룹 리스트**(`InsetGroup`) — 고지는 행,
 * 보존 근거·즉시 삭제 고지는 그룹 꼬리말, 체크는 행 오른쪽 원형 체크, 사유는 체크마크 선택 목록이다.
 * 종전의 카드·칩·네모 체크박스는 웹 폼처럼 보여 걷었다.
 *
 * 화면 구성은 **서버 판정(`withdrawal-preview`)으로 갈린다** — 결제 이력이 있으면 보존
 * 섹션을, 없으면 "모든 데이터가 즉시 삭제됩니다"를 그린다. 보존 섹션을 회색 처리하거나
 * "해당 없음"으로 남기지 않는다: **섹션 자체를 그리지 않는다.**
 * 스토어 해지 안내는 **텍스트만**이며 이동 버튼·딥링크를 두지 않는다(탈퇴 도중 외부 앱으로
 * 이탈하면 돌아오지 못한다 — 해지 진입점은 설정 > 요금제 관리에 이미 있다).
 */
export default function WithdrawalScreen() {
  const screen = useWithdrawalScreen();
  // 스크롤 뷰가 아닌 상태 화면(전체 에러)이 비울 위쪽 — 투명 시스템 바 밑에서 시작한다
  const headerInset = useNativeHeaderInset();
  // iOS 26: 시스템 큰 제목 — 설정과 같은 문법(PUSHED_SCREEN_HEADER). 뒤로 버튼이 있어 UIKit 이 큰 제목을 버튼 줄
  // 밑에 두고, 스크롤 접힘·바 밑 블러는 시스템이 한다. A8(처리 중)엔 훅이 뒤로 버튼을 숨긴다
  useSystemLargeTitle(COPY.appBarTitle, null);

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
  const isDisabled = screen.isSubmitting;

  return (
    // 시스템 바 갈래는 위쪽을 바(automatic 인셋)가 채운다 — 아래 독만 안전영역을 받는다
    <SafeAreaView
      style={styles.container}
      edges={USES_SYSTEM_PUSHED_HEADER ? ['bottom'] : undefined}
    >
      {/* 앱바(iOS 26 이외) — 서버 응답과 무관하므로 로딩 중에도 먼저 그린다. 뒤로가기가 취소 경로다 */}
      {USES_SYSTEM_PUSHED_HEADER ? null : (
        <View style={styles.appBar}>
          {/* 뒤로 — 유리 원 안의 셰브론(상세 화면과 같은 문법, PM 2026-09-28 03:07) */}
          <GlassIconButton onPress={screen.goBack} accessibilityLabel={COPY.backA11y}>
            <ChevronIcon direction="left" size={BACK_ICON_SIZE} color={theme.color.textPrimary} />
          </GlassIconButton>
          <Text style={styles.appBarTitle} accessibilityRole="header">
            {COPY.appBarTitle}
          </Text>
          <View style={styles.appBarSpacer} />
        </View>
      )}

      {screen.isLoadError ? (
        // 진입 조회 실패는 차단형이다 — 어느 변형인지 모르는 채로 고지를 그릴 수 없다
        <View style={[styles.flex, { paddingTop: headerInset }]}>
          <FullScreenError
            title={COPY.loadFailed}
            retryLabel={COPY.retry}
            isRetrying={screen.isRetryingLoad}
            onRetry={screen.retryLoad}
          />
        </View>
      ) : (
        <>
          <ScrollView
            contentContainerStyle={styles.body}
            // 투명 시스템 바 밑을 비운다(iOS 26). 그 외 갈래는 RN 기본(never)
            contentInsetAdjustmentBehavior={USES_SYSTEM_PUSHED_HEADER ? 'automatic' : 'never'}
            keyboardShouldPersistTaps="handled"
          >
            {preview === null ? (
              screen.showSkeleton ? (
                // 그룹 골격 그대로 — 낭독·반짝임은 영역 하나로
                <SkeletonGroup style={styles.skeletonArea}>
                  <SkeletonBlock style={styles.skeletonGroup} />
                  <SkeletonBlock style={styles.skeletonGroup} />
                </SkeletonGroup>
              ) : null
            ) : (
              <>
                <Text style={styles.headline}>{COPY.headline}</Text>

                {/* 1. 삭제되는 데이터 — 두 변형 공통. 보존할 것이 없으면(A7-b) 즉시 파기 고지가 꼬리말로 붙는다
                    (보존 섹션 없음) */}
                <InsetGroup
                  title={COPY.deleted.title}
                  footer={preview.hasPaymentHistory ? undefined : COPY.immediateDeletionNotice}
                >
                  {COPY.deleted.items.map((item) => (
                    <View key={item} style={styles.noticeRow}>
                      <Text style={styles.noticeText}>{item}</Text>
                    </View>
                  ))}
                </InsetGroup>

                {/* 2. 보존되는 데이터 — **결제 이력이 있을 때만 그린다.** 삭제 항목과 나란히
                    노출해야 "전부 지워진다"고 이해한 채 탈퇴하는 일이 없다(auth.md 4.3-1) */}
                {preview.retained !== null ? (
                  <InsetGroup
                    title={COPY.retained.title(preview.retained.years)}
                    footer={COPY.retained.basis}
                  >
                    {preview.retained.items.map((item) => (
                      <View key={item} style={styles.noticeRow}>
                        {/* 모르는 항목 키는 키 자체를 노출한다 — 고지에서 조용히 빠지면 안 된다 */}
                        <Text style={styles.noticeText}>{COPY.retained.item[item] ?? item}</Text>
                      </View>
                    ))}
                  </InsetGroup>
                ) : null}

                {/* 3·4. 활성 구독 안내(텍스트만 — 스토어로 보내는 버튼·딥링크 없음) + 구독 만료 동의.
                    동의 체크 없이는 [탈퇴하기]가 활성되지 않는다. 필요 여부 판정은 서버 응답이다(auth-api.md 4.6) */}
                {preview.hasActiveSubscription || preview.subscriptionExpiryAgreementRequired ? (
                  <InsetGroup
                    title={preview.hasActiveSubscription ? COPY.activeSubscription.title : undefined}
                  >
                    {preview.hasActiveSubscription ? (
                      <View style={styles.noticeRow}>
                        <Text style={styles.noteText}>{COPY.activeSubscription.description}</Text>
                      </View>
                    ) : null}
                    {preview.subscriptionExpiryAgreementRequired ? (
                      <WithdrawalCheckRow
                        label={COPY.activeSubscription.agreement}
                        isChecked={screen.isSubscriptionExpiryAgreed}
                        isHighlighted={screen.highlightedCheck === 'subscriptionExpiry'}
                        isDisabled={isDisabled}
                        onToggle={screen.toggleSubscriptionExpiryAgreement}
                      />
                    ) : null}
                  </InsetGroup>
                ) : null}

                {/* 5. 탈퇴 사유(선택) — 식별자 없이 해시로만 남는다(domain.md 3.4). 단일 선택 목록 */}
                <InsetGroup title={COPY.reason.label} bodyRole="radiogroup">
                  {WITHDRAWAL_REASON_CODES.filter(
                    // 결제 구현 전 MVP 바이너리(KAN-66) — 구독을 언급하는 사유는 고를 수 없다
                    (code) => IS_SUBSCRIPTION_UI_ENABLED || code !== 'price',
                  ).map((code) => (
                    <WithdrawalReasonRow
                      key={code}
                      label={COPY.reason.option[code]}
                      isSelected={screen.reasonCode === code}
                      isDisabled={isDisabled}
                      onPress={() => screen.toggleReason(code)}
                    />
                  ))}
                  {/* 자유 입력은 [기타]에서만 연다 — 선택형 사유만 고른 사용자에게 빈 칸을 주지 않는다.
                      그룹 안의 마지막 행이다(iOS 설정의 메모 입력 칸) */}
                  {screen.reasonCode === 'other' ? (
                    <TextInput
                      style={styles.reasonInput}
                      value={screen.reasonText}
                      onChangeText={screen.changeReasonText}
                      placeholder={COPY.reason.textPlaceholder}
                      placeholderTextColor={theme.color.textMuted}
                      maxLength={screen.reasonTextMaxLength}
                      multiline
                      editable={!isDisabled}
                      accessibilityLabel={COPY.reason.textLabel}
                    />
                  ) : null}
                </InsetGroup>

                {/* 6. 최종 확인 */}
                <InsetGroup>
                  <WithdrawalCheckRow
                    label={COPY.confirm}
                    isChecked={screen.isConfirmed}
                    isHighlighted={screen.highlightedCheck === 'confirm'}
                    isDisabled={isDisabled}
                    onToggle={screen.toggleConfirm}
                  />
                </InsetGroup>
              </>
            )}
          </ScrollView>

          {/* 7. 하단 독 — [탈퇴하기]는 파괴적 주 동작(채운 빨강 알약)이고, 취소 경로를 같은 화면에 남긴다 */}
          <View style={styles.dock}>
            {screen.submitError !== null ? (
              // 사용자가 시작한 요청의 직접 결과라 assertive다(auth-uiux.md 7장)
              <Text style={styles.dockError} accessibilityLiveRegion="assertive">
                {screen.submitError}
              </Text>
            ) : null}
            <Pressable
              style={[
                pillButton.base,
                pillButton.destructive,
                styles.submit,
                !screen.canSubmit && styles.submitDisabled,
              ]}
              disabled={!screen.canSubmit}
              onPress={screen.handleSubmitPress}
              accessibilityRole="button"
              accessibilityLabel={COPY.submit}
              accessibilityState={{ disabled: !screen.canSubmit }}
            >
              <Text style={pillButton.destructiveLabel}>{COPY.submit}</Text>
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

/** 앱바 뒤로 셰브론 — 글자 `‹` 는 폰트마다 굵기·세로 위치가 달라 도형으로 그린다(design.md §5). 유리 원(40) 안쪽 값 */
const BACK_ICON_SIZE = 20;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.color.background,
  },
  flex: {
    flex: 1,
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
    // 좌우 16 — 설정·라이브러리·탐색 상단 버튼과 같은 선(PM 2026-09-30 05:28 "상단 버튼 양쪽 공백이 안 맞는다", 종전 8)
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
  // 그룹 사이(24)를 그룹 안 행 사이(구분선)보다 훨씬 넓게 벌린다 — 묶음의 경계가 여백으로 먼저 읽혀야 한다(설정과 같다).
  // 좌우 여백은 그룹(InsetGroup)이 갖는다
  body: {
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.lg,
    gap: theme.spacing.lg,
  },
  /** 큰 제목 밑의 한 줄 물음 — 그룹 글자 선(16 + 16)에 맞춘다 */
  headline: {
    marginHorizontal: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    fontSize: theme.font.size.lg,
    fontWeight: '600',
    color: theme.color.textPrimary,
  },
  /** 고지 행 — 탭할 수 없는 글자 행. 설정 행과 같은 여백, 높이는 글자가 정한다(최소 44) */
  noticeRow: {
    minHeight: theme.touchTarget.minHeight,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm + theme.spacing.xs,
  },
  noticeText: {
    fontSize: theme.font.size.md,
    color: theme.color.textPrimary,
    lineHeight: 22,
  },
  /** 설명 문단(구독 해지 안내) — 보조색, 여러 줄 */
  noteText: {
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
    lineHeight: theme.font.size.sm * 1.5,
  },
  /** [기타] 자유 입력 — 그룹 면 안의 한 행. 테두리 없이 면이 곧 입력 칸이다(iOS 설정의 메모 칸) */
  reasonInput: {
    minHeight: theme.touchTarget.minHeight * 2,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm + theme.spacing.xs,
    fontSize: theme.font.size.md,
    lineHeight: 22,
    color: theme.color.textPrimary,
    textAlignVertical: 'top',
  },
  skeletonArea: {
    marginHorizontal: theme.spacing.md,
    gap: theme.spacing.lg,
  },
  skeletonGroup: {
    height: 168,
    borderRadius: theme.radius.xl,
  },
  dock: {
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.md,
  },
  dockError: {
    fontSize: theme.font.size.sm,
    color: theme.color.danger,
    textAlign: 'center',
  },
  /** 파괴적 주 동작 — 크기만. 모양·색은 공용 알약(pillButton.destructive — 채운 빨강, auth-uiux.md 4.5) */
  submit: {
    minHeight: theme.touchTarget.minHeight + theme.spacing.sm,
  },
  /** 비활성 — 조건(확인·동의)이 안 찼을 때. 빨강을 흐리지 않고 회색 면으로 내린다 */
  submitDisabled: {
    backgroundColor: theme.color.fillMuted,
  },
  /** 취소 경로는 같은 화면에 남긴다 — 파괴적 버튼 옆의 되돌아갈 길(글자 버튼) */
  cancel: {
    minHeight: theme.touchTarget.minHeight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelLabel: {
    fontSize: theme.font.size.md,
    fontWeight: '600',
    color: theme.color.textPrimary,
  },
});
