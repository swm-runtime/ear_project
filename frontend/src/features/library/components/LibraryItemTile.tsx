import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { theme } from '@/shared/theme';
import RemoteImage from '@/shared/ui/RemoteImage';

import { LIBRARY_COPY } from '../library.copy';
import type { LibraryItem } from '../library.types';

interface LibraryItemTileProps {
  item: LibraryItem;
  /** 타일 본문 탭 = 즉시 재생 판정. 상세 화면을 거치지 않는다(library.md 4.3) */
  onPress: (item: LibraryItem) => void;
  onMorePress: (item: LibraryItem) => void;
  /**
   * 탐험 편(source = discovery) 배지 노출 여부 — 전체 목록에서만 켠다.
   * [이어 PICK] 뷰는 구획이 이미 구분하므로 끈다(library.md 4.6-1).
   */
  showDiscoveryBadge?: boolean;
}

const formatDuration = (durationSec: number): string =>
  LIBRARY_COPY.card.durationLabel(Math.max(1, Math.round(durationSec / 60)));

/**
 * 격자 타일 — 정사각 아트워크 위에 상태(진행률·완청은 꽉 찬 바·더보기)를 얹고, 아래에 제목 두 줄과 길이를 둔다
 * (2026-09-18 PM: 목록 행 → 썸네일 격자, `docs/changes/pending/library-thumbnail-grid.md`).
 * 정보량은 행 카드(LibraryItemCard)와 같다 — 출처·저자는 상세에서만(결정 2026-09-15).
 * 더보기만 별도 히트 영역(44pt)이다.
 */
export default function LibraryItemTile({
  item,
  onPress,
  onMorePress,
  showDiscoveryBadge = false,
}: LibraryItemTileProps) {
  const isCompleted = item.status === 'completed';
  // 완청한 탐험 편에는 배지를 그리지 않는다 — 제안 성격은 이미 다했고, 사진 위 표식 셋이 붐빈다(2026-09-18)
  const hasDiscoveryBadge = showDiscoveryBadge && item.source === 'discovery' && !isCompleted;
  // 완청은 바를 100% 로 고정한다 — 실제 위치를 그리면 완청 판정(최대 도달 90%, library.md 4.4) 직후엔 9할,
  // 완청 뒤 되감으면 3할짜리 바가 "완청" 타일에 남는다. 좌상단 체크는 사진 위 스티커라 뺐다(2026-09-22 PM)
  const progressRatio = isCompleted
    ? 1
    : item.status === 'in_progress' && item.progress && item.content.durationSec > 0
      ? Math.min(1, item.progress.positionSec / item.content.durationSec)
      : null;
  const progressPercent = progressRatio !== null ? Math.round(progressRatio * 100) : null;
  // 흰 진행률 바는 밝은 사진에서 안 보인다 — 바가 있을 때도 아래 변을 어둡힌다(2026-09-22 PM)
  const hasBottomFade = hasDiscoveryBadge || progressPercent !== null;
  // 네이티브 SVG 는 "100%" 를 100pt 로 받으므로 아트워크 폭을 실측해 그라데이션 폭으로 준다(ScrollFade 와 같은 이유)
  const [artworkWidth, setArtworkWidth] = useState(0);

  return (
    <View style={styles.container}>
      <Pressable
        onPress={() => onPress(item)}
        accessibilityRole="button"
        accessibilityLabel={[
          hasDiscoveryBadge ? LIBRARY_COPY.discovery.badge : null,
          item.content.title,
          isCompleted ? LIBRARY_COPY.card.completedA11y : null,
        ]
          .filter(Boolean)
          .join(', ')}
        accessibilityHint="재생"
      >
        <View
          style={styles.artwork}
          onLayout={(event) => setArtworkWidth(event.nativeEvent.layout.width)}
        >
          <RemoteImage uri={item.content.thumbnailUrl} recyclingKey={item.content.id} style={styles.image} />
          {hasBottomFade ? (
            // 사진 아래 변에 깔리는 검정 그라데이션 — 그 위에 놓이는 것("새로운 주제" 글자·흰 진행률 바)이 밝은 사진에서도
            // 읽히게 하는 바탕. 아래 변에 아무것도 없으면 그리지 않는다(사진을 괜히 어둡히지 않는다)
            <View style={styles.bottomFade} pointerEvents="none">
              <Svg width={artworkWidth} height={BOTTOM_FADE_HEIGHT}>
                <Defs>
                  <LinearGradient id="tileBottomFade" x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0" stopColor="#000000" stopOpacity={0} />
                    <Stop offset="1" stopColor="#000000" stopOpacity={0.75} />
                  </LinearGradient>
                </Defs>
                <Rect
                  x="0"
                  y="0"
                  width={artworkWidth}
                  height={BOTTOM_FADE_HEIGHT}
                  fill="url(#tileBottomFade)"
                />
              </Svg>
            </View>
          ) : null}
          {hasDiscoveryBadge ? (
            // 그라데이션 위에 글자만 — 알약 배지는 사진 위에서 스티커처럼 떠 보여 뺐다(2026-09-22 PM).
            // 좌하단인 이유는 그대로: 제목 위에 두면 그 타일만 글 블록이 밀려 옆 타일과 줄이 어긋난다(2026-09-18 PM)
            <Text style={styles.discoveryLabel}>{LIBRARY_COPY.discovery.badge}</Text>
          ) : null}
          {progressPercent !== null ? (
            // 진행률 바만 있으면 색 외 단서가 없다 — a11y 텍스트를 반드시 제공한다(uiux 7). 완청은 "100% 들음"이 아니라 "완청한 콘텐츠"
            <View
              style={styles.progressTrack}
              accessibilityRole="progressbar"
              accessibilityLabel={
                isCompleted
                  ? LIBRARY_COPY.card.completedA11y
                  : LIBRARY_COPY.card.progressA11y(progressPercent)
              }
            >
              <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
            </View>
          ) : null}
        </View>
        <View style={styles.info}>
          <Text style={styles.title} numberOfLines={2}>
            {item.content.title}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {formatDuration(item.content.durationSec)}
          </Text>
        </View>
      </Pressable>
      {/* 아트워크 우상단에 띄운 더보기 — 사진 위라 반투명 검정 원으로 받친다 */}
      <Pressable
        style={styles.moreButton}
        onPress={() => onMorePress(item)}
        accessibilityRole="button"
        accessibilityLabel={LIBRARY_COPY.card.moreA11y(item.content.title)}
        hitSlop={theme.spacing.xs}
      >
        <View style={styles.moreCircle}>
          <Text style={styles.moreGlyph}>⋯</Text>
        </View>
      </Pressable>
    </View>
  );
}

