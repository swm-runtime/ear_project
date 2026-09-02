import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { theme } from '@/shared/theme';
import FullScreenError from '@/shared/ui/FullScreenError';

import { TopicChip } from '@/features/interest';

import StepIndicator from '../components/StepIndicator';
import { useTopicSelectScreen } from '../hooks/useTopicSelectScreen';
import { ONBOARDING_COPY } from '../onboarding.copy';

/** O5 — 칩 모양 스켈레톤. 스피너를 중앙에 띄우지 않는다(onboarding-uiux.md 4.2) */
const SKELETON_CHIP_COUNT = 8;

/**
 * O1–O3 관심 주제 선택(1/3). 이 화면에는 [건너뛰기]가 없다 —
 * 주제는 드립 편성의 유일한 필수 신호다(onboarding-uiux.md 4.1).
 */
export default function TopicSelectScreen() {
  const insets = useSafeAreaInsets();
  const {
    topics,
    selectedCount,
    maxSelectable,
    canGoNext,
    isSubmitting,
    showSkeleton,
    isLoading,
    isError,
    isRefetching,
    refetch,
    toggleTopic,
    handleNextPress,
  } = useTopicSelectScreen();

  // 로딩 중에도 인디케이터와 제목은 먼저 그린다 — 이 단계가 무엇인지는 이미 정해져 있다(onboarding-uiux.md 4.2)
  return (
    <SafeAreaView style={styles.container}>
      <View style={[styles.header, { paddingTop: Math.max(theme.spacing.md - insets.top, 0) }]}>
        {/*
          2·3단계에는 [이전] 버튼이 있어 인디케이터가 그 높이만큼 내려와 있다.
          1단계는 되돌아갈 곳이 없지만(4.1) 같은 자리를 비워 위치를 맞춘다 —
          단계를 넘길 때 진행 막대가 위아래로 튀면 진행이 아니라 다른 화면으로 읽힌다.
        */}
        <View style={styles.backPlaceholder} />
        <StepIndicator current={1} />
        <Text style={styles.title}>{ONBOARDING_COPY.topic.title}</Text>
        <Text style={styles.countGuide} accessibilityLiveRegion="polite">
          {selectedCount === 0
            ? ONBOARDING_COPY.topic.guideBeforeSelect
            : ONBOARDING_COPY.topic.countLabel(selectedCount, maxSelectable)}
        </Text>
      </View>

      {isError ? (
        <FullScreenError
          title={ONBOARDING_COPY.topic.loadFailedTitle}
          description={ONBOARDING_COPY.topic.loadFailedDescription}
          retryLabel={ONBOARDING_COPY.topic.retry}
          isRetrying={isRefetching}
          onRetry={refetch}
        />
      ) : (
        <ScrollView contentContainerStyle={styles.chipArea}>
          {isLoading ? (
            showSkeleton ? (
              Array.from({ length: SKELETON_CHIP_COUNT }, (_, index) => (
                <View key={index} style={styles.skeletonChip} />
              ))
            ) : null
          ) : (
            topics.map((topic) => (
              <TopicChip
                key={topic.topicId}
                topicId={topic.topicId}
                label={topic.name}
                isSelected={topic.isSelected}
                isDimmed={topic.isDimmed}
                dimmedHint={ONBOARDING_COPY.topic.limitToast}
                onPress={() => toggleTopic(topic.topicId)}
              />
            ))
          )}
        </ScrollView>
      )}

      {!isError ? (
        <View style={styles.dock}>
          {!canGoNext ? (
            <Text style={styles.minRequired}>{ONBOARDING_COPY.topic.minRequired}</Text>
          ) : null}
          <Pressable
            style={[styles.next, (!canGoNext || isLoading) && styles.nextDisabled]}
            disabled={!canGoNext || isLoading || isSubmitting}
            onPress={handleNextPress}
            accessibilityRole="button"
            accessibilityLabel={ONBOARDING_COPY.topic.next}
            accessibilityState={{ disabled: !canGoNext || isLoading || isSubmitting }}
          >
            {isSubmitting ? (
              <ActivityIndicator color={theme.color.onPrimary} />
            ) : (
              <Text style={styles.nextLabel}>{ONBOARDING_COPY.topic.next}</Text>
            )}
          </Pressable>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.color.background,
    paddingHorizontal: theme.spacing.lg,
  },
  header: {
    // paddingTop은 inset에 따라 화면에서 계산한다 — SafeAreaView가 이미 넣은 여백 위에
    // 고정값을 또 더하면 기기에서만 헤더가 두 배로 내려온다(웹은 inset이 0이다)
    gap: theme.spacing.sm,
  },
  /** O4·O7의 [이전] 버튼과 같은 높이 — 인디케이터 위치를 세 단계에서 일치시킨다 */
  backPlaceholder: {
    height: theme.touchTarget.minHeight,
  },
  title: {
    fontSize: theme.font.size.lg,
    fontWeight: '700',
    color: theme.color.textPrimary,
    lineHeight: theme.font.size.lg * 1.4,
    marginTop: theme.spacing.md,
  },
  countGuide: {
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
  },
  chipArea: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.lg,
  },
  skeletonChip: {
    // 실제 칩과 같은 격자 규칙
    flexGrow: 1,
    flexBasis: '40%',
    height: theme.touchTarget.minHeight + theme.spacing.md,
    borderRadius: theme.radius.full,
    backgroundColor: theme.color.surface,
  },
  dock: {
    gap: theme.spacing.sm,
    paddingBottom: theme.spacing.xl,
  },
  minRequired: {
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
    textAlign: 'center',
  },
  next: {
    minHeight: theme.touchTarget.minHeight + theme.spacing.sm,
    borderRadius: theme.radius.md,
    backgroundColor: theme.color.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextDisabled: {
    backgroundColor: theme.color.border,
  },
  nextLabel: {
    fontSize: theme.font.size.md,
    fontWeight: '600',
    color: theme.color.onPrimary,
  },
});
