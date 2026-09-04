import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { theme } from '@/shared/theme';
import ChevronIcon from '@/shared/ui/ChevronIcon';
import FullScreenError from '@/shared/ui/FullScreenError';
import ScrollFade from '@/shared/ui/ScrollFade';

import ContentPickCard, { PICK_CARD_THUMBNAIL } from '../components/ContentPickCard';
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
  const insets = useSafeAreaInsets();
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
    handleSkipPress,
    handleBackPress,
  } = usePickScreen();

  return (
    <SafeAreaView style={styles.container}>
      <View style={[styles.header, { paddingTop: Math.max(theme.spacing.md - insets.top, 0) }]}>
        {/* O1·O4와 같은 가운데 타이틀 툴바 — 왼쪽 [이전], 인디케이터는 그리지 않는다 */}
        <View style={styles.toolbar}>
          <Pressable
            style={styles.back}
            onPress={handleBackPress}
            accessibilityRole="button"
            accessibilityLabel="이전 단계로"
          >
            <ChevronIcon direction="left" size={24} color={theme.color.textPrimary} />
          </Pressable>
          <Text style={styles.toolbarTitle} accessibilityRole="header">
            {ONBOARDING_COPY.pick.toolbarTitle}
          </Text>
          {/* [건너뛰기] — 우상단(O4와 동일). 담은 것과 무관하게 담지 않고 넘어간다 */}
          <Pressable
            style={styles.skip}
            disabled={isSubmitting}
            onPress={handleSkipPress}
            accessibilityRole="button"
            accessibilityLabel={ONBOARDING_COPY.pick.skip}
            accessibilityState={{ disabled: isSubmitting }}
          >
            <Text style={styles.skipLabel}>{ONBOARDING_COPY.pick.skip}</Text>
          </Pressable>
        </View>
        <Text style={styles.stepLabel} accessibilityLabel="3단계 중 3단계">
          3/3 단계
        </Text>
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
          {/* 개수는 캡션으로, 진행은 O1·O4와 같은 원형 버튼으로. 0개면 버튼이 건너뛰기 동작을 한다(4.4) */}
          {selectedCount > 0 ? (
            <Text style={styles.countCaption} importantForAccessibility="no">
              {ONBOARDING_COPY.pick.submit(selectedCount)}
            </Text>
          ) : null}
          <Pressable
            style={styles.next}
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
              <ActivityIndicator color={theme.color.onPrimary} />
            ) : (
              <ChevronIcon direction="right" size={28} color={theme.color.onPrimary} />
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
  toolbar: {
    height: theme.touchTarget.minHeight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolbarTitle: {
    // O1·O4 툴바 타이틀과 동일
    fontSize: 24,
    fontWeight: '700',
    color: theme.color.textPrimary,
  },
  back: {
    position: 'absolute',
    left: 0,
    top: 0,
    minWidth: theme.touchTarget.minWidth,
    minHeight: theme.touchTarget.minHeight,
    justifyContent: 'center',
    marginLeft: -theme.spacing.sm,
    paddingLeft: theme.spacing.sm,
  },
  stepLabel: {
    fontSize: theme.font.size.sm,
    fontWeight: '600',
    color: theme.color.textSecondary,
    // O1·O4와 동일 — 위(툴바)·아래(헤드라인) 여백을 같게
    marginVertical: theme.spacing.md,
  },
  // O1·O4와 같은 큰 회색 헤드라인
  title: {
    fontSize: theme.font.size.xl,
    fontWeight: '700',
    color: theme.color.textSecondary,
    lineHeight: theme.font.size.xl * 1.35,
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
  // 실제 카드와 같은 높이·모서리여야 로딩이 끝날 때 목록이 튀지 않는다
  skeletonCard: {
    height: PICK_CARD_THUMBNAIL + theme.spacing.md * 2,
    borderRadius: theme.radius.lg,
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: theme.spacing.md,
    // O1·O4와 동일한 하단 여유
    paddingBottom: theme.spacing.xxl + theme.spacing.lg,
  },
  /** 담은 개수 캡션 — 버튼 라벨이 아이콘이 된 대신 정보는 옆에 남긴다 */
  countCaption: {
    fontSize: theme.font.size.md,
    fontWeight: '700',
    color: theme.color.textPrimary,
  },
  /** 우상단 [건너뛰기] — O4와 동일. 위치만 보조일 뿐 터치 타깃·글자 크기는 그대로다 */
  skip: {
    position: 'absolute',
    right: 0,
    top: 0,
    minHeight: theme.touchTarget.minHeight,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.sm,
  },
  skipLabel: {
    fontSize: theme.font.size.md,
    fontWeight: '600',
    color: theme.color.textSecondary,
    textDecorationLine: 'underline',
  },
  /** O1·O4와 같은 원형 진행 버튼 */
  next: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: theme.color.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
