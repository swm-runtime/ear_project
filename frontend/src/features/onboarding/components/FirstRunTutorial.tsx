import { Asset } from 'expo-asset';
import { useRef, useState } from 'react';
import {
  FlatList,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { theme } from '@/shared/theme';
import TabBarIcon from '@/shared/ui/TabBarIcon';
import { useWalkthroughStore } from '@/shared/ui/walkthrough.store';

import {
  ExploreFeaturedCard,
  ExploreSearchBarRow,
  ExploreTile,
  PopularPeriodToggle,
  TopicChips,
  featuredCardArtworkRect,
  type ExploreItem,
  type ExploreTopic,
} from '@/features/explore';
import {
  LibraryItemCard,
  LibrarySearchBarRow,
  LibraryTabs,
  type LibraryItem,
} from '@/features/library';
import { RemainingPlaysIndicator } from '@/features/player';

import { ONBOARDING_COPY } from '../onboarding.copy';

/** 가려막의 어둡기 — 아래 예시 화면이 비쳐야 "이 화면의 안내"로 읽힌다 */
const SCRIM = 'rgba(0,0,0,0.7)';
const HOLE_PAD = 8;
const HOLE_RADIUS = 16;
/** 이만큼 끌면 넘긴다. 짧으면 스크롤 의도까지 단계 이동으로 먹는다 */
const SWIPE_THRESHOLD = 40;
/** 이 안쪽 움직임은 탭으로 본다 */
const TAP_SLOP = 10;

/**
 * 번들 자산을 URI 로 바꾼다 — 카드가 `{ uri }` 를 기대하므로 require 를 그대로 못 넘긴다.
 * `Image.resolveAssetSource` 는 react-native-web 에 없어 expo-asset 을 쓴다.
 */
const assetUri = (mod: number): string => Asset.fromModule(mod).uri;

const THUMBS = [
  assetUri(require('../../../../assets/topics/topic-economy.jpg')),
  assetUri(require('../../../../assets/topics/topic-communication.jpg')),
  assetUri(require('../../../../assets/topics/topic-data-ai.jpg')),
  assetUri(require('../../../../assets/topics/topic-habit.jpg')),
];

const CONTENTS = [
  { id: 't1', title: '금리가 내려가면 내 월급은 어떻게 되나', authorName: '이음', durationSec: 600 },
  { id: 't2', title: '회의에서 말수가 적어도 인정받는 법', authorName: '윤아', durationSec: 540 },
  { id: 't3', title: 'AI가 대체하지 못하는 일의 조건', authorName: '이음', durationSec: 720 },
  { id: 't4', title: '번아웃이 오기 전에 몸이 보내는 신호', authorName: '윤아', durationSec: 480 },
] as const;

const content = (i: number) => ({
  id: CONTENTS[i].id,
  title: CONTENTS[i].title,
  authorName: CONTENTS[i].authorName,
  sourceName: '이어 오리지널',
  sourceUrl: null,
  durationSec: CONTENTS[i].durationSec,
  thumbnailUrl: THUMBS[i % THUMBS.length],
  contentVersion: 1,
  topicIds: [],
});

const exploreItem = (i: number): ExploreItem => ({
  content: content(i),
  library: null,
  isCountedToday: false,
});

const libraryItem = (i: number): LibraryItem => ({
  id: `tutorial-lib-${i}`,
  source: 'drip',
  status: 'unplayed',
  addedAt: new Date().toISOString(),
  lastPlayedAt: null,
  completedAt: null,
  isCountedToday: false,
  content: content(i),
  progress: null,
});

const TOPICS: ExploreTopic[] = [
  { id: 'tut-1', name: '경제 상식', isInterest: true },
  { id: 'tut-2', name: '커뮤니케이션', isInterest: true },
  { id: 'tut-3', name: '데이터·AI', isInterest: true },
  { id: 'tut-4', name: '습관·동기', isInterest: false },
];

const TABS = [
  { name: 'library' as const, label: '라이브러리' },
  { name: 'explore' as const, label: '탐색' },
  { name: 'profile' as const, label: '프로필' },
];

const noop = () => {};

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * 첫 사용 튜토리얼 — **예시 화면을 배경으로 깔고** 그 위에 설명을 얹는다.
 *
 * 실제 화면 위에 얹지 않는 이유: 갓 가입한 사용자의 라이브러리는 비어 있어서 정작
 * 설명할 것이 화면에 없다. 담으면 라이브러리에 모이고 매일 아침 2편이 도착한다는
 * 흐름은 **채워진 화면**을 보여줘야 전달된다.
 *
 * 배경은 **실제 화면과 같은 컴포넌트를 같은 구조로** 쌓는다(검색줄·주제 칩·섹션 제목과
 * 기간 토글·가로 캐러셀·타일 격자, 라이브러리는 검색줄·상태 탭·아이템 카드). 데이터만
 * 예시값이다. 비슷하게 새로 그리면 화면이 바뀔 때 어긋나고, 튜토리얼과 실제가 다르면
 * 안내가 오히려 방해가 된다.
 *
 * 넘기는 방법은 스와이프다. 탭도 같은 동작으로 받는다. 신호(pending)는 온보딩 종료가
 * 세우고 여기서 소비한다.
 * 문서 반영 요청: changes/pending/onboarding-o1-visual-refresh.md
 */
export default function FirstRunTutorial() {
  const pending = useWalkthroughStore((s) => s.pending);
  const clear = useWalkthroughStore((s) => s.clear);
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(0);
  /** 가리킬 자리는 **실제로 그려진 뒤** 측정해서 받는다 — 짐작해 두면 구멍이 어긋난다 */
  const [markRect, setMarkRect] = useState<Rect | null>(null);
  const targetRef = useRef<View>(null);

  const tabBarTop = height - insets.bottom - 60;
  const libraryTab: Rect = { x: 0, y: tabBarTop, w: width / 3, h: 60 };

  const steps = [
    {
      stage: 'explore' as const,
      title: ONBOARDING_COPY.tutorial.exploreTitle,
      body: ONBOARDING_COPY.tutorial.exploreBody,
    },
    {
      stage: 'library' as const,
      title: ONBOARDING_COPY.tutorial.libraryTitle,
      body: ONBOARDING_COPY.tutorial.libraryBody,
    },
    {
      stage: 'drip' as const,
      title: ONBOARDING_COPY.tutorial.dripTitle,
      body: ONBOARDING_COPY.tutorial.dripBody,
    },
  ];

  const go = (delta: number) => {
    const next = step + delta;
    if (next < 0) return;
    if (next >= steps.length) {
      clear();
      return;
    }
    setMarkRect(null);
    setStep(next);
  };

  // 매 렌더 새로 만든다 — 손을 뗄 때 한 번만 판정하므로 도중에 끊기지 않고,
  // 핸들러가 항상 최신 단계를 본다(ref로 최신 값을 나르는 배선이 필요 없다)
  const pan = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 4 || Math.abs(g.dy) > 4,
    onPanResponderRelease: (_, g) => {
      if (Math.abs(g.dx) < TAP_SLOP && Math.abs(g.dy) < TAP_SLOP) {
        go(1);
        return;
      }
      if (g.dx <= -SWIPE_THRESHOLD) go(1);
      else if (g.dx >= SWIPE_THRESHOLD) go(-1);
    },
  });

  if (!pending) return null;

  const current = steps[step];
  const isExplore = current.stage === 'explore';
  const target = current.stage === 'library' ? libraryTab : markRect;

  /** 둥근 사각형 한 조각 — 바깥 사각형과 함께 evenodd로 채우면 이 자리가 뚫린다 */
  const holePath = (r: Rect): string => {
    const x = r.x - HOLE_PAD;
    const y = r.y - HOLE_PAD;
    const w = r.w + HOLE_PAD * 2;
    const h = r.h + HOLE_PAD * 2;
    const rad = Math.min(HOLE_RADIUS, w / 2, h / 2);
    return (
      `M ${x + rad} ${y} H ${x + w - rad} A ${rad} ${rad} 0 0 1 ${x + w} ${y + rad}` +
      ` V ${y + h - rad} A ${rad} ${rad} 0 0 1 ${x + w - rad} ${y + h}` +
      ` H ${x + rad} A ${rad} ${rad} 0 0 1 ${x} ${y + h - rad}` +
      ` V ${y + rad} A ${rad} ${rad} 0 0 1 ${x + rad} ${y} Z`
    );
  };

  /** 제목은 구멍 반대쪽에 — 같은 쪽에 두면 정작 가리키는 것을 글자가 덮는다 */
  const headAtBottom = target !== null && target.y < height / 2;
  const arrow =
    target === null
      ? ''
      : headAtBottom
        ? // 설명이 아래에 있으니 위로 올라가 구멍의 아래 모서리를 가리킨다
          `M ${theme.spacing.lg + 30} ${target.y + target.h + 74} ` +
          `C ${theme.spacing.lg + 10} ${target.y + target.h + 52}, ` +
          `${target.x + target.w / 2} ${target.y + target.h + 44}, ` +
          `${target.x + target.w / 2} ${target.y + target.h + 14}`
        : // 설명이 위에 있으니 내려가 구멍의 위 모서리를 가리킨다
          `M ${theme.spacing.lg + 30} ${target.y - 74} ` +
          `C ${theme.spacing.lg + 10} ${target.y - 52}, ` +
          `${target.x + target.w / 2} ${target.y - 44}, ` +
          `${target.x + target.w / 2} ${target.y - 14}`;

  /**
   * onLayout 이 주는 값은 **부모 기준 상대 좌표**라 가려막(화면 전체)의 구멍 좌표로 쓸 수 없다.
   * 배치가 끝난 시점을 onLayout 으로 알고, 좌표는 measureInWindow 로 화면 기준을 받는다.
   *
   * `crop` 은 잰 사각형에서 실제로 뚫을 부분만 잘라낸다 — 탐색 단계는 카드 전체가 아니라
   * 썸네일만 뚫는다(카드 전체는 화면 높이의 8할이라 설명을 둘 자리가 남지 않는다).
   */
  const measure = (crop?: (r: Rect) => Rect) => () => {
    targetRef.current?.measureInWindow((x, y, w, h) => {
      const measured = { x, y, w, h };
      setMarkRect(crop ? crop(measured) : measured);
    });
  };

  return (
    <View style={styles.root} {...pan.panHandlers}>
      {/* ── 배경: 실제 화면과 같은 컴포넌트를 같은 구조로 쌓는다. 데이터만 예시다 ── */}
      <SafeAreaView style={styles.screen} edges={['top']} pointerEvents="none">
        {isExplore ? (
          <>
            <ExploreSearchBarRow
              onPress={noop}
              trailing={<RemainingPlaysIndicator remaining={1} limit={2} onExhaustedPress={noop} />}
            />
            <TopicChips topics={TOPICS} selectedTopicIds={[]} onToggle={noop} />
            <ScrollView scrollEnabled={false}>
              <View style={styles.section}>
                <View style={styles.sectionHeaderRow}>
                  <Text style={[styles.sectionTitle, styles.sectionHeaderTitle]}>지금 인기</Text>
                  <PopularPeriodToggle selected="month" onSelect={noop} disabled />
                </View>
                <FlatList
                  horizontal
                  scrollEnabled={false}
                  data={[exploreItem(0), exploreItem(1)]}
                  keyExtractor={(item) => item.content.id}
                  renderItem={({ item, index }) => (
                    // 첫 카드만 측정한다 — 가리키는 것은 카드 하나다. 구멍은 그중 썸네일만이다
                    <View
                      ref={index === 0 ? targetRef : undefined}
                      onLayout={index === 0 ? measure(featuredCardArtworkRect) : undefined}
                    >
                      <ExploreFeaturedCard item={item} onPress={noop} onMorePress={noop} />
                    </View>
                  )}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.carousel}
                  ItemSeparatorComponent={() => <View style={styles.carouselGap} />}
                />
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>관심사에 맞는 추천</Text>
                <FlatList
                  horizontal
                  scrollEnabled={false}
                  data={[exploreItem(2), exploreItem(3), exploreItem(0)]}
                  keyExtractor={(item) => item.content.id}
                  renderItem={({ item }) => (
                    <ExploreTile item={item} onPress={noop} onMorePress={noop} />
                  )}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.carousel}
                  ItemSeparatorComponent={() => <View style={styles.carouselGap} />}
                />
              </View>
            </ScrollView>
          </>
        ) : (
          <>
            <LibrarySearchBarRow
              query=""
              onChangeQuery={noop}
              trailing={<RemainingPlaysIndicator remaining={1} limit={2} onExhaustedPress={noop} />}
            />
            <LibraryTabs filter="all" onChange={noop} topicFilterCount={0} onFilterPress={noop} />
            <ScrollView scrollEnabled={false} contentContainerStyle={styles.list}>
              {current.stage === 'drip' ? (
                <View ref={targetRef} style={styles.dripRow} onLayout={measure()}>
                  <Text style={styles.dripLabel}>오늘 아침 도착 · 2편</Text>
                </View>
              ) : null}
              {/* 라이브러리 단계가 가리키는 것은 카드가 아니라 탭바다(libraryTab) — 여기는 재지 않는다 */}
              <LibraryItemCard item={libraryItem(0)} onPress={noop} onMorePress={noop} />
              <LibraryItemCard item={libraryItem(1)} onPress={noop} onMorePress={noop} />
              <LibraryItemCard item={libraryItem(2)} onPress={noop} onMorePress={noop} />
            </ScrollView>
          </>
        )}
      </SafeAreaView>

      <View style={[styles.tabBar, { top: tabBarTop, height: 60 + insets.bottom }]}>
        {TABS.map((tab) => {
          const focused = tab.label === (isExplore ? '탐색' : '라이브러리');
          return (
            <View key={tab.label} style={styles.tab}>
              <TabBarIcon
                name={tab.name}
                focused={focused}
                size={28}
                color={focused ? theme.color.textPrimary : theme.color.textSecondary}
              />
              <Text style={[styles.tabLabel, focused && styles.tabOn]}>{tab.label}</Text>
            </View>
          );
        })}
      </View>

      {/* ── 그 위: 가려막과 설명 ── */}
      <Svg style={StyleSheet.absoluteFill} width={width} height={height} pointerEvents="none">
        <Path
          d={`M 0 0 H ${width} V ${height} H 0 Z ${target ? holePath(target) : ''}`}
          fill={SCRIM}
          fillRule="evenodd"
        />
        {arrow ? (
          <Path
            d={arrow}
            stroke={theme.color.onPrimary}
            strokeWidth={2}
            strokeDasharray="5 6"
            strokeLinecap="round"
            fill="none"
          />
        ) : null}
      </Svg>

      <View style={[styles.head, headAtBottom ? { bottom: insets.bottom + 132 } : { top: height * 0.42 }]}>
        <Text style={styles.title}>{current.title}</Text>
        <Text style={styles.body}>{current.body}</Text>
      </View>


      <Pressable
        style={[styles.skip, { top: insets.top, right: theme.spacing.sm }]}
        onPress={clear}
        accessibilityRole="button"
        accessibilityLabel={ONBOARDING_COPY.tutorial.skip}
      >
        <Text style={styles.skipLabel}>{ONBOARDING_COPY.tutorial.skip}</Text>
      </Pressable>

      <View
        style={[styles.dots, { bottom: insets.bottom + 88 }]}
        accessibilityLabel={`${steps.length}단계 중 ${step + 1}단계`}
      >
        {steps.map((s, i) => (
          <View key={s.title} style={[styles.dot, i === step && styles.dotActive]} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: theme.color.background,
  },
  screen: {
    flex: 1,
  },
  // 아래 넷은 ExploreScreen의 같은 이름 스타일과 값을 맞춘다
  section: {
    paddingBottom: theme.spacing.md,
  },
  sectionTitle: {
    fontSize: theme.font.size.xl,
    fontWeight: '700',
    color: theme.color.textPrimary,
    lineHeight: theme.font.size.xl * 1.25,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingRight: theme.spacing.md,
  },
  sectionHeaderTitle: {
    flexShrink: 1,
  },
  carousel: {
    paddingHorizontal: theme.spacing.md,
  },
  carouselGap: {
    width: theme.spacing.md,
  },
  list: {
    paddingHorizontal: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  dripRow: {
    alignSelf: 'flex-start',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs + 2,
    borderRadius: theme.radius.full,
    backgroundColor: theme.color.primary,
    marginBottom: theme.spacing.xs,
  },
  dripLabel: {
    fontSize: theme.font.size.sm,
    fontWeight: '700',
    color: theme.color.onPrimary,
  },
  tabBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.color.border,
    backgroundColor: theme.color.background,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingTop: theme.spacing.md,
  },
  tabLabel: {
    fontSize: theme.font.size.xs,
    color: theme.color.textSecondary,
  },
  tabOn: {
    color: theme.color.textPrimary,
    fontWeight: '700',
  },
  head: {
    position: 'absolute',
    left: theme.spacing.lg,
    right: theme.spacing.lg,
    gap: theme.spacing.sm,
  },
  title: {
    fontSize: theme.font.size.xl,
    fontWeight: '700',
    color: theme.color.onPrimary,
    lineHeight: theme.font.size.xl * 1.3,
  },
  body: {
    fontSize: theme.font.size.md,
    color: 'rgba(255,255,255,0.78)',
    lineHeight: theme.font.size.md * 1.5,
  },
  skip: {
    position: 'absolute',
    minHeight: theme.touchTarget.minHeight,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.sm,
  },
  skipLabel: {
    fontSize: theme.font.size.sm,
    color: theme.color.onPrimary,
    textDecorationLine: 'underline',
  },
  dots: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.38)',
  },
  dotActive: {
    backgroundColor: theme.color.onPrimary,
  },
});
