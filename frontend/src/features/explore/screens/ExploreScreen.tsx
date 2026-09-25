import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useFadingNativeTitle } from '@/shared/navigation/useFadingNativeTitle';
import {
  useNativeBarPullProps,
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
  RemainingPlaysIndicator,
  useBottomDockInset,
} from '@/features/player';

import ExploreEmptyState from '../components/ExploreEmptyState';
import ExploreFeaturedCard from '../components/ExploreFeaturedCard';
import ExploreMoreSheet from '../components/ExploreMoreSheet';
import ExploreSearchBarRow from '../components/ExploreSearchBarRow';
import ExploreSkeleton from '../components/ExploreSkeleton';
import ExploreTile from '../components/ExploreTile';
import PopularPeriodToggle from '../components/PopularPeriodToggle';
import TopicChips from '../components/TopicChips';
import { EXPLORE_COPY } from '../explore.copy';
import { exploreGridKey, toExploreGridData } from '../explore.grid';
import { buildSectionListKey } from '../explore.section-key';
import type { ExploreSection } from '../explore.types';
import { useExploreScreen } from '../hooks/useExploreScreen';

/**
 * 탐색 탭(E1~E13) — 화면은 뷰만 담당하고 로직은 useExploreScreen이 소유한다.
 *
 * 상단 두 갈래(PM 2026-09-25 23:50 "애플이라면 상단을 어떻게" · 09-26 00:29 애플 뮤직 스샷):
 * - **iOS 26 시스템 탭 바(HAS_NATIVE_TAB_BAR)** — 투명 시스템 바(바 밑 블러는 시스템) 밑에 **콘텐츠 안 큰 제목 줄**
 *   ("탐색" + 오른쪽 잔여 링, 같은 줄), 그 밑 채움 검색 필드(누르면 검색 화면 E6), 주제 칩이 **목록의 첫 줄**로 같이
 *   스크롤한다(앱스토어 카테고리 알약). 제목 줄이 바 밑으로 들어가면 바에 작은 제목이 페이드인한다.
 * - 그 외 — 떠 있는 유리 머리 줄(FloatingHeader: 검색창 + 링 + 칩)이 목록 위에 뜬다(2026-09-24).
 */