const MORE_CIRCLE_SIZE = 28;
/** 그라데이션 높이 — 글자 한 줄이 어두운 띠 안에 들어올 만큼만. 사진 절반을 덮으면 표식이 아니라 어두운 사진이 된다 */
const BOTTOM_FADE_HEIGHT = 56;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: 'relative',
  },
  artwork: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.color.surface,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  // 사진 아래 변에 붙는 진행률 — 트랙은 흰 반투명, 채움은 흰색(사진 위 대비). 완청은 끝까지 찬 바(유튜브 문법)
  progressTrack: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.35)',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#FFFFFF',
  },
  info: {
    paddingTop: theme.spacing.sm,
    gap: theme.spacing.xs,
  },
  // 사진 아래 변에 깔리는 검정 그라데이션(투명 → 75%) — 밝은 사진에서도 흰 글자·흰 바가 읽히게 하는 바탕
  bottomFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: BOTTOM_FADE_HEIGHT,
  },
  // 흰 글자만 — 배경 박스 없이 그라데이션 위에 놓는다. 아래 변의 진행률 바(4px)와 겹치지 않게 sm 띄운다
  discoveryLabel: {
    position: 'absolute',
    left: theme.spacing.sm,
    bottom: theme.spacing.sm + 4,
    fontSize: theme.font.size.xs,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  title: {
    fontSize: theme.font.size.sm,
    fontWeight: '700',
    lineHeight: theme.font.size.sm * 1.35,
    color: theme.color.textPrimary,
  },
  meta: {
    fontSize: theme.font.size.xs,
    color: theme.color.textSecondary,
  },
  // 히트 영역 44pt — 원은 작게 두고 투명 여백으로 채운다
  moreButton: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: theme.touchTarget.minWidth,
    height: theme.touchTarget.minHeight,
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
    padding: theme.spacing.sm,
  },
  moreCircle: {
    width: MORE_CIRCLE_SIZE,
    height: MORE_CIRCLE_SIZE,
    borderRadius: MORE_CIRCLE_SIZE / 2,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreGlyph: {
    fontSize: theme.font.size.md,
    fontWeight: '700',
    color: '#FFFFFF',
    // 글리프가 원 안에서 살짝 위로 뜬다 — 기준선 보정
    marginTop: -2,
  },
});
