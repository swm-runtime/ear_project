import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useDelayedVisible } from '@/shared/hooks/useDelayedVisible';
import { theme } from '@/shared/theme';
import ConfirmDialog from '@/shared/ui/ConfirmDialog';
import SettingsIcon from '@/shared/ui/SettingsIcon';

import CareerCard from '../components/CareerCard';
import InterestCard from '../components/InterestCard';
import ProfileHeader, { PROFILE_IDENTITY_ROW_HEIGHT } from '../components/ProfileHeader';
import ProfileSkeleton from '../components/ProfileSkeleton';
import StatsSummaryRow from '../components/StatsSummaryRow';
import TopicDonut from '../components/TopicDonut';
import WeeklyChart from '../components/WeeklyChart';
import { useProfileScreen } from '../hooks/useProfileScreen';
import { PROFILE_COPY } from '../profile.copy';

const SETTINGS_ICON_SIZE = 22;

/** 아이콘 크기(22)를 터치 타깃 44pt로 채운다 — 보이는 상자를 키우면 닉네임 줄이 함께 커진다 */
const SETTINGS_HIT_SLOP = (theme.touchTarget.minHeight - SETTINGS_ICON_SIZE) / 2;

/**
 * 프로필 탭(P1~P10) — 화면은 뷰만 담당하고 로직은 useProfileScreen이 소유한다.
 * 하나의 세로 스크롤: 헤더 / 플랜 / 관심 주제 / 커리어 / 통계 3영역(profile-uiux.md 4.1).
 * 카드 순서는 바꾸지 않는다 — 위는 계정·결제, 아래 둘은 추천에 쓰이는 값이다.
 * 구분선은 두지 않는다 — 이메일 카드가 빠져 위가 한 장뿐이라, 1대 2를 가르는 선이 됐다.
 */
