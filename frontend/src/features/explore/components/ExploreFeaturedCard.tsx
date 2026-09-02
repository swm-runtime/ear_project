import { Image, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { theme } from '@/shared/theme';

import { EXPLORE_COPY } from '../explore.copy';
import type { ExploreItem } from '../explore.types';

interface ExploreFeaturedCardProps {
  item: ExploreItem;
  /** 카드 본문 탭 = 곧장 재생 판정. 상세 화면을 끼우지 않는다(explore-uiux.md 4.1) */
  onPress: (item: ExploreItem) => void;
  onMorePress: (item: ExploreItem) => void;
}

const toMinutes = (durationSec: number): number => Math.max(1, Math.round(durationSec / 60));

/** 화면 폭의 78% — 다음 카드가 옆에 걸쳐 보여야 가로로 더 있다는 것이 드러난다 */
const WIDTH_RATIO = 0.78;
const MAX_WIDTH = 340;

/**
 * 인기 섹션의 큰 카드 — 가로 캐러셀의 항목이다.
 * 정보 구성은 목록 행(ExploreContentRow)과 같다: 썸네일·출처·저자·제목·길이.
 * 담기/제거는 여기서도 더보기 시트가 소유한다(explore.md 4.3 — 행에 담기 버튼을 두지 않는다).
 */
export default function ExploreFeaturedCard({
  item,
  onPress,
  onMorePress,
}: ExploreFeaturedCardProps) {
  const { width } = useWindowDimensions();
  const cardWidth = Math.min(width * WIDTH_RATIO, MAX_WIDTH);
  const isCompleted = item.library?.status === 'completed';
  const minutes = toMinutes(item.content.durationSec);

  return (
    <View style={[styles.card, { width: cardWidth }]}>
      <Pressable
        style={styles.body}
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
        <Text style={styles.meta} numberOfLines={1}>
          {item.content.sourceName} · {item.content.authorName}
        </Text>
        <Text style={styles.title} numberOfLines={2}>
          {item.content.title}
        </Text>
      </Pressable>

      <View style={styles.footer}>
        {/*
          재생 알약 — 그 자체는 버튼이 아니다. 카드 본문 탭이 이미 재생 판정으로 가므로
          여기에 Pressable을 또 씌우면 같은 동작의 진입점이 둘이 된다
        */}
        <Pressable
          style={styles.playPill}
          onPress={() => onPress(item)}
          accessibilityRole="button"
          accessibilityLabel={EXPLORE_COPY.row.a11yLabel({
            title: item.content.title,
            sourceName: item.content.sourceName,
            minutes,
            completed: isCompleted,
          })}
        >
          <Text style={styles.playGlyph}>▶</Text>
          <Text style={styles.playLabel}>{EXPLORE_COPY.row.durationLabel(minutes)}</Text>
        </Pressable>
        <Pressable
          style={styles.moreButton}
          onPress={() => onMorePress(item)}
          accessibilityRole="button"
          accessibilityLabel={EXPLORE_COPY.row.moreA11y}
        >
          <Text style={styles.moreGlyph}>⋯</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: theme.radius.lg,
    backgroundColor: theme.color.surface,
    padding: theme.spacing.md,
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
    borderRadius: theme.radius.md,
    backgroundColor: theme.color.background,
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
  meta: {
    fontSize: theme.font.size.xs,
    fontWeight: '600',
    color: theme.color.textSecondary,
  },
  title: {
    fontSize: theme.font.size.md,
    fontWeight: '700',
    color: theme.color.textPrimary,
    // 두 줄까지 접히는 제목이라 줄 간격을 함께 잡는다
    lineHeight: theme.font.size.md * 1.35,
    // 제목이 한 줄이든 두 줄이든 아래 알약 줄의 높이가 같아야 카드끼리 나란히 선다
    minHeight: theme.font.size.md * 1.35 * 2,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: theme.spacing.xs,
  },
  playPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    minHeight: theme.touchTarget.minHeight - theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.full,
    backgroundColor: theme.color.background,
  },
  playGlyph: {
    fontSize: theme.font.size.xs,
    color: theme.color.textPrimary,
  },
  playLabel: {
    fontSize: theme.font.size.sm,
    fontWeight: '700',
    color: theme.color.textPrimary,
  },
  moreButton: {
    minWidth: theme.touchTarget.minWidth,
    minHeight: theme.touchTarget.minHeight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreGlyph: {
    fontSize: theme.font.size.lg,
    color: theme.color.textSecondary,
  },
});
