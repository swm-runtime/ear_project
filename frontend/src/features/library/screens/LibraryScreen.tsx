import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { theme } from '@/shared/theme';
import BrandMark from '@/shared/ui/BrandMark';
import FullScreenError from '@/shared/ui/FullScreenError';

import { MiniPlayer, PlayConfirmDialog, RemainingPlaysIndicator } from '@/features/player';

import LibraryBanner from '../components/LibraryBanner';
import LibraryEmptyState from '../components/LibraryEmptyState';
import LibraryItemCard from '../components/LibraryItemCard';
import LibraryItemSkeleton from '../components/LibraryItemSkeleton';
import LibraryTabs from '../components/LibraryTabs';
import MoreActionsSheet from '../components/MoreActionsSheet';
import TopicFilterSheet from '../components/TopicFilterSheet';
import UndoSnackbar from '../components/UndoSnackbar';
import { useLibraryScreen } from '../hooks/useLibraryScreen';
import { LIBRARY_COPY } from '../library.copy';

/** L1 라이브러리 — 앱의 첫 화면. 화면은 뷰만 담당하고 로직은 useLibraryScreen이 소유한다 */
export default function LibraryScreen() {
  const screen = useLibraryScreen();

  // L6·L9는 목록 전체가 빈 상태 — 탭 줄·필터 아이콘·복원 미니플레이어를 감춘다(uiux 4.8)
  const isWholeEmpty = screen.emptyKind === 'newUser' || screen.emptyKind === 'deletedAll';
  const showTabBar = !screen.isFullError && !isWholeEmpty;
  // 복원 스냅샷 폴백의 노출 조건 — 활성 재생 세션의 표시는 MiniPlayer가 스스로 판단한다
  const resumeFallback =
    screen.resumeTarget !== null && !screen.isFullError && !isWholeEmpty
      ? {
          contentId: screen.resumeTarget.content.id,
          title: screen.resumeTarget.content.title,
          thumbnailUrl: screen.resumeTarget.content.thumbnailUrl,
          positionSec: screen.resumeTarget.progress?.positionSec ?? 0,
          durationSec: screen.resumeTarget.content.durationSec,
        }
      : null;

  const renderEmpty = () => {
    switch (screen.emptyKind) {
      case 'newUser':
        return (
          <LibraryEmptyState
            title={LIBRARY_COPY.empty.newUser.title}
            description={LIBRARY_COPY.empty.newUser.description}
            actionLabel={LIBRARY_COPY.empty.newUser.action}
            onActionPress={screen.goToExplore}
          />
        );
      case 'filtered':
        return (
          <LibraryEmptyState
            title={LIBRARY_COPY.empty.filtered.title}
            description={LIBRARY_COPY.empty.filtered.description(screen.filteredConditions)}
            actionLabel={LIBRARY_COPY.empty.filtered.action}
            onActionPress={screen.resetFilters}
          />
        );
      case 'drip':
        // 다음 행동 버튼을 두지 않는다 — 드립은 사용자가 앞당길 수 없다(uiux 4.8)
        return <LibraryEmptyState title={LIBRARY_COPY.empty.drip.title} />;
      case 'deletedAll':
        return (
          <LibraryEmptyState
            title={LIBRARY_COPY.empty.deletedAll.title}
            description={LIBRARY_COPY.empty.deletedAll.description}
            actionLabel={LIBRARY_COPY.empty.deletedAll.action}
            onActionPress={screen.goToExplore}
          />
        );
      default:
        return null;
    }
  };

  const renderFooter = () => {
    if (screen.isFetchingNextPage) {
      return <ActivityIndicator style={styles.footer} color={theme.color.primary} />;
    }
    // L15 추가 로딩 실패 — 인라인 에러. 전체 화면 에러로 전환하지 않는다(uiux 4.9)
    if (screen.isLoadMoreFailed) {
      return (
        <View style={styles.footer}>
          <Text style={styles.footerText}>{LIBRARY_COPY.error.loadMoreFailed}</Text>
          <Pressable
            onPress={screen.retryLoadMore}
            accessibilityRole="button"
            accessibilityLabel={LIBRARY_COPY.error.retry}
            style={styles.footerRetry}
          >
            <Text style={styles.footerRetryLabel}>{LIBRARY_COPY.error.retry}</Text>
          </Pressable>
        </View>
      );
    }
    // L10 캐시 목록 — 지금 보는 것이 전부가 아님을 밝힌다(uiux 4.10)
    if (screen.isOffline) {
      return (
        <Text style={[styles.footer, styles.footerText]}>{LIBRARY_COPY.cachedListNotice}</Text>
      );
    }
    return null;
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.appBar}>
        {/* 화면 이름(라이브러리) 대신 브랜드를 세운다 — 앱을 열면 항상 여기로 들어오는 기본 탭이다 */}
        <BrandMark />
        {/* 무제한·캐시·값 없음이면 자리를 비운다 — "무제한" 배지도 없다(uiux 4.3) */}
        {screen.remainingDisplay ? (
          <RemainingPlaysIndicator
            remaining={screen.remainingDisplay.remaining}
            limit={screen.remainingDisplay.limit}
            onExhaustedPress={() => screen.openPaywall()}
          />
        ) : null}
      </View>

      {showTabBar ? (
        <LibraryTabs
          filter={screen.filter}
          onChange={screen.setFilter}
          topicFilterCount={screen.topicFilterCount}
          onFilterPress={screen.openTopicSheet}
        />
      ) : null}

      {/* 배너는 탭 아래 · 목록 바로 위에 둔다 — 세 배너 모두 "이 목록에 무슨 일이
          있었나"를 알리므로 목록에 붙어 있어야 무엇에 대한 통지인지 읽힌다(uiux 4.1) */}
      {screen.banner ? (
        <LibraryBanner banner={screen.banner} onPress={screen.handleBannerPress} />
      ) : null}

      {screen.isFullError ? (
        <FullScreenError
          title={
            screen.isFullErrorNetwork
              ? LIBRARY_COPY.error.networkTitle
              : LIBRARY_COPY.error.loadFailedTitle
          }
          description={LIBRARY_COPY.error.loadFailedDescription}
          retryLabel={LIBRARY_COPY.error.retry}
          isRetrying={screen.isRefetching}
          onRetry={screen.retry}
        />
      ) : screen.showSkeleton ? (
        <LibraryItemSkeleton />
      ) : screen.isInitialLoading ? (
        <View style={styles.container} />
      ) : (
        <FlatList
          data={screen.items}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <LibraryItemCard
              item={item}
              onPress={screen.handleItemPress}
              onMorePress={screen.openMoreSheet}
            />
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={renderEmpty()}
          ListFooterComponent={renderFooter()}
          contentContainerStyle={screen.items.length === 0 ? styles.emptyContent : undefined}
          refreshControl={
            <RefreshControl
              refreshing={screen.isManualRefreshing}
              onRefresh={() => void screen.refresh()}
              tintColor={theme.color.primary}
            />
          }
          onEndReached={screen.loadMore}
          onEndReachedThreshold={0.4}
        />
      )}

      {/* 미니플레이어(PL11) — 활성 세션은 실시간, 없으면 복원 스냅샷을 일시정지로 표시한다 */}
      <MiniPlayer
        resumeFallback={resumeFallback}
        onResumePlayPress={screen.handleMiniPlayerPlay}
        onResumeExpandPress={screen.handleMiniPlayerExpand}
        onResumeDismiss={screen.handleMiniPlayerDismiss}
      />

      <TopicFilterSheet
        key={screen.topicSheetEpoch}
        visible={screen.isTopicSheetVisible}
        topics={screen.topics}
        isLoading={screen.isTopicsLoading}
        appliedTopicIds={screen.appliedTopicIds}
        appliedSourceFilter={screen.appliedSourceFilter}
        onApply={screen.applyTopicFilter}
        onDismiss={screen.closeTopicSheet}
      />

      <MoreActionsSheet
        item={screen.moreSheetItem}
        onDelete={screen.requestDelete}
        onDismiss={screen.closeMoreSheet}
      />

      <PlayConfirmDialog
        visible={screen.playConfirm !== null}
        remaining={screen.playConfirm?.remaining ?? 0}
        onConfirm={screen.confirmPlay}
        onCancel={screen.cancelPlayConfirm}
        onSuppressToday={screen.suppressAndPlay}
      />

      {/* 스낵바는 미니플레이어·하단 탭 위에 겹친다 — [실행 취소]가 가려지면 안 된다(uiux 4.4) */}
      <UndoSnackbar visible={screen.pendingDeleteItem !== null} onUndoPress={screen.undoDelete} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.color.background,
  },
  appBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    minHeight: theme.touchTarget.minHeight + theme.spacing.sm,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: theme.color.border,
    marginLeft: theme.spacing.md,
  },
  emptyContent: {
    flexGrow: 1,
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
