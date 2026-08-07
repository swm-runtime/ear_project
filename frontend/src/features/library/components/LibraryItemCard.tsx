import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/shared/theme';

import { LIBRARY_COPY } from '../library.copy';
import type { LibraryItem } from '../library.types';

interface LibraryItemCardProps {
  item: LibraryItem;
  /** 카드 본문 탭 = 즉시 재생 판정. 상세 화면을 거치지 않는다(library.md 4.3) */
  onPress: (item: LibraryItem) => void;
  onMorePress: (item: LibraryItem) => void;
}

const formatDuration = (durationSec: number): string =>
  LIBRARY_COPY.card.durationLabel(Math.max(1, Math.round(durationSec / 60)));

/**
 * 아이템 카드 — 썸네일·제목·출처·저자·길이(FE 개편 2026-08-07: 정보량 축소).
 * 출처 배지·상태 텍스트를 없애고, 완청은 썸네일 좌상단 체크(색이 아니라 형태 단서 — uiux 7),
 * 듣다 만 것은 진행률 바로만 구분한다. 더보기만 별도 히트 영역(44pt)이다.
 */
export default function LibraryItemCard({ item, onPress, onMorePress }: LibraryItemCardProps) {
  const isCompleted = item.status === 'completed';
  const progressRatio =
    item.status === 'in_progress' && item.progress && item.content.durationSec > 0
      ? Math.min(1, item.progress.positionSec / item.content.durationSec)
      : null;
  const progressPercent = progressRatio !== null ? Math.round(progressRatio * 100) : null;

  return (
    <View style={styles.container}>
      <Pressable
        style={styles.body}
        onPress={() => onPress(item)}
        accessibilityRole="button"
        accessibilityLabel={
          isCompleted
            ? `${item.content.title}, ${LIBRARY_COPY.card.completedA11y}`
            : item.content.title
        }
        accessibilityHint="재생"
      >
        <View>
          <Image source={{ uri: item.content.thumbnailUrl }} style={styles.thumbnail} />
          {isCompleted ? (
            <View style={styles.completedMark}>
              <Text style={styles.completedGlyph}>✓</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.info}>
          <Text style={styles.title} numberOfLines={2}>
            {item.content.title}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {item.content.sourceName} · {item.content.authorName} ·{' '}
            {formatDuration(item.content.durationSec)}
          </Text>
          {progressPercent !== null ? (
            // 진행률 바만 있으면 색 외 단서가 없다 — a11y 텍스트를 반드시 제공한다(uiux 7)
            <View
              style={styles.progressTrack}
              accessibilityRole="progressbar"
              accessibilityLabel={LIBRARY_COPY.card.progressA11y(progressPercent)}
            >
              <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
            </View>
          ) : null}
        </View>
      </Pressable>
      <Pressable
        style={styles.moreButton}
        onPress={() => onMorePress(item)}
        accessibilityRole="button"
        accessibilityLabel={LIBRARY_COPY.card.moreA11y(item.content.title)}
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
  completedMark: {
    position: 'absolute',
    top: -theme.spacing.xs,
    left: -theme.spacing.xs,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: theme.color.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: theme.color.background,
  },
  completedGlyph: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.color.onPrimary,
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
  meta: {
    fontSize: theme.font.size.xs,
    color: theme.color.textSecondary,
  },
  progressTrack: {
    height: 4,
    maxWidth: 160,
    borderRadius: 2,
    backgroundColor: theme.color.border,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: theme.color.primary,
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
