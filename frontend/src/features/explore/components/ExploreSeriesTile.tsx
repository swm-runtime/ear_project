import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { motion, theme } from '@/shared/theme';
import RemoteImage from '@/shared/ui/RemoteImage';
import { Text } from '@/shared/ui/Typography';

import { EXPLORE_COPY } from '../explore.copy';
import type { ExploreSeries } from '../explore.types';
import { featuredCardWidth } from './ExploreFeaturedCard';
import { EXPLORE_TILE_WIDTH } from './ExploreTile';
import FeaturedCardBackdrop, { ON_ART_TEXT, ON_ART_TEXT_SECONDARY } from './FeaturedCardBackdrop';
import SeriesStackedArtwork, {
  SERIES_STACK_HEIGHT,
  SeriesStackLayers,
} from './SeriesStackedArtwork';
import { useExploreTopicsQuery } from '../hooks/useExploreTopicsQuery';

/** 하단 줄에 적는 주제 수 — 콘텐츠 타일의 해시태그 수와 같다 */
const MAX_TOPIC_TAGS = 2;
/** 사진 아래 변 그라데이션 높이 — 라이브러리 타일의 "새로운 주제" 바탕과 같은 값(design.md §3) */
const BOTTOM_FADE_HEIGHT = 56;
/** "시리즈" 앞의 쌓인 카드 글리프 — 글자 크기(xs)와 같은 높이 */
const STACK_GLYPH_SIZE = 12;
/** 뒤 카드가 표지보다 한쪽에서 좁아지는 폭(가까운 장 — 먼 장은 두 배). 대표 카드는 폭이 넓어 더 들인다 */
const STACK_INSET = theme.spacing.sm;
const FEATURED_STACK_INSET = theme.spacing.md;

interface ExploreSeriesTileProps {
  series: ExploreSeries;
  /** 카드 탭 = 시리즈 화면(E14). **재생이 아니다** — "행 탭 = 즉시 재생"의 예외(explore.md 4.4) */
  onPress: (series: ExploreSeries) => void;
  /**
   * `carousel`(기본)·`grid` = 콘텐츠 사각 타일(ExploreTile)과 같은 크기. `featured` = 인기 섹션의 대표 카드(ExploreFeaturedCard)와
   * 같은 크기 — 같은 줄에 섞여도 카드 높이·폭이 어긋나지 않는다
   */
  layout?: 'carousel' | 'grid' | 'featured';
}

/**
 * 시리즈 카드(KAN-225 — explore-uiux.md 4.1-1). 콘텐츠 타일과 같은 자리·크기에 들어가고 **표지 뒤로 겹쳐 비져 나온 카드 두 장**
 * (재생목록 묶음 문법, 2026-10-22)과 **사진 아래 변의 "시리즈" 글자**로 단일 편과 가른다 — 사진 위 스티커(알약 배지)는 쓰지 않는다
 * (design.md §3, 라이브러리 "새로운 주제"와 같은 처리). 뒤 카드 몫만큼 표지를 낮춰 자리 전체 높이는 콘텐츠 타일과 같다.
 * 표지는 시리즈 표지(없으면 가장 앞 편 썸네일), 제목은 시리즈 제목, 하단 줄은 `#주제 · N편`. **더보기(⋯)는 없다** — 담기·제거는 편 단위라 시리즈 화면의
 * 편 행이 가진다. 카드 전체가 한 히트 영역이다
 */
