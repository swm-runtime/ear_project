import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  InteractionManager,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAnimatedValue } from '@/shared/hooks/useAnimatedValue';
import { useNativeHeaderInset } from '@/shared/navigation/useNativeHeaderInset';
import { useSystemLargeTitle } from '@/shared/navigation/useSystemLargeTitle';
import { useTabScrollToTop } from '@/shared/navigation/useTabScrollToTop';
import { motion, theme } from '@/shared/theme';
import AndroidBlurTarget from '@/shared/ui/AndroidBlurTarget';
import AndroidCollapsingBar from '@/shared/ui/AndroidCollapsingBar';
import FloatingHeader, {
  useFloatingHeaderInset,
  useFloatingHeaderScroll,
} from '@/shared/ui/FloatingHeader';
import FullScreenError from '@/shared/ui/FullScreenError';
import { HAS_NATIVE_TAB_BAR } from '@/shared/ui/GlassSurface';
import LargeTitleRow from '@/shared/ui/LargeTitleRow';
import { Text } from '@/shared/ui/Typography';

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
import PeriodCrossfade from '../components/PeriodCrossfade';
import PopularPeriodToggle from '../components/PopularPeriodToggle';
import SearchToolbar from '../components/SearchToolbar';
import TopicChips from '../components/TopicChips';
import { EXPLORE_COPY } from '../explore.copy';
import { buildSectionListKey } from '../explore.section-key';
import type { ExploreItem, ExploreSection } from '../explore.types';
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
  const insets = useSafeAreaInsets();
  // Android 는 iOS 식 접힘 바(AndroidCollapsingBar) — 머리 줄이 목록 첫 줄이라 상태 바만 비운다
  const headerInset = HAS_NATIVE_TAB_BAR ? 0 : ANDROID_IOS_HEADER ? insets.top : floatingInset;
  // 시스템 탭 갈래(바 없음) — 스크롤 뷰가 아닌 상태 화면(스켈레톤·에러)은 상태 바만 비운다
  const nativeBarInset = useNativeHeaderInset();
  // 머리 줄(JS 탭 바 갈래)의 루트 ref — 종전 시스템 edge effect 연결용, 지금은 FloatingHeader 가 요구만 한다
  const headerRef = useRef<View>(null);
  // 주제 칩 줄의 가로 위치 — 피드 ↔ 격자 전환으로 칩 줄이 새로 그려져도 제자리에 둔다(TopicChips offsetRef)
  const chipsOffsetRef = useRef(0);
  /*
   * 주제를 바꾸는 동안 지금 콘텐츠를 흐리게 둔다(screen.isSwitching) — 새 목록이 오면 그 목록이 흐린 상태에서 제 밝기로
   * 돌아오며 바뀐다(PM 2026-10-09 깜빡임). 검색창·칩 줄은 흐리지 않는다
   */
  const switchDim = useAnimatedValue(1);
  /*
   * 피드로 돌아올 때 섹션을 한 번에 다 그리지 않는다 — 캐러셀마다 사진 목록이라 한 프레임에 몰리면 전환이 끊긴다.
   * 첫 화면 몫만 먼저, 나머지는 전환 모션이 끝난 뒤(InteractionManager) 붙인다. 아래쪽이라 눈에 띄지 않는다
   */
  const [feedSectionLimit, setFeedSectionLimit] = useState(Number.POSITIVE_INFINITY);
  const [limitedFor, setLimitedFor] = useState(screen.isFiltered);
  if (limitedFor !== screen.isFiltered) {
    setLimitedFor(screen.isFiltered);
    if (!screen.isFiltered) setFeedSectionLimit(FEED_FIRST_SECTIONS);
  }
  useEffect(() => {
    if (feedSectionLimit === Number.POSITIVE_INFINITY) return;
    const task = InteractionManager.runAfterInteractions(() =>
      setFeedSectionLimit(Number.POSITIVE_INFINITY),
    );
    return () => task.cancel();
  }, [feedSectionLimit]);
  useEffect(() => {
    const animation = Animated.timing(switchDim, {
      toValue: screen.isSwitching ? SWITCH_DIM_OPACITY : 1,
      duration: motion.duration.fast,
      // 금방 오면 흐리지 않는다 — 흰 바탕에서 짧게 흐렸다 돌아오는 게 깜빡임으로 읽혔다(PM 2026-10-09)
      delay: screen.isSwitching ? DIM_DELAY_MS : 0,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [screen.isSwitching, switchDim]);
  // Android 서리 유리 띠의 블러 대상(AndroidBlurTarget)
  const blurTargetRef = useRef<View>(null);
  // 제자리 검색 모드(iOS 26·Android) — 아래 isSearching 분기
  const [isSearching, setIsSearching] = useState(false);
  // 제자리 검색 닫기 요청 — ✕ 는 시스템 바 캡슐에 있고, 덮개가 퇴장 애니메이션 끝에 onExit 로 isSearching 을 끈다
  const [isClosingSearch, setIsClosingSearch] = useState(false);
  // 탭 재선택과 같은 "맨 위로"를 Android 접힘 바 제목 탭도 부른다
  const scrollToTopRef = useRef<(() => void) | null>(null);
  const { solidness, scrollY, scrollProps } = useFloatingHeaderScroll();
  const listRef = useTabScrollToTop({
    topInset: nativeBarInset,
    enabled: !isSearching,
    controlRef: scrollToTopRef,
  });
  const openSearch = () => {
    if (HAS_NATIVE_TAB_BAR || ANDROID_IOS_HEADER) {
      setIsSearching(true);
    } else {
      screen.openSearch();
    }
  };

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
  // .inline 큰 제목 — 제목과 캡슐이 한 줄(05:43 PM). 접힘·블러는 시스템
  // 왼쪽 검색 버튼은 못 둔다(06:03 — .inline 에 왼쪽 항목이 들어가면 큰 제목이 안 접힘)
  useSystemLargeTitle(EXPLORE_COPY.tabTitle, barTrailing);

  /*
   * 제자리 검색은 피드 **위에 덮는다** — 피드는 밑에 그대로 둬서 닫을 때 다시 그릴 게 없다(23:12 PM "x 누를 때 렉" — 종전엔
   * 피드를 통째로 갈아 끼워 닫힘 애니메이션 끝에 피드 전체를 새로 마운트하느라 끊겼다)
   */
  const searchOverlay = isSearching ? (
    <View style={HAS_NATIVE_TAB_BAR ? StyleSheet.absoluteFill : [StyleSheet.absoluteFill, { zIndex: 2 }]}>
      <ExploreSearchScreen
        embedding={{
          remaining: screen.remainingDisplay
            ? { remaining: screen.remainingDisplay.remaining, limit: screen.remainingDisplay.limit }
            : null,
          onExhaustedPress: () => screen.openPaywall('explore'),
          isClosing: isClosingSearch,
          onRequestClose: () => setIsClosingSearch(true),
          onExit: () => {
            setIsSearching(false);
            setIsClosingSearch(false);
          },
          onOpenTopic: (topicId) => {
            screen.clearTopicFilter();
            screen.toggleTopic(topicId);
            setIsSearching(false);
            setIsClosingSearch(false);
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
        {Platform.OS === 'android' ? <LargeTitleRow title={EXPLORE_COPY.tabTitle} /> : null}
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
      offsetRef={chipsOffsetRef}
    />
  ) : null;
  // 시스템 바 갈래에서는 제목 줄·검색 필드·칩이 콘텐츠의 첫 줄이다 — 목록과 같이 스크롤한다.
  // 검색 필드는 유리가 아니라 면(콘텐츠 안) — 누르면 검색 화면(E6), 입력은 거기서(explore.md 4.5-1)
  const contentChips = ANDROID_IOS_HEADER ? (
    // Android — iOS 와 같이 큰 제목·검색창·칩이 목록 첫 줄(PM 2026-09-29 17:19). 링은 떠 있는 바의 오른쪽에 고정
    <View>
      <LargeTitleRow title={EXPLORE_COPY.tabTitle} />
      <ExploreSearchBarRow onPress={openSearch} trailing={null} variant="fill" />
      {chips}
    </View>
  ) : HAS_NATIVE_TAB_BAR ? (
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
    // 구간 전환 중엔 스피너 줄을 넣지 않는다 — 캐러셀 아래에 줄이 끼었다 빠지며 그 아래 섹션 전체가 밀렸다 돌아와 깜빡였다
    // (PM 2026-10-09 "인기 콘텐츠 아래가 전부 깜빡"). 전환 중 표시는 카드 줄의 흐림(PeriodCrossfade)이 맡는다
    if (screen.isFetchingPopularNextPage) {
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
            {/* 세그먼트 내부의 alignSelf:flex-start가 제목 행의 가운데 정렬을 덮지 않게 감싼다. */}
            <View style={styles.sectionPeriodControl}>
              <PopularPeriodToggle
                selected={section.period}
                onSelect={screen.selectPopularPeriod}
                disabled={screen.isPopularSwitching}
              />
            </View>
          </View>
        ) : (
          <Text
            style={[styles.sectionTitle, styles.sectionTitleBlock, headerStyle]}
            accessibilityRole="header"
          >
            {section.title}
          </Text>
        )}

        {/* 구간 전환 중에는 직전 줄을 흐리게 유지한다 — 그 섹션만이다(uiux 4.10). 새 구간이 오면 같은 자리에서 교차한다
            (PeriodCrossfade). 새 줄은 새로 만들어져 넘기던 가로 위치와 무관하게 첫 카드부터 보인다 */}
        <PeriodCrossfade
          swapKey={section.period ?? 'static'}
          isDimmed={isPopular && screen.isPopularSwitching}
        >
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
            ItemSeparatorComponent={CarouselGap}
            onEndReached={isPopular ? screen.loadMorePopular : undefined}
            onEndReachedThreshold={0.5}
          />
        </PeriodCrossfade>

        {renderPopularSectionFooter(section)}
      </View>
    );
  };

  const renderBody = () => {
    // 필터 전환 로딩은 단일 목록이 될 자리다 — 섹션 제목 없는 행 스켈레톤만 그린다
    if (screen.showSkeleton) {
      return (
        <View style={{ paddingTop: headerInset + nativeBarInset }}>
          {ANDROID_IOS_HEADER ? <LargeTitleRow title={EXPLORE_COPY.tabTitle} /> : null}
          <ExploreSkeleton showSectionTitles={!screen.isFiltered} />
        </View>
      );
    }
    if (screen.isInitialLoading) return <View style={styles.container} />;

    /*
     * **피드(E1)와 주제 격자(E2)는 한 목록이다**(PM 2026-10-09 — 칩을 고르고 풀 때 끊김). 종전엔 피드는 ScrollView, 격자는
     * FlatList 라 모드가 바뀔 때마다 검색창·칩 줄까지 든 목록을 통째로 지우고 새로 만들었다. 이제 목록·머리(검색창·칩)는
     * 그대로 두고 내용(data)만 섹션 ↔ 격자 줄로 바꾼다. 격자는 두 칸을 한 줄 항목으로 묶는다(numColumns 는 바꿀 수 없다).
     * 섹션 구성·순서·제목은 서버 응답 그대로(explore.md 4.1), 격자는 무한 스크롤(필터 결과는 개수를 가늠할 수 없어 세로)
     */
    const listItems: ExploreListItem[] = screen.isFiltered
      ? toGridRows(screen.filteredItems)
      : screen.sections
          .slice(0, feedSectionLimit)
          .map((section, index) => ({ kind: 'section', section, index }));
    const isListEmpty = screen.isFiltered
      ? screen.filteredItems.length === 0
      : screen.sections.length === 0;
    return (
      <Animated.FlatList
        ref={listRef}
        {...DOCK_SCROLL_PROPS}
        {...scrollProps}
        data={listItems}
        keyExtractor={(item) =>
          item.kind === 'section' ? buildSectionListKey(item.section) : item.key
        }
        renderItem={({ item }) =>
          item.kind === 'section' ? (
            <Animated.View style={{ opacity: switchDim }}>
              {renderSection(item.section, item.index)}
            </Animated.View>
          ) : (
            <Animated.View style={[styles.gridRow, { opacity: switchDim }]}>
              {item.items.map((cell, column) =>
                cell === null ? (
                  <View key={`spacer-${column}`} style={styles.gridCell} />
                ) : (
                  <View key={cell.content.id} style={styles.gridCell}>
                    <ExploreTile
                      item={cell}
                      layout="grid"
                      onPress={screen.handleRowPress}
                      onMorePress={screen.openMoreSheet}
                    />
                  </View>
                ),
              )}
            </Animated.View>
          )
        }
        ItemSeparatorComponent={screen.isFiltered ? GridSeparator : undefined}
        // 첫 화면 몫만 먼저 — 섹션은 캐러셀이라 무겁다
        initialNumToRender={screen.isFiltered ? 4 : FEED_FIRST_SECTIONS}
        ListEmptyComponent={
          screen.emptyKind === 'filtered' ? (
            <ExploreEmptyState
              title={EXPLORE_COPY.empty.filtered.title}
              actionLabel={EXPLORE_COPY.empty.filtered.action}
              onActionPress={screen.clearTopicFilter}
            />
          ) : screen.emptyKind === 'feed' ? (
            <ExploreEmptyState
              title={EXPLORE_COPY.empty.feed.title}
              actionLabel={EXPLORE_COPY.empty.feed.action}
              onActionPress={screen.goToLibrary}
            />
          ) : null
        }
        ListHeaderComponent={contentChips}
        // 격자 위 칩 — 칩 줄 아래 여백(8)에 8 을 더해 첫 줄 사진과 16(#1335). 스타일만 바뀌고 머리는 다시 만들지 않는다
        ListHeaderComponentStyle={
          contentChips && screen.isFiltered ? styles.gridHeaderChips : undefined
        }
        ListFooterComponent={screen.isFiltered ? renderFooter() : null}
        contentContainerStyle={[
          isListEmpty
            ? styles.emptyContent
            : screen.isFiltered
              ? styles.gridContent
              : styles.feedContent,
          { paddingTop: headerInset, paddingBottom: miniInset },
        ]}
        refreshControl={refreshControl}
        onEndReached={screen.loadMore}
        onEndReachedThreshold={0.4}
      />
    );
  };

  return (
    <View style={styles.container}>
      {HAS_NATIVE_TAB_BAR ? renderBody() : (
      <View
        style={styles.container}
        pointerEvents={isSearching ? 'none' : 'auto'}
        accessibilityElementsHidden={isSearching}
        importantForAccessibility={isSearching ? 'no-hide-descendants' : 'auto'}
      >
        {/* Android — 머리 줄의 서리 유리 띠가 흐릴 대상. 머리 줄은 이 뒤에 선언한다 */}
        <AndroidBlurTarget targetRef={blurTargetRef}>{renderBody()}</AndroidBlurTarget>
        {/* 머리 줄은 목록 **뒤에 선언**한다(zIndex 로 위에 뜬다) */}
        {/* 머리 줄은 목록 위에 떠 있다 — 배경 없이 유리 컨트롤만(2026-09-24 PM). 시스템 바 갈래에서는 없다 */}
        {ANDROID_IOS_HEADER ? (
          <AndroidCollapsingBar
            title={EXPLORE_COPY.tabTitle}
            scrollY={scrollY}
            // 라이브러리 알약([링 | 필터])과 같은 캡슐 — 탭을 오가면 필터 칸이 줄었다 자란다(useTabPillMorph).
            // 맨 링(RemainingPlaysIndicator)이면 모양이 달라 모핑이 안 보였다(PM 2026-09-30 03:10)
            trailing={
              screen.remainingDisplay ? (
                <ExploreRingPill
                  remaining={screen.remainingDisplay.remaining}
                  limit={screen.remainingDisplay.limit}
                  onExhaustedPress={() => screen.openPaywall('explore')}
                />
              ) : null
            }
            blurTarget={blurTargetRef}
            onTitlePress={() => scrollToTopRef.current?.()}
          />
        ) : HAS_NATIVE_TAB_BAR ? null : (
          <FloatingHeader
            onHeightChange={setHeaderHeight}
            solidness={solidness}
            containerRef={headerRef}
            androidFrostTarget={blurTargetRef}
          >
            {Platform.OS === 'android' ? (
              <View style={styles.androidTitle}>
                <LargeTitleRow title={EXPLORE_COPY.tabTitle} trailing={remainingRing} />
              </View>
            ) : null}
            <ExploreSearchBarRow
              onPress={openSearch}
              trailing={Platform.OS === 'android' ? null : remainingRing}
            />

            {chips}
          </FloatingHeader>
        )}
      </View>
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

/** Android — iOS 26 탐색 상단(큰 제목·검색창·칩이 목록 첫 줄 + 접히면 가운데 제목) 흉내. 옛 iOS 는 떠 있는 머리 줄 그대로 */

const ANDROID_IOS_HEADER = Platform.OS === 'android' && !HAS_NATIVE_TAB_BAR;

const CarouselGap = () => <View style={styles.carouselGap} />;

/** 한 목록(피드 섹션 · 격자 줄)의 항목 */
type ExploreListItem =
  | { kind: 'section'; section: ExploreSection; index: number }
  | { kind: 'gridRow'; key: string; items: (ExploreItem | null)[] };

/** 격자 두 칸을 한 줄로 묶는다 — 홀수면 마지막 줄 오른쪽은 빈 칸 */
const toGridRows = (items: ExploreItem[]): ExploreListItem[] => {
  const rows: ExploreListItem[] = [];
  for (let i = 0; i < items.length; i += 2) {
    rows.push({ kind: 'gridRow', key: items[i].content.id, items: [items[i], items[i + 1] ?? null] });
  }
  return rows;
};

const GridSeparator = () => <View style={styles.gridSeparator} />;

/** 주제 전환 중 콘텐츠 흐림 */
const SWITCH_DIM_OPACITY = 0.5;
/** 이보다 빨리 오면 흐리지 않는다 — 스켈레톤 지연 표시(useDelayedVisible)와 같은 생각 */
const DIM_DELAY_MS = 300;
/** 피드로 돌아올 때 먼저 그리는 섹션 수 — 첫 화면 몫 */
const FEED_FIRST_SECTIONS = 2;

const styles = StyleSheet.create({
  // 고정 제목 아래로 목록이 지나가도 글자가 겹치지 않도록 화면 바탕을 채운다.
  androidTitle: {
    backgroundColor: theme.color.background,
  },
  container: {
    flex: 1,
    backgroundColor: theme.color.background,
  },
  feedContent: {
    paddingBottom: theme.spacing.lg,
  },
  // 주제 필터 결과 — 라이브러리와 같은 두 칸 썸네일 격자(2026-09-18 PM). 좌우 여백은 검색 줄과 같은 선
  // 좌우 여백은 격자 줄(gridRow)이 갖는다 — 머리(검색창·칩)는 피드와 같은 자리에 그대로 있어야 한다(한 목록)
  gridContent: {
    paddingBottom: theme.spacing.sm,
  },
  gridRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm * 1.5,
    paddingHorizontal: theme.spacing.md,
  },
  // 격자 칸 — 주제 전환 흐림(opacity)을 칸마다 건다. 칸 폭은 타일(gridTile flex 1)이 아니라 이 칸이 나눈다
  gridCell: {
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
  // 격자 위 칩 — 칩 줄 아래 여백(8)에 8 을 더해 첫 줄 사진과 16. 검색창 ↔ 칩 간격과 맞춘다(PM 2026-10-09 — 8 은 칩이 격자에 붙어 보였다)
  gridHeaderChips: {
    marginBottom: theme.spacing.sm,
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
  sectionPeriodControl: {
    alignSelf: 'center',
    flexShrink: 0,
    minHeight: theme.touchTarget.minHeight,
    justifyContent: 'center',
  },
  // 캐러셀 좌우 여백은 섹션 제목과 같은 선에서 시작한다
  carousel: {
    paddingHorizontal: theme.spacing.md,
  },
  carouselGap: {
    width: theme.spacing.md,
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
