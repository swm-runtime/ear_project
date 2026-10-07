import { useEffect, useMemo, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { useReduceMotion } from '@/shared/hooks/useReduceMotion';
import { theme } from '@/shared/theme';
import { Text } from '@/shared/ui/Typography';

import { PLAYER_COPY } from '../player.copy';
import { currentSectionOf } from '../player.section';
import { playerColor } from '../player.theme';
import type { PlayerSection } from '../player.types';

/** 구간이 바뀔 때 옛 제목이 빠지고 새 제목이 들어오는 시간 — 시크바 옆에서 눈에 거슬리지 않을 만큼 짧게 */
const FADE_OUT_MS = 120;
const FADE_IN_MS = 180;
/** 애플 글자 단계 — 라벨은 Caption 1(12), 제목은 Subheadline(15) */
const TITLE_FONT_SIZE = 15;
const TITLE_LINE_HEIGHT = 20;
const TITLE_MAX_LINES = 2;

interface PlayerCurrentSectionProps {
  sections: readonly PlayerSection[];
  positionSec: number;
}

/**
 * 시크바 바로 위 "지금 듣는 구간" 카드(KAN-127 — player.md 4.6-1). 위에 작은 라벨, 아래에 구간 제목 최대 2줄(넘치면
 * 말줄임). **제목 칸은 늘 두 줄 높이다** — 한 줄·두 줄 제목이 번갈아 와도 카드 높이가 같아야 시크바·재생 버튼이 움직이지
 * 않는다(player-uiux.md 7장 "컨트롤 위치는 모든 상태에서 동일"). 구간이 바뀌면 제목만 교차 페이드(동작 줄이기면 즉시).
 * 구간이 없는 콘텐츠는 카드 자체를 그리지 않는다. 미니플레이어에는 두지 않는다(PM 2026-10-07)
 */
export default function PlayerCurrentSection({ sections, positionSec }: PlayerCurrentSectionProps) {
  const title = currentSectionOf(sections, positionSec)?.title ?? null;
  const reduceMotion = useReduceMotion();
  const [shownTitle, setShownTitle] = useState(title);
  const opacity = useMemo(() => new Animated.Value(1), []);

  // 제목이 바뀌면 옛 제목을 걷고 새 제목을 들인다 — 교체(setState)는 애니메이션 완료 콜백에서만 일어난다
  useEffect(() => {
    if (title === shownTitle) return undefined;
    if (reduceMotion !== false || shownTitle === null) {
      opacity.setValue(1);
      const frame = requestAnimationFrame(() => setShownTitle(title));
      return () => cancelAnimationFrame(frame);
    }
    const fadeOut = Animated.timing(opacity, {
      toValue: 0,
      duration: FADE_OUT_MS,
      useNativeDriver: true,
    });
    fadeOut.start(({ finished }) => {
      if (!finished) return;
      setShownTitle(title);
      Animated.timing(opacity, { toValue: 1, duration: FADE_IN_MS, useNativeDriver: true }).start();
    });
    return () => fadeOut.stop();
  }, [title, shownTitle, reduceMotion, opacity]);

  if (shownTitle === null) return null;

  return (
    <View
      style={styles.card}
      accessible
      accessibilityLabel={PLAYER_COPY.screen.currentSectionA11y(shownTitle)}
    >
      <Text style={styles.label} numberOfLines={1}>
        {PLAYER_COPY.screen.currentSectionLabel}
      </Text>
      <Animated.View style={[styles.titleBox, { opacity }]}>
        {/* 한글을 단어 단위로 끊는다(iOS) — 글자 단위면 "원칙 / 과"처럼 단어 중간에서 줄이 바뀐다 */}
        <Text
          style={styles.title}
          numberOfLines={TITLE_MAX_LINES}
          ellipsizeMode="tail"
          lineBreakStrategyIOS="hangul-word"
        >
          {shownTitle}
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  // 한 단 올라온 면 — 버튼이 아니라 면이라 둥근 사각(design.md §2), 연속 곡률
  card: {
    marginBottom: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm + 2,
    gap: 2,
    borderRadius: theme.radius.md,
    borderCurve: 'continuous',
    backgroundColor: playerColor.surface,
  },
  label: {
    fontSize: theme.font.size.xs,
    fontWeight: '600',
    color: playerColor.textSecondary,
  },
  titleBox: {
    height: TITLE_LINE_HEIGHT * TITLE_MAX_LINES,
  },
  title: {
    fontSize: TITLE_FONT_SIZE,
    lineHeight: TITLE_LINE_HEIGHT,
    fontWeight: '600',
    color: playerColor.textPrimary,
  },
});
