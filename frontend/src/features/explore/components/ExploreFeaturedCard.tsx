import { Image, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { theme } from '@/shared/theme';
import MoreIcon from '@/shared/ui/MoreIcon';
import RemoteImage from '@/shared/ui/RemoteImage';
import { Text } from '@/shared/ui/Typography';

import { EXPLORE_COPY } from '../explore.copy';
import type { ExploreItem } from '../explore.types';

/** 하단 줄에 적는 주제 수 — 그 이상은 길이를 밀어낸다(플레이어 제목 줄과 같은 규칙) */
const MAX_TOPIC_TAGS = 2;

interface ExploreFeaturedCardProps {
  item: ExploreItem;
  /**
   * 이 콘텐츠의 주제 이름 — 화면이 주제 목록(id → 이름)으로 풀어 넘긴다. 서버 응답의 콘텐츠에는 id 만 있다.
   * 못 찾으면(목록 미도착·모르는 id) 빈 배열이고, 그때는 길이만 적는다
   */
  topicNames?: string[];
  /** 카드 본문 탭 = 곧장 재생 판정. 상세 화면을 끼우지 않는다(explore-uiux.md 4.1) */
  onPress: (item: ExploreItem) => void;
  onMorePress: (item: ExploreItem) => void;
}

const toMinutes = (durationSec: number): number => Math.max(1, Math.round(durationSec / 60));

/**
 * 화면 폭의 72% — 다음 카드가 옆에 걸쳐 보여야 가로로 더 있다는 것이 드러난다.
 * 78%에서 낮췄다(2026-09-15) — 카드가 화면을 덜 차지하면서 걸침은 오히려 커진다.
 */
const WIDTH_RATIO = 0.72;
const MAX_WIDTH = 312;
/**
 * 카드 하단(제목·알약 줄)의 바탕은 **앨범아트가 흐리게 이어진 면**이다(PM 2026-09-25 22:01 "blur 처리해서 마치
 * 이어진 것처럼"). 카드 전체에 흐린 커버를 깔고 위 정사각형만 선명한 커버가 덮는다 — 플레이어 배경과 같은 방식
 * (기본 Image blurRadius, expo-image 는 세기 기준이 달라 톤이 바뀐다). 우리 커버는 차콜 계열이라 하단 글자는
 * 플레이어 팔레트(흰 글자)로, 밝은 커버가 와도 읽히게 어두운 막을 한 겹 둔다
 */
const BACKDROP_BLUR_RADIUS = 36;
const BACKDROP_SCRIM = 'rgba(23, 23, 26, 0.45)';
const ON_ART_TEXT = '#FFFFFF';
const ON_ART_TEXT_SECONDARY = 'rgba(255, 255, 255, 0.72)';

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * 측정된 카드 사각형에서 **썸네일 사각형만** 잘라낸다.
 *
 * 코치마크가 카드 전체를 뚫으면 구멍이 화면 높이의 8할을 차지해 설명을 둘 자리가 남지 않는다
 * (제목 두 줄 + 재생 알약까지 합친 높이다). 가리키려는 것은 "담을 수 있는 콘텐츠"이고 그건
 * 썸네일로 충분하다.
 *
 * **이 계산은 아래 `card`·`artworkFrame` 스타일에 묶여 있다** — 썸네일은 카드의 **위·양옆 변에 붙는**
 * 정사각형(카드 폭 그대로, 2026-09-22 PM — 위·양쪽 공백 제거)이다. 둘 중 하나를 바꾸면 여기도 바꾼다.
 * 그래서 카드를 쓰는 쪽이 짐작하지 않도록 이 파일이 함께 소유한다.
 */
export const featuredCardArtworkRect = (card: Rect): Rect => ({
  x: card.x,
  y: card.y,
  w: card.w,
  h: card.w,
});

/**
 * 인기 섹션의 큰 카드 — 가로 캐러셀의 항목이다.
 * 정보 구성은 타일(ExploreTile)과 같다: 썸네일·제목·길이.
 * 담기/제거는 여기서도 더보기 시트가 소유한다(explore.md 4.3 — 행에 담기 버튼을 두지 않는다).
 */
export default function ExploreFeaturedCard({
  item,
  topicNames = [],
  onPress,
  onMorePress,
}: ExploreFeaturedCardProps) {
  const { width } = useWindowDimensions();
  const cardWidth = Math.min(width * WIDTH_RATIO, MAX_WIDTH);
  const isCompleted = item.library?.status === 'completed';
  const minutes = toMinutes(item.content.durationSec);

  return (
    <View style={[styles.card, { width: cardWidth }]}>
      {/* 흐린 커버 바탕 — 카드 전체. 위 정사각형은 아래 선명한 커버가 덮어 하단만 "이어진" 흐림으로 남는다 */}
      <Image
        source={{ uri: item.content.thumbnailUrl }}
        style={styles.backdrop}
        blurRadius={BACKDROP_BLUR_RADIUS}
        resizeMode="cover"
        accessibilityElementsHidden
        importantForAccessibility="no"
      />
      <View style={styles.backdropScrim} pointerEvents="none" />
      <Pressable
        style={styles.body}
        onPress={() => onPress(item)}
        accessibilityRole="button"
        accessibilityLabel={EXPLORE_COPY.row.a11yLabel({
          title: item.content.title,
          minutes,
          completed: isCompleted,
        })}
      >
        <View style={styles.artworkFrame}>
          <RemoteImage
            uri={item.content.thumbnailUrl}
            recyclingKey={item.content.id}
            style={styles.artwork}
          />
          {/* 완청 체크는 없다(2026-09-22 PM) — 사진 위 스티커라 뺐다. 완청은 낭독기 라벨(completed)로만 전한다 */}
        </View>
        <Text style={styles.title} numberOfLines={2}>
          {item.content.title}
        </Text>
      </Pressable>

      <View style={styles.footer}>
        {/*
          **재생 버튼을 두지 않는다.** 타일의 히트 영역은 둘뿐이다 — 본문 탭 = 재생, ⋯ 만 별도
          (explore-uiux.md 5장). 09-27 에 길이 알약을 원 버튼으로 바꿨다가 09-28 에 걷었다:
          같은 동작의 진입점이 둘이 되고(PM "플레이 버튼은 왜 넣은 거야"), 흐린 커버 위 불투명 원은
          사진 위 스티커 금지(design.md §3)에도 걸렸다. 정보는 글자로만 둔다
        */}
        {/*
          주제 해시태그 + 길이(PM 2026-09-28 01:06). 종전엔 저자(`이음`·`윤아`)를 적었는데 두 값뿐이라 정보가
          거의 없었고, 작은 타일(ExploreTile)은 애초에 길이만 적어 대표 카드만 저자를 보여 주는 것도 어긋났다.
          주제는 탐색에서 고르는 축이라 같은 자리에 더 쓸모 있다
        */}
        <Text style={styles.meta} numberOfLines={1}>
          {topicNames.length > 0
            ? `${EXPLORE_COPY.row.hashtags(topicNames.slice(0, MAX_TOPIC_TAGS))} · ${EXPLORE_COPY.row.durationLabel(minutes)}`
            : EXPLORE_COPY.row.durationLabel(minutes)}
        </Text>
        <Pressable
          style={styles.moreButton}
          onPress={() => onMorePress(item)}
          accessibilityRole="button"
          accessibilityLabel={EXPLORE_COPY.row.moreA11y}
        >
          <MoreIcon size={22} color={ON_ART_TEXT_SECONDARY} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  /*
   * 커버가 카드의 위·양옆 변에 붙는다(2026-09-22 PM — 카드 안 여백에 갇힌 사진은 액자 속 액자였다). 카드가
   * 라운드·클립을 맡아 커버의 위 모서리는 카드 곡률을 따르고 아래 모서리는 각지게 제목 블록으로 이어진다.
   * 패딩은 아래·제목·알약 줄에만 남는다
   */
  card: {
    borderRadius: theme.radius.lg,
    borderCurve: 'continuous',
    overflow: 'hidden',
    // 바탕은 흐린 커버(backdrop)가 깐다 — 커버가 없을 때의 폴백 색만 남긴다
    backgroundColor: theme.color.surface,
    paddingBottom: theme.spacing.md,
    gap: theme.spacing.xs,
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    // 흐림의 가장자리가 비치지 않게 살짝 키운다(플레이어 배경과 같다)
    transform: [{ scale: 1.2 }],
  },
  backdropScrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: BACKDROP_SCRIM,
  },
  body: {
    gap: theme.spacing.xs,
  },
  artworkFrame: {
    width: '100%',
    aspectRatio: 1,
    marginBottom: theme.spacing.sm,
  },
  artwork: {
    flex: 1,
    backgroundColor: theme.color.background,
  },
  title: {
    marginHorizontal: theme.spacing.md,
    fontSize: theme.font.size.md,
    fontWeight: '700',
    color: ON_ART_TEXT,
    // 두 줄까지 접히는 제목이라 줄 간격을 함께 잡는다
    lineHeight: theme.font.size.md * 1.35,
    // 제목이 한 줄이든 두 줄이든 아래 알약 줄의 높이가 같아야 카드끼리 나란히 선다
    minHeight: theme.font.size.md * 1.35 * 2,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm + theme.spacing.xs,
    marginTop: theme.spacing.xs,
    marginHorizontal: theme.spacing.md,
  },
  /** 저자 · 길이 — 정보지 버튼 성분이 아니라 보조 글자. 더보기 점을 오른쪽 끝으로 민다 */
  meta: {
    flex: 1,
    fontSize: theme.font.size.sm,
    color: ON_ART_TEXT_SECONDARY,
  },
  moreButton: {
    minWidth: theme.touchTarget.minWidth,
    minHeight: theme.touchTarget.minHeight,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
