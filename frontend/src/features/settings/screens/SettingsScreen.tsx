import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useDelayedVisible } from '@/shared/hooks/useDelayedVisible';
import { APP_VERSION } from '@/shared/lib/app-version';
import { theme } from '@/shared/theme';

import { NotificationPrePromptModal } from '@/features/notification';

import EmailRow from '../components/EmailRow';
import NotificationBanner from '../components/NotificationBanner';
import PlanSummaryCard from '../components/PlanSummaryCard';
import PlaybackRateSheet from '../components/PlaybackRateSheet';
import SettingsDialog from '../components/SettingsDialog';
import SettingsRow from '../components/SettingsRow';
import SettingsSection from '../components/SettingsSection';
import SettingsToggleRow from '../components/SettingsToggleRow';
import SettingsTopSkeleton from '../components/SettingsTopSkeleton';
import { useSettingsScreen } from '../hooks/useSettingsScreen';
import { KAKAO_CHANNEL_URL } from '../settings.constants';
import { SETTINGS_COPY } from '../settings.copy';

/**
 * 설정 화면(S1~S7) — 화면은 뷰만 담당하고 로직은 useSettingsScreen이 소유한다.
 * 설정은 허브다: 이 화면이 소유하는 조작은 토글·배속 시트뿐이고 나머지는 소유 화면으로
 * 보낸다(settings-uiux.md 1장). 진입점은 프로필 우상단 아이콘 하나다(탭이 아니다 — settings.md 2장).
 * 프로필로 되돌아가는 계정 카드·오프라인 저장 메뉴·자동 확장 토글(P1)은 두지 않는다(8장 금지).
 */
