import { StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { APP_LANGUAGE } from '@/shared/i18n/locale';
import { theme } from '@/shared/theme';
import { SkeletonBlock, SkeletonCircle, SkeletonGroup, SkeletonLine } from '@/shared/ui/Skeleton';

import { MAX_MARQUEE_ROWS } from '../services/topic-rows';

/**
 * 마퀴 알약 폭 — 주제 화면(TopicSelectScreen)의 실제 알약과 스켈레톤이 같은 값을 쓴다. 마퀴는 알약 폭이 같아야 한 바퀴
 * 길이가 맞아 고정 폭이다. 영어 주제 이름("Personal Finance" 등)은 156 에서 말줄임돼 영어는 184(KAN-197), GLOBAL 주제의
 * 가장 긴 이름 "Korean History & Society"·"K-Beauty & Fashion" 이 184 에서도 말줄임돼 216(2026-10-18 영어 QA — 라벨 좌우 여백도
 * 영어는 16 으로 줄인다, TopicChip). 사진(2.50:1)은 세로가 조금 더 잘린다. 한국어는 그대로 156
 */
export const TOPIC_PILL_WIDTH = APP_LANGUAGE === 'ko' ? 156 : 216;
const PILL_HEIGHT = theme.touchTarget.minHeight + theme.spacing.sm;
const PILLS_PER_ROW = 3;
/** 원형 [다음] 자리 — TopicSelectScreen `next` 와 같은 64 */
const NEXT_BUTTON_SIZE = 64;

/**
 * 주제 알약 줄 자리 — 마퀴 4줄 × 알약 3개. **반드시 `SkeletonGroup` 안에서 쓴다**(낭독 라벨·반짝임은 그룹 몫).
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
              width={TOPIC_PILL_WIDTH}
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
