import { Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/shared/theme';
import MoreIcon from '@/shared/ui/MoreIcon';
import RemoteImage from '@/shared/ui/RemoteImage';

import { EXPLORE_COPY } from '../explore.copy';
import type { ExploreItem } from '../explore.types';

interface ExploreTileProps {
  item: ExploreItem;
  /** 타일 탭 = 곧장 재생 판정. 상세 화면을 끼우지 않는다(explore-uiux.md 4.1) */
  onPress: (item: ExploreItem) => void;
  onMorePress: (item: ExploreItem) => void;
  /**
   * `carousel`(기본) = 가로 캐러셀의 고정 폭 타일. `grid` = 두 칸 격자의 한 칸 — 칸 폭을 그대로 채운다.
   * 주제 필터 결과·검색 결과는 라이브러리와 같은 썸네일 격자로 그린다(2026-09-18 PM)
   */
  layout?: 'carousel' | 'grid';
}

const toMinutes = (durationSec: number): number => Math.max(1, Math.round(durationSec / 60));

/** 정사각 아트워크 한 변 */
export const EXPLORE_TILE_WIDTH = 156;

/**
 * 일반 섹션의 사각 타일 — 가로 캐러셀의 항목이다.
 * 더보기(⋯)를 아트워크 위에 얹는다 — 담기·제거 진입점이 더보기 시트뿐이라
 * 타일에서도 빠지면 탐색에서 담을 방법이 사라진다(explore.md 4.3).
 */
export default function ExploreTile({
  item,
  onPress,
  onMorePress,
  layout = 'carousel',
}: ExploreTileProps) {
  const isGrid = layout === 'grid';
  const isCompleted = item.library?.status === 'completed';
  const minutes = toMinutes(item.content.durationSec);

  return (
    <View style={isGrid ? styles.gridTile : styles.tile}>
      <Pressable
        onPress={() => onPress(item)}
        accessibilityRole="button"
        accessibilityLabel={EXPLORE_COPY.row.a11yLabel({
          title: item.content.title,
          minutes,
          completed: isCompleted,
        })}
      >
        <View style={isGrid ? styles.gridArtworkFrame : styles.artworkFrame}>
          <RemoteImage uri={item.content.thumbnailUrl} recyclingKey={item.content.id} style={styles.artwork} />
          {/* 완청 체크는 없다(2026-09-22 PM) — 사진 위 스티커라 뺐다. 완청은 낭독기 라벨(completed)로만 전한다 */}
        </View>
        <Text style={styles.title} numberOfLines={2}>
          {item.content.title}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {EXPLORE_COPY.row.durationLabel(minutes)}
        </Text>
      </Pressable>

      <Pressable
        style={styles.moreButton}
        onPress={() => onMorePress(item)}
        accessibilityRole="button"
        accessibilityLabel={EXPLORE_COPY.row.moreA11y}
      >
        <View style={styles.moreBadge}>
          <MoreIcon size={22} color={theme.color.onPrimary} shadow />
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    width: EXPLORE_TILE_WIDTH,
  },
  // 라운드·클립은 프레임(View)이 한다 — 모서리를 연속 곡률(애플 아이콘식)로 마감하는 borderCurve 는 View 의 것이고
  // expo-image 는 모른다(2026-09-22 PM). iOS 만 적용, 안드로이드는 원호 그대로
  artworkFrame: {
    width: EXPLORE_TILE_WIDTH,
    height: EXPLORE_TILE_WIDTH,
    marginBottom: theme.spacing.sm,
    borderRadius: theme.radius.md,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  // 격자 — 라이브러리 격자 타일(LibraryItemTile)과 같은 모양: 칸 폭 정사각, 라운드 lg
  gridTile: {
    flex: 1,
  },
  gridArtworkFrame: {
    width: '100%',
    aspectRatio: 1,
    marginBottom: theme.spacing.sm,
    borderRadius: theme.radius.lg,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  artwork: {
    flex: 1,
    backgroundColor: theme.color.surface,
  },
  title: {
    fontSize: theme.font.size.sm,
    fontWeight: '700',
    color: theme.color.textPrimary,
    lineHeight: theme.font.size.sm * 1.35,
    // 제목 줄 수가 달라도 타일 높이가 같아야 캐러셀이 들쭉날쭉하지 않다
    minHeight: theme.font.size.sm * 1.35 * 2,
  },
  meta: {
    marginTop: theme.spacing.xs,
    fontSize: theme.font.size.xs,
    color: theme.color.textSecondary,
  },
  // 아트워크 우상단 — 히트 영역은 44pt를 지키고 배지만 작게 보인다(uiux 7장)
  moreButton: {
    position: 'absolute',
    top: 0,
    right: 0,
    minWidth: theme.touchTarget.minWidth,
    minHeight: theme.touchTarget.minHeight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // 원은 없다 — 흰 점 3개(MoreIcon, 후광 그림자)만 둔다(2026-09-22 PM, LibraryItemTile 과 같다)
  moreBadge: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