export default function ExploreSeriesTile({
  series,
  onPress,
  layout = 'carousel',
}: ExploreSeriesTileProps) {
  const { width } = useWindowDimensions();
  // 주제 이름 — 칩 줄이 이미 받아 둔 같은 캐시(exploreKeys.topics()). 못 찾은 id 는 버린다(대표 카드의 주제 줄과 같은 규칙)
  const topics = useExploreTopicsQuery().data;
  const topicNames = series.topicIds
    .map((id) => topics?.find((topic) => topic.id === id)?.name)
    .filter((name): name is string => Boolean(name))
    .slice(0, MAX_TOPIC_TAGS);
  // 편수는 계획 편수 그대로(PM 2026-10-22 — 시리즈 화면 머리와 같다)
  const meta = EXPLORE_COPY.seriesCard.meta(topicNames, series.totalEpisodes);
  const a11yLabel = EXPLORE_COPY.seriesCard.a11yLabel(series.title, series.totalEpisodes);

  if (layout === 'featured') {
    const cardWidth = featuredCardWidth(width);
    return (
      // 뒤 카드는 대표 카드 바깥에 둔다 — 카드가 표지를 클립(overflow hidden)해 안에 두면 비져 나오지 못한다
      <View style={[styles.featuredStack, { width: cardWidth }]}>
        <SeriesStackLayers
          uri={series.thumbnailUrl}
          recyclingKey={series.id}
          radius={theme.radius.lg}
          inset={FEATURED_STACK_INSET}
        />
        <View style={styles.featuredCard}>
          <FeaturedCardBackdrop uri={series.thumbnailUrl} recyclingKey={series.id} />
          <Pressable
            style={styles.featuredBody}
            onPress={() => onPress(series)}
            accessibilityRole="button"
            accessibilityLabel={a11yLabel}
          >
            {/* 표지를 뒤 카드 몫만큼 낮춘다 — 같은 줄의 콘텐츠 대표 카드와 전체 높이가 같아야 한다 */}
            <View
              style={[styles.featuredArtworkFrame, { height: cardWidth - SERIES_STACK_HEIGHT }]}
            >
              <RemoteImage
                uri={series.thumbnailUrl}
                recyclingKey={series.id}
                style={styles.artwork}
              />
              <SeriesArtworkLabel />
            </View>
            <Text style={styles.featuredTitle} numberOfLines={2}>
              {series.title}
            </Text>
            {/* 대표 카드의 하단 줄(더보기 44) 높이를 그대로 둔다 — 같은 줄의 콘텐츠 대표 카드와 높이가 같아야 한다 */}
            <View style={styles.featuredFooter}>
              <Text style={styles.featuredMeta} numberOfLines={1}>
                {meta}
              </Text>
            </View>
          </Pressable>
        </View>
      </View>
    );
  }

  const isGrid = layout === 'grid';
  return (
    <View style={isGrid ? styles.gridTile : styles.tile}>
      <Pressable
        onPress={() => onPress(series)}
        accessibilityRole="button"
        accessibilityLabel={a11yLabel}
      >
        <SeriesStackedArtwork
          uri={series.thumbnailUrl}
          recyclingKey={series.id}
          style={isGrid ? styles.gridArtworkFrame : styles.artworkFrame}
          radius={isGrid ? theme.radius.lg : theme.radius.md}
          inset={STACK_INSET}
          fadeInMs={isGrid ? motion.duration.fast : undefined}
        >
          <SeriesArtworkLabel />
        </SeriesStackedArtwork>
        <Text style={styles.title} numberOfLines={2}>
          {series.title}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {meta}
        </Text>
      </Pressable>
    </View>
  );
}

/**
 * 사진 아래 변의 시리즈 표식 — 검정 그라데이션(투명 → 75%) 위 흰 글리프 + "시리즈". 장식이 아니라 정보지만 카드 낭독 라벨이
 * 이미 "시리즈"를 말하므로 낭독에서는 뺀다(같은 말을 두 번 읽지 않게)
 */
