import { useEffect, useMemo, useRef } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { theme } from '@/shared/theme';

import { PLAYER_COPY } from '../player.copy';
import { formatPlaybackTime } from '../player.format';
import type { QueueItem } from '../player.types';

interface PlayerQueuePanelProps {
  items: QueueItem[];
  isLoading: boolean;
  isError: boolean;
  /** 지금 재생 중인 콘텐츠 — 굵게 표시하고 낭독에도 "재생 중"을 붙인다(색만으로 구분하지 않는다) */
  currentContentId: string;
  onSelect: (item: QueueItem) => void;
  onRetry: () => void;
  /** 항목 위에서 오른쪽으로 밀면 접는다 — 아트워크 화면으로 "돌아가는" 방향 */
  onSwipeRight: () => void;
  /** 시트 안에서는 손잡이 라벨이 제목 역할이라 패널 제목을 다시 그리지 않는다 */
  showHeader?: boolean;
}

const SWIPE_RIGHT_DISTANCE = 40;
const SWIPE_AXIS_RATIO = 1.5;
const THUMBNAIL_SIZE = 48;

const toMinutes = (durationSec: number | null): number =>
  durationSec === null ? 0 : Math.max(1, Math.round(durationSec / 60));

/**
 * 재생 목록 패널(2026-09-16) — 바닥 손잡이를 끌어올리면 아트워크가 압축되고 이 패널이 남은 높이를
 * 채운다(스크립트 패널과 같은 자리·같은 전환).
 *
 * **목록의 원천은 필터를 걸지 않은 라이브러리 첫 페이지다**(2026-09-17 — FE 워크트리 작업 통합). 패널은
 * 라이브러리 화면의 복제가 아니라 "지금 듣는 것의 이웃"을 보여주는 자리라 검색·탭·주제 필터를 두지 않는다.
 * library의 `LibraryItemCard`를 가져오지 않는다 — player → library 직접 의존이 되어 의존 표
 * (architecture.md 4.4)의 방향이 뒤집힌다. 한 줄 밀도가 이 자리에 맞기도 하다.
 *
 * 문서 반영 요청: changes/pending/player-queue-panel.md
 */
export default function PlayerQueuePanel({
  items,
  isLoading,
  isError,
  currentContentId,
  onSelect,
  onRetry,
  onSwipeRight,
  showHeader = true,
}: PlayerQueuePanelProps) {
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

  const header = showHeader ? (
    <Text style={styles.title} accessibilityRole="header">
      {PLAYER_COPY.queuePanel.title}
    </Text>
  ) : null;

  if (isError) {
    return (
      <View style={styles.panel} {...swipeRightResponder.panHandlers}>
        {header}
        <View style={styles.placeholder}>
          <Text style={styles.placeholderText}>{PLAYER_COPY.queuePanel.loadFailed}</Text>
          <Pressable
            style={styles.retry}
            onPress={onRetry}
            accessibilityRole="button"
            accessibilityLabel={PLAYER_COPY.queuePanel.retry}
          >
            <Text style={styles.retryLabel}>{PLAYER_COPY.queuePanel.retry}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={styles.panel} {...swipeRightResponder.panHandlers}>
        {header}
        <View style={styles.placeholder}>
          <ActivityIndicator color={theme.color.textSecondary} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.panel} {...swipeRightResponder.panHandlers}>
      <FlatList
        data={items}
        keyExtractor={(item) => item.itemId}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={header}
        ListEmptyComponent={
          <View style={styles.placeholder}>
            <Text style={styles.placeholderText}>{PLAYER_COPY.queuePanel.empty}</Text>
          </View>
        }
        renderItem={({ item }) => {
          const isCurrent = item.contentId === currentContentId;
          const tags: string[] = [];
          if (isCurrent) tags.push(PLAYER_COPY.queuePanel.nowPlayingA11y);
          if (item.isCompleted) tags.push(PLAYER_COPY.queuePanel.completedA11y);
          return (
            <Pressable
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              onPress={() => onSelect(item)}
              accessibilityRole="button"
              accessibilityLabel={PLAYER_COPY.queuePanel.itemA11y(
                item.title,
                toMinutes(item.durationSec),
                tags,
              )}
              accessibilityState={{ selected: isCurrent }}
            >
              {item.thumbnailUrl ? (
                <Image source={{ uri: item.thumbnailUrl }} style={styles.thumbnail} />
              ) : (
                <View style={styles.thumbnail} />
              )}
              <View style={styles.rowMeta}>
                <Text
                  style={[styles.rowTitle, isCurrent && styles.rowTitleCurrent]}
                  numberOfLines={1}
                >
                  {item.title}
                </Text>
                <Text style={styles.rowDuration}>
                  {item.durationSec === null ? '' : formatPlaybackTime(item.durationSec)}
                </Text>
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // 구분선 없음(PM 2026-09-17) — 손잡이와 목록 사이는 여백으로만 가른다
  panel: {
    flex: 1,
    minHeight: 0,
  },
  list: {
    flex: 1,
  },
  listContent: {
    // 시트가 화면 폭을 꽉 채우므로 행의 좌우 여백은 여기서 — 행 자체 패딩(sm)과 합쳐 화면 여백(lg)이 된다
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.md,
    gap: theme.spacing.xs,
  },
  title: {
    fontSize: theme.font.size.xs,
    fontWeight: '600',
    color: theme.color.textSecondary,
    paddingHorizontal: theme.spacing.sm,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.xs,
  },
  placeholder: {
    paddingVertical: theme.spacing.xl,
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  placeholderText: {
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
  },
  retry: {
    minHeight: theme.touchTarget.minHeight,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.md,
  },
  retryLabel: {
    fontSize: theme.font.size.sm,
    fontWeight: '600',
    color: theme.color.primary,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.md,
  },
  rowPressed: {
    backgroundColor: theme.color.surface,
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
    fontWeight: '500',
    color: theme.color.textPrimary,
  },
  // 재생 중 — 굵기로 구분한다(색만으로 구분하지 않는다, uiux 7장)
  rowTitleCurrent: {
    fontWeight: '700',
  },
  rowDuration: {
    fontSize: theme.font.size.xs,
    color: theme.color.textSecondary,
    fontVariant: ['tabular-nums'],
  },
});
