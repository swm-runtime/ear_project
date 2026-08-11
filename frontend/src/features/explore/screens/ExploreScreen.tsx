import { useCallback, useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  View,
  type ViewToken,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { theme } from '@/shared/theme';
import FullScreenError from '@/shared/ui/FullScreenError';

import { MiniPlayer, PlayConfirmDialog, RemainingPlaysIndicator } from '@/features/player';

import ExploreContentRow from '../components/ExploreContentRow';
import ExploreEmptyState from '../components/ExploreEmptyState';
import ExploreMoreSheet from '../components/ExploreMoreSheet';
import ExploreSearchBarRow from '../components/ExploreSearchBarRow';
import ExploreSkeleton from '../components/ExploreSkeleton';
import PopularPeriodToggle from '../components/PopularPeriodToggle';
import TopicChips from '../components/TopicChips';
import { EXPLORE_COPY } from '../explore.copy';
import { buildSectionListKey } from '../explore.section-key';
import type { ExploreItem, ExploreSection } from '../explore.types';
import { useExploreScreen } from '../hooks/useExploreScreen';

/** key는 SectionList가 소비하는 React key — 서버 값이 아니라 buildSectionListKey가 만든 유일 값이다 */
type FeedSection = ExploreSection & { key: string; data: ExploreItem[] };

const VIEWABILITY_CONFIG = { itemVisiblePercentThreshold: 50 };

/** 탐색 탭(E1~E13) — 화면은 뷰만 담당하고 로직은 useExploreScreen이 소유한다 */
export default function ExploreScreen() {
  const screen = useExploreScreen();

  /* 인기 섹션 추가 로딩 트리거 — 섹션이 목록 중간에 있어 onEndReached로는 잡히지 않는다.
     마지막 인기 행이 보이면 커서로 이어 받는다(uiux 4.10). 콜백 prop은 교체가 금지라 ref로 최신을 든다 */
  const loadMorePopularRef = useRef(screen.loadMorePopular);
  useEffect(() => {
    loadMorePopularRef.current = screen.loadMorePopular;
  });
  const handleViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken<ExploreItem>[] }) => {
      const reachedPopularEnd = viewableItems.some((token) => {
        const section = (token as { section?: FeedSection }).section;
        if (!section || section.period === null) return false;
        const lastItem = section.data[section.data.length - 1];
        // 헤더 위치의 토큰은 item에 content가 없다 — keyExtractor의 방어와 같은 이유
        const tokenItem = token.item as Partial<ExploreItem> | undefined;
        return lastItem !== undefined && tokenItem?.content?.id === lastItem.content.id;
      });
      if (reachedPopularEnd) loadMorePopularRef.current();
    },
    [],
  );

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

  // 인라인 에러 — 기존 목록을 유지한 채 그 자리에서만 알린다(common-error-handling.md 4.3)
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

  const renderFooter = () => {
    if (screen.isFetchingNextPage) {
      return <ActivityIndicator style={styles.footer} color={theme.color.primary} />;
    }
    if (screen.isLoadMoreFailed) {
      return renderInlineError(EXPLORE_COPY.error.loadMoreFailed, screen.retryLoadMore);
    }
    return null;
  };

  // E13 인기 섹션의 인라인 상태 — 전환 중 로딩 · 전환 실패 · 추가 로딩(uiux 4.10)
  const renderPopularSectionFooter = (section: FeedSection) => {
    if (section.period === null) return null;
    if (screen.isPopularSwitching || screen.isFetchingPopularNextPage) {
      return <ActivityIndicator style={styles.footer} color={theme.color.primary} />;
    }
    if (screen.isPopularSwitchFailed) {
      return renderInlineError(EXPLORE_COPY.popular.switchFailed, screen.retryPopularSwitch);
    }
    if (screen.isPopularLoadMoreFailed) {
      return renderInlineError(EXPLORE_COPY.error.loadMoreFailed, screen.retryPopularLoadMore);
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
      <SectionList<ExploreItem, FeedSection>
        sections={screen.sections.map((section) => ({
          ...section,
          // topic_group이 주제 수만큼 반복돼도 유일해야 한다 — 서버 sectionKey를 그대로 쓰지 않는다
          key: buildSectionListKey(section),
          data: section.items,
        }))}
        // 뷰어빌리티 콜백을 켜면 RN VirtualizedSectionList가 섹션 헤더 위치에도 keyExtractor를
        // 호출하는데, 그때의 item은 행이 아니라 섹션 객체 등이라 content가 없다(업스트림 동작).
        // 렌더 경로에서는 항상 실제 행 item이다 — 표시용 키에는 영향이 없다
        keyExtractor={(item: Partial<ExploreItem> | undefined, index) =>
          item?.content?.id ?? `section-boundary-${index}`
        }
        renderItem={({ item, section }) => {
          const row = (
            <ExploreContentRow
              item={item}
              onPress={screen.handleRowPress}
              onMorePress={screen.openMoreSheet}
            />
          );
          // 구간 전환 중에는 직전 목록을 흐리게 유지한다 — 그 섹션의 행만이다(uiux 4.10)
          if (section.period !== null && screen.isPopularSwitching) {
            return <View style={styles.dimmed}>{row}</View>;
          }
          return row;
        }}
        renderSectionHeader={({ section }) =>
          // 토글 노출은 key가 아니라 period 값으로 가른다 — popular 섹션만 값이 있다(explore-api.md 4.1)
          section.period !== null ? (
            <View style={styles.sectionHeaderRow}>
              <Text
                style={[styles.sectionTitle, styles.sectionHeaderTitle]}
                accessibilityRole="header"
              >
                {section.title}
              </Text>
              <PopularPeriodToggle
                selected={section.period}
                onSelect={screen.selectPopularPeriod}
                disabled={screen.isPopularSwitching}
              />
            </View>
          ) : (
            <Text style={styles.sectionTitle} accessibilityRole="header">
              {section.title}
            </Text>
          )
        }
        renderSectionFooter={({ section }) => renderPopularSectionFooter(section)}
        onViewableItemsChanged={handleViewableItemsChanged}
        viewabilityConfig={VIEWABILITY_CONFIG}
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

      {/* 미니플레이어(PL11) — 활성 재생 세션만 그린다. 복원 스냅샷 판정은 라이브러리 소유다 */}
      <MiniPlayer />

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
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingRight: theme.spacing.md,
  },
  sectionHeaderTitle: {
    // 토글과 공간을 나눈다 — 동적 텍스트 200%에서도 제목이 토글을 밀어내지 않게(uiux 7)
    flexShrink: 1,
  },
  dimmed: {
    opacity: 0.5,
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