function SeriesArtworkLabel() {
  return (
    <View
      style={styles.bottomFade}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Svg width="100%" height={BOTTOM_FADE_HEIGHT} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="seriesBottomFade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#000000" stopOpacity={0} />
            <Stop offset="1" stopColor="#000000" stopOpacity={0.75} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height={BOTTOM_FADE_HEIGHT} fill="url(#seriesBottomFade)" />
      </Svg>
      <View style={styles.label}>
        {/*
          쌓인 카드 — 앞 카드 위로 뒤 카드 두 장이 반투명 판으로 비져 나온다. 표지 뒤 겹친 카드(SeriesStackedArtwork)를 그대로
          줄인 모양이라 글리프와 카드가 같은 말을 한다(PM 2026-10-22 다섯 후보 중 선택). 색만으로 가르지 않는다
        */}
        <Svg width={STACK_GLYPH_SIZE} height={STACK_GLYPH_SIZE} viewBox="0 0 24 24">
          <Rect x="5" y="1.2" width="14" height="2.6" rx="1.3" fill={ON_ART_TEXT} opacity={0.45} />
          <Rect x="3" y="4.6" width="18" height="2.9" rx="1.45" fill={ON_ART_TEXT} opacity={0.72} />
          <Rect x="1" y="8.6" width="22" height="13.9" rx="3" fill={ON_ART_TEXT} />
        </Svg>
        <Text style={styles.labelText}>{EXPLORE_COPY.seriesCard.badge}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // 콘텐츠 사각 타일(ExploreTile)과 같은 치수 — 캐러셀에서 섞여도 줄이 들쭉날쭉하지 않다
  tile: {
    width: EXPLORE_TILE_WIDTH,
  },
  // 자리 전체(뒤 카드 + 표지) — 콘텐츠 타일의 정사각 사진과 같은 치수. 모서리·클립은 SeriesStackedArtwork 의 표지가 갖는다
  artworkFrame: {
    width: EXPLORE_TILE_WIDTH,
    height: EXPLORE_TILE_WIDTH,
    marginBottom: theme.spacing.sm,
  },
  gridTile: {
    flex: 1,
  },
  gridArtworkFrame: {
    width: '100%',
    aspectRatio: 1,
    marginBottom: theme.spacing.sm,
  },
  artwork: {
    flex: 1,
  },
  title: {
    fontSize: theme.font.size.sm,
    fontWeight: '700',
    color: theme.color.textPrimary,
    lineHeight: theme.font.size.sm * 1.35,
    minHeight: theme.font.size.sm * 1.35 * 2,
  },
  meta: {
    marginTop: theme.spacing.xs,
    fontSize: theme.font.size.xs,
    color: theme.color.textSecondary,
  },
  bottomFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: BOTTOM_FADE_HEIGHT,
  },
  // 좌하단 — 라이브러리 "새로운 주제"와 같은 자리(design.md §5 격자 타일). 배경 박스 없이 그라데이션 위 글자만
  label: {
    position: 'absolute',
    left: theme.spacing.sm,
    bottom: theme.spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  labelText: {
    fontSize: theme.font.size.xs,
    fontWeight: '700',
    color: ON_ART_TEXT,
  },
  featuredStack: {
    paddingTop: SERIES_STACK_HEIGHT,
  },
  // 대표 카드 — ExploreFeaturedCard 와 같은 껍데기(커버가 위·양옆 변에 붙고 카드가 클립)
  featuredCard: {
    borderRadius: theme.radius.lg,
    borderCurve: 'continuous',
    overflow: 'hidden',
    backgroundColor: theme.color.surface,
    paddingBottom: theme.spacing.md,
  },
  featuredBody: {
    gap: theme.spacing.xs,
  },
  featuredArtworkFrame: {
    width: '100%',
    marginBottom: theme.spacing.sm,
  },
  featuredTitle: {
    marginHorizontal: theme.spacing.md,
    fontSize: theme.font.size.md,
    fontWeight: '700',
    color: ON_ART_TEXT,
    lineHeight: theme.font.size.md * 1.35,
    minHeight: theme.font.size.md * 1.35 * 2,
  },
  featuredFooter: {
    minHeight: theme.touchTarget.minHeight,
    justifyContent: 'center',
    marginTop: theme.spacing.xs,
    marginHorizontal: theme.spacing.md,
  },
  featuredMeta: {
    fontSize: theme.font.size.sm,
    color: ON_ART_TEXT_SECONDARY,
  },
});
