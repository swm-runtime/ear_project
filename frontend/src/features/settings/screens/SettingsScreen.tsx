import { useRef } from 'react';
import { Animated, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDelayedVisible } from '@/shared/hooks/useDelayedVisible';
import { APP_VERSION, APP_VERSION_LABEL, IS_DEV_API } from '@/shared/lib/app-version';
import { IS_SUBSCRIPTION_UI_ENABLED } from '@/shared/lib/feature-flags';
import { USES_SYSTEM_PUSHED_HEADER } from '@/shared/navigation/pushed-screen-header';
import { useSystemLargeTitle } from '@/shared/navigation/useSystemLargeTitle';
import { theme } from '@/shared/theme';
import AndroidBlurTarget from '@/shared/ui/AndroidBlurTarget';
import AndroidCollapsingBar from '@/shared/ui/AndroidCollapsingBar';
import ChevronIcon from '@/shared/ui/ChevronIcon';
import ConfirmDialog from '@/shared/ui/ConfirmDialog';
import { useFloatingHeaderScroll } from '@/shared/ui/FloatingHeader';
import GlassCapsule, { HEADER_CONTROL_HEIGHT } from '@/shared/ui/GlassCapsule';
import LargeTitleRow from '@/shared/ui/LargeTitleRow';
import { pillButton } from '@/shared/ui/pill-button.styles';
import { Text } from '@/shared/ui/Typography';

import { NotificationPrePromptModal } from '@/features/notification';

