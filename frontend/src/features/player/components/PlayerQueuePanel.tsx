import { useEffect, useMemo, useRef } from 'react';
import { FlatList, Image, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/shared/theme';

import { PLAYER_COPY } from '../player.copy';
import { formatPlaybackTime } from '../player.format';
import type { QueueItem } from '../player.types';

interface PlayerQueuePanelProps {
  items: QueueItem[];
  /** 항목 위에서 오른쪽으로 밀면 접는다 — 아트워크 화면으로 "돌아가는" 방향 */
  onSwipeRight: () => void;
}

const SWIPE_RIGHT_DISTANCE = 40;
const SWIPE_AXIS_RATIO = 1.5;
const THUMBNAIL_SIZE = 48;

/**
 * 다음 재생 목록 패널(2026-09-16) — 바닥 손잡이를 끌어올리면 아트워크가 압축되고 이 패널이 남은 높이를
 * 채운다(스크립트 패널과 같은 자리·같은 전환). **목록의 원천은 아직 없다** — 지금은 dev mock이 채우고,
 * 항목 탭은 연결하지 않았다(TODO: 편성 순서·라이브러리 미청취 순서 중 무엇을 "다음"으로 볼지 결정 필요).
 */
export default function PlayerQueuePanel({ items, onSwipeRight }: PlayerQueuePanelProps) {
  const swipeRightRef = useRef(onSwipeRight);
  useEffect(() => {
    swipeRightRef.current = onSwipeRight;
  });
  // 목록은 세로 스크롤을 가져가므로 가로 이동만 부모가 가로챈다(capture) — 스크롤과 겹치지 않는다
  const swipeRightResponder = useMemo(
    () =>
      // eslint-disable-next-line react-hooks/refs -- 콜백은 렌더가 아니라 제스처 시점에 실행된다(표준 PanResponder 패턴)
      PanResponder.create({
        onMoveShouldSetPanResponderCapture: (_, gesture) =>
          gesture.dx > SWIPE_RIGHT_DISTANCE &&
          Math.abs(gesture.dx) > Math.abs(gesture.dy) * SWIPE_AXIS_RATIO,
        onPanResponderRelease: () => swipeRightRef.current(),
      }),
    [],
  );

  return (
    <View style={styles.panel} {...swipeRightResponder.panHandlers}>
      <FlatList
        data={items}
        keyExtractor={(item) => item.contentId}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <Text style={styles.title} accessibilityRole="header">
            {PLAYER_COPY.queuePanel.title}
          </Text>
        }
        renderItem={({ item, index }) => (
          <Pressable
            style={styles.row}
            accessibilityRole="button"
            accessibilityLabel={PLAYER_COPY.queuePanel.itemA11y(index + 1, item.title)}
          >
            <Image source={{ uri: item.thumbnailUrl }} style={styles.thumbnail} />
            <View style={styles.rowMeta}>
              <Text style={styles.rowTitle} numberOfLines={1}>
                {item.title}
              </Text>
              <Text style={styles.rowDuration}>{formatPlaybackTime(item.durationSec)}</Text>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // 헤더와의 경계 — 목록이 헤더 밑으로 스크롤돼 들어갈 때 잘린 행이 그대로 보이지 않게 선을 긋는다
  panel: {
    flex: 1,
    minHeight: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.color.border,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.md,
    gap: theme.spacing.xs,
  },
  title: {
    fontSize: theme.font.size.xs,
    fontWeight: '600',
    color: theme.color.textSecondary,
    paddingHorizontal: theme.spacing.sm,
    paddingBottom: theme.spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.md,
  },
  thumbnail: {
    width: THUMBNAIL_SIZE,
    height: THUMBNAIL_SIZE,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.color.surface,
  },
  rowMeta: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    fontSize: theme.font.size.md,
    fontWeight: '600',
    color: theme.color.textPrimary,
  },
  rowDuration: {
    fontSize: theme.font.size.xs,
    color: theme.color.textSecondary,
    fontVariant: ['tabular-nums'],
  },
});
