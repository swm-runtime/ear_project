import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useDelayedVisible } from '@/shared/hooks/useDelayedVisible';
import { theme } from '@/shared/theme';

import CareerCard from '../components/CareerCard';
import EmailCard from '../components/EmailCard';
import InterestCard from '../components/InterestCard';
import PlanCard from '../components/PlanCard';
import ProfileHeader from '../components/ProfileHeader';
import ProfileSkeleton from '../components/ProfileSkeleton';
import StatsSummaryRow from '../components/StatsSummaryRow';
import TopicDonut from '../components/TopicDonut';
import WeeklyChart from '../components/WeeklyChart';
import { useProfileScreen } from '../hooks/useProfileScreen';
import { PROFILE_COPY } from '../profile.copy';

/**
 * 프로필 탭(P1~P10) — 화면은 뷰만 담당하고 로직은 useProfileScreen이 소유한다.
 * 하나의 세로 스크롤: 헤더 / 플랜 / 이메일 / 구분선 / 관심 주제 / 커리어 / 통계 3영역(profile-uiux.md 4.1).
 * 카드 순서는 바꾸지 않는다 — 위 둘은 계정·결제, 아래 둘은 추천에 쓰이는 값이다.
 */
export default function ProfileScreen() {
  const screen = useProfileScreen();
  // 0.3초 미만 로딩은 표시하지 않는다(common-error-handling.md 5장)
  const showSkeleton = useDelayedVisible(screen.isInitialLoading);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* 설정 아이콘은 조회 결과와 무관하게 즉시 노출한다(P6) — 진입은 프로필 조회와 무관하다 */}
      <View style={styles.topBar}>
        <Pressable
          style={styles.settingsButton}
          onPress={screen.openSettings}
          accessibilityRole="button"
          accessibilityLabel={PROFILE_COPY.header.settingsA11y}
        >
          {/* 아이콘 리소스 도입 전 글리프 표기(MainNavigator 탭 라벨과 같은 태도) */}
          <Text style={styles.settingsGlyph}>⚙</Text>
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
              <ProfileHeader nickname={screen.header.nickname} provider={screen.header.provider} />
            ) : null}

            {screen.planCard !== null ? (
              <PlanCard
                state={screen.planCard}
                onPress={screen.openPlan}
                onRetry={screen.retry}
                isRetrying={screen.isRetrying}
              />
            ) : null}
            {screen.emailCard !== null ? (
              <EmailCard
                state={screen.emailCard}
                onPress={screen.openEmail}
                onRetry={screen.retry}
                isRetrying={screen.isRetrying}
              />
            ) : null}

            {/* 위 둘(계정·결제)과 아래 둘(추천용 값)의 성격 구분선(profile-uiux.md 4.1) */}
            <View style={styles.divider} />

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
  topBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: theme.spacing.sm,
  },
  settingsButton: {
    minHeight: theme.touchTarget.minHeight,
    minWidth: theme.touchTarget.minWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsGlyph: {
    fontSize: theme.font.size.lg,
    color: theme.color.textPrimary,
  },
  scrollContent: {
    paddingBottom: theme.spacing.xxl,
  },
  content: {
    gap: theme.spacing.sm,
  },
  divider: {
    height: 1,
    backgroundColor: theme.color.border,
    marginHorizontal: theme.spacing.md,
    marginVertical: theme.spacing.sm,
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
