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

interface PlayerCurrentSectionProps {
  sections: readonly PlayerSection[];
  positionSec: number;
}

/**
 * 시크바 바로 위 "지금 · {구간 제목}" 한 줄(KAN-127 — player.md 4.6-1). 넘치면 말줄임, 구간이 바뀌면 교차 페이드
 * (동작 줄이기면 즉시 교체). 구간이 없는 콘텐츠는 줄 자체를 그리지 않는다. 미니플레이어에는 두지 않는다(PM 2026-10-07)
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
      style={styles.container}
      accessible
      accessibilityLabel={PLAYER_COPY.screen.currentSectionA11y(shownTitle)}
    >
      <Animated.View style={{ opacity }}>
        <Text style={styles.line} numberOfLines={1} ellipsizeMode="tail">
          <Text style={styles.label}>{PLAYER_COPY.screen.currentSectionLabel}</Text>
          {` ${PLAYER_COPY.screen.currentSectionSeparator} `}
          {shownTitle}
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: theme.spacing.xs,
  },
  line: {
    fontSize: theme.font.size.sm,
    color: playerColor.textSecondary,
  },
  label: {
    fontWeight: '600',
    color: playerColor.textPrimary,
  },
});
