import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { theme } from '@/shared/theme';
import MoreIcon from '@/shared/ui/MoreIcon';
import RemoteImage from '@/shared/ui/RemoteImage';
import { Text } from '@/shared/ui/Typography';

import { EXPLORE_COPY } from '../explore.copy';
import type { ExploreItem } from '../explore.types';
import FeaturedCardBackdrop, { ON_ART_TEXT, ON_ART_TEXT_SECONDARY } from './FeaturedCardBackdrop';

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
  /**
   * 하단 줄 해시태그 탭 → `#태그` 검색(KAN-219, explore-uiux.md 4.1). 태그 글자만 따로 눌린다 — 카드 본문(재생)과 겹치지
   * 않는 하단 줄에 있다. 콘텐츠 태그가 없어 주제 이름으로 대신 적을 때는 태그가 아니라 눌리지 않는다
   */
  onTagPress?: (tag: string) => void;
}

const toMinutes = (durationSec: number): number => Math.max(1, Math.round(durationSec / 60));

/**
 * 화면 폭의 72% — 다음 카드가 옆에 걸쳐 보여야 가로로 더 있다는 것이 드러난다.
 * 78%에서 낮췄다(2026-09-15) — 카드가 화면을 덜 차지하면서 걸침은 오히려 커진다.
 */
const WIDTH_RATIO = 0.72;
const MAX_WIDTH = 312;
/** 대표 카드 폭 — 화면 폭에서 정한다(카드 안 사진·제목 배치의 기준) */
export const featuredCardWidth = (windowWidth: number): number =>
  Math.min(windowWidth * WIDTH_RATIO, MAX_WIDTH);
/* 하단 바탕(흐린 커버 + 막)은 FeaturedCardBackdrop 이 그린다 — 시리즈 대표 카드와 같은 바탕(KAN-225) */
/** 태그 글자를 누르는 동안 — iOS 시스템 글자 버튼의 눌림(옅어짐)과 같은 처리 */
const TAG_PRESSED_OPACITY = 0.5;

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
  onTagPress,
}: ExploreFeaturedCardProps) {
  const { width } = useWindowDimensions();
  const cardWidth = featuredCardWidth(width);
  const isCompleted = item.isCompleted;
  const minutes = toMinutes(item.content.durationSec);
  const tags = item.content.tags.slice(0, MAX_TOPIC_TAGS);

  return (
    <View style={[styles.card, { width: cardWidth }]}>
      <FeaturedCardBackdrop uri={item.content.thumbnailUrl} recyclingKey={item.content.id} />
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
        {/*
          콘텐츠 해시태그가 있으면 그것을(KAN-163 — 타일과 같은 줄), 아직 없는 콘텐츠(소급 전)는 종전대로 주제 이름을 쓴다.
          '#'이 둘을 가리키는 기간은 태그 소급이 끝나면 사라진다
        */}
        {tags.length > 0 && onTagPress ? (
          /*
           * 태그는 글자마다 따로 눌리는 버튼이다(KAN-219) — 높이는 하단 줄(더보기 44)이, 폭은 최소 44 가 채운다. 버튼끼리 붙어
           * 있어 히트 영역이 겹치지 않는다(hitSlop 을 쓰지 않는 이유). 글자가 자기 Pressable 안에만 있어 Android 의 Text
           * pointerEvents 무시와 무관하다(형제 Pressable 위에 겹친 글자가 없다)
           */
          <View style={styles.metaRow}>
            {tags.map((tag) => (
              <Pressable
                key={tag}
                onPress={() => onTagPress(tag)}
                style={({ pressed }) => [styles.tagButton, pressed ? styles.tagPressed : null]}
                accessibilityRole="button"
                accessibilityLabel={EXPLORE_COPY.row.hashtagSearchA11y(tag)}
              >
                <Text style={styles.metaText} numberOfLines={1}>
                  {EXPLORE_COPY.row.hashtag(tag)}
                </Text>
              </Pressable>
            ))}
            <Text style={styles.durationText} numberOfLines={1}>
              {EXPLORE_COPY.row.durationAfterTags(minutes)}
            </Text>
          </View>
        ) : (
          <Text style={styles.meta} numberOfLines={1}>
            {tags.length > 0
              ? EXPLORE_COPY.row.metaWithTags(tags, minutes)
              : topicNames.length > 0
                ? `${EXPLORE_COPY.row.hashtags(topicNames.slice(0, MAX_TOPIC_TAGS))} · ${EXPLORE_COPY.row.durationLabel(minutes)}`
                : EXPLORE_COPY.row.durationLabel(minutes)}
          </Text>
        )}
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
    // 사진이 뜨기 전엔 비워 둔다 — 흰색이면 카드 위 정사각형이 하얗게 번쩍였다(PM 2026-10-09). 아래 흐린 바탕·막이 비친다
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
  /** 태그 버튼 + 길이 — 더보기 점을 오른쪽 끝으로 민다. 넘치면 태그 글자가 말줄임으로 줄어든다 */
  metaRow: {
    flex: 1,
    // 첫 태그 버튼의 왼쪽 여백만큼 당겨 글자 시작선을 제목 시작선에 맞춘다
    marginLeft: -theme.spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
  },
  /*
   * 글자 버튼 — 터치 44×44(design.md §6). 보이는 글자는 그대로 두고 상자만 키운다. 좌우 여백 xs 가 태그 사이 간격이 된다
   */
  tagButton: {
    flexShrink: 1,
    minWidth: theme.touchTarget.minWidth,
    minHeight: theme.touchTarget.minHeight,
    paddingHorizontal: theme.spacing.xs,
    justifyContent: 'center',
  },
  tagPressed: {
    opacity: TAG_PRESSED_OPACITY,
  },
  metaText: {
    fontSize: theme.font.size.sm,
    color: ON_ART_TEXT_SECONDARY,
  },
  durationText: {
    flexShrink: 0,
    paddingLeft: theme.spacing.xs,
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
