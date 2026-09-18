import { useEffect, useId, useState } from 'react';
import type { LayoutChangeEvent, StyleProp, TextStyle } from 'react-native';
import { AccessibilityInfo, Animated, Easing, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, G, LinearGradient, Mask, Rect, Stop, Text as SvgText } from 'react-native-svg';

import { useAnimatedValue } from '@/shared/hooks/useAnimatedValue';
import { theme } from '@/shared/theme';

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
  /** 양끝에서 글자가 투명해지는 구간(px). 0이면 그냥 잘린다 */
  fadeWidth?: number;
}

const DEFAULT_SPEED = 36;
const DEFAULT_PAUSE_MS = 1800;
const DEFAULT_GAP = 56;
/** 글자 세 개 폭쯤 — 좁으면 마지막 글자가 반쯤 남은 채 가장자리에 부딪힌다(2026-09-17·18 PM 지적) */
const DEFAULT_FADE_WIDTH = 88;
/** 트랙 폭 — 어떤 제목보다 넓기만 하면 된다. 뷰포트가 잘라 보이지 않는다 */
const TRACK_WIDTH = 10000;
/** 한글·라틴 글자의 시각적 가운데는 기준선에서 글자 크기의 이 비율만큼 위다 — SVG 텍스트를 줄 가운데에 앉히는 값 */
const BASELINE_RATIO = 0.36;

const AnimatedG = Animated.createAnimatedComponent(G);
const AnimatedRect = Animated.createAnimatedComponent(Rect);

/**
 * 한 줄 제목 — 폭에 다 들어가면 그대로, 넘치면 왼쪽으로 흘러 끝을 보여준다(2026-09-16).
 *
 * - 넘칠 때만 움직인다. 들어가는 제목까지 흐르면 화면이 쉴 새 없이 움직여 보인다.
 * - "움직임 줄이기"가 켜진 기기에서는 흐르지 않고 말줄임으로 자른다 — 낭독기에는 항상 전문이 읽힌다.
 * - 흐르는 동안은 **SVG 텍스트 + 그라데이션 마스크**로 그린다(2026-09-17 PM) — 양끝에서 글자의 불투명도가
 *   0으로 내려가며 사라지고 나타난다. 배경색을 덧칠하는 방식이 아니라 사진 위에서도 된다. 마스크(MaskedView)는
 *   네이티브 모듈이라 못 쓰고, react-native-svg 의 Mask 는 iOS·Android·웹 모두 지원한다.
 * - 왼쪽 페이드는 글자가 움직이기 시작한 뒤에만 켜진다 — 멈춰 있는 첫 글자를 흐리면 안 된다.
 */
