import { useEffect, useMemo, useState } from 'react';
import { Animated, Platform, StyleSheet, View } from 'react-native';

import { useDelayedVisible } from '@/shared/hooks/useDelayedVisible';
import { useReduceMotion } from '@/shared/hooks/useReduceMotion';
import { motion, theme } from '@/shared/theme';
import { SkeletonGroup, SkeletonLine } from '@/shared/ui/Skeleton';
import { Text } from '@/shared/ui/Typography';

import { PLAYER_COPY } from '../player.copy';
import { currentSectionOf, sectionDisplayOf, type SectionDisplay } from '../player.section';
import { playerColor } from '../player.theme';
import type { PlayerSection } from '../player.types';
import { useScrubPositionStore } from '../store/scrub-position.store';

/**
 * 구간이 바뀔 때 — 옛 내용이 빠지며 위(앞으로 갈 때)·아래(뒤로 갈 때)로 밀려나고, 새 내용이 반대편에서 들어온다
 * (PM 2026-10-07 "구간 바뀔 때나 바 잡고 끌 때 애니메이션"). 끄는 동안 연달아 바뀌어도 따라가도록 짧게
 */
const SLIDE_OUT_MS = 100;
const FADE_IN_MS = 160;
const SLIDE_DISTANCE = 8;
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

/** 표시 내용 + 몇 번째 구간인가(밀려나는 방향을 정한다) */
type ShownSection = SectionDisplay & { index: number };

/**
 * 카드 안쪽 위아래 여백. **iOS 는 글자 묶음이 줄 칸 안에서 아래로 2.7pt 앉는다** — 실기기 실측(2026-10-07, 3px/pt):
 * 위 14.3pt · 아래 9.0pt. 카드 높이는 그대로 두고 그 차이의 절반만큼 위 여백을 덜고 아래에 더한다(눈으로 보이는 위아래가
 * 각각 약 11.7pt). Android(Pretendard)는 따로 실측 전이라 같은 값이다(memory: Android 한글 세로 정렬은 실측 후 보정)
 */
const CARD_PADDING = theme.spacing.sm + 2;
const IOS_GLYPH_SHIFT = 2.67;
const CARD_PADDING_TOP = Platform.OS === 'ios' ? CARD_PADDING - IOS_GLYPH_SHIFT : CARD_PADDING;
const CARD_PADDING_BOTTOM = Platform.OS === 'ios' ? CARD_PADDING + IOS_GLYPH_SHIFT : CARD_PADDING;

const sameDisplay = (a: ShownSection | null, b: ShownSection | null) =>
  a?.index === b?.index && a?.heading === b?.heading && a?.detail === b?.detail;

interface PlayerCurrentSectionProps {
  sections: readonly PlayerSection[];
  positionSec: number;
  /**
   * 재생 발급 응답을 기다리는 중 — 구간이 있는지 아직 모른다. 카드 자리를 먼저 잡고 스켈레톤을 그린다(조금 늦으면).
   * 응답이 오면 구간이 있으면 내용, 없으면 카드가 사라진다
   */
  isLoading?: boolean;
}

/**
 * 시크바 바로 위 구간 카드(KAN-127 — player.md 4.6-1). 위 큰 줄은 구역 이름("개요"·"본론"·"결론"), 아래는 구간 요약
 * 한 줄(요약이 없으면 서버 제목, 넘치면 말줄임). 서버가 구역을 안 실었으면 위 "지금 듣는 구간"(`sectionDisplayOf`).
 * **카드 안쪽 높이는 늘 큰 줄 하나 + 작은 줄 하나다** — 구간이 바뀌어도 카드 높이·구역 이름 자리가 같아야
 * 시크바·재생 버튼이 움직이지 않는다(player-uiux.md 7장). 바뀌면 내용이 위·아래로 밀려나며 바뀐다(동작 줄이기면 즉시).
 * 재생 바를 끄는 동안은 손가락 아래 위치의 구간을 보여 준다.
 * 구간이 없는 콘텐츠는 카드 자체를 그리지 않는다. 미니플레이어에는 두지 않는다(PM 2026-10-07)
 */
