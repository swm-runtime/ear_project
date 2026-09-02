import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/shared/theme';

import { LIBRARY_COPY } from '../library.copy';
import type { LibraryItem } from '../library.types';

interface LibraryItemCardProps {
  item: LibraryItem;
  /** 카드 본문 탭 = 즉시 재생 판정. 상세 화면을 거치지 않는다(library.md 4.3) */
  onPress: (item: LibraryItem) => void;
  onMorePress: (item: LibraryItem) => void;
  /**
   * 탐험 편(source = discovery) 행 배지 노출 여부 — 전체 목록에서만 켠다.
   * [이어 PICK] 뷰는 구획이 이미 구분하므로 끈다(library.md 4.6-1).
   * 출처 배지 금지(4.1-1)의 예외는 이 배지 하나다 — 제안 성격을 드러내는 장치다.
   */
  showDiscoveryBadge?: boolean;
}

const formatDuration = (durationSec: number): string =>
  LIBRARY_COPY.card.durationLabel(Math.max(1, Math.round(durationSec / 60)));

/**
 * 아이템 카드 — 썸네일·제목·출처·저자·길이(FE 개편 2026-08-07: 정보량 축소).
 * 출처 배지·상태 텍스트를 없애고, 완청은 썸네일 좌상단 체크(색이 아니라 형태 단서 — uiux 7),
 * 듣다 만 것은 진행률 바로만 구분한다. 더보기만 별도 히트 영역(44pt)이다.
 */
export default function LibraryItemCard({
  item,
  onPress,
  onMorePress,
  showDiscoveryBadge = false,
}: LibraryItemCardProps) {
  const isCompleted = item.status === 'completed';
  const hasDiscoveryBadge = showDiscoveryBadge && item.source === 'discovery';
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
        accessibilityLabel={[
          // 배지는 라벨이 자식 텍스트를 덮으므로 a11y 라벨에도 싣는다(uiux 7)
          hasDiscoveryBadge ? LIBRARY_COPY.discovery.badge : null,
          item.content.title,
          isCompleted ? LIBRARY_COPY.card.completedA11y : null,
        ]
          .filter(Boolean)
          .join(', ')}
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
          {hasDiscoveryBadge ? (
            <View style={styles.discoveryBadge}>
              <Text style={styles.discoveryBadgeLabel}>{LIBRARY_COPY.discovery.badge}</Text>
            </View>
          ) : null}
          <Text style={styles.title} numberOfLines={1}>
            {item.content.title}
          </Text>
          {/* 제목 → 출처·저자 → 시간 세 줄. 온보딩 선택 카드와 같은 배열이다(2026-09-02) */}
          <Text style={styles.meta} numberOfLines={1}>
            {item.content.sourceName} · {item.content.authorName}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
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
  // 탐색의 세로 카드(ExploreContentRow)와 같은 문법 — 두 화면의 행이 같아야 한다(library.md 4.1)
  /*
   * ⋯를 흐름에서 빼 우상단에 띄운다 — 흐름에 두면 본문이 ⋯ 왼쪽(44px 앞)에서 끝나
   * 아래 출처·저자의 오른쪽 선이 ⋯보다 안쪽으로 들어간다. 둘 다 컨텐트 박스 오른쪽
   * 끝에 붙어야 같은 여백으로 읽힌다(2026-09-02)
   */
  container: {
    position: 'relative',
    marginHorizontal: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.color.surface,
  },
  body: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.md,
  },
  // 글 두 줄(제목+메타)보다 아트워크가 훨씬 높으면 위아래가 빈다 — 88에서 낮췄다(2026-09-02)
  thumbnail: {
    width: 72,
    height: 72,
    borderRadius: theme.radius.md,
    backgroundColor: theme.color.background,
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
    borderColor: theme.color.surface,
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
  discoveryBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 2,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: theme.color.primary,
  },
  discoveryBadgeLabel: {
    fontSize: theme.font.size.xs,
    fontWeight: '600',
    color: theme.color.primary,
  },
  title: {
    // 우상단에 뜬 ⋯ 아래로 글자가 파고들지 않게 자리를 비운다
    paddingRight: theme.spacing.xl,
    fontSize: theme.font.size.md,
    fontWeight: '700',
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
    position: 'absolute',
    top: theme.spacing.sm,
    // 절대 위치의 기준은 **패딩 박스**라 right:0이면 컨테이너 패딩을 건너뛰고 카드 끝에
    // 붙는다. 패딩과 같은 값을 줘야 아래 출처·저자와 같은 선이 된다
    right: theme.spacing.md,
    minWidth: theme.touchTarget.minWidth,
    minHeight: theme.touchTarget.minHeight,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  moreGlyph: {
    fontSize: theme.font.size.lg,
    color: theme.color.textSecondary,
  },
});