export default function ProfileScreen() {
  const screen = useProfileScreen();
  // 0.3초 미만 로딩은 표시하지 않는다(common-error-handling.md 5장)
  const showSkeleton = useDelayedVisible(screen.isInitialLoading);

  /**
   * 설정 아이콘 — **화면이 소유하고 자리만 헤더에 빌려준다.**
   * 조회 결과와 무관하게 노출해야 하는데(P6) 헤더는 실패·로딩 중에 그려지지 않는다.
   * 그래서 헤더가 있으면 닉네임 줄에 넣고(스크롤하면 이름과 함께 올라간다),
   * 없으면 화면 오른쪽 위에 직접 띄운다 — 어느 쪽이든 설정 진입은 사라지지 않는다.
   */
  const settingsButton = (
    <Pressable
      style={styles.settingsButton}
      onPress={screen.openSettings}
      hitSlop={SETTINGS_HIT_SLOP}
      accessibilityRole="button"
      accessibilityLabel={PROFILE_COPY.header.settingsA11y}
    >
      <SettingsIcon size={SETTINGS_ICON_SIZE} color={theme.color.textPrimary} />
    </Pressable>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {screen.header === null ? <View style={styles.settingsSlot}>{settingsButton}</View> : null}

      {screen.isInitialLoading ? (
        showSkeleton ? (
          <ProfileSkeleton />
        ) : null
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={screen.isManualRefreshing}
              onRefresh={screen.refresh}
              tintColor={theme.color.textSecondary}
            />
          }
        >
          {/* 그래프 밖 빈 곳 탭 → 말풍선 해제. 카드·막대·버튼은 자기 탭을 먼저 가져가므로
              이 핸들러는 상호작용 없는 영역에서만 발화한다. 시각·접근성 표면이 아니다(accessible=false) */}
          <Pressable
            style={styles.content}
            onPress={screen.weekly.clearBarTooltip}
            accessible={false}
          >
            {screen.header !== null ? (
              <ProfileHeader
                nickname={screen.header.nickname}
                profileImageUrl={screen.header.profileImageUrl}
                provider={screen.header.provider}
                email={screen.header.email}
                isEmailVerified={screen.header.isEmailVerified}
                onEmailPress={screen.openEmail}
                plan={screen.planCard}
                onPlanPress={screen.openPlan}
                settingsSlot={settingsButton}
              />
            ) : null}
            {/* 이메일 카드를 두지 않는다 — 주소는 헤더가 이미 보여준다. 같은 값을 한 화면에
                두 번 쓰면 어느 쪽이 최신인지 묻게 된다. 프로필 쪽 등록·인증·변경 진입은
                헤더의 이메일 줄이 갖는다(profile.md 4.3 — 설정 경로와 같은 화면) */}

            {screen.interestCard !== null ? (
              <InterestCard
                state={screen.interestCard}
                onPress={screen.openInterests}
                onRetry={screen.retry}
                isRetrying={screen.isRetrying}
              />
            ) : null}
            {screen.careerCard !== null ? (
              <CareerCard
                state={screen.careerCard}
                onPress={screen.openCareer}
                onRetry={screen.retry}
                isRetrying={screen.isRetrying}
              />
            ) : null}

            {screen.stats !== null ? (
              screen.stats.kind === 'error' ? (
                // P10 변형 B — 통계 영역 전체를 하나의 에러 블록으로 접는다. 카드·내비게이션은 정상
                <View style={styles.statsErrorBlock}>
                  <Text style={styles.statsErrorTitle}>{PROFILE_COPY.stats.errorTitle}</Text>
                  <Text style={styles.statsErrorText}>{PROFILE_COPY.stats.error}</Text>
                  <Pressable
                    style={styles.statsRetryButton}
                    onPress={screen.retry}
                    disabled={screen.isRetrying}
                    accessibilityRole="button"
                    accessibilityLabel={PROFILE_COPY.retry}
                    accessibilityState={{ disabled: screen.isRetrying }}
                  >
                    <Text style={styles.statsRetryText}>{PROFILE_COPY.retry}</Text>
                  </Pressable>
                </View>
              ) : (
                // 통계 3영역 — 요약 → 주간 그래프 → 주제 분포 순서 고정(profile.md 4.1)
                <View style={styles.statsArea}>
                  <StatsSummaryRow summary={screen.stats.data.summary} />
                  <WeeklyChart weekly={screen.weekly} />
                  <TopicDonut distribution={screen.stats.data.distribution} />
                </View>
              )
            ) : null}
          </Pressable>
        </ScrollView>
      )}

      {/* 인증된 이메일 변경 불가 안내 — 설정과 같은 화면을 쓴다(auth.md 4.4) */}
      <ConfirmDialog
        isVisible={screen.isEmailLockedVisible}
        title={PROFILE_COPY.email.lockedTitle}
        body={PROFILE_COPY.email.lockedBody}
        secondaryAction={{
          label: PROFILE_COPY.email.lockedClose,
          onPress: screen.closeEmailLocked,
        }}
        primaryAction={{
          label: PROFILE_COPY.email.lockedContact,
          onPress: screen.contactFromEmailLocked,
        }}
        onCloseRequest={screen.closeEmailLocked}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.color.background,
  },
  /** 헤더가 없을 때만 쓰는 겹침 층 — 헤더 높이만큼 차지하고 그 안에서 세로 가운데로 정렬된다 */
  settingsSlot: {
    position: 'absolute',
    top: 0,
    // 헤더가 들어올 때 아이콘이 옆으로 튀지 않게 identityRow 의 오른쪽 여백과 같은 값을 쓴다
    right: theme.spacing.md,
    /**
     * `PROFILE_IDENTITY_ROW_HEIGHT`(위쪽 여백 24 + 아바타 64) 안에서 가운데를 잡으면
     * 위쪽 여백이 포함된 만큼 위로 올라가 **닉네임 줄과 거의 같은 높이**가 된다 —
     * 헤더가 들어오면서 아이콘이 위아래로 뛰지 않는다.
     */
    height: PROFILE_IDENTITY_ROW_HEIGHT,
    justifyContent: 'center',
    // 스크롤 내용 위에 떠 있어야 눌린다
    zIndex: 1,
  },
  /** 보이는 상자는 아이콘 크기 그대로 두고 터치 타깃은 hitSlop 으로 채운다 */
  settingsButton: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingBottom: theme.spacing.xxl,
  },
  content: {
    gap: theme.spacing.sm,
  },
  statsArea: {
    gap: theme.spacing.lg,
    marginTop: theme.spacing.md,
  },
  statsErrorBlock: {
    marginTop: theme.spacing.md,
    marginHorizontal: theme.spacing.md,
    borderRadius: theme.radius.md,
    backgroundColor: theme.color.surface,
    alignItems: 'center',
    paddingVertical: theme.spacing.lg,
    gap: theme.spacing.xs,
  },
  statsErrorTitle: {
    fontSize: theme.font.size.md,
    fontWeight: '600',
    color: theme.color.textPrimary,
  },
  statsErrorText: {
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
  },
  statsRetryButton: {
    minHeight: theme.touchTarget.minHeight,
    minWidth: theme.touchTarget.minWidth,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.sm,
  },
  statsRetryText: {
    fontSize: theme.font.size.sm,
    fontWeight: '600',
    color: theme.color.primary,
  },
});
