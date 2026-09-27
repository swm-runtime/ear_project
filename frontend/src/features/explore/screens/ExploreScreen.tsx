import { useLayoutEffect, useMemo, useRef, useState } from 'react';
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

import { useNativeHeaderInset } from '@/shared/navigation/useNativeHeaderInset';
import { useSystemLargeTitle } from '@/shared/navigation/useSystemLargeTitle';
import { useTabScrollToTop } from '@/shared/navigation/useTabScrollToTop';
import { theme } from '@/shared/theme';
import FloatingHeader, {
  useFloatingHeaderInset,
  useFloatingHeaderScroll,
} from '@/shared/ui/FloatingHeader';
import FullScreenError from '@/shared/ui/FullScreenError';
import { HAS_NATIVE_TAB_BAR } from '@/shared/ui/GlassSurface';

import {
  DOCK_SCROLL_PROPS,
  PlayConfirmDialog,
  RemainingPlaysIndicator,
  useBottomDockInset,
} from '@/features/player';

import ExploreSearchScreen from './ExploreSearchScreen';
import ExploreEmptyState from '../components/ExploreEmptyState';
import ExploreFeaturedCard from '../components/ExploreFeaturedCard';
import ExploreMoreSheet from '../components/ExploreMoreSheet';
import ExploreRingPill from '../components/ExploreRingPill';
import ExploreSearchBarRow from '../components/ExploreSearchBarRow';
import ExploreSkeleton from '../components/ExploreSkeleton';
import ExploreTile from '../components/ExploreTile';
import PopularPeriodToggle from '../components/PopularPeriodToggle';
import SearchToolbar from '../components/SearchToolbar';
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
 * - **iOS 26 시스템 탭 바(HAS_NATIVE_TAB_BAR)** — 시스템 바 없이(터치를 먹어서 껐다, 09-26 17:42) **콘텐츠 안 큰 제목 줄**
 *   ("탐색" + 오른쪽 잔여 링, 같은 줄), 그 밑 채움 검색 필드(누르면 검색 화면 E6), 주제 칩이 **목록의 첫 줄**로 같이
 *   스크롤한다(앱스토어 카테고리 알약). 큰 제목 "탐색"과 캡슐은 시스템 바가 든다(useSystemLargeTitle — iOS 26 .inline).
 * - 그 외 — 떠 있는 유리 머리 줄(FloatingHeader: 검색창 + 링 + 칩)이 목록 위에 뜬다(2026-09-24).
 */
