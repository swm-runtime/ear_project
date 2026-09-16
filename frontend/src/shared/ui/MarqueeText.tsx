import { useEffect, useState } from 'react';
import type { LayoutChangeEvent, StyleProp, TextStyle } from 'react-native';
import { AccessibilityInfo, Animated, Easing, StyleSheet, Text, View } from 'react-native';

import { useAnimatedValue } from '@/shared/hooks/useAnimatedValue';

interface MarqueeTextProps {
  text: string;
  /** 글자 스타일. `lineHeight`가 있으면 뷰포트 높이로 쓴다 — 없으면 fontSize×1.3 */
  style?: StyleProp<TextStyle>;
  /** 흐르는 속도(px/초) */
  speed?: number;
  /** 흐르기 시작 전·한 바퀴 돈 뒤의 정지 시간 */
  pauseMs?: number;
  /** 원문과 반복본 사이 간격(px) */
  gap?: number;
}

const DEFAULT_SPEED = 36;
const DEFAULT_PAUSE_MS = 1800;
const DEFAULT_GAP = 56;
/** 트랙 폭 — 어떤 제목보다 넓기만 하면 된다. 뷰포트가 잘라 보이지 않는다 */
const TRACK_WIDTH = 10000;

/**
 * 한 줄 제목 — 폭에 다 들어가면 그대로, 넘치면 왼쪽으로 흘러 끝을 보여준다(2026-09-16).
 *
 * - 넘칠 때만 움직인다. 들어가는 제목까지 흐르면 화면이 쉴 새 없이 움직여 보인다.
 * - "움직임 줄이기"가 켜진 기기에서는 흐르지 않고 말줄임으로 자른다 — 낭독기에는 항상 전문이 읽힌다.
 * - transform 기반이라 스크롤뷰의 첫 탭 소비 문제(TopicMarqueeRow 참고)가 없다. 만질 일이 없는 글자에만 쓴다.
 */
export default function MarqueeText({
  text,
  style,
  speed = DEFAULT_SPEED,
  pauseMs = DEFAULT_PAUSE_MS,
  gap = DEFAULT_GAP,
}: MarqueeTextProps) {
  const [viewportWidth, setViewportWidth] = useState(0);
  const [textWidth, setTextWidth] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);
  const translateX = useAnimatedValue(0);

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (!cancelled) setReduceMotion(enabled);
      })
      .catch(() => {
        /* 조회 실패는 "줄이기 꺼짐"으로 본다 */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const overflows = viewportWidth > 0 && textWidth > viewportWidth;
  const shouldScroll = overflows && !reduceMotion;

  useEffect(() => {
    translateX.setValue(0);
    if (!shouldScroll) return;

    const distance = textWidth + gap;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(pauseMs),
        Animated.timing(translateX, {
          toValue: -distance,
          duration: (distance / speed) * 1000,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
        // 반복본이 원문 자리에 왔을 때 0으로 되감으면 이음새가 보이지 않는다
        Animated.timing(translateX, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [shouldScroll, textWidth, gap, pauseMs, speed, translateX]);

  const flat = StyleSheet.flatten(style) ?? {};
  const lineHeight = flat.lineHeight ?? (flat.fontSize ?? 16) * 1.3;

  const onViewportLayout = (event: LayoutChangeEvent) =>
    setViewportWidth(event.nativeEvent.layout.width);
  const onTextLayout = (event: LayoutChangeEvent) => setTextWidth(event.nativeEvent.layout.width);

  return (
    <View
      style={[styles.viewport, { height: lineHeight }]}
      onLayout={onViewportLayout}
      accessible
      accessibilityRole="text"
      accessibilityLabel={text}
    >
      {/* 자연 폭 측정용 — 보이지 않게 두고 폭만 잰다. 절대 배치만으로는 웹에서 컨테이너 폭에
          맞춰 줄어들어 "안 넘침"으로 잘못 재므로, 아주 넓은 트랙 안에 두어 글자가 제 폭을 갖게 한다 */}
      <View
        style={[styles.track, styles.measure]}
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Text style={[style, styles.noShrink]} numberOfLines={1} onLayout={onTextLayout}>
          {text}
        </Text>
      </View>

      {shouldScroll ? (
        <Animated.View
          style={[styles.track, { transform: [{ translateX }] }]}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Text style={[style, styles.noShrink]} numberOfLines={1}>
            {text}
          </Text>
          <Text style={[style, styles.noShrink, { marginLeft: gap }]} numberOfLines={1}>
            {text}
          </Text>
        </Animated.View>
      ) : (
        <Text
          style={style}
          numberOfLines={1}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {text}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  viewport: {
    overflow: 'hidden',
    justifyContent: 'center',
  },
  measure: {
    opacity: 0,
  },
  // 폭을 크게 잡아 두 벌의 글자가 컨테이너에 눌리지 않게 한다 — 뷰포트의 overflow hidden이 자른다
  track: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: TRACK_WIDTH,
    flexDirection: 'row',
  },
  noShrink: {
    flexShrink: 0,
  },
});
