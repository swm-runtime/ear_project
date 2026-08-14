import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { theme } from '@/shared/theme';
import FullScreenError from '@/shared/ui/FullScreenError';
import ScrollFade from '@/shared/ui/ScrollFade';

import ContentPickCard from '../components/ContentPickCard';
import StepIndicator from '../components/StepIndicator';
import { usePickScreen } from '../hooks/usePickScreen';
import { ONBOARDING_COPY } from '../onboarding.copy';

const SKELETON_CARD_COUNT = 9;

/**
 * O7·O8·O12 추천 콘텐츠 담기(3/3).
 * - 두 섹션(6건 + 3건)을 한 덩어리로 그리지 않는다. 섹션 제목은 서버가 내려준 값을 그대로 쓴다.
 * - 하단 버튼은 담은 개수에 따라 [건너뛰기] ↔ [N개 담기]로 바뀐다 — 비활성 [0개 담기]를 두지 않는다.
 * (onboarding-uiux.md 4.4)
 */
export default function PickScreen() {
  const {
    sections,
    selectedContentIds,
    selectedCount,
    isSubmitting,
    showSkeleton,
    isLoading,
    isError,
    isRefetching,
    refetch,
    toggleContent,
    handleProceedPress,
    handleBackPress,
  } = usePickScreen();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable
          style={styles.back}
          onPress={handleBackPress}
          accessibilityRole="button"
          accessibilityLabel="이전 단계로"
        >
          <Text style={styles.backIcon}>‹</Text>
        </Pressable>
        <StepIndicator current={3} />
        <Text style={styles.title}>{ONBOARDING_COPY.pick.title}</Text>
        <Text style={styles.subtitle}>{ONBOARDING_COPY.pick.subtitle}</Text>
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
        <View style={styles.listWrap}>
          <ScrollView style={styles.scroll} contentContainerStyle={styles.list}>
            {isLoading ? (
              showSkeleton ? (
                // O12 — 섹션 제목도 스켈레톤으로 둔다. 표본 충분 여부는 응답이 와야 안다(onboarding-uiux.md 4.4)
                <View style={styles.skeletonArea}>
                  <View style={styles.skeletonSectionTitle} />
                  {Array.from({ length: SKELETON_CARD_COUNT }, (_, index) => (
                    <View key={index} style={styles.skeletonCard} />
                  ))}
                </View>
              ) : null
            ) : (
              sections.map((section) => (
                <View key={section.sectionType} style={styles.section}>
                  <Text style={styles.sectionTitle} accessibilityRole="header">
                    {section.title} · {section.items.length}
                  </Text>
                  <View style={styles.cardList}>
                    {section.items.map((content) => (
                      <ContentPickCard
                        key={content.contentId}
                        content={content}
                        isSelected={selectedContentIds.includes(content.contentId)}
                        onPress={() => toggleContent(content.contentId)}
                      />
                    ))}
                  </View>
                </View>
              ))
            )}
          </ScrollView>
          {/* 목록이 하단 독에 그대로 맞닿아 끝나면 마지막 카드와 버튼이 겹쳐 보인다 */}
          <ScrollFade />
        </View>
      )}

      {!isError && !isLoading ? (
        // 주 버튼은 스크롤 영역이 아니라 고정 독에 둔다 — 버튼이 목록에 묻히면 담고도 진행하지 못한다(onboarding-uiux.md 5)
        <View style={styles.dock}>
          <Pressable
            style={[styles.proceed, selectedCount === 0 && styles.proceedSkip]}
            disabled={isSubmitting}
            onPress={() => void handleProceedPress()}
            accessibilityRole="button"
            accessibilityLabel={
              selectedCount === 0
                ? ONBOARDING_COPY.pick.skip
                : ONBOARDING_COPY.pick.submit(selectedCount)
            }
            accessibilityState={{ disabled: isSubmitting }}
          >
            {isSubmitting ? (
              <ActivityIndicator
                color={selectedCount === 0 ? theme.color.textSecondary : theme.color.onPrimary}
              />
            ) : (
              <Text style={[styles.proceedLabel, selectedCount === 0 && styles.proceedSkipLabel]}>
                {selectedCount === 0
                  ? ONBOARDING_COPY.pick.skip
                  : ONBOARDING_COPY.pick.submit(selectedCount)}
              </Text>
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
    paddingTop: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  back: {
    minWidth: theme.touchTarget.minWidth,
    minHeight: theme.touchTarget.minHeight,
    justifyContent: 'center',
    marginLeft: -theme.spacing.sm,
    paddingLeft: theme.spacing.sm,
  },
  backIcon: {
    fontSize: theme.font.size.xl,
    color: theme.color.textPrimary,
    lineHeight: theme.font.size.xl,
  },
  title: {
    fontSize: theme.font.size.lg,
    fontWeight: '700',
    color: theme.color.textPrimary,
    lineHeight: theme.font.size.lg * 1.4,
    marginTop: theme.spacing.md,
  },
  subtitle: {
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
  },
  /** ScrollFade를 목록 바닥에 절대 배치하기 위한 기준 — 스크롤 영역 밖으로 나가지 않는다 */
  listWrap: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  list: {
    paddingVertical: theme.spacing.lg,
    // 마지막 카드가 페이드에 가려 잘려 보이지 않도록 페이드 높이만큼 더 준다
    paddingBottom: theme.spacing.lg + theme.spacing.xl,
    gap: theme.spacing.lg,
  },
  skeletonArea: {
    gap: theme.spacing.sm,
  },
  skeletonSectionTitle: {
    width: 140,
    height: theme.font.size.md,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.color.surface,
    marginBottom: theme.spacing.sm,
  },
  skeletonCard: {
    height: 80,
    borderRadius: theme.radius.md,
    backgroundColor: theme.color.surface,
  },
  section: {
    gap: theme.spacing.sm,
  },
  sectionTitle: {
    fontSize: theme.font.size.md,
    fontWeight: '700',
    color: theme.color.textPrimary,
  },
  cardList: {
    gap: theme.spacing.sm,
  },
  dock: {
    paddingBottom: theme.spacing.md,
  },
  proceed: {
    minHeight: theme.touchTarget.minHeight + theme.spacing.sm,
    borderRadius: theme.radius.md,
    backgroundColor: theme.color.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  proceedSkip: {
    backgroundColor: theme.color.background,
    borderWidth: 1.5,
    borderColor: theme.color.border,
  },
  proceedLabel: {
    fontSize: theme.font.size.md,
    fontWeight: '600',
    color: theme.color.onPrimary,
  },
  proceedSkipLabel: {
    color: theme.color.textSecondary,
  },
});