export default function ExploreScreen() {
  const screen = useExploreScreen();
  const miniInset = useBottomDockInset();
  // 떠 있는 머리 줄(검색창·칩)의 높이 — 목록이 그만큼 위를 비운다(시스템 바 갈래에서는 0)
  const [headerHeight, setHeaderHeight] = useState(0);
  const floatingInset = useFloatingHeaderInset(headerHeight);
  const headerInset = HAS_NATIVE_TAB_BAR ? 0 : floatingInset;
  // 시스템 탭 갈래(바 없음) — 스크롤 뷰가 아닌 상태 화면(스켈레톤·에러)은 상태 바만 비운다
  const nativeBarInset = useNativeHeaderInset();
  // 맨 위에서는 머리 줄 컨트롤이 면, 내리면 유리(PM 2026-09-25)
  const { solidness, scrollY, scrollProps } = useFloatingHeaderScroll();
  // 머리 줄(JS 탭 바 갈래)의 루트 ref — 종전 시스템 edge effect 연결용, 지금은 FloatingHeader 가 요구만 한다
  const headerRef = useRef<View>(null);
  // 제자리 검색 모드(iOS 26) — 아래 isSearching 분기
  const [isSearching, setIsSearching] = useState(false);
  // 제자리 검색 닫기 요청 — ✕ 는 시스템 바 캡슐에 있고, 덮개가 퇴장 애니메이션 끝에 onExit 로 isSearching 을 끈다
  const [isClosingSearch, setIsClosingSearch] = useState(false);
  const listRef = useTabScrollToTop({ topInset: nativeBarInset, enabled: !isSearching });
  const openSearch = HAS_NATIVE_TAB_BAR ? () => setIsSearching(true) : screen.openSearch;

  /*
   * 제자리 검색(iOS 26 — PM 2026-09-27 21:03 "검색 화면을 따로 두지 말고 그냥 탐색"): 검색창을 누르면 새 화면으로 가지 않고
   * 이 자리가 "탐색" 제목 + 입력 중인 검색창 + 최근 검색어·추천 키워드(입력하면 결과)로 바뀐다. [취소]면 피드로 돌아온다.
   * 애플 뮤직 검색 탭과 같다. 피드 상태(필터·구간)는 이 화면 훅이 그대로 들고 있다. JS 탭 바 갈래는 종전 스택 검색 화면
   */
  // 잔여 재생 링 — 무제한·캐시·값 없음이면 자리를 비운다, "무제한" 배지도 없다(uiux 4.2)
  // 시스템 탭 바 갈래는 라이브러리 알약과 같은 캡슐(ExploreRingPill) — 탭 전환 때 필터 칸이 줄었다 자라게(00:32 PM)
  // JS 탭 바 갈래의 떠 있는 머리 줄 링(시스템 바 갈래는 바 캡슐 — 아래 barTrailing)
  const remainingRing = screen.remainingDisplay ? (
    <RemainingPlaysIndicator
      remaining={screen.remainingDisplay.remaining}
      limit={screen.remainingDisplay.limit}
      onExhaustedPress={() => screen.openPaywall('explore')}
    />
  ) : null;

  /*
   * **시스템 큰 제목**(iOS 26 .inline — 라이브러리와 같다, PM 2026-09-28 03:14 "이거야"): 큰 제목 "탐색"과 오른쪽 캡슐이 바
   * 줄에 앉고, 스크롤 접힘·바 밑 블러는 시스템. 캡슐은 피드면 [링], 제자리 검색이면 [링 | ✕](닫힐 때 ✕ 칸이 줄어든다).
   * 바 옵션으로 넘기는 요소라 참조가 안정해야 한다 — 화면 훅의 콜백은 ref 로 읽는다
   */
  const screenRef = useRef(screen);
  useLayoutEffect(() => {
    screenRef.current = screen;
  });
  const remainingValue = screen.remainingDisplay?.remaining;
  const remainingLimit = screen.remainingDisplay?.limit;
  const barTrailing = useMemo(() => {
    const remaining =
      remainingValue !== undefined && remainingLimit !== undefined
        ? { remaining: remainingValue, limit: remainingLimit }
        : null;
    const onExhaustedPress = () => screenRef.current.openPaywall('explore');
    if (isSearching) {
      return (
        <SearchToolbar
          remaining={remaining}
          onExhaustedPress={onExhaustedPress}
          onClose={() => setIsClosingSearch(true)}
          isOpen={!isClosingSearch}
        />
      );
    }
    return remaining ? (
      <ExploreRingPill
        remaining={remaining.remaining}
        limit={remaining.limit}
        onExhaustedPress={onExhaustedPress}
      />
    ) : null;
  }, [isSearching, isClosingSearch, remainingValue, remainingLimit]);
  // 바는 탭 화면(ExploreStack 의 부모)의 것
  // 내리면 가운데 작은 제목 + 왼쪽 유리 검색 버튼(PM 2026-09-28 03:44) — 누르면 제자리 검색. 검색 중엔 펼친 바
  useSystemLargeTitle(EXPLORE_COPY.tabTitle, barTrailing, {
    onParent: true,
    collapse: isSearching
      ? undefined
      : { scrollY, onSearch: () => setIsSearching(true), searchLabel: EXPLORE_COPY.search.placeholder },
  });

  /*
   * 제자리 검색은 피드 **위에 덮는다** — 피드는 밑에 그대로 둬서 닫을 때 다시 그릴 게 없다(23:12 PM "x 누를 때 렉" — 종전엔
   * 피드를 통째로 갈아 끼워 닫힘 애니메이션 끝에 피드 전체를 새로 마운트하느라 끊겼다)
   */
  const searchOverlay = isSearching ? (
    <View style={StyleSheet.absoluteFill}>
      <ExploreSearchScreen
        embedding={{
          remaining: screen.remainingDisplay
            ? { remaining: screen.remainingDisplay.remaining, limit: screen.remainingDisplay.limit }
            : null,
          onExhaustedPress: () => screen.openPaywall('explore'),
          isClosing: isClosingSearch,
          onExit: () => {
            setIsSearching(false);
            setIsClosingSearch(false);
          },
          onOpenTopic: (topicId) => {
            screen.clearTopicFilter();
            screen.toggleTopic(topicId);
            setIsSearching(false);
          },
        }}
      />
    </View>
  ) : null;

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
  // 시스템 바 갈래에서는 제목 줄·검색 필드·칩이 콘텐츠의 첫 줄이다 — 목록과 같이 스크롤한다.
  // 검색 필드는 유리가 아니라 면(콘텐츠 안) — 누르면 검색 화면(E6), 입력은 거기서(explore.md 4.5-1)
  const contentChips = HAS_NATIVE_TAB_BAR ? (
    <View>
      <ExploreSearchBarRow onPress={openSearch} trailing={null} variant="fill" />
      {chips}
    </View>
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
  /**
   * 콘텐츠의 주제 id 를 이름으로 푼다 — 대표 카드 하단 줄의 해시태그(플레이어 제목 줄의 `queueCategoryOf` 와
   * 같은 규칙: 못 찾은 id 는 버리고, 자리를 억지로 채우지 않는다). 주제 목록은 칩 줄이 이미 받아 둔 것이다
   */
  const topicNamesOf = (topicIds: string[]): string[] =>
    topicIds
      .map((id) => screen.topics.find((topic) => topic.id === id)?.name)
      .filter((name): name is string => Boolean(name));

  const renderSection = (section: ExploreSection, index: number) => {
    const isPopular = section.period !== null;
    /*
     * 첫 섹션의 제목은 위 여백을 줄인다 — 그 위가 **주제 칩 줄**이라 칩의 아래 여백(8)과 제목의 위 여백(24)이
     * 겹쳐 32 가 됐다(PM 2026-09-28 00:28 "주제 알약하고 인기콘텐츠 제목 간격이 너무 크다"). 섹션 **사이**의
     * 24 는 그대로 둔다 — 제목이 "뒤 캐러셀의 머리"로 읽히게 위 여백을 아래의 세 배로 두는 규칙이다(아래 주석)
     */
    const headerStyle = index === 0 ? styles.sectionHeaderFirst : null;

    return (
      <View key={buildSectionListKey(section)} style={styles.section}>
        {section.period !== null ? (
          <View style={[styles.sectionHeaderRow, headerStyle]}>
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
          <Text
            style={[styles.sectionTitle, styles.sectionTitleBlock, headerStyle]}
            accessibilityRole="header"
          >
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
                  topicNames={topicNamesOf(item.content.topicIds)}
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
      {/* 머리 줄은 목록 **뒤에 선언**한다(zIndex 로 위에 뜬다) */}
      {/* 머리 줄은 목록 위에 떠 있다 — 배경 없이 유리 컨트롤만(2026-09-24 PM). 시스템 바 갈래에서는 없다 */}
      {HAS_NATIVE_TAB_BAR ? null : (
        <FloatingHeader
          onHeightChange={setHeaderHeight}
          solidness={solidness}
          containerRef={headerRef}
        >
          <ExploreSearchBarRow onPress={openSearch} trailing={remainingRing} />

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

      {searchOverlay}
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
  /** 첫 섹션 — 위가 주제 칩 줄이라 여백이 겹친다(위 headerStyle 주석). 32 → 24 */
  sectionHeaderFirst: {
    paddingTop: theme.spacing.md,
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
