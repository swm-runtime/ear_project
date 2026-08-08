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
 * 완청은 썸네일 좌상단 체크로 구분한다 — 탐색은 청취 여부와 무관하게 전부 노출되므로
 * 완청 단서가 라이브러리 카드와 동일하게 필요하다(FE 확정 2026-08-07).
 * 담김 배지는 두지 않는다 — 담김 여부는 더보기 시트의 담기/제거 분기로 확인한다
 * (FE 확정 2026-08-07, 정보량 축소). 행에 담기 버튼도 없다(explore.md 4.3).
 */
export default function ExploreContentRow({ item, onPress, onMorePress }: ExploreContentRowProps) {
  const isCompleted = item.library?.status === 'completed';
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
          completed: isCompleted,
        })}
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
            {EXPLORE_COPY.row.durationLabel(minutes)}
          </Text>
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
