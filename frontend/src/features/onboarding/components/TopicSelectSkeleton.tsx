import { StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { theme } from '@/shared/theme';
import { SkeletonBlock, SkeletonCircle, SkeletonGroup, SkeletonLine } from '@/shared/ui/Skeleton';

import { TOPIC_CHIP_MIN_WIDTH } from '@/features/interest';

import { MAX_MARQUEE_ROWS } from '../services/topic-rows';

/**
 * 알약 자리 폭 — 실제 알약은 라벨 폭을 따르므로(PM 확정 2026-10-19) 스켈레톤도 같은 폭으로 늘어세우지 않는다.
 * 줄마다 다른 순서로 돌려 써서 폭이 제각각인 알약 줄처럼 보이게 한다. 가장 짧은 자리는 칩 최소 폭과 같다
 */
const PILL_WIDTHS = [
  TOPIC_CHIP_MIN_WIDTH + 24,
  TOPIC_CHIP_MIN_WIDTH,
  TOPIC_CHIP_MIN_WIDTH + 56,
] as const;
const PILL_HEIGHT = theme.touchTarget.minHeight + theme.spacing.sm;
const PILLS_PER_ROW = 4;
/** 원형 [다음] 자리 — TopicSelectScreen `next` 와 같은 64 */
const NEXT_BUTTON_SIZE = 64;

/**
 * 주제 알약 줄 자리 — 마퀴 4줄 × 알약 4개(넘치는 끝은 화면 밖으로 잘린다). **반드시 `SkeletonGroup` 안에서 쓴다**(낭독 라벨·반짝임은 그룹 몫).
 * 주제 화면(목록 로딩)과 온보딩 진입 스켈레톤이 같이 쓴다.
 */
export function TopicPillRowsSkeleton() {
  return (
    <>
      {Array.from({ length: MAX_MARQUEE_ROWS }, (_, rowIndex) => (
        <View key={rowIndex} style={styles.pillRow}>
          {Array.from({ length: PILLS_PER_ROW }, (_, index) => (
            <SkeletonBlock
              key={index}
              width={PILL_WIDTHS[(rowIndex + index) % PILL_WIDTHS.length]}
              height={PILL_HEIGHT}
              radius="full"
            />
          ))}
        </View>
      ))}
    </>
  );
}

/**
 * 온보딩 진입 스켈레톤 — 재개 지점(onboarding_step)을 받기 전에는 어느 단계로 갈지 모르지만, 대부분은 첫 단계라
 * **주제 선택(O1) 레이아웃**을 그린다: 가운데 툴바 제목 · 단계 표시 · 두 줄 헤드라인 · 알약 4줄 · 원형 [다음].
 * 배치·치수는 TopicSelectScreen 과 같다 — 다르면 화면이 뜨는 순간 튄다. 0.3초 미만 미표시는 호출부 몫이다.
 */
export default function TopicSelectSkeleton() {
  const insets = useSafeAreaInsets();
  return (
    <SafeAreaView style={styles.container}>
      <SkeletonGroup style={styles.body}>
        <View style={[styles.header, { paddingTop: Math.max(theme.spacing.md - insets.top, 0) }]}>
          <View style={styles.toolbar}>
            <SkeletonLine width={120} height={24} />
          </View>
          <SkeletonLine width={56} height={theme.font.size.sm} style={styles.stepLabel} />
          <View style={styles.title}>
            <SkeletonLine width="70%" height={theme.font.size.xl} />
            <SkeletonLine width="85%" height={theme.font.size.xl} />
          </View>
          <View style={styles.progressSlot} />
        </View>
        <View style={styles.centerSpacer} />
        <View style={styles.marqueeArea}>
          <TopicPillRowsSkeleton />
        </View>
        <View style={styles.centerSpacer} />
        <View style={styles.dock}>
          <SkeletonCircle size={NEXT_BUTTON_SIZE} />
        </View>
      </SkeletonGroup>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.color.background,
    paddingHorizontal: theme.spacing.lg,
  },
  body: {
    flex: 1,
  },
  header: {
    gap: theme.spacing.sm,
  },
  toolbar: {
    height: theme.touchTarget.minHeight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepLabel: {
    marginVertical: theme.spacing.md,
  },
  // 헤드라인 줄 간격 — 글자 크기 xl × 줄 높이 1.35 와 같은 리듬
  title: {
    gap: theme.font.size.xl * 0.35,
  },
  progressSlot: {
    minHeight: 40,
  },
  centerSpacer: {
    flex: 1,
  },
  marqueeArea: {
    marginHorizontal: -theme.spacing.lg,
    gap: theme.spacing.sm + theme.spacing.xs,
    overflow: 'hidden',
  },
  pillRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
  },
  dock: {
    paddingBottom: theme.spacing.xxl + theme.spacing.lg,
    alignItems: 'flex-end',
  },
});
