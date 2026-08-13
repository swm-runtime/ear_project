import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useDelayedVisible } from '@/shared/hooks/useDelayedVisible';
import { theme } from '@/shared/theme';
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

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/*
        설정 아이콘 — 헤더(프로필 줄)의 오른쪽 끝에 세로 가운데로 얹는다.
        헤더 안에 넣지 않는 이유는 **조회 결과와 무관하게 즉시 노출해야** 하기 때문이다(P6).
        헤더는 조회 실패·로딩 중에는 그려지지 않으므로, 그 안에 두면 설정 진입이 함께 사라진다.
      */}
      <View style={styles.settingsSlot}>
        <Pressable
          style={styles.settingsButton}
          onPress={screen.openSettings}
          accessibilityRole="button"
          accessibilityLabel={PROFILE_COPY.header.settingsA11y}
        >
          <SettingsIcon size={SETTINGS_ICON_SIZE} color={theme.color.textPrimary} />
        </Pressable>
      </View>

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
                provider={screen.header.provider}
                email={screen.header.email}
                plan={screen.planCard}
                onPlanPress={screen.openPlan}
              />
            ) : null}
            {/* 이메일 카드를 두지 않는다 — 주소는 헤더가 이미 보여준다. 같은 값을 한 화면에
                두 번 쓰면 어느 쪽이 최신인지 묻게 된다. 등록·인증·변경 진입점은 설정의
                이메일 행이 갖는다(settings-uiux.md — 설정은 허브다) */}

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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.color.background,
  },
  /** 헤더 높이만큼만 차지하는 겹침 층 — 그 안에서 세로 가운데로 정렬된다 */
  settingsSlot: {
    position: 'absolute',
    top: 0,
    right: theme.spacing.sm,
    height: PROFILE_IDENTITY_ROW_HEIGHT,
    justifyContent: 'center',
    // 스크롤 내용 위에 떠 있어야 눌린다
    zIndex: 1,
  },
  settingsButton: {
    minHeight: theme.touchTarget.minHeight,
    minWidth: theme.touchTarget.minWidth,
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
