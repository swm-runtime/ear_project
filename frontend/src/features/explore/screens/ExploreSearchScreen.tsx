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

import { useNativeHeaderInset } from '@/shared/navigation/useNativeHeaderInset';
import { theme } from '@/shared/theme';
import { HAS_NATIVE_TAB_BAR } from '@/shared/ui/GlassSurface';
import LargeTitleRow from '@/shared/ui/LargeTitleRow';

import {
  DOCK_SCROLL_PROPS,
  MiniPlayer,
  PlayConfirmDialog,
  useBottomDockInset,
} from '@/features/player';

import ExploreMoreSheet from '../components/ExploreMoreSheet';
import ExploreTile from '../components/ExploreTile';
import RecentSearchList from '../components/RecentSearchList';
import SearchInputRow from '../components/SearchInputRow';
import SuggestedKeywordChips from '../components/SuggestedKeywordChips';
import { EXPLORE_COPY } from '../explore.copy';
import { exploreGridKey, toExploreGridData } from '../explore.grid';
import { useExploreSearchScreen } from '../hooks/useExploreSearchScreen';

/**
 * 검색 화면(E6·E7, explore.md 4.5 — MVP 포함 격상 2026-08-23).
 * 잔여 재생 표시는 없다 — 검색창이 그 줄을 다 쓴다(4.4-1). 숨긴 것은 표시이지 규칙이
 * 아니라서, 결과 재생은 판정·팝업을 피드와 동일하게 거친다(7장).
 * 화면은 뷰만 담당하고 로직은 useExploreSearchScreen이 소유한다.
 *
 * **iOS 26 시스템 탭 바 갈래의 상단은 애플 뮤직 검색 탭 문법**(09-26 00:29 스샷) — 큰 제목 "검색" + 채움 검색 필드 + [취소].
 * 제목·필드는 목록 밖에 고정한다(결과·로딩으로 목록이 바뀔 때 입력 상자가 내려가면 키보드가 떨어진다).
 * 탐색 제목 줄 밑 검색 필드를 누르면 이 화면이 스택에 올라온다(탭 바가 가려지므로 미니플레이어는 여기서 직접 그린다).
 * 검색 탭(탭 바 옆 검색 원, #730)은 뺐다 — 입구가 둘이라(PM 09-26 01:20). 그 외 플랫폼은 종전대로 검색 줄만이다.
 */
export default function ExploreSearchScreen() {
  const screen = useExploreSearchScreen();
  const miniInset = useBottomDockInset();
  const nativeBarInset = useNativeHeaderInset();

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
          {...DOCK_SCROLL_PROPS}
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
          {...DOCK_SCROLL_PROPS}
          data={toExploreGridData(screen.fallbackItems)}
          keyExtractor={exploreGridKey}
          numColumns={2}
          columnWrapperStyle={styles.gridRow}
          contentContainerStyle={[styles.gridContent, { paddingBottom: miniInset }]}
          renderItem={({ item }) =>
            item === null ? (
              <View style={styles.gridSpacer} />
            ) : (
              <ExploreTile
                item={item}
                layout="grid"
                onPress={screen.handleRowPress}
                onMorePress={screen.openMoreSheet}
              />
            )
          }
          ItemSeparatorComponent={() => <View style={styles.gridSeparator} />}
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
          {...DOCK_SCROLL_PROPS}
          style={screen.isShowingStaleResults ? styles.dimmed : undefined}
          data={toExploreGridData(screen.results)}
          keyExtractor={exploreGridKey}
          numColumns={2}
          columnWrapperStyle={styles.gridRow}
          contentContainerStyle={[styles.gridContent, { paddingBottom: miniInset }]}
          renderItem={({ item }) =>
            item === null ? (
              <View style={styles.gridSpacer} />
            ) : (
              <ExploreTile
                item={item}
                layout="grid"
                onPress={screen.handleRowPress}
                onMorePress={screen.openMoreSheet}
              />
            )
          }
          ItemSeparatorComponent={() => <View style={styles.gridSeparator} />}
          ListFooterComponent={renderResultFooter()}
          onEndReached={screen.loadMore}
          onEndReachedThreshold={0.4}
          keyboardShouldPersistTaps="handled"
        />
      </View>
    );
  };

  // 시스템 바 갈래에서는 상태 바만 비운다(스택 화면이라 바는 없다)
  const Frame = HAS_NATIVE_TAB_BAR ? View : SafeAreaView;
  return (
    <Frame style={[styles.container, { paddingTop: nativeBarInset }]} edges={['top']}>
      {HAS_NATIVE_TAB_BAR ? (
        <>
          <LargeTitleRow title={EXPLORE_COPY.search.tabTitle} />
          <SearchInputRow
            value={screen.inputText}
            onChangeText={screen.handleChangeText}
            onSubmit={screen.submitSearch}
            onCancel={screen.cancel}
            variant="fill"
          />
        </>
      ) : (
        <SearchInputRow
          value={screen.inputText}
          onChangeText={screen.handleChangeText}
          onSubmit={screen.submitSearch}
          onCancel={screen.cancel}
        />
      )}

      {/* 검색 실패 — 이전 결과를 유지하고 상단 배너로 알린다(explore.md 7장). 한 번에 하나(uiux 5장) */}
      {screen.errorBanner ? (
        <View style={styles.errorBanner} accessibilityLiveRegion="polite">
          <Text style={styles.errorBannerText}>{screen.errorBanner}</Text>
        </View>
      ) : null}

      {renderBody()}

      {/* 미니플레이어(PL11) — 검색 화면에서도 유지된다(explore.md 4.5-1). 스택 화면이라 탭 바(액세서리)가 가려져 직접 그린다 */}
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
    </Frame>
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
  // 좌우 여백은 격자 컨테이너(gridContent)가 이미 준다
  noResultHeader: {
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
  // 카드가 자기 배경을 갖게 되어 구분선이 필요 없다 — 카드 사이 간격만 둔다
  // 검색 결과·결과 없음의 인기 콘텐츠 — 라이브러리와 같은 두 칸 썸네일 격자(2026-09-18 PM)
  gridContent: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  gridRow: {
    gap: theme.spacing.sm * 1.5,
  },
  gridSpacer: {
    flex: 1,
  },
  gridSeparator: {
    height: theme.spacing.lg,
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