export default function SettingsScreen() {
  const screen = useSettingsScreen();
  // 0.3초 미만 로딩은 표시하지 않는다(common-error-handling.md 5장)
  const showSkeleton = useDelayedVisible(screen.isInitialLoading);

  // 조회 값이 필요한 조작(토글·배속) — 기준값이 없으면 비활성이다(S6: 토글 섹션도 에러 영역)
  const hasControls = screen.controls !== null;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* 앱바 — 뒤로가기 + "설정"(settings-uiux.md 4.1) */}
      <View style={styles.appBar}>
        <Pressable
          style={styles.backButton}
          onPress={screen.goBack}
          accessibilityRole="button"
          accessibilityLabel={SETTINGS_COPY.backA11y}
        >
          <Text style={styles.backGlyph}>‹</Text>
        </Pressable>
        <Text style={styles.appBarTitle} accessibilityRole="header">
          {SETTINGS_COPY.title}
        </Text>
        <View style={styles.appBarSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* ── 상단 요약(계정·구독) — 서버 값이 필요한 영역만 로딩·에러가 있다(S6) ── */}
        {screen.isInitialLoading ? (
          showSkeleton ? (
            <SettingsTopSkeleton />
          ) : null
        ) : screen.isFullError ? (
          <View style={styles.summaryErrorCard}>
            <Text style={styles.summaryErrorText}>{SETTINGS_COPY.summaryError}</Text>
            <Pressable
              style={styles.summaryRetry}
              onPress={screen.retry}
              disabled={screen.isRetrying}
              accessibilityRole="button"
              accessibilityLabel={SETTINGS_COPY.retry}
              accessibilityState={{ disabled: screen.isRetrying }}
            >
              <Text style={styles.summaryRetryLabel}>{SETTINGS_COPY.retry}</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <SettingsSection title={SETTINGS_COPY.sections.account}>
              {screen.emailRow !== null ? (
                <EmailRow
                  state={screen.emailRow}
                  onPress={screen.openEmail}
                  onRetry={screen.retry}
                  isRetrying={screen.isRetrying}
                />
              ) : null}
            </SettingsSection>

            <SettingsSection title={SETTINGS_COPY.sections.subscription}>
              {screen.planRow !== null ? (
                <PlanSummaryCard
                  state={screen.planRow}
                  onPress={screen.openPlan}
                  onRetry={screen.retry}
                  isRetrying={screen.isRetrying}
                />
              ) : null}
            </SettingsSection>
          </>
        )}

        {/* ── 아래는 정적 메뉴 — 조회와 무관하게 즉시 노출·동작한다(settings-uiux.md 4.6) ── */}

        <SettingsSection title={SETTINGS_COPY.sections.content}>
          <SettingsRow
            label={SETTINGS_COPY.content.interest}
            value={
              screen.interestCount === null
                ? null
                : SETTINGS_COPY.content.interestCount(screen.interestCount)
            }
            onPress={screen.openInterests}
          />
          <SettingsRow label={SETTINGS_COPY.content.career} onPress={screen.openCareer} />
          {/* 주제 자동 확장(FR-06)은 P1 미구현이라 항목을 그리지 않는다(settings-api.md 4.1) */}
        </SettingsSection>

        <SettingsSection title={SETTINGS_COPY.sections.playback}>
          <SettingsRow
            label={SETTINGS_COPY.playback.rate}
            value={
              screen.controls === null
                ? null
                : SETTINGS_COPY.playback.rateValue(screen.controls.playbackRate)
            }
            onPress={screen.openRateSheet}
            disabled={!hasControls}
          />
          {/* 오프라인 저장 관리는 P1 이연 — 메뉴를 노출하지 않는다(settings.md 4.1) */}
        </SettingsSection>

        <SettingsSection title={SETTINGS_COPY.sections.notification}>
          {screen.isNotificationBannerVisible ? (
            <NotificationBanner onPress={screen.openPrePrompt} />
          ) : null}
          <SettingsToggleRow
            label={SETTINGS_COPY.notification.dripToggle}
            value={screen.controls?.isDripNotificationEnabled ?? false}
            onToggle={screen.toggleDripNotification}
            isDimmed={screen.isDripToggleDimmed}
            disabled={!hasControls}
          />
          <SettingsToggleRow
            label={SETTINGS_COPY.notification.marketingToggle}
            value={screen.controls?.isMarketingAgreed ?? false}
            onToggle={screen.toggleMarketingConsent}
            disabled={!hasControls}
          />
        </SettingsSection>

        <SettingsSection title={SETTINGS_COPY.sections.info}>
          <SettingsRow label={SETTINGS_COPY.info.notice} onPress={screen.openNotice} />
          <SettingsRow label={SETTINGS_COPY.info.terms} onPress={screen.openTerms} />
          <SettingsRow label={SETTINGS_COPY.info.privacy} onPress={screen.openPrivacyPolicy} />
          <SettingsRow
            label={SETTINGS_COPY.info.version}
            value={APP_VERSION}
            badge={screen.isUpdateAvailable ? SETTINGS_COPY.info.updateBadge : null}
            rightSlot={
              screen.isUpdateAvailable ? (
                <Pressable
                  style={styles.updateButton}
                  onPress={screen.openStore}
                  accessibilityRole="button"
                  accessibilityLabel={SETTINGS_COPY.info.update}
                >
                  <Text style={styles.updateLabel}>{SETTINGS_COPY.info.update}</Text>
                </Pressable>
              ) : undefined
            }
            a11yLabel={SETTINGS_COPY.info.versionA11y(APP_VERSION, screen.isUpdateAvailable)}
          />
        </SettingsSection>

        <SettingsSection title={SETTINGS_COPY.sections.support}>
          <SettingsRow label={SETTINGS_COPY.support.contact} onPress={screen.openContact} />
        </SettingsSection>

        <SettingsSection title={SETTINGS_COPY.sections.account}>
          <SettingsRow label={SETTINGS_COPY.account.logout} onPress={screen.openLogoutDialog} />
          {/* 낮은 시각 비중이지만 숨기지 않는다 — 찾을 수 없는 탈퇴는 다크 패턴이다(settings-uiux.md 4.1) */}
          <SettingsRow
            label={SETTINGS_COPY.account.withdraw}
            onPress={screen.openWithdrawal}
            isSubdued
          />
        </SettingsSection>

        {/* 관리자 섹션 — 관리자 계정에만, 리스트 맨 끝(일반 계정에는 행 자체가 없다) */}
        {screen.isAdmin ? (
          <SettingsSection title={SETTINGS_COPY.sections.admin}>
            <SettingsRow label={SETTINGS_COPY.admin.menu} onPress={screen.openAdmin} />
          </SettingsSection>
        ) : null}
      </ScrollView>

      {/* ── 시트·다이얼로그 ── */}

      {screen.controls !== null ? (
        <PlaybackRateSheet
          isVisible={screen.isRateSheetVisible}
          currentRate={screen.controls.playbackRate}
          onSelect={screen.selectPlaybackRate}
          onClose={screen.closeRateSheet}
        />
      ) : null}

      {/* S5 로그아웃 확인 — 질문 하나로 충분하다. 처리 중 버튼 비활성(settings-uiux.md 4.4) */}
      <SettingsDialog
        isVisible={screen.isLogoutDialogVisible}
        title={SETTINGS_COPY.account.logoutConfirmTitle}
        secondaryAction={{
          label: SETTINGS_COPY.account.logoutCancel,
          onPress: screen.closeLogoutDialog,
          disabled: screen.isLoggingOut,
        }}
        primaryAction={{
          label: SETTINGS_COPY.account.logoutConfirm,
          onPress: screen.confirmLogout,
          disabled: screen.isLoggingOut,
        }}
        onCloseRequest={screen.closeLogoutDialog}
      />

      {/* S4 OS 권한 안내 — 거부된 권한은 재요청할 수 없어 [설정 열기]로 보낸다 */}
      <SettingsDialog
        isVisible={screen.isPermissionDialogVisible}
        title={SETTINGS_COPY.notification.permissionTitle}
        secondaryAction={{
          label: SETTINGS_COPY.notification.permissionClose,
          onPress: screen.closePermissionDialog,
        }}
        primaryAction={{
          label: SETTINGS_COPY.notification.permissionOpen,
          onPress: screen.openOsSettings,
        }}
        onCloseRequest={screen.closePermissionDialog}
      />

      {/* 문의하기 폴백 — 채널을 열 수 없으면 링크 복사(settings-uiux.md 4.6) */}
      <SettingsDialog
        isVisible={screen.isContactFallbackVisible}
        title={SETTINGS_COPY.support.contactFallbackTitle}
        secondaryAction={{
          label: SETTINGS_COPY.support.contactClose,
          onPress: screen.closeContactFallback,
        }}
        primaryAction={{
          label: SETTINGS_COPY.support.contactCopy,
          onPress: screen.copyContactLink,
        }}
        onCloseRequest={screen.closeContactFallback}
      >
        <Text style={styles.contactLink} selectable>
          {KAKAO_CHANNEL_URL}
        </Text>
      </SettingsDialog>

      {/* 유도 배너의 목적지 — 사전 안내(notification.md 소유) */}
      <NotificationPrePromptModal
        isVisible={screen.isPrePromptVisible}
        onFinished={screen.finishPrePrompt}
      />
    </SafeAreaView>
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
    paddingHorizontal: theme.spacing.sm,
  },
  backButton: {
    minHeight: theme.touchTarget.minHeight,
    minWidth: theme.touchTarget.minWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backGlyph: {
    fontSize: theme.font.size.xl,
    color: theme.color.textPrimary,
  },
  appBarTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: theme.font.size.md,
    fontWeight: '700',
    color: theme.color.textPrimary,
  },
  appBarSpacer: {
    minWidth: theme.touchTarget.minWidth,
  },
  scrollContent: {
    paddingVertical: theme.spacing.md,
    paddingBottom: theme.spacing.xxl,
    // 섹션 사이(24)를 섹션 안 항목 사이(구분선)보다 훨씬 넓게 벌린다 —
    // 묶음의 경계가 여백으로 먼저 읽혀야 한다(2026-09-02)
    gap: theme.spacing.lg,
  },
  summaryErrorCard: {
    marginHorizontal: theme.spacing.md,
    borderRadius: theme.radius.md,
    backgroundColor: theme.color.surface,
    alignItems: 'center',
    paddingVertical: theme.spacing.lg,
    gap: theme.spacing.xs,
  },
  summaryErrorText: {
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
  },
  summaryRetry: {
    minHeight: theme.touchTarget.minHeight,
    minWidth: theme.touchTarget.minWidth,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.sm,
  },
  summaryRetryLabel: {
    fontSize: theme.font.size.sm,
    fontWeight: '600',
    color: theme.color.primary,
  },
  updateButton: {
    minHeight: theme.touchTarget.minHeight,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.sm,
  },
  updateLabel: {
    fontSize: theme.font.size.sm,
    fontWeight: '600',
    color: theme.color.primary,
  },
  contactLink: {
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
  },
});