export default function MarqueeText({
  text,
  style,
  speed = DEFAULT_SPEED,
  pauseMs = DEFAULT_PAUSE_MS,
  gap = DEFAULT_GAP,
  fadeWidth = DEFAULT_FADE_WIDTH,
}: MarqueeTextProps) {
  const [viewportWidth, setViewportWidth] = useState(0);
  const [textWidth, setTextWidth] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);
  const translateX = useAnimatedValue(0);
  // 그라데이션·마스크 id 는 문서 안에서 유일해야 한다 — 같은 화면에 마퀴가 여럿이다
  const uid = `marquee${useId().replace(/[^a-zA-Z0-9]/g, '')}`;

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
          // SVG 의 translateX 프로퍼티를 움직인다 — 네이티브 드라이버는 transform 스타일에만 붙는다
          useNativeDriver: false,
        }),
        // 반복본이 원문 자리에 왔을 때 0으로 되감으면 이음새가 보이지 않는다
        Animated.timing(translateX, { toValue: 0, duration: 0, useNativeDriver: false }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [shouldScroll, textWidth, gap, pauseMs, speed, translateX]);

  const flat = StyleSheet.flatten(style) ?? {};
  const fontSize = flat.fontSize ?? 16;
  const lineHeight = flat.lineHeight ?? fontSize * 1.3;
  const color = typeof flat.color === 'string' ? flat.color : theme.color.textPrimary;
  const fontWeight = flat.fontWeight === undefined ? 'normal' : String(flat.fontWeight);

  const onViewportLayout = (event: LayoutChangeEvent) =>
    setViewportWidth(event.nativeEvent.layout.width);
  const onTextLayout = (event: LayoutChangeEvent) => setTextWidth(event.nativeEvent.layout.width);

  // 왼쪽 페이드 — 글자가 페이드 폭만큼 흘러 들어간 뒤 완전히 켜진다(멈춰 있는 처음엔 0)
  const leftFadeOpacity = translateX.interpolate({
    inputRange: [-fadeWidth, 0],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });
  const leftSolidOpacity = translateX.interpolate({
    inputRange: [-fadeWidth, 0],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  const fade = Math.min(fadeWidth, viewportWidth / 3);
  const baselineY = lineHeight / 2 + fontSize * BASELINE_RATIO;

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
        <Svg width={viewportWidth} height={lineHeight} pointerEvents="none">
          <Defs>
            {/*
              마스크는 **알파**로 쓴다(2026-09-18) — 밝기(luminance) 마스크는 회색을 감마 보정해 읽어서 플랫폼마다
              곡선이 달랐고, 웹에선 가장자리에 20~30% 불투명도가 남아 글자가 세로로 툭 끊겼다. 알파는 stopOpacity 가
              곧 글자의 불투명도라 어디서나 같다. 가장자리 20%는 완전 투명 — 경계에 닿기 전에 0이 된다
            */}
            <LinearGradient id={`${uid}-left`} x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0" />
              <Stop offset="0.2" stopColor="#FFFFFF" stopOpacity="0" />
              <Stop offset="0.45" stopColor="#FFFFFF" stopOpacity="0.18" />
              <Stop offset="0.7" stopColor="#FFFFFF" stopOpacity="0.55" />
              <Stop offset="1" stopColor="#FFFFFF" stopOpacity="1" />
            </LinearGradient>
            <LinearGradient id={`${uid}-right`} x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor="#FFFFFF" stopOpacity="1" />
              <Stop offset="0.3" stopColor="#FFFFFF" stopOpacity="0.55" />
              <Stop offset="0.55" stopColor="#FFFFFF" stopOpacity="0.18" />
              <Stop offset="0.8" stopColor="#FFFFFF" stopOpacity="0" />
              <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
            </LinearGradient>
            {/*
              마스크는 뷰포트보다 훨씬 넓게 잡는다 — 네이티브 SVG 는 마스크 영역 밖의 글자를 숨기지 않아, 흐르는
              글자가 페이드 뒤에서 잘린 채 드러났다(2026-09-18 실기기). 알파 마스크라 안 그린 곳은 투명이다.
              가운데(양끝 페이드 사이)만 불투명 흰색으로 채운다
            */}
            <Mask
              id={`${uid}-mask`}
              x={-TRACK_WIDTH}
              y="0"
              width={TRACK_WIDTH * 2 + viewportWidth}
              height={lineHeight}
              maskUnits="userSpaceOnUse"
              maskType="alpha"
            >
              <Rect
                x={fade}
                y="0"
                width={Math.max(0, viewportWidth - fade * 2)}
                height={lineHeight}
                fill="#FFFFFF"
              />
              {/* 왼쪽 페이드가 꺼져 있는 동안(멈춘 처음)은 왼쪽 끝까지 불투명 */}
              <AnimatedRect
                x="0"
                y="0"
                width={fade}
                height={lineHeight}
                fill="#FFFFFF"
                opacity={leftSolidOpacity}
              />
              <AnimatedRect
                x="0"
                y="0"
                width={fade}
                height={lineHeight}
                fill={`url(#${uid}-left)`}
                opacity={leftFadeOpacity}
              />
              <Rect
                x={viewportWidth - fade}
                y="0"
                width={fade}
                height={lineHeight}
                fill={`url(#${uid}-right)`}
              />
            </Mask>
          </Defs>
          <G mask={`url(#${uid}-mask)`}>
            <AnimatedG translateX={translateX}>
              <SvgText
                x="0"
                y={baselineY}
                fill={color}
                fontSize={fontSize}
                fontWeight={fontWeight}
                fontFamily={flat.fontFamily}
              >
                {text}
              </SvgText>
              <SvgText
                x={textWidth + gap}
                y={baselineY}
                fill={color}
                fontSize={fontSize}
                fontWeight={fontWeight}
                fontFamily={flat.fontFamily}
              >
                {text}
              </SvgText>
            </AnimatedG>
          </G>
        </Svg>
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
  // 폭을 크게 잡아 글자가 컨테이너에 눌리지 않게 한다 — 뷰포트의 overflow hidden이 자른다
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
