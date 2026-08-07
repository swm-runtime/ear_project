import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { theme } from '@/shared/theme';
import FullScreenError from '@/shared/ui/FullScreenError';

import { PlayConfirmDialog, RemainingPlaysIndicator } from '@/features/player';

import ExploreContentRow from '../components/ExploreContentRow';
import ExploreEmptyState from '../components/ExploreEmptyState';
import ExploreMoreSheet from '../components/ExploreMoreSheet';
import ExploreSearchBarRow from '../components/ExploreSearchBarRow';
import ExploreSkeleton from '../components/ExploreSkeleton';
import TopicChips from '../components/TopicChips';
import { EXPLORE_COPY } from '../explore.copy';
import { useExploreScreen } from '../hooks/useExploreScreen';

/** 탐색 탭(E1~E12) — 화면은 뷰만 담당하고 로직은 useExploreScreen이 소유한다 */
export default function ExploreScreen() {
  const screen = useExploreScreen();

  // E10은 검색창 줄·주제 칩·잔여 표시까지 그리지 않는다 — 화면 전체가 에러다(uiux 4.8)
  if (screen.isFullError) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <FullScreenError
          title={
            screen.isFullErrorNetwork
              ? EXPLORE_COPY.error.networkTitle
              : EXPLORE_COPY.error.loadFailedTitle
          }
          description={EXPLORE_COPY.error.loadFailedDescription}
          retryLabel={EXPLORE_COPY.error.retry}
          isRetrying={screen.isRetrying}
          onRetry={screen.retry}
        />
      </SafeAreaView>
    );
  }

  // E8(콘텐츠 풀 0건)은 주제 칩 줄을 숨긴다 — 어떤 칩을 골라도 결과가 없다(uiux 4.7)
  const showChips = screen.emptyKind !== 'feed';

  const renderFooter = () => {
    if (screen.isFetchingNextPage) {
      return <ActivityIndicator style={styles.footer} color={theme.color.primary} />;
    }
    // 추가 로딩 실패 — 인라인 에러. 기존 목록을 유지한다(common-error-handling.md 4.3)
    if (screen.isLoadMoreFailed) {
      return (
        <View style={styles.footer}>
          <Text style={styles.footerText}>{EXPLORE_COPY.error.loadMoreFailed}</Text>
          <Pressable
            onPress={screen.retryLoadMore}
            accessibilityRole="button"
            accessibilityLabel={EXPLORE_COPY.error.retry}
            style={styles.footerRetry}
          >
            <Text style={styles.footerRetryLabel}>{EXPLORE_COPY.error.retry}</Text>
          </Pressable>
        </View>
      );
    }
    return null;
  };

  const refreshControl = (
    <RefreshControl
      refreshing={screen.isManualRefreshing}
      onRefresh={() => void screen.refresh()}
      tintColor={theme.color.primary}
    />
  );

  const renderBody = () => {
    // 필터 전환 로딩은 단일 목록이 될 자리다 — 섹션 제목 없는 행 스켈레톤만 그린다
    if (screen.showSkeleton) return <ExploreSkeleton showSectionTitles={!screen.isFiltered} />;
    if (screen.isInitialLoading) return <View style={styles.container} />;

    // E2 — 주제 필터 단일 목록(무한 스크롤)
    if (screen.isFiltered) {
      return (
        <FlatList
          data={screen.filteredItems}
          keyExtractor={(item) => item.content.id}
          renderItem={({ item }) => (
            <ExploreContentRow
              item={item}
              onPress={screen.handleRowPress}
              onMorePress={screen.openMoreSheet}
            />
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            screen.emptyKind === 'filtered' ? (
              <ExploreEmptyState
                title={EXPLORE_COPY.empty.filtered.title}
                actionLabel={EXPLORE_COPY.empty.filtered.action}
                onActionPress={screen.clearTopicFilter}
              />
            ) : null
          }
          ListFooterComponent={renderFooter()}
          contentContainerStyle={
            screen.filteredItems.length === 0 ? styles.emptyContent : undefined
          }
          refreshControl={refreshControl}
          onEndReached={screen.loadMore}
          onEndReachedThreshold={0.4}
        />
      );
    }

    // E1 — 섹션형 피드. 섹션 구성·순서·제목은 서버 응답 그대로다(explore.md 4.1)
    return (
      <SectionList
        sections={screen.sections.map((section) => ({ ...section, data: section.items }))}
        keyExtractor={(item) => item.content.id}
        renderItem={({ item }) => (
          <ExploreContentRow
            item={item}
            onPress={screen.handleRowPress}
            onMorePress={screen.openMoreSheet}
          />
        )}
        renderSectionHeader={({ section }) => (
          <Text style={styles.sectionTitle} accessibilityRole="header">
            {section.title}
          </Text>
        )}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          screen.emptyKind === 'feed' ? (
            <ExploreEmptyState
              title={EXPLORE_COPY.empty.feed.title}
              actionLabel={EXPLORE_COPY.empty.feed.action}
              onActionPress={screen.goToLibrary}
            />
          ) : null
        }
        contentContainerStyle={screen.sections.length === 0 ? styles.emptyContent : undefined}
        refreshControl={refreshControl}
        stickySectionHeadersEnabled={false}
      />
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ExploreSearchBarRow
        trailing={
          // 무제한·캐시·값 없음이면 자리를 비운다 — "무제한" 배지도 없다(uiux 4.2)
          screen.remainingDisplay ? (
            <RemainingPlaysIndicator
              remaining={screen.remainingDisplay.remaining}
              limit={screen.remainingDisplay.limit}
              onExhaustedPress={() => screen.openPaywall()}
            />
          ) : null
        }
      />

      {showChips ? (
        <TopicChips
          topics={screen.topics}
          selectedTopicIds={screen.selectedTopicIds}
          onToggle={screen.toggleTopic}
        />
      ) : null}

      {renderBody()}

      <ExploreMoreSheet
        item={screen.moreSheetItem}
        onSave={screen.requestSave}
        onRemove={screen.requestRemove}
        onDismiss={screen.closeMoreSheet}
      />

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
  sectionTitle: {
    fontSize: theme.font.size.lg,
    fontWeight: '700',
    color: theme.color.textPrimary,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.xs,
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