import AudioQualitySection from '../components/AudioQualitySection';
import ColorModeSection from '../components/ColorModeSection';
import DevDiagnosticsRows from '../components/DevDiagnosticsRows';
import DevPushTokenRow from '../components/DevPushTokenRow';
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
  const { scrollY, scrollProps } = useFloatingHeaderScroll();
  // Android 바는 목록 **위에 떠 있다**(밑으로 목록이 지나가며 블러로 비친다) — 상태 바까지 덮으므로 안전영역을 직접 준다
  const insets = useSafeAreaInsets();
  // 떠 있는 바의 블러가 흐릴 대상 — 목록을 감싼다(Android)
  const blurTargetRef = useRef<View>(null);
  // Android 접힘 바 제목 탭 → 맨 위로(PM 2026-09-30 04:53 — 라이브러리·탐색과 같은 동작)
  const scrollRef = useRef<ScrollView>(null);
  // iOS 26: **시스템 큰 제목** — 라이브러리·탐색과 같다(PM 2026-09-28 03:14 "이거야"). 뒤로 버튼이 있어 UIKit 이 큰 제목을
  // 버튼 줄 밑에 두고, 스크롤 접힘·바 밑 블러는 시스템이 한다
  // 접힌 작은 제목 크기는 훅 기본값(전 화면 공통 — 04:09 PM)
  useSystemLargeTitle(SETTINGS_COPY.title, null);

  return (
    <SafeAreaView
      style={styles.container}
      edges={USES_SYSTEM_PUSHED_HEADER || ANDROID_LARGE_TITLE ? [] : ['top']}
    >
      {/* 앱바 — 뒤로가기 + "설정"(settings-uiux.md 4.1). iOS 26 은 시스템 투명 바(뒤로만) + 콘텐츠 큰 제목
          (PUSHED_SCREEN_HEADER, PM 2026-09-27 01:42 "설정 페이지도 UI 일관되게") */}
      {USES_SYSTEM_PUSHED_HEADER || ANDROID_LARGE_TITLE ? null : (
        <View style={styles.appBar}>
          <Pressable
            style={styles.backButton}
            onPress={screen.goBack}
            accessibilityRole="button"
            accessibilityLabel={SETTINGS_COPY.backA11y}
          >
            <ChevronIcon direction="left" size={BACK_ICON_SIZE} color={theme.color.textPrimary} />
          </Pressable>
          <Text style={styles.appBarTitle} accessibilityRole="header">
            {SETTINGS_COPY.title}
          </Text>
          <View style={styles.appBarSpacer} />
        </View>
      )}

      <AndroidBlurTarget targetRef={blurTargetRef}>
        <Animated.ScrollView
          ref={scrollRef}
          contentContainerStyle={[
            styles.scrollContent,
            // Android — 버튼 줄 바로 아래 제목을 둔다. 별도 16pt 여백은 iOS보다 간격을 벌려 제거했다.
            ANDROID_LARGE_TITLE && {
              paddingTop: insets.top + ANDROID_BAR_ROW_HEIGHT,
            },
          ]}
          // 투명 시스템 바 밑을 비운다(iOS 26). 그 외 갈래는 RN 기본(never)
          contentInsetAdjustmentBehavior={USES_SYSTEM_PUSHED_HEADER ? 'automatic' : 'never'}
          {...scrollProps}
        >
          {ANDROID_LARGE_TITLE ? (
            <View style={styles.androidLargeTitle}>
              <LargeTitleRow title={SETTINGS_COPY.title} />
            </View>
          ) : null}
          {/* ── 상단 요약(계정·구독) — 서버 값이 필요한 영역만 로딩·에러가 있다(S6) ── */}
          {screen.isInitialLoading ? (
            showSkeleton ? (
              <SettingsTopSkeleton />
            ) : null
          ) : screen.isFullError ? (
            <View style={styles.summaryErrorCard}>
              <Text style={styles.summaryErrorText}>{SETTINGS_COPY.summaryError}</Text>
              <Pressable
                style={[pillButton.base, styles.summaryRetry]}
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

              {/* 구독 섹션 — 결제 구현 전 MVP 바이너리에서는 그리지 않는다(KAN-66, feature-flags.ts) */}
              {IS_SUBSCRIPTION_UI_ENABLED ? (
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
              ) : null}
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

          {/* 음질(settings.md 4.6) — 고를 것이 둘 이상일 때만. 구독 UI 꺼진 바이너리·옛 서버면 섹션 없음 */}
          {screen.audioQuality !== null ? (
            <AudioQualitySection
              selected={screen.audioQuality.selected}
              options={screen.audioQuality.options}
              onSelect={screen.selectAudioQuality}
            />
          ) : null}

          {/* 화면 모드(다크 모드, 2026-10-10) — 기기 표시 설정이라 서버 응답과 무관하게 늘 보인다 */}
          <ColorModeSection />

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
            {/* 제3자 저작물 고지 — 랜딩 /licenses 를 연다(CC BY 아이콘 표기, changes/archive/third-party-notice-in-app.md) */}
            <SettingsRow label={SETTINGS_COPY.info.licenses} onPress={screen.openLicenses} />
            <SettingsRow
              label={SETTINGS_COPY.info.version}
              // 버전 뒤 괄호는 실행 중인 JS 번들 식별자다 — OTA 적용 여부를 눈으로 가른다
              value={APP_VERSION_LABEL}
              badge={screen.isUpdateAvailable ? SETTINGS_COPY.info.updateBadge : null}
              rightSlot={
                screen.isUpdateAvailable ? (
                  <Pressable
                    style={[pillButton.base, styles.updateButton]}
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
            {/* 파괴적 항목 — 로그아웃과 같은 크기의 빨강(PM 2026-09-27 22:45, iOS 설정의 "계정 삭제" 문법).
              숨기지 않는다 — 찾을 수 없는 탈퇴는 다크 패턴이다(settings-uiux.md 4.1) */}
            <SettingsRow
              label={SETTINGS_COPY.account.withdraw}
              onPress={screen.openWithdrawal}
              isDestructive
            />
          </SettingsSection>

          {/* 관리자 섹션 — 관리자 계정에만, 리스트 맨 끝(일반 계정에는 행 자체가 없다) */}
          {screen.isAdmin ? (
            <SettingsSection title={SETTINGS_COPY.sections.admin}>
              <SettingsRow label={SETTINGS_COPY.admin.menu} onPress={screen.openAdmin} />
            </SettingsSection>
          ) : null}

          {/* 개발계 진단은 사용자 메뉴 아래에 별도 묶음으로 둔다. 운영 앱에는 노출하지 않는다. */}
          {IS_DEV_API ? (
            <SettingsSection title={SETTINGS_COPY.sections.developer}>
              <DevPushTokenRow />
              <DevDiagnosticsRows />
            </SettingsSection>
          ) : null}
        </Animated.ScrollView>
      </AndroidBlurTarget>

      {/* Android 떠 있는 바는 목록(BlurTargetView) **뒤에** 그린다 — BlurView 는 붙는 순간 한 번만 대상을 찾는데, 앞에 두면
          그때 목록의 ref 가 아직 비어 블러가 안 걸렸다(PM 2026-09-29 15:50 스샷 — 글자가 흐려지지 않고 연해지기만). 절대 배치라 위치는 같다 */}
      {ANDROID_LARGE_TITLE ? (
        /*
         * **Android — 애플 문법**(PM 2026-09-29 14:42 "설정을 애플처럼, 제목 위에 원형 버튼에 <"): 위 줄엔 유리 원 안의 ‹ 만,
         * 큰 제목 "설정"은 콘텐츠 첫 줄, 내리면 가운데 작은 제목 + 서리 유리. 라이브러리·탐색과 같은 공용 바(AndroidCollapsingBar,
         * 23:11 "설정 화면 코드도 통일")
         */
        <AndroidCollapsingBar
          title={SETTINGS_COPY.title}
          scrollY={scrollY}
          blurTarget={blurTargetRef}
          onTitlePress={() => scrollRef.current?.scrollTo({ y: 0, animated: true })}
          leading={
            <GlassCapsule style={styles.androidBackCircle}>
              <Pressable
                style={styles.androidBackPressable}
                onPress={screen.goBack}
                accessibilityRole="button"
                accessibilityLabel={SETTINGS_COPY.backA11y}
                hitSlop={4}
              >
                <ChevronIcon
                  direction="left"
                  size={ANDROID_BACK_ICON_SIZE}
                  color={theme.color.textPrimary}
                />
              </Pressable>
            </GlassCapsule>
          }
        />
      ) : null}

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
      {/* 인증된 이메일 변경 불가 안내 — 프로필과 같은 화면을 쓴다(auth.md 4.4) */}
      <ConfirmDialog
        isVisible={screen.isEmailLockedVisible}
        title={SETTINGS_COPY.email.lockedTitle}
        body={SETTINGS_COPY.email.lockedBody}
        secondaryAction={{
          label: SETTINGS_COPY.email.lockedClose,
          onPress: screen.closeEmailLocked,
        }}
        primaryAction={{
          label: SETTINGS_COPY.email.lockedContact,
          onPress: screen.contactFromEmailLocked,
        }}
        onCloseRequest={screen.closeEmailLocked}
      />

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
          // 파괴적 확인 — 채운 빨강(PM 2026-09-28 00:15). 취소는 연한 면 그대로다
          isDestructive: true,
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

/** 앱바 뒤로 셰브론 — 글자 `‹` 는 폰트마다 굵기·세로 위치가 달라 도형으로 그린다(design.md §5) */
const BACK_ICON_SIZE = 24;
/** Android 애플 문법 헤더(원형 ‹ + 콘텐츠 큰 제목) — iOS 26 은 시스템 바, 옛 iOS 는 종전 앱바 */
const ANDROID_LARGE_TITLE = Platform.OS === 'android' && !USES_SYSTEM_PUSHED_HEADER;
const ANDROID_BACK_ICON_SIZE = 20;
/** Android 떠 있는 바의 줄 높이(상태 바 제외) — 44 에서 52 로(PM 2026-09-29 15:10 "상단바 높이 조금만 더") */
const ANDROID_BAR_ROW_HEIGHT = 52;

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
  // Android — iOS 26 뒤로 버튼처럼 유리 원(40) 안의 ‹. 오른쪽은 같은 폭을 비워 작은 제목이 가운데에 선다
  /*
   * 원의 왼쪽 끝을 콘텐츠 왼쪽 선(큰 제목·섹션 = md 16)에 맞춘다(PM 2026-09-29 14:54 "왼쪽 공백이 예전 기준") — 종전 앱바는
   * 44 칸(sm 8 + 칸 안 가운데 ‹)이라 여백이 8+α 였고, 원(40)을 그 자리에 두니 12 에서 시작해 제목 선과 어긋났다.
   * iOS 26 뒤로 버튼도 16 에서 시작한다
   */
  androidBackCircle: {
    width: HEADER_CONTROL_HEIGHT,
    height: HEADER_CONTROL_HEIGHT,
  },
  androidBackPressable: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // 큰 제목 줄 — 섹션 간격(gap)과 겹치지 않게 아래로 살짝 당긴다
  androidLargeTitle: {
    marginBottom: -theme.spacing.sm,
  },
  // 큰 제목 줄 — 섹션 간격(gap)과 겹치지 않게 아래 여백은 줄 자체가 갖는다
  scrollContent: {
    paddingVertical: theme.spacing.md,
    paddingBottom: theme.spacing.xxl,
    // 섹션 사이(24)를 섹션 안 항목 사이(구분선)보다 훨씬 넓게 벌린다 —
    // 묶음의 경계가 여백으로 먼저 읽혀야 한다(2026-09-02)
    gap: theme.spacing.lg,
  },
  summaryErrorCard: {
    marginHorizontal: theme.spacing.md,
    borderRadius: theme.radius.xl,
    borderCurve: 'continuous',
    backgroundColor: theme.color.surface,
    alignItems: 'center',
    paddingVertical: theme.spacing.lg,
    paddingHorizontal: theme.spacing.md,
    gap: theme.spacing.xs,
  },
  summaryErrorText: {
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
  },
  // 흰 알약(회색 면 위) — 모양은 공용 알약(pillButton.base), 면 색·크기만 여기서
  summaryRetry: {
    minHeight: theme.touchTarget.minHeight,
    minWidth: theme.touchTarget.minWidth,
    paddingHorizontal: theme.spacing.md,
    backgroundColor: theme.color.background,
  },
  summaryRetryLabel: {
    fontSize: theme.font.size.sm,
    fontWeight: '600',
    color: theme.color.primary,
  },
  // 흰 알약 — 모양은 공용 알약(pillButton.base)
  updateButton: {
    minHeight: theme.touchTarget.minHeight,
    minWidth: theme.touchTarget.minWidth,
    paddingHorizontal: theme.spacing.md,
    backgroundColor: theme.color.background,
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
