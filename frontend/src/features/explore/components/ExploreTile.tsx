import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/shared/theme';

import { EXPLORE_COPY } from '../explore.copy';
import type { ExploreItem } from '../explore.types';

interface ExploreTileProps {
  item: ExploreItem;
  /** 타일 탭 = 곧장 재생 판정. 상세 화면을 끼우지 않는다(explore-uiux.md 4.1) */
  onPress: (item: ExploreItem) => void;
  onMorePress: (item: ExploreItem) => void;
}

const toMinutes = (durationSec: number): number => Math.max(1, Math.round(durationSec / 60));

/** 정사각 아트워크 한 변 */
export const EXPLORE_TILE_WIDTH = 156;

/**
 * 일반 섹션의 사각 타일 — 가로 캐러셀의 항목이다.
 * 더보기(⋯)를 아트워크 위에 얹는다 — 담기·제거 진입점이 더보기 시트뿐이라
 * 타일에서도 빠지면 탐색에서 담을 방법이 사라진다(explore.md 4.3).
 */
export default function ExploreTile({ item, onPress, onMorePress }: ExploreTileProps) {
  const isCompleted = item.library?.status === 'completed';
  const minutes = toMinutes(item.content.durationSec);

  return (
    <View style={styles.tile}>
      <Pressable
        onPress={() => onPress(item)}
        accessibilityRole="button"
        accessibilityLabel={EXPLORE_COPY.row.a11yLabel({
          title: item.content.title,
          sourceName: item.content.sourceName,
          minutes,
          completed: isCompleted,
        })}
      >
        <View style={styles.artworkFrame}>
          <Image source={{ uri: item.content.thumbnailUrl }} style={styles.artwork} />
          {isCompleted ? (
            <View style={styles.completedMark}>
              <Text style={styles.completedGlyph}>✓</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.title} numberOfLines={2}>
          {item.content.title}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {item.content.sourceName} · {EXPLORE_COPY.row.durationLabel(minutes)}
        </Text>
      </Pressable>

      <Pressable
        style={styles.moreButton}
        onPress={() => onMorePress(item)}
        accessibilityRole="button"
        accessibilityLabel={EXPLORE_COPY.row.moreA11y}
      >
        <View style={styles.moreBadge}>
          <Text style={styles.moreGlyph}>⋯</Text>
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    width: EXPLORE_TILE_WIDTH,
  },
  artworkFrame: {
    width: EXPLORE_TILE_WIDTH,
    height: EXPLORE_TILE_WIDTH,
    marginBottom: theme.spacing.sm,
  },
  artwork: {
    flex: 1,
    borderRadius: theme.radius.md,
    backgroundColor: theme.color.surface,
  },
  completedMark: {
    position: 'absolute',
    top: theme.spacing.sm,
    left: theme.spacing.sm,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.color.overlay,
  },
  completedGlyph: {
    fontSize: theme.font.size.xs,
    fontWeight: '700',
    color: theme.color.onPrimary,
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
  moreBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.color.overlay,
  },
  moreGlyph: {
    fontSize: theme.font.size.md,
    fontWeight: '700',
    color: theme.color.onPrimary,
  },
});
