import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/shared/theme';

import { EXPLORE_COPY } from '../explore.copy';
import type { ExploreItem } from '../explore.types';

interface ExploreContentRowProps {
  item: ExploreItem;
  /** 행 본문 탭 = 곧장 재생 판정. 상세 화면을 끼우지 않는다(explore-uiux.md 4.1) */
  onPress: (item: ExploreItem) => void;
  onMorePress: (item: ExploreItem) => void;
}

const toMinutes = (durationSec: number): number => Math.max(1, Math.round(durationSec / 60));

/**
 * 콘텐츠 행 — 라이브러리 아이템 행과 같은 문법(썸네일·제목·출처·저자·길이).
 * 담김은 "담김" 텍스트 배지 하나로만 구분한다(색만으로 구분하지 않는다 — uiux 7).
 * 행에 담기 버튼을 두지 않는다 — 담기/제거는 더보기 시트 소유다(explore.md 4.3).
 */
export default function ExploreContentRow({ item, onPress, onMorePress }: ExploreContentRowProps) {
  const isSaved = item.library !== null;
  const minutes = toMinutes(item.content.durationSec);

  return (
    <View style={styles.container}>
      <Pressable
        style={styles.body}
        onPress={() => onPress(item)}
        accessibilityRole="button"
        accessibilityLabel={EXPLORE_COPY.row.a11yLabel({
          title: item.content.title,
          sourceName: item.content.sourceName,
          minutes,
          saved: isSaved,
        })}
      >
        <Image source={{ uri: item.content.thumbnailUrl }} style={styles.thumbnail} />
        <View style={styles.info}>
          <Text style={styles.title} numberOfLines={2}>
            {item.content.title}
          </Text>
          <View style={styles.metaRow}>
            <Text style={styles.meta} numberOfLines={1}>
              {item.content.sourceName} · {item.content.authorName} ·{' '}
              {EXPLORE_COPY.row.durationLabel(minutes)}
            </Text>
            {isSaved ? (
              <View style={styles.savedBadge}>
                <Text style={styles.savedBadgeLabel}>{EXPLORE_COPY.savedBadge}</Text>
              </View>
            ) : null}
          </View>
        </View>
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
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: theme.spacing.md,
    backgroundColor: theme.color.background,
  },
  body: {
    flex: 1,
    flexDirection: 'row',
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.md,
  },
  thumbnail: {
    width: 64,
    height: 64,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.color.surface,
  },
  info: {
    flex: 1,
    gap: theme.spacing.xs,
    justifyContent: 'center',
  },
  title: {
    fontSize: theme.font.size.sm,
    fontWeight: '600',
    color: theme.color.textPrimary,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  meta: {
    flexShrink: 1,
    fontSize: theme.font.size.xs,
    color: theme.color.textSecondary,
  },
  savedBadge: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 2,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.color.surface,
    borderWidth: 1,
    borderColor: theme.color.border,
  },
  savedBadgeLabel: {
    fontSize: theme.font.size.xs,
    fontWeight: '600',
    color: theme.color.textSecondary,
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
