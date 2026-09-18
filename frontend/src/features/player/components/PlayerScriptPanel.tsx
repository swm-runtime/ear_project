import { useEffect, useMemo, useRef } from 'react';
import { FlatList, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/shared/theme';
import ScrollFade from '@/shared/ui/ScrollFade';

import { PLAYER_COPY } from '../player.copy';
import { formatPlaybackTime } from '../player.format';
import type { ScriptSegment } from '../player.types';

interface PlayerScriptPanelProps {
  segments: ScriptSegment[];
  positionSec: number;
  /** 문단 탭 → 그 구간 시작으로 seek. 패널은 닫지 않는다 — 듣던 채로 따라 읽는 화면이다 */
  onSeek: (sec: number) => void;
  /** 문단 위에서 오른쪽으로 밀면 접는다 — 아트워크 화면으로 "돌아가는" 방향(2026-09-16) */
  onSwipeRight: () => void;
}

/** 문단 위에서 오른쪽으로 이만큼 밀면 접는다. 세로 성분이 크면 목록 스크롤에 양보한다 */
const SWIPE_RIGHT_DISTANCE = 40;
const SWIPE_AXIS_RATIO = 1.5;

/** 현재 구간 — 시작 초가 재생 위치를 넘지 않는 마지막 문단. 첫 문단 전이면 0 */
const currentIndexOf = (segments: ScriptSegment[], positionSec: number): number => {
  let index = 0;
  for (let i = 0; i < segments.length; i += 1) {
    if (segments[i].startSec <= positionSec) index = i;
    else break;
  }
  return index;
};

/**
 * PL6 스크립트 — 시트가 아니라 **플레이어 안에서 펼쳐지는 패널**(2026-09-16 개정).
 * 펼치면 아트워크가 한 줄 헤더로 압축되고 이 패널이 남은 높이를 채운다. 컨트롤은 바닥에 그대로 있어
 * 읽으면서 조작한다. 현재 구간 하이라이트(배경 + 굵기, 7장)·자동 스크롤·문단 탭 seek는 uiux 4.6 그대로.
 * 텍스트 선택·복사는 막는다(FR-33).
 */
export default function PlayerScriptPanel({
  segments,
  positionSec,
  onSeek,
  onSwipeRight,
}: PlayerScriptPanelProps) {
  const listRef = useRef<FlatList<ScriptSegment>>(null);
  const currentIndex = currentIndexOf(segments, positionSec);

  // 현재 문단을 화면 위쪽 1/3에 둔다 — 다음 문단이 미리 보여 읽기가 끊기지 않는다
  const scrollToCurrent = (animated: boolean) => {
    if (segments.length === 0) return;
    listRef.current?.scrollToIndex({ index: currentIndex, viewPosition: 0.3, animated });
  };
  useEffect(() => {
    scrollToCurrent(true);
    // 펼친 직후에는 목록이 아직 측정 전이라 첫 호출이 조용히 실패한다 — 한 프레임 뒤 한 번 더 맞춘다
    const timer = setTimeout(() => scrollToCurrent(false), 80);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- currentIndex가 바뀔 때만 다시 맞춘다
  }, [currentIndex, segments.length]);

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
        ref={listRef}
        data={segments}
        keyExtractor={(segment) => String(segment.startSec)}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        // 측정 전 인덱스로 스크롤하면 실패한다 — 대략 위치로 한 번 가고 다음 갱신에서 맞춘다
        onScrollToIndexFailed={({ averageItemLength, index }) => {
          listRef.current?.scrollToOffset({ offset: averageItemLength * index, animated: false });
        }}
        renderItem={({ item, index }) => {
          const isCurrent = index === currentIndex;
          const time = formatPlaybackTime(item.startSec);
          return (
            <Pressable
              style={[styles.segment, isCurrent && styles.segmentCurrent]}
              onPress={() => onSeek(item.startSec)}
              accessibilityRole="button"
              accessibilityLabel={PLAYER_COPY.scriptSheet.segmentA11y(time, item.speaker)}
              accessibilityState={{ selected: isCurrent }}
            >
              <View style={styles.segmentHead}>
                {item.speaker ? (
                  <Text style={[styles.speaker, isCurrent && styles.speakerCurrent]}>
                    {item.speaker}
                  </Text>
                ) : null}
                <Text style={styles.time}>{time}</Text>
              </View>
              <Text style={[styles.text, isCurrent && styles.textCurrent]} selectable={false}>
                {item.text}
              </Text>
            </Pressable>
          );
        }}
      />
      {/* 헤더와의 경계 — 선을 긋지 않고, 목록이 헤더 밑으로 올라가며 배경색으로 흐려져 사라진다(2026-09-18 PM) */}
      <ScrollFade edge="top" />
      {/* 아래쪽도 대칭 — 컨트롤 위에서 문단이 잘린 채 끝나지 않고 흐려지며 사라진다 */}
      <ScrollFade edge="bottom" />
      {/* 손잡이는 서랍의 아랫단이다 — 접힌 상태의 바닥 손잡이와 같은 자리·같은 모양이라,
          위로 끌어 올린 것을 아래로 끌어 내리는 것으로 읽힌다. 탭도 접는다 */}
    </View>
  );
}

const styles = StyleSheet.create({
  // 헤더와의 경계는 선이 아니라 위쪽 페이드(ScrollFade top)가 만든다
  panel: {
    flex: 1,
    minHeight: 0,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.md,
    gap: theme.spacing.xs,
  },
  segment: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.md,
    gap: theme.spacing.xs,
  },
  segmentCurrent: {
    backgroundColor: theme.color.surface,
  },
  segmentHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: theme.spacing.sm,
  },
  speaker: {
    fontSize: theme.font.size.xs,
    fontWeight: '600',
    color: theme.color.textSecondary,
  },
  speakerCurrent: {
    color: theme.color.primary,
  },
  time: {
    fontSize: theme.font.size.xs,
    color: theme.color.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  text: {
    fontSize: theme.font.size.md,
    lineHeight: theme.font.size.md * 1.55,
    color: theme.color.textSecondary,
    userSelect: 'none',
  },
  textCurrent: {
    fontWeight: '600',
    color: theme.color.textPrimary,
  },
});