export default function PlayerCurrentSection({
  sections,
  positionSec,
  isLoading = false,
}: PlayerCurrentSectionProps) {
  // 재생 바를 끄는 동안은 손가락 아래 위치의 구간을 미리 보여 준다(애플 팟캐스트) — 놓으면 재생 위치로 돌아온다
  const scrubSec = useScrubPositionStore((state) => state.scrubSec);
  const section = currentSectionOf(sections, scrubSec ?? positionSec);
  const sectionIndex = section === null ? -1 : sections.indexOf(section);
  const computed = section === null ? null : sectionDisplayOf(section, PLAYER_COPY.screen);
  const displayHeading = computed?.heading ?? null;
  const displayDetail = computed?.detail ?? null;
  // 재생 위치는 수시로 바뀌지만 표시 내용은 구간이 바뀔 때만 바뀐다 — 같은 내용이면 같은 객체를 써서 효과가 다시 돌지 않게 한다
  const display = useMemo<ShownSection | null>(
    () =>
      displayHeading === null || displayDetail === null
        ? null
        : { heading: displayHeading, detail: displayDetail, index: sectionIndex },
    [displayHeading, displayDetail, sectionIndex],
  );
  const reduceMotion = useReduceMotion();
  const [shown, setShown] = useState(display);
  const opacity = useMemo(() => new Animated.Value(1), []);
  const translateY = useMemo(() => new Animated.Value(0), []);

  // 내용이 바뀌면 옛 내용을 밀어내고 새 내용을 들인다 — 교체(setState)는 애니메이션 완료 콜백에서만 일어난다
  useEffect(() => {
    if (sameDisplay(display, shown)) return undefined;
    if (reduceMotion !== false || shown === null || display === null) {
      opacity.setValue(1);
      translateY.setValue(0);
      const frame = requestAnimationFrame(() => setShown(display));
      return () => cancelAnimationFrame(frame);
    }
    // 앞 구간으로 가면 위로 밀려나고 아래에서 들어온다(목록을 내리는 방향), 뒤로 가면 반대
    const direction = display.index >= shown.index ? 1 : -1;
    const slideOut = Animated.parallel([
      Animated.timing(opacity, {
        toValue: 0,
        duration: SLIDE_OUT_MS,
        easing: motion.easing.easeOut,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: -direction * SLIDE_DISTANCE,
        duration: SLIDE_OUT_MS,
        easing: motion.easing.easeOut,
        useNativeDriver: true,
      }),
    ]);
    slideOut.start(({ finished }) => {
      if (!finished) return;
      setShown(display);
      translateY.setValue(direction * SLIDE_DISTANCE);
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: FADE_IN_MS, useNativeDriver: true }),
        Animated.spring(translateY, { toValue: 0, ...motion.spring.snappy, useNativeDriver: true }),
      ]).start();
    });
    return () => slideOut.stop();
  }, [display, shown, reduceMotion, opacity, translateY]);

  // 짧은 대기에는 빈 카드만 — 스켈레톤이 번쩍 지나가지 않게 조금 늦게 그린다(PlayerScriptStatus 와 같다)
  const showSkeleton = useDelayedVisible(isLoading && shown === null);
  if (shown === null) {
    if (!isLoading) return null;
    return (
      <View style={styles.card}>
        {showSkeleton ? (
          <SkeletonGroup
            style={styles.content}
            color={playerColor.skeleton}
            accessibilityLabel={PLAYER_COPY.screen.currentSectionLoadingA11y}
          >
            {/* 막대를 글자와 같은 줄 높이 칸의 가운데에 — 내용으로 바뀔 때 자리가 맞는다 */}
            <View style={styles.headingSlot}>
              <SkeletonLine width={44} height={HEADING_FONT_SIZE} />
            </View>
            <View style={styles.detailSlot}>
              <SkeletonLine width="62%" height={DETAIL_FONT_SIZE} />
            </View>
          </SkeletonGroup>
        ) : (
          <View style={styles.content} />
        )}
      </View>
    );
  }

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
      <Animated.View style={[styles.content, { opacity, transform: [{ translateY }] }]}>
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
    // 위 — 제목·카테고리는 컨트롤 영역 첫 줄에 바짝 붙게 배치된다(재생 바 터치 영역 위 절반이 여백이던 자리).
    // 카드가 그 자리에 들어오면 카테고리 밑이 0 이 된다(PM 2026-10-07 1.2.0 실기기) — 카드가 직접 여백을 갖는다
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingTop: CARD_PADDING_TOP,
    paddingBottom: CARD_PADDING_BOTTOM,
    borderRadius: theme.radius.md,
    borderCurve: 'continuous',
    // 반투명 흰 채움 — 바탕과 상관없이 같은 회색으로 읽힌다(playerColor.fill)
    backgroundColor: playerColor.fill,
    // 밀려나는 글자가 카드 밖으로 비치지 않게
    overflow: 'hidden',
  },
  content: {
    height: CONTENT_HEIGHT,
    gap: HEADING_DETAIL_GAP,
  },
  headingSlot: {
    height: HEADING_LINE_HEIGHT,
    justifyContent: 'center',
  },
  detailSlot: {
    height: DETAIL_LINE_HEIGHT,
    justifyContent: 'center',
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
