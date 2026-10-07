import { useEffect, useMemo, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { useReduceMotion } from '@/shared/hooks/useReduceMotion';
import { theme } from '@/shared/theme';
import { Text } from '@/shared/ui/Typography';

import { PLAYER_COPY } from '../player.copy';
import { currentSectionOf, sectionDisplayOf, type SectionDisplay } from '../player.section';
import { playerColor } from '../player.theme';
import type { PlayerSection } from '../player.types';

/** 구간이 바뀔 때 옛 내용이 빠지고 새 내용이 들어오는 시간 — 시크바 옆에서 눈에 거슬리지 않을 만큼 짧게 */
const FADE_OUT_MS = 120;
const FADE_IN_MS = 180;
/** 애플 글자 단계 — 위 구역 이름은 Headline(17 굵게), 아래 단락 제목은 Footnote(13) */
const HEADING_FONT_SIZE = 17;
const HEADING_LINE_HEIGHT = 22;
const DETAIL_FONT_SIZE = 13;
const DETAIL_LINE_HEIGHT = 18;
/** 제목 한 줄 + 요약 한 줄 = 두 줄(PM 2026-10-07 — "두 줄이 아니라 한 줄, 제목 + 요약이라 두 줄") */
const DETAIL_MAX_LINES = 1;
const HEADING_DETAIL_GAP = 2;
/** 구역 이름 한 줄 + 요약 한 줄 — 카드 안쪽 높이는 늘 이 값이다 */
const CONTENT_HEIGHT =
  HEADING_LINE_HEIGHT + HEADING_DETAIL_GAP + DETAIL_LINE_HEIGHT * DETAIL_MAX_LINES;

const sameDisplay = (a: SectionDisplay | null, b: SectionDisplay | null) =>
  a?.heading === b?.heading && a?.detail === b?.detail;

interface PlayerCurrentSectionProps {
  sections: readonly PlayerSection[];
  positionSec: number;
}

/**
 * 시크바 바로 위 구간 카드(KAN-127 — player.md 4.6-1). 위 큰 줄은 구역 이름("개요"·"본론"·"결론"), 아래는 구간 요약
 * 한 줄(요약이 없으면 서버 제목, 넘치면 말줄임). 서버가 구역을 안 실었으면 위 "지금 듣는 구간"(`sectionDisplayOf`).
 * **카드 안쪽 높이는 늘 큰 줄 하나 + 작은 줄 하나다** — 구간이 바뀌어도 카드 높이·구역 이름 자리가 같아야
 * 시크바·재생 버튼이 움직이지 않는다(player-uiux.md 7장). 바뀌면 내용 전체를 교차 페이드(동작 줄이기면 즉시).
 * 구간이 없는 콘텐츠는 카드 자체를 그리지 않는다. 미니플레이어에는 두지 않는다(PM 2026-10-07)
 */
export default function PlayerCurrentSection({ sections, positionSec }: PlayerCurrentSectionProps) {
  const section = currentSectionOf(sections, positionSec);
  const computed = section === null ? null : sectionDisplayOf(section, PLAYER_COPY.screen);
  const displayHeading = computed?.heading ?? null;
  const displayDetail = computed?.detail ?? null;
  // 재생 위치는 수시로 바뀌지만 표시 내용은 구간이 바뀔 때만 바뀐다 — 같은 내용이면 같은 객체를 써서 효과가 다시 돌지 않게 한다
  const display = useMemo<SectionDisplay | null>(
    () =>
      displayHeading === null || displayDetail === null
        ? null
        : { heading: displayHeading, detail: displayDetail },
    [displayHeading, displayDetail],
  );
  const reduceMotion = useReduceMotion();
  const [shown, setShown] = useState(display);
  const opacity = useMemo(() => new Animated.Value(1), []);

  // 내용이 바뀌면 옛 내용을 걷고 새 내용을 들인다 — 교체(setState)는 애니메이션 완료 콜백에서만 일어난다
  useEffect(() => {
    if (sameDisplay(display, shown)) return undefined;
    if (reduceMotion !== false || shown === null) {
      opacity.setValue(1);
      const frame = requestAnimationFrame(() => setShown(display));
      return () => cancelAnimationFrame(frame);
    }
    const fadeOut = Animated.timing(opacity, {
      toValue: 0,
      duration: FADE_OUT_MS,
      useNativeDriver: true,
    });
    fadeOut.start(({ finished }) => {
      if (!finished) return;
      setShown(display);
      Animated.timing(opacity, { toValue: 1, duration: FADE_IN_MS, useNativeDriver: true }).start();
    });
    return () => fadeOut.stop();
  }, [display, shown, reduceMotion, opacity]);

  if (shown === null) return null;

  return (
    <View
      style={styles.card}
      accessible
      accessibilityLabel={PLAYER_COPY.screen.currentSectionA11y(
        // 구역이 없으면 위 줄이 "지금 듣는 구간"이라 앞말과 겹친다 — 그때는 요약만 붙인다
        shown.heading === PLAYER_COPY.screen.currentSectionLabel
          ? shown.detail
          : `${shown.heading}, ${shown.detail}`,
      )}
    >
      <Animated.View style={[styles.content, { opacity }]}>
        <Text style={styles.heading} numberOfLines={1}>
          {shown.heading}
        </Text>
        {/* 한글을 단어 단위로 끊는다(iOS) — 글자 단위면 "원칙 / 과"처럼 단어 중간에서 줄이 바뀐다 */}
        <Text
          style={styles.detail}
          numberOfLines={DETAIL_MAX_LINES}
          ellipsizeMode="tail"
          lineBreakStrategyIOS="hangul-word"
        >
          {shown.detail}
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
    borderRadius: theme.radius.md,
    borderCurve: 'continuous',
    backgroundColor: playerColor.surface,
  },
  content: {
    height: CONTENT_HEIGHT,
    gap: HEADING_DETAIL_GAP,
  },
  heading: {
    fontSize: HEADING_FONT_SIZE,
    lineHeight: HEADING_LINE_HEIGHT,
    fontWeight: '600',
    color: playerColor.textPrimary,
  },
  detail: {
    fontSize: DETAIL_FONT_SIZE,
    lineHeight: DETAIL_LINE_HEIGHT,
    color: playerColor.textSecondary,
  },
});
