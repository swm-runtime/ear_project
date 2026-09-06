import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { theme } from '@/shared/theme';
import FullScreenError from '@/shared/ui/FullScreenError';

import { MiniPlayer, PlayConfirmDialog, RemainingPlaysIndicator } from '@/features/player';

import ExploreContentRow from '../components/ExploreContentRow';
import ExploreEmptyState from '../components/ExploreEmptyState';
import ExploreFeaturedCard from '../components/ExploreFeaturedCard';
import ExploreMoreSheet from '../components/ExploreMoreSheet';
import ExploreSearchBarRow from '../components/ExploreSearchBarRow';
import ExploreSkeleton from '../components/ExploreSkeleton';
import ExploreTile from '../components/ExploreTile';
import ExploreWalkthrough from '../components/ExploreWalkthrough';
import PopularPeriodToggle from '../components/PopularPeriodToggle';
import TopicChips from '../components/TopicChips';
import { EXPLORE_COPY } from '../explore.copy';
import { buildSectionListKey } from '../explore.section-key';
import type { ExploreSection } from '../explore.types';
import { useExploreScreen } from '../hooks/useExploreScreen';

/** 탐색 탭(E1~E13) — 화면은 뷰만 담당하고 로직은 useExploreScreen이 소유한다 */
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
  const renderPopularSectionFooter = (section: ExploreSection) => {
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

  /**
   * 섹션 하나 = 제목 + 가로 캐러셀. 인기 섹션만 큰 카드이고 나머지는 사각 타일이다.
   * 추가 로딩은 **가로 목록의 onEndReached**가 맡는다 — 세로 화면의 뷰어빌리티로는
   * 가로로 끝까지 민 시점을 알 수 없다(캐러셀 전환 2026-09-02).
   */
  const renderSection = (section: ExploreSection) => {
    const isPopular = section.period !== null;

    return (
      <View key={buildSectionListKey(section)} style={styles.section}>
        {section.period !== null ? (
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionTitle, styles.sectionHeaderTitle]} accessibilityRole="header">
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
        )}

        {/* 구간 전환 중에는 직전 목록을 흐리게 유지한다 — 그 섹션만이다(uiux 4.10) */}
        <View style={isPopular && screen.isPopularSwitching ? styles.dimmed : undefined}>
          <FlatList
            horizontal
            data={section.items}
            keyExtractor={(item) => item.content.id}
            renderItem={({ item }) =>
              isPopular ? (
                <ExploreFeaturedCard
                  item={item}
                  onPress={screen.handleRowPress}
                  onMorePress={screen.openMoreSheet}
                />
              ) : (
                <ExploreTile
                  item={item}
                  onPress={screen.handleRowPress}
                  onMorePress={screen.openMoreSheet}
                />
              )
            }
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.carousel}
            ItemSeparatorComponent={() => <View style={styles.carouselGap} />}
            onEndReached={isPopular ? screen.loadMorePopular : undefined}
            onEndReachedThreshold={0.5}
          />
        </View>

        {renderPopularSectionFooter(section)}
      </View>
    );
  };

  const renderBody = () => {
    // 필터 전환 로딩은 단일 목록이 될 자리다 — 섹션 제목 없는 행 스켈레톤만 그린다
    if (screen.showSkeleton) return <ExploreSkeleton showSectionTitles={!screen.isFiltered} />;
    if (screen.isInitialLoading) return <View style={styles.container} />;

    // E2 — 주제 필터 단일 목록(무한 스크롤). 필터 결과는 캐러셀이 아니라 세로 목록이다 —
    // 개수가 정해져 있지 않아 가로로 밀게 하면 끝을 가늠할 수 없다
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
            screen.filteredItems.length === 0 ? styles.emptyContent : styles.listContent
          }
          refreshControl={refreshControl}
          onEndReached={screen.loadMore}
          onEndReachedThreshold={0.4}
        />
      );
    }

    // E1 — 섹션형 피드. 섹션 구성·순서·제목은 서버 응답 그대로다(explore.md 4.1)
    return (
      <ScrollView
        contentContainerStyle={
          screen.sections.length === 0 ? styles.emptyContent : styles.feedContent
        }
        refreshControl={refreshControl}
      >
        {screen.sections.length === 0 ? (
          screen.emptyKind === 'feed' ? (
            <ExploreEmptyState
              title={EXPLORE_COPY.empty.feed.title}
              actionLabel={EXPLORE_COPY.empty.feed.action}
              onActionPress={screen.goToLibrary}
            />
          ) : null
        ) : (
          screen.sections.map(renderSection)
        )}
      </ScrollView>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ExploreSearchBarRow
        onPress={screen.openSearch}
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
        onDetail={screen.openDetail}
        onSourceLink={screen.openSourceLink}
        onSave={screen.requestSave}
        onRemove={screen.requestRemove}
        onShare={screen.shareItem}
        onDismiss={screen.closeMoreSheet}
        onDismissed={screen.handleSheetDismiss}
      />

      <PlayConfirmDialog
        visible={screen.playConfirm !== null}
        remaining={screen.playConfirm?.remaining ?? 0}
        onConfirm={screen.confirmPlay}
        onCancel={screen.cancelPlayConfirm}
        onSuppressToday={screen.suppressAndPlay}
      />

      {/* 첫 사용 코치마크 — 온보딩 직후 착지에서만 뜬다(walkthrough.store) */}
      <ExploreWalkthrough />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.color.background,
  },
  feedContent: {
    paddingBottom: theme.spacing.lg,
  },
  listContent: {
    paddingVertical: theme.spacing.sm,
  },
  /**
   * 섹션 구분은 **배경색이 아니라 제목 크기와 근접성**으로 만든다(2026-09-02).
   * 캐러셀이 가로로 이어져 이미지 줄이 반복되므로, 제목이 "앞 캐러셀의 꼬리"가 아니라
   * "뒤 캐러셀의 머리"로 읽혀야 한다 — 위 여백을 아래 여백의 세 배로 둔다.
   * 여백을 더 벌리면 첫 섹션이 화면 아래로 밀려 정작 인기 카드가 안 보인다.
   */
  section: {
    paddingBottom: theme.spacing.md,
  },
  sectionTitle: {
    fontSize: theme.font.size.xl,
    fontWeight: '700',
    color: theme.color.textPrimary,
    // 크기만 키우면 두 줄로 접힐 때 줄이 붙는다
    lineHeight: theme.font.size.xl * 1.25,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.sm,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingRight: theme.spacing.md,
    // 세로 여백은 행이 갖는다. 제목에만 두면 제목 상자가 위아래로 비대칭하게 커져
    // alignItems:center가 글자가 아니라 그 상자를 기준으로 맞춰 토글이 위로 뜬다
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.sm,
  },
  sectionHeaderTitle: {
    // 토글과 공간을 나눈다 — 동적 텍스트 200%에서도 제목이 토글을 밀어내지 않게(uiux 7)
    flexShrink: 1,
    paddingTop: 0,
    paddingBottom: 0,
  },
  // 캐러셀 좌우 여백은 섹션 제목과 같은 선에서 시작한다
  carousel: {
    paddingHorizontal: theme.spacing.md,
  },
  carouselGap: {
    width: theme.spacing.md,
  },
  dimmed: {
    opacity: 0.5,
  },
  // 카드가 자기 배경을 갖게 되어 구분선이 필요 없다 — 카드 사이 간격만 둔다
  separator: {
    height: theme.spacing.sm,
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
