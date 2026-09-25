import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useFadingNativeTitle } from '@/shared/navigation/useFadingNativeTitle';
import {
  useNativeBarPullStyle,
  useNativeHeaderInset,
} from '@/shared/navigation/useNativeHeaderInset';
import { useSystemScrollEdgeEffect } from '@/shared/navigation/useSystemScrollEdgeEffect';
import { theme } from '@/shared/theme';
import FloatingHeader, {
  useFloatingHeaderInset,
  useFloatingHeaderScroll,
} from '@/shared/ui/FloatingHeader';
import FullScreenError from '@/shared/ui/FullScreenError';
import { HAS_NATIVE_TAB_BAR } from '@/shared/ui/GlassSurface';
import LargeTitleRow from '@/shared/ui/LargeTitleRow';

import {
  DOCK_SCROLL_PROPS,
  PlayConfirmDialog,
  useBottomDockInset,
  useMiniPlayerResumeStore,
} from '@/features/player';

import LibraryBanner from '../components/LibraryBanner';
import LibraryEmptyState from '../components/LibraryEmptyState';
import LibraryFilterSummary from '../components/LibraryFilterSummary';
import LibraryItemSkeleton from '../components/LibraryItemSkeleton';
import LibraryItemTile from '../components/LibraryItemTile';
import LibrarySearchBarRow from '../components/LibrarySearchBarRow';
import LibraryToolbar from '../components/LibraryToolbar';
import MoreActionsSheet from '../components/MoreActionsSheet';
import TopicFilterSheet from '../components/TopicFilterSheet';
import UndoSnackbar from '../components/UndoSnackbar';
import { useLibraryScreen } from '../hooks/useLibraryScreen';
import { LIBRARY_COPY } from '../library.copy';
import { filterLibraryRows, normalizeLibraryQuery } from '../library.search';
import type { LibraryItem, LibraryListRow } from '../library.types';

/** 격자 렌더 행 — 타일 두 장이 한 행, 탐험 구획 헤더는 전체 폭 한 행 */
type LibraryGridRow =
  { kind: 'pair'; key: string; items: LibraryItem[] } | { kind: 'discoveryHeader'; key: string };

/**
 * 목록 행을 두 칸 격자 행으로 묶는다(2026-09-18 PM: 썸네일 격자). `numColumns`는 헤더처럼 전체 폭
 * 행이 끼면 격자가 어긋나므로 쓰지 않는다. 구획 헤더 앞뒤로 짝이 끊기면 마지막 타일은 혼자 남긴다
 */
const toGridRows = (rows: LibraryListRow[]): LibraryGridRow[] => {
  const result: LibraryGridRow[] = [];
  let pending: LibraryItem[] = [];
  const flush = () => {
    if (pending.length === 0) return;
    result.push({ kind: 'pair', key: pending[0].id, items: pending });
    pending = [];
  };
  rows.forEach((row) => {
    if (row.kind === 'discoveryHeader') {
      flush();
      result.push({ kind: 'discoveryHeader', key: 'discovery-header' });
      return;
    }
    pending.push(row.item);
    if (pending.length === 2) flush();
  });
  flush();
  return result;
};

/**
 * L1 라이브러리 — 앱의 첫 화면. 화면은 뷰만 담당하고 로직은 useLibraryScreen이 소유한다.
 *
 * 상단 두 갈래(PM 2026-09-26 00:14 "라이브러리도" · 00:29 애플 뮤직 스샷 — design.md 5장 "상단 — 시스템 내비게이션 바"):
 * - **iOS 26 시스템 탭 바(HAS_NATIVE_TAB_BAR)** — 투명 시스템 바(바 밑 블러는 시스템) 밑에 **콘텐츠 안 큰 제목 줄**
 *   ("라이브러리" + 오른쪽 링·필터 툴바 캡슐, 같은 줄) / 채움 검색 필드 / 조건 요약·배너 — 전부 목록의 첫 줄로 같이 스크롤한다.
 *   제목 줄이 바 밑으로 들어가면 바에 작은 제목이 페이드인한다(애플 뮤직·앱스토어 탭 화면).
 * - 그 외 — 떠 있는 유리 머리 줄(FloatingHeader: 검색창 + 툴바 + 요약 + 배너)이 목록 위에 뜬다(2026-09-24).
 */
