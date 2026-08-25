import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { theme } from '@/shared/theme';

import { MiniPlayer, PlayConfirmDialog } from '@/features/player';

import ExploreContentRow from '../components/ExploreContentRow';
import ExploreMoreSheet from '../components/ExploreMoreSheet';
import RecentSearchList from '../components/RecentSearchList';
import SearchInputRow from '../components/SearchInputRow';
import SuggestedKeywordChips from '../components/SuggestedKeywordChips';
import { EXPLORE_COPY } from '../explore.copy';
import { useExploreSearchScreen } from '../hooks/useExploreSearchScreen';

/**
 * 검색 화면(E6·E7, explore.md 4.5 — MVP 포함 격상 2026-08-23).
 * 잔여 재생 표시는 없다 — 검색창이 그 줄을 다 쓴다(4.4-1). 숨긴 것은 표시이지 규칙이
 * 아니라서, 결과 재생은 판정·팝업을 피드와 동일하게 거친다(7장).
 * 화면은 뷰만 담당하고 로직은 useExploreSearchScreen이 소유한다.
 */
export default function ExploreSearchScreen() {
  const screen = useExploreSearchScreen();

  const renderInlineError = (message: string, onRetry: () => void) => (
    <View style={styles.footer}>
      <Text style={styles.footerText}>{message}</Text>
      <Pressable
        onPress={onRetry}
        accessibilityRole="button"
        accessibilityLabel={EXPLORE_COPY.error.retry}
        style={styles.footerRetry}
      >
        <Text style={styles.footerRetryLabel}>{EXPLORE_COPY.error.retry}</Text>
      </Pressable>
    </View>
  );

  const renderResultFooter = () => {
    if (screen.isFetchingNextPage) {
      return <ActivityIndicator style={styles.footer} color={theme.color.primary} />;
    }
    if (screen.isLoadMoreFailed) {
      return renderInlineError(EXPLORE_COPY.error.loadMoreFailed, screen.retryLoadMore);
    }
    return null;
  };

  const renderBody = () => {
    // E6 검색 초기 — 최근 검색어 + 추천 키워드. 서버 호출 없음(explore-api.md 6장)
    if (screen.isInitialMode) {
      return (
        <ScrollView
          contentContainerStyle={styles.initialContent}
          keyboardShouldPersistTaps="handled"
        >
          {screen.showEmptyPrompt ? (
            <Text style={styles.emptyPrompt}>{EXPLORE_COPY.search.emptyPrompt}</Text>
          ) : null}
          <RecentSearchList
            searches={screen.recentSearches}
            onSearchPress={screen.searchRecentQuery}
            onDeletePress={screen.deleteRecentSearch}
            onClearAll={screen.clearAllRecentSearches}
          />
          <SuggestedKeywordChips
            topics={screen.suggestedTopics}
            onKeywordPress={screen.searchSuggestedKeyword}
          />
        </ScrollView>
      );
    }

    // 첫 검색 로딩 — 직전 결과가 없으면 인라인 스피너 하나다(스켈레톤을 쓰지 않는다, uiux 4.6)
    if (screen.isFirstSearchLoading) {
      return <ActivityIndicator style={styles.centerLoading} color={theme.color.primary} />;
    }

    // E7 검색 결과 없음 — 검색어 되비춤 + 관련 주제 칩 + 인기 콘텐츠(같은 응답의 fallback)
    if (screen.isNoResult) {
      return (
        <FlatList
          data={screen.fallbackItems}
          keyExtractor={(item) => item.content.id}
          renderItem={({ item }) => (
            <ExploreContentRow
              item={item}
              onPress={screen.handleRowPress}
              onMorePress={screen.openMoreSheet}
            />
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListHeaderComponent={
            <View style={styles.noResultHeader}>
              <Text style={styles.noResultTitle}>
                {EXPLORE_COPY.search.noResult(screen.activeQuery ?? '')}
              </Text>
              {screen.relatedTopics.length > 0 ? (
                <View style={styles.relatedChips}>
                  {screen.relatedTopics.map((topic) => (
                    <Pressable
                      key={topic.id}
                      style={styles.relatedChip}
                      onPress={() => screen.openTopicList(topic.id)}
                      accessibilityRole="button"
                      accessibilityLabel={topic.name}
                    >
                      <Text style={styles.relatedChipLabel}>{topic.name}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
              {screen.fallbackItems.length > 0 ? (
                <Text style={styles.popularTitle} accessibilityRole="header">
                  {EXPLORE_COPY.search.popularTitle}
                </Text>
              ) : null}
            </View>
          }
          keyboardShouldPersistTaps="handled"
        />
      );
    }

    // E6 변형 — 검색 결과. 행은 피드 행과 같은 문법·같은 동작이다(explore.md 4.5-3)
    return (
      <View style={styles.resultContainer}>
        {/* 질의가 바뀌는 동안 직전 결과를 유지한 채 로딩을 겹친다(explore.md 5장) */}
        {screen.isShowingStaleResults ? (
          <ActivityIndicator style={styles.inlineLoading} color={theme.color.primary} />
        ) : null}
        <FlatList
          style={screen.isShowingStaleResults ? styles.dimmed : undefined}
          data={screen.results}
          keyExtractor={(item) => item.content.id}
          renderItem={({ item }) => (
            <ExploreContentRow
              item={item}
              onPress={screen.handleRowPress}
              onMorePress={screen.openMoreSheet}
            />
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListFooterComponent={renderResultFooter()}
          onEndReached={screen.loadMore}
          onEndReachedThreshold={0.4}
          keyboardShouldPersistTaps="handled"
        />
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <SearchInputRow
        value={screen.inputText}
        onChangeText={screen.handleChangeText}
        onSubmit={screen.submitSearch}
        onCancel={screen.cancel}
      />

      {/* 검색 실패 — 이전 결과를 유지하고 상단 배너로 알린다(explore.md 7장). 한 번에 하나(uiux 5장) */}
      {screen.errorBanner ? (
        <View style={styles.errorBanner} accessibilityLiveRegion="polite">
          <Text style={styles.errorBannerText}>{screen.errorBanner}</Text>
        </View>
      ) : null}

      {renderBody()}

      {/* 미니플레이어(PL11) — 검색 화면에서도 유지된다(explore.md 4.5-1) */}
      <MiniPlayer />

      <ExploreMoreSheet
        item={screen.moreSheetItem}
        onDetail={screen.openDetail}
        onSourceLink={screen.openSourceLink}
        onSave={screen.requestSave}
        onRemove={screen.requestRemove}
        onShare={screen.shareItem}
        onDismiss={screen.closeMoreSheet}
        onDismissed={screen.handleSheetDismiss}
      />

      {/* 재생 확인 팝업 — 표시(잔여 숫자)를 숨긴 것이지 판정·팝업 규칙을 뺀 것이 아니다(explore.md 7장) */}
      <PlayConfirmDialog
        visible={screen.playConfirm !== null}
        remaining={screen.playConfirm?.remaining ?? 0}
        onConfirm={screen.confirmPlay}
        onCancel={screen.cancelPlayConfirm}
        onSuppressToday={screen.suppressAndPlay}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.color.background,
  },
  initialContent: {
    gap: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
  },
  emptyPrompt: {
    paddingHorizontal: theme.spacing.md,
    fontSize: theme.font.size.xs,
    color: theme.color.textSecondary,
  },
  centerLoading: {
    marginTop: theme.spacing.xl,
  },
  resultContainer: {
    flex: 1,
  },
  inlineLoading: {
    paddingVertical: theme.spacing.sm,
  },
  dimmed: {
    opacity: 0.5,
  },
  noResultHeader: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  noResultTitle: {
    fontSize: theme.font.size.md,
    fontWeight: '700',
    color: theme.color.textPrimary,
  },
  relatedChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  relatedChip: {
    minHeight: theme.touchTarget.minHeight,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: theme.color.border,
    backgroundColor: theme.color.background,
  },
  relatedChipLabel: {
    fontSize: theme.font.size.sm,
    fontWeight: '600',
    color: theme.color.textPrimary,
  },
  popularTitle: {
    marginTop: theme.spacing.sm,
    fontSize: theme.font.size.lg,
    fontWeight: '700',
    color: theme.color.textPrimary,
  },
  errorBanner: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    backgroundColor: theme.color.surface,
  },
  errorBannerText: {
    fontSize: theme.font.size.xs,
    color: theme.color.textSecondary,
    textAlign: 'center',
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: theme.color.border,
    marginLeft: theme.spacing.md,
  },
  footer: {
    paddingVertical: theme.spacing.md,
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  footerText: {
    fontSize: theme.font.size.xs,
    color: theme.color.textSecondary,
    textAlign: 'center',
  },
  footerRetry: {
    minHeight: theme.touchTarget.minHeight,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.md,
  },
  footerRetryLabel: {
    fontSize: theme.font.size.sm,
    fontWeight: '600',
    color: theme.color.primary,
  },
});