export default function ExploreScreen() {
  const screen = useExploreScreen();
  const miniInset = useBottomDockInset();
  // 떠 있는 머리 줄(검색창·칩)의 높이 — 목록이 그만큼 위를 비운다(시스템 바 갈래에서는 0)
  const [headerHeight, setHeaderHeight] = useState(0);
  const floatingInset = useFloatingHeaderInset(headerHeight);
  const headerInset = HAS_NATIVE_TAB_BAR ? 0 : floatingInset;
  // 투명 시스템 바 — 스크롤 뷰가 아닌 상태 화면(스켈레톤·에러)은 상태 바만 비우고, 목록은 바 줄만큼 끌어올린다(제목이 바 줄 자리에)
  const nativeBarInset = useNativeHeaderInset();
  const nativeBarPull = useNativeBarPullProps();
  // 맨 위에서는 머리 줄 컨트롤이 면, 내리면 유리(PM 2026-09-25)
  const { solidness, scrollY, scrollProps } = useFloatingHeaderScroll();
  useFadingNativeTitle(EXPLORE_COPY.tabTitle, scrollY);
  // 상태 바 밑 블러는 iOS 26 시스템 scroll edge effect — 목록이 그려진 뒤에 걸어야 한다
  // 필터 목록·피드 중 하나만 그려지므로 ref 하나를 같이 쓴다
  const listRef = useRef(null);
  const headerRef = useRef<View>(null);
  useSystemScrollEdgeEffect(
    listRef,
    headerRef,
    !screen.isFullError && !screen.showSkeleton && !screen.isInitialLoading,
  );

  // E10은 검색창 줄·주제 칩·잔여 표시까지 그리지 않는다 — 화면 전체가 에러다(uiux 4.8)
  if (screen.isFullError) {
    // 시스템 바 갈래에서는 투명 바 높이만큼 비운다(안전영역은 그 안에 든다)
    const Frame = HAS_NATIVE_TAB_BAR ? View : SafeAreaView;
    return (
      <Frame style={[styles.container, { paddingTop: nativeBarInset }]} edges={['top']}>
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
      </Frame>
    );
  }

  // E8(콘텐츠 풀 0건)은 주제 칩 줄을 숨긴다 — 어떤 칩을 골라도 결과가 없다(uiux 4.7)
  const showChips = screen.emptyKind !== 'feed';
  const chips = showChips ? (
    <TopicChips
      topics={screen.topics}
      selectedTopicIds={screen.selectedTopicIds}
      onToggle={screen.toggleTopic}
    />
  ) : null;
  // 잔여 재생 링 — 무제한·캐시·값 없음이면 자리를 비운다, "무제한" 배지도 없다(uiux 4.2)
  const remainingRing = screen.remainingDisplay ? (
    <RemainingPlaysIndicator
      remaining={screen.remainingDisplay.remaining}
      limit={screen.remainingDisplay.limit}
      onExhaustedPress={() => screen.openPaywall('explore')}
    />
  ) : null;
  // 시스템 바 갈래의 큰 제목 줄 — 제목과 링이 같은 줄
  const titleRow = HAS_NATIVE_TAB_BAR ? (
    <LargeTitleRow title={EXPLORE_COPY.tabTitle} trailing={remainingRing} />
  ) : null;
  // 시스템 바 갈래에서는 제목 줄·검색 필드·칩이 콘텐츠의 첫 줄이다 — 목록과 같이 스크롤한다.
  // 검색 필드는 유리가 아니라 면(콘텐츠 안) — 누르면 검색 화면(E6), 입력은 거기서(explore.md 4.5-1)
  const contentChips = HAS_NATIVE_TAB_BAR ? (
    <>
      {titleRow}
      <ExploreSearchBarRow onPress={screen.openSearch} trailing={null} variant="fill" />
      {chips}
    </>
  ) : null;

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
      // 스피너가 머리 줄 밑에 숨지 않게
      progressViewOffset={headerInset}
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
          <Text style={[styles.sectionTitle, styles.sectionTitleBlock]} accessibilityRole="header">
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
    if (screen.showSkeleton) {
      return (
        <View style={{ paddingTop: headerInset + nativeBarInset }}>
          {titleRow}
          <ExploreSkeleton showSectionTitles={!screen.isFiltered} />
        </View>
      );
    }
    if (screen.isInitialLoading) return <View style={styles.container} />;

    // E2 — 주제 필터 단일 목록(무한 스크롤). 필터 결과는 캐러셀이 아니라 세로 목록이다 —
    // 개수가 정해져 있지 않아 가로로 밀게 하면 끝을 가늠할 수 없다
    if (screen.isFiltered) {
      return (
        <Animated.FlatList
          ref={listRef}
          {...DOCK_SCROLL_PROPS}
          {...nativeBarPull}
          {...scrollProps}
          data={toExploreGridData(screen.filteredItems)}
          keyExtractor={exploreGridKey}
          numColumns={2}
          columnWrapperStyle={styles.gridRow}
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
          ListEmptyComponent={
            screen.emptyKind === 'filtered' ? (
              <ExploreEmptyState
                title={EXPLORE_COPY.empty.filtered.title}
                actionLabel={EXPLORE_COPY.empty.filtered.action}
                onActionPress={screen.clearTopicFilter}
              />
            ) : null
          }
          ListHeaderComponent={contentChips}
          ListHeaderComponentStyle={contentChips ? styles.contentChips : undefined}
          ListFooterComponent={renderFooter()}
          contentContainerStyle={[
            screen.filteredItems.length === 0 ? styles.emptyContent : styles.gridContent,
            { paddingTop: headerInset, paddingBottom: miniInset },
          ]}
          refreshControl={refreshControl}
          onEndReached={screen.loadMore}
          onEndReachedThreshold={0.4}
        />
      );
    }

    // E1 — 섹션형 피드. 섹션 구성·순서·제목은 서버 응답 그대로다(explore.md 4.1)
    return (
      <Animated.ScrollView
        ref={listRef}
        {...DOCK_SCROLL_PROPS}
        {...nativeBarPull}
        {...scrollProps}
        contentContainerStyle={[
          screen.sections.length === 0 ? styles.emptyContent : styles.feedContent,
          { paddingTop: headerInset, paddingBottom: miniInset },
        ]}
        refreshControl={refreshControl}
      >
        {contentChips}
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
      </Animated.ScrollView>
    );
  };

  return (
    <View style={styles.container}>
      {renderBody()}
      {/* 머리 줄은 목록 **뒤에 선언**한다(zIndex 로 위에 뜬다) — 목록이 화면의 첫 자손 스크롤 뷰여야 react-native-screens 가
          iOS 26 의 시스템 scroll edge effect(상태 바 밑 블러)를 걸 수 있다(2026-09-25 PM) */}
      {/* 머리 줄은 목록 위에 떠 있다 — 배경 없이 유리 컨트롤만(2026-09-24 PM). 시스템 바 갈래에서는 없다 */}
      {HAS_NATIVE_TAB_BAR ? null : (
      <FloatingHeader
        onHeightChange={setHeaderHeight}
        solidness={solidness}
        containerRef={headerRef}
      >
        <ExploreSearchBarRow onPress={screen.openSearch} trailing={remainingRing} />

        {chips}
      </FloatingHeader>
      )}

      {/* 미니플레이어(PL11) — 활성 재생 세션만 그린다. 복원 스냅샷 판정은 라이브러리 소유다 */}

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
    </View>
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
  // 주제 필터 결과 — 라이브러리와 같은 두 칸 썸네일 격자(2026-09-18 PM). 좌우 여백은 검색 줄과 같은 선
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
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.sm,
  },
  // 콘텐츠 첫 줄의 칩(시스템 바 갈래) — 좌우 여백은 칩 줄이 갖는다. 격자 목록은 gridContent 의 좌우 여백을 되돌린다
  contentChips: {
    marginHorizontal: -theme.spacing.md,
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
  // 단독 제목만 줄 간격을 키운다 — 크기만 키우면 두 줄로 접힐 때 줄이 붙는다
  sectionTitleBlock: {
    lineHeight: theme.font.size.xl * 1.25,
  },
  sectionHeaderTitle: {
    // 토글과 공간을 나눈다 — 동적 텍스트 200%에서도 제목이 토글을 밀어내지 않게(uiux 7)
    flexShrink: 1,
    paddingTop: 0,
    paddingBottom: 0,
    // 줄 간격을 키우지 않는다 — iOS 는 늘린 줄 높이의 여분을 글자 위에만 얹어 글자가 상자 아래로 내려앉고,
    // alignItems:center 로 맞춘 토글이 글자보다 위에 떠 보였다(2026-09-25 23:41 실기기)
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
