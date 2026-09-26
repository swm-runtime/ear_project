import MaskedView from '@react-native-masked-view/masked-view';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import { AccessibilityInfo, Animated, Easing, StyleSheet, Text, View } from 'react-native';

import { useAnimatedValue } from '@/shared/hooks/useAnimatedValue';

import {
  DEFAULT_FADE_WIDTH,
  DEFAULT_GAP,
  DEFAULT_PAUSE_MS,
  DEFAULT_SPEED,
  fadeStops,
  type MarqueeTextProps,
} from './MarqueeText.shared';

/**
 * 한 줄 제목 — 폭에 다 들어가면 그대로, 넘치면 왼쪽으로 흘러 끝을 보여준다(2026-09-16). **네이티브 판**(iOS·Android).
 *
 * 종전(SVG 텍스트 + SVG 마스크, JS 드라이버)은 흐르는 내내 **매 프레임 JS 스레드에서** SVG 속성을 갱신했다 —
 * 미니플레이어가 떠 있는 동안 JS 가 늘 바빠 플레이어 모션·끌기 같은 JS 구동 애니메이션이 전부 버벅였다
 * (PM 2026-09-26 17:48 "애니메이션들이 버벅이고 렉 걸린다"). 이제 글자는 보통 Text 두 벌을 `transform.translateX`
 * 로 흘리고(네이티브 드라이버), 양끝 페이드는 MaskedView + 그라데이션 마스크다. 흐르는 동안 JS 는 놀고 있다.
 *
 * - 넘칠 때만 움직인다. "움직임 줄이기"가 켜진 기기에서는 흐르지 않고 말줄임으로 자른다 — 낭독기에는 항상 전문.
 * - 왼쪽 페이드는 글자가 움직이기 시작한 뒤에만 켜진다 — 멈춰 있는 첫 글자를 흐리면 안 된다. 마스크 왼쪽 구간은
 *   그라데이션 위에 흰 면을 얹고 그 불투명도를 translateX 로 몬다(마스크 뷰도 네이티브 드라이버가 움직인다).
 * - 웹은 `MarqueeText.tsx`(SVG 판) — MaskedView 가 없다
 */
export default function MarqueeText({
  text,
  style,
  speed = DEFAULT_SPEED,
  pauseMs = DEFAULT_PAUSE_MS,
  gap = DEFAULT_GAP,
  fadeWidth = DEFAULT_FADE_WIDTH,
  isPaused = false,
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
  /** 한 바퀴 이동 거리 — 원문 + 간격. 반복본이 원문 자리에 오는 지점 */
  const distance = textWidth + gap;
  const shouldScroll = overflows && !reduceMotion;

  useEffect(() => {
    translateX.setValue(0);
    if (!shouldScroll || isPaused) return;

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
  }, [shouldScroll, isPaused, distance, pauseMs, speed, translateX]);

  const flat = StyleSheet.flatten(style) ?? {};
  const fontSize = flat.fontSize ?? 16;
  const lineHeight = flat.lineHeight ?? fontSize * 1.3;

  const onViewportLayout = (event: LayoutChangeEvent) =>
    setViewportWidth(event.nativeEvent.layout.width);
  const onTextLayout = (event: LayoutChangeEvent) => setTextWidth(event.nativeEvent.layout.width);

  const fade = Math.min(fadeWidth, viewportWidth / 3);
  /*
   * 왼쪽 페이드 — 글자가 페이드 폭만큼 흘러 들어간 뒤 켜지고(멈춰 있는 처음엔 0), 한 바퀴의 **마지막 페이드
   * 폭 구간에서 미리 꺼진다**(2026-09-18 PM). 그 구간엔 반복본의 머리가 왼쪽 끝으로 들어오는 중이라, 켜 둔 채
   * 0으로 되감으면 흐리던 첫 글자가 순간 진해지는 팝이 보인다. 미리 꺼 두면 멈추는 순간 이미 진하다
   */
  const leftFadeRange =
    distance > fade * 2
      ? { inputRange: [-distance, -distance + fade, -fade, 0], outputRange: [0, 1, 1, 0] }
      : { inputRange: [-fade, 0], outputRange: [1, 0] };
  // 마스크 왼쪽의 흰 면 — 1이면 페이드 없음(불투명), 0이면 밑의 그라데이션이 드러나 페이드
  const leftSolidOpacity = translateX.interpolate({
    inputRange: leftFadeRange.inputRange,
    outputRange: leftFadeRange.outputRange.map((v) => 1 - v),
    extrapolate: 'clamp',
  });

  const leftStops = fadeStops(true);
  const rightStops = fadeStops(false);
  const gradientColors = (stops: { opacity: number }[]) =>
    stops.map((stop) => `rgba(255, 255, 255, ${stop.opacity})`) as [string, string, ...string[]];
  const gradientLocations = (stops: { offset: number }[]) =>
    stops.map((stop) => stop.offset) as [number, number, ...number[]];

  return (
    <View
      style={[styles.viewport, { height: lineHeight }]}
      onLayout={onViewportLayout}
      accessible
      accessibilityRole="text"
      accessibilityLabel={text}
    >
      {/* 자연 폭 측정용 — 보이지 않게 두고 폭만 잰다. 아주 넓은 트랙 안에 두어 글자가 제 폭을 갖게 한다 */}
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
        <MaskedView
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
          maskElement={
            <View style={styles.mask}>
              {/* 왼쪽 페이드 구간 — 그라데이션 위에 흰 면. 멈춘 처음엔 면이 덮어 왼쪽 끝까지 불투명 */}
              <View style={{ width: fade }}>
                <LinearGradient
                  style={StyleSheet.absoluteFill}
                  colors={gradientColors(leftStops)}
                  locations={gradientLocations(leftStops)}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                />
                <Animated.View style={[StyleSheet.absoluteFill, styles.solid, { opacity: leftSolidOpacity }]} />
              </View>
              <View style={[styles.solid, styles.flex]} />
              <LinearGradient
                style={{ width: fade }}
                colors={gradientColors(rightStops)}
                locations={gradientLocations(rightStops)}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
              />
            </View>
          }
        >
          <Animated.View style={[styles.track, { transform: [{ translateX }] }]}>
            <Text style={[style, styles.noShrink]} numberOfLines={1}>
              {text}
            </Text>
            <Text style={[style, styles.noShrink, { marginLeft: gap }]} numberOfLines={1}>
              {text}
            </Text>
          </Animated.View>
        </MaskedView>
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
  track: {
    flexDirection: 'row',
    alignItems: 'center',
    height: '100%',
    // 두 벌이 뷰포트를 넘도록 — 줄어들면 "안 넘침"으로 잘못 잰다
    width: 10000,
  },
  measure: {
    position: 'absolute',
    opacity: 0,
  },
  noShrink: {
    flexShrink: 0,
  },
  mask: {
    flex: 1,
    flexDirection: 'row',
  },
  flex: {
    flex: 1,
  },
  solid: {
    backgroundColor: '#FFFFFF',
  },
});