export default function LibraryScreen() {
  const screen = useLibraryScreen();
  const miniInset = useBottomDockInset();
  // 떠 있는 머리 줄(검색창·탭·배너)의 높이 — 목록이 그만큼 위를 비운다(시스템 바 갈래에서는 0)
  const [headerHeight, setHeaderHeight] = useState(0);
  const floatingInset = useFloatingHeaderInset(headerHeight);
  const headerInset = HAS_NATIVE_TAB_BAR ? 0 : floatingInset;
  // 투명 시스템 바 — 스크롤 뷰가 아닌 상태 화면(스켈레톤·에러)은 상태 바만 비우고, 목록의 제목 줄은 바 줄만큼 올린다
  const nativeBarInset = useNativeHeaderInset();
  const nativeBarPull = useNativeBarPullStyle();
  // 맨 위에서는 머리 줄 컨트롤이 면, 내리면 유리(PM 2026-09-25)
  const { solidness, scrollY, scrollProps } = useFloatingHeaderScroll();
  useFadingNativeTitle(LIBRARY_COPY.tabTitle, scrollY);
  // 상태 바 밑 블러는 iOS 26 시스템 scroll edge effect — 목록이 그려진 뒤에 걸어야 한다
  const listRef = useRef(null);
  const headerRef = useRef<View>(null);
  useSystemScrollEdgeEffect(
    listRef,
    headerRef,
    !screen.isFullError && !screen.showSkeleton && !screen.isInitialLoading,
  );

  /*
   * 검색은 **받아 둔 목록만** 좁힌다 — 서버 조회를 추가하지 않는다.
   * 아직 불러오지 않은 페이지는 대상이 아니며, 스크롤로 더 불러오면 그만큼 대상이 늘어난다.
   */
  const [query, setQuery] = useState('');
  const normalizedQuery = normalizeLibraryQuery(query);
  const isSearching = normalizedQuery.length > 0;

  // 매칭 규칙은 library.search.ts가 소유한다 — 저자 null(AI 생성) 처리 포함
  const visibleRows = useMemo(
    () => filterLibraryRows(screen.listRows, normalizedQuery),
    [screen.listRows, normalizedQuery],
  );
  const gridRows = useMemo(() => toGridRows(visibleRows), [visibleRows]);

  // L6·L9는 목록 전체가 빈 상태 — 탭 줄·필터 아이콘·복원 미니플레이어를 감춘다(uiux 4.8)
  const isWholeEmpty = screen.emptyKind === 'newUser' || screen.emptyKind === 'deletedAll';
  const showTabBar = !screen.isFullError && !isWholeEmpty;

  // 잔여 링(무제한·캐시·값 없음이면 칸 없음 — uiux 4.3) + 필터를 한 유리 캡슐에(2026-09-25 PM).
  // 상태·출처·주제 필터는 전부 시트 하나 — 세그먼트 탭 줄은 폐지
  const toolbar = showTabBar ? (
    <LibraryToolbar
      remaining={screen.remainingDisplay}
      onExhaustedPress={() => screen.openPaywall('library')}
      activeFilterCount={screen.topicFilterCount}
      onFilterPress={screen.openTopicSheet}
    />
  ) : null;
  // 시스템 바 갈래의 큰 제목 줄 — 제목과 툴바가 같은 줄(PM 2026-09-26 00:25 "높이 맞추자")
  const titleRow = HAS_NATIVE_TAB_BAR ? (
    <LargeTitleRow title={LIBRARY_COPY.tabTitle} trailing={toolbar} />
  ) : null;

  // 시스템 바 갈래에서 조건 요약·배너는 목록의 첫 줄이다 — 목록과 같이 스크롤한다
  const filterSummary = showTabBar ? (
    <LibraryFilterSummary conditions={screen.filteredConditions} onPress={screen.openTopicSheet} />
  ) : null;
  // 배너는 목록 바로 위에 둔다 — 세 배너 모두 "이 목록에 무슨 일이 있었나"를 알리므로 목록에 붙어 있어야
  // 무엇에 대한 통지인지 읽힌다(uiux 4.1)
  const banner = screen.banner ? (
    <LibraryBanner banner={screen.banner} onPress={screen.handleBannerPress} />
  ) : null;
  const contentHeader = HAS_NATIVE_TAB_BAR ? (
    <View style={[styles.contentHeader, nativeBarPull]}>
      {titleRow}
      {/* 콘텐츠 안 검색 필드 — 유리가 아니라 면(애플 뮤직 검색 탭). 받아 둔 목록을 그 자리에서 좁히는 규칙은 그대로 */}
      {showTabBar ? (
        <LibrarySearchBarRow query={query} onChangeQuery={setQuery} trailing={null} variant="fill" />
      ) : null}
      {filterSummary}
      {banner}
    </View>
  ) : null;
  // 복원 스냅샷 폴백의 노출 조건 — 활성 재생 세션의 표시는 MiniPlayer가 스스로 판단한다
  const resumeTarget = screen.resumeTarget;
  const isResumeVisible = resumeTarget !== null && !screen.isFullError && !isWholeEmpty;
  // 스토어에 올리는 값이라 참조가 안정해야 한다 — 매 렌더 새 객체면 독의 미니플레이어가 매번 다시 그린다
  const resumeFallback = useMemo(
    () =>
      isResumeVisible && resumeTarget !== null
        ? {
            contentId: resumeTarget.content.id,
            title: resumeTarget.content.title,
            thumbnailUrl: resumeTarget.content.thumbnailUrl,
            positionSec: resumeTarget.progress?.positionSec ?? 0,
            durationSec: resumeTarget.content.durationSec,
            // 카테고리 줄 — 복원 응답의 topic_ids(library-api.md 4.3, KAN-91 반영 2026-09-22 · FE 매핑 09-24)
            topicIds: resumeTarget.content.topicIds,
          }
        : null,
    [isResumeVisible, resumeTarget],
  );

  // 미니플레이어는 탭 바 독(CapsuleTabBar)에 하나만 산다(2026-09-23) — 복원 스냅샷과 핸들러를 스토어로 넘긴다
  const setMiniPlayerResume = useMiniPlayerResumeStore((s) => s.set);
  const { handleMiniPlayerPlay, handleMiniPlayerExpand, handleMiniPlayerDismiss } = screen;
  useEffect(() => {
    setMiniPlayerResume({
      fallback: resumeFallback,
      onPlayPress: handleMiniPlayerPlay,
      onExpandPress: handleMiniPlayerExpand,
      onDismiss: handleMiniPlayerDismiss,
    });
  }, [
    setMiniPlayerResume,
    resumeFallback,
    handleMiniPlayerPlay,
    handleMiniPlayerExpand,
    handleMiniPlayerDismiss,
  ]);

  const renderEmpty = () => {
    if (isSearching) {
      return (
        <LibraryEmptyState
          title={LIBRARY_COPY.search.emptyTitle}
          description={LIBRARY_COPY.search.emptyDescription}
          actionLabel={LIBRARY_COPY.search.emptyAction}
          onActionPress={() => setQuery('')}
        />
      );
    }
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
    <View style={styles.container}>
      {screen.isFullError ? (
        <View style={[styles.container, { paddingTop: nativeBarInset }]}>
          {titleRow}
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
        </View>
      ) : screen.showSkeleton ? (
        <View style={{ paddingTop: headerInset + nativeBarInset }}>
          {titleRow}
          <LibraryItemSkeleton />
        </View>
      ) : screen.isInitialLoading ? (
        <View style={styles.container} />
      ) : (
        <Animated.FlatList
          ref={listRef}
          {...DOCK_SCROLL_PROPS}
          {...scrollProps}
          data={gridRows}
          keyExtractor={(row) => row.key}
          renderItem={({ item: row }) =>
            row.kind === 'discoveryHeader' ? (
              // [이어 PICK] 뷰의 탐험 구획 타이틀 — 정규 드립 구획 뒤에 온다(library.md 4.6-1)
              <Text style={styles.discoverySectionTitle} accessibilityRole="header">
                {LIBRARY_COPY.discovery.sectionTitle}
              </Text>
            ) : (
              <View style={styles.gridRow}>
                {row.items.map((item) => (
                  <LibraryItemTile
                    key={item.id}
                    item={item}
                    onPress={screen.handleItemPress}
                    onMorePress={screen.openMoreSheet}
                    // 배지는 전체 목록에서만 — PICK 뷰는 구획이 구분한다(library.md 4.6-1)
                    showDiscoveryBadge={!screen.isPickView}
                  />
                ))}
                {/* 홀수 마지막 행 — 빈 칸을 채워 남은 타일이 전체 폭으로 늘지 않게 한다 */}
                {row.items.length === 1 ? <View style={styles.gridSpacer} /> : null}
              </View>
            )
          }
          ItemSeparatorComponent={({ leadingItem }: { leadingItem: LibraryGridRow }) =>
            // 구획 타이틀 바로 아래에는 간격을 두지 않는다 — 타이틀 자체가 아래 여백을 가진다
            leadingItem.kind === 'discoveryHeader' ? null : <View style={styles.separator} />
          }
          ListHeaderComponent={contentHeader}
          ListEmptyComponent={renderEmpty()}
          ListFooterComponent={renderFooter()}
          contentContainerStyle={[
            gridRows.length === 0 ? styles.emptyContent : styles.gridContent,
            { paddingTop: headerInset, paddingBottom: miniInset },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={screen.isManualRefreshing}
              onRefresh={() => void screen.refresh()}
              tintColor={theme.color.primary}
              // 스피너가 머리 줄 밑에 숨지 않게
              progressViewOffset={headerInset}
            />
          }
          onEndReached={screen.loadMore}
          onEndReachedThreshold={0.4}
        />
      )}

      {/* 머리 줄은 목록 **뒤에 선언**한다(zIndex 로 위에 뜬다) — 목록이 화면의 첫 자손 스크롤 뷰여야 react-native-screens 가
          iOS 26 의 시스템 scroll edge effect(상태 바 밑 블러)를 걸 수 있다(2026-09-25 PM) */}
      {/* 머리 줄은 목록 위에 떠 있다 — 배경 없이 유리 컨트롤만(2026-09-24 PM). 브랜드 표시는 두지 않는다(2026-09-02).
          시스템 바 갈래에서는 없다 — 검색창·툴바는 바에, 요약·배너는 목록 첫 줄에 */}
      {HAS_NATIVE_TAB_BAR ? null : (
        <FloatingHeader
          onHeightChange={setHeaderHeight}
          solidness={solidness}
          containerRef={headerRef}
        >
          {showTabBar ? (
            <LibrarySearchBarRow query={query} onChangeQuery={setQuery} trailing={toolbar} />
          ) : null}
          {filterSummary}
          {banner}
        </FloatingHeader>
      )}

      {/* 미니플레이어(PL11) — 활성 세션은 실시간, 없으면 복원 스냅샷을 일시정지로 표시한다 */}

      <TopicFilterSheet
        key={screen.topicSheetEpoch}
        visible={screen.isTopicSheetVisible}
        topics={screen.topics}
        isLoading={screen.isTopicsLoading}
        appliedTopicIds={screen.appliedTopicIds}
        appliedSourceFilter={screen.appliedSourceFilter}
        appliedStatus={screen.filter}
        onApply={screen.applyTopicFilter}
        onDismiss={screen.closeTopicSheet}
      />

      <MoreActionsSheet
        item={screen.moreSheetItem}
        onDetail={screen.openDetail}
        onSourceLink={screen.openSourceLink}
        onDelete={screen.requestDelete}
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

      {/* 스낵바는 미니플레이어·하단 탭 위에 겹친다 — [실행 취소]가 가려지면 안 된다(uiux 4.4) */}
      <UndoSnackbar visible={screen.pendingDeleteItem !== null} onUndoPress={screen.undoDelete} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.color.background,
  },
  // 목록 첫 줄의 제목·검색·요약·배너(시스템 바 갈래) — 좌우 여백은 각자 갖는다. 격자의 좌우 여백을 되돌린다
  contentHeader: {
    marginHorizontal: -theme.spacing.md,
  },
  // 격자 — 좌우 여백은 검색 줄과 같은 선(md), 타일 사이는 sm×1.5
  gridContent: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm,
  },
  gridRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm * 1.5,
  },
  gridSpacer: {
    flex: 1,
  },
  // 타일 행 사이 세로 간격 — 제목 두 줄 뒤에 다음 사진이 바로 붙지 않게 가로 간격보다 크게
  separator: {
    height: theme.spacing.lg,
  },
  // 구획 앞뒤 여백을 카드 간격(8)보다 크게 벌린다 — 그래야 타이틀이 앞 카드의 꼬리가
  // 아니라 뒤 묶음의 머리로 읽힌다. 타이틀 아래는 구분선을 긋지 않으므로 여백이 유일한 단서다
  discoverySectionTitle: {
    paddingTop: theme.spacing.xl,
    paddingBottom: theme.spacing.sm,
    fontSize: theme.font.size.lg,
    fontWeight: '700',
    color: theme.color.textPrimary,
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
