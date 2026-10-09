import { useEffect } from 'react';
import { Animated, Easing, Image, Pressable, StyleSheet, View } from 'react-native';

import { useAnimatedValue } from '@/shared/hooks/useAnimatedValue';
import { motion, theme } from '@/shared/theme';

import { topicImageSource } from './TopicChip';

interface InterestBubbleProps {
  name: string;
  /** 지름(pt) — 배치는 부모(InterestBubbleField)가 정한다 */
  size: number;
  isSelected: boolean;
  /** 상한까지 다 골랐을 때 남은 주제 — 흐려지지만 탭은 받는다(막는 것은 저장, uiux 4.1 · 변경 2026-08-11) */
  isDimmed: boolean;
  /** 둥실 모션의 박자를 버블마다 다르게 — 같은 박자로 떠다니면 한 덩어리처럼 출렁인다 */
  index: number;
  /** OS "동작 줄이기" — null(아직 모름)도 움직이지 않는 쪽으로 다룬다 */
  reduceMotion: boolean | null;
  onPress: () => void;
}

/** 선택되면 커지고 상한 뒤 남은 주제는 물러난다 — 위치를 밀지 않도록 크기는 transform 으로만 바꾼다 */
const SCALE_SELECTED = 1.16;
const SCALE_DIMMED = 0.9;
const DIMMED_OPACITY = 0.42;
/** 위아래로 떠다니는 폭(pt) */
const FLOAT_DISTANCE = 5;
const RING_INNER = 3;
const RING_OUTER = 2.5;
const BADGE_SIZE = 28;

/**
 * 관심 주제 버블(PM 2026-10-09 "D로 가는데 설정 관심 주제 관리만") — 원형 사진 + 가운데 이름. 애플 뮤직 첫 실행의
 * 아티스트 버블 문법: 고르면 튕기며 커지고(흰·검정 이중 링 + 체크 배지), 상한까지 고르면 나머지가 작아지며 흐려진다.
 * 버블마다 다른 박자로 5pt 떠다닌다. 크기·위치·불투명도 전부 transform·opacity 라 네이티브 드라이버로 돈다.
 *
 * 선택은 색이 아니라 **링·체크·크기**로 구분한다(design.md "색만으로 상태를 구분하지 않는다") — 종전 사진 알약은
 * 막 농도(34→62%)만 바뀌어 어두운 사진에서는 선택 여부가 보이지 않았다(PM 10-09 스샷).
 */
export default function InterestBubble({
  name,
  size,
  isSelected,
  isDimmed,
  index,
  reduceMotion,
  onPress,
}: InterestBubbleProps) {
  const targetScale = isSelected ? SCALE_SELECTED : isDimmed ? SCALE_DIMMED : 1;
  const scale = useAnimatedValue(targetScale);
  const press = useAnimatedValue(1);
  const selection = useAnimatedValue(isSelected ? 1 : 0);
  const fade = useAnimatedValue(isDimmed ? DIMMED_OPACITY : 1);
  const float = useAnimatedValue(0);

  useEffect(() => {
    Animated.spring(scale, {
      toValue: targetScale,
      ...motion.spring.jelly,
      useNativeDriver: true,
    }).start();
  }, [scale, targetScale]);

  useEffect(() => {
    Animated.spring(selection, {
      toValue: isSelected ? 1 : 0,
      ...motion.spring.snappy,
      useNativeDriver: true,
    }).start();
  }, [selection, isSelected]);

  useEffect(() => {
    Animated.timing(fade, {
      toValue: isDimmed ? DIMMED_OPACITY : 1,
      duration: motion.duration.normal,
      useNativeDriver: true,
    }).start();
  }, [fade, isDimmed]);

  useEffect(() => {
    if (reduceMotion !== false) {
      float.setValue(0);
      return undefined;
    }
    // 4.2~5.0초 주기, 시작점도 엇갈린다 — 결정적 값이라 다시 들어와도 같은 리듬이다
    const half = (2100 + ((index * 130) % 400)) as number;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(float, {
          toValue: -FLOAT_DISTANCE,
          duration: half,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(float, {
          toValue: 0,
          duration: half,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    const timer = setTimeout(() => loop.start(), (index * 370) % 2300);
    return () => {
      clearTimeout(timer);
      loop.stop();
    };
  }, [float, index, reduceMotion]);

  const pressTo = (value: number) =>
    Animated.spring(press, {
      toValue: value,
      ...motion.spring.snappy,
      useNativeDriver: true,
    }).start();

  const radius = size / 2;
  const outer = size + (RING_INNER + RING_OUTER) * 2;
  const inner = size + RING_INNER * 2;

  return (
    <Animated.View
      style={{
        width: size,
        height: size,
        opacity: fade,
        transform: [{ translateY: float }, { scale: Animated.multiply(scale, press) }],
      }}
    >
      <Pressable
        onPress={onPress}
        onPressIn={() => pressTo(0.93)}
        onPressOut={() => pressTo(1)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: isSelected }}
        accessibilityLabel={name}
        style={styles.fill}
      >
        {/* 이중 링(검정 바깥 · 흰 안쪽) — 사진 뒤에 깔아 사진 둘레로만 보인다 */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.ring,
            {
              width: outer,
              height: outer,
              borderRadius: outer / 2,
              top: -(RING_INNER + RING_OUTER),
              left: -(RING_INNER + RING_OUTER),
              borderWidth: RING_OUTER,
              opacity: selection,
            },
          ]}
        />
        <Animated.View
          pointerEvents="none"
          style={[
            styles.ringInner,
            {
              width: inner,
              height: inner,
              borderRadius: inner / 2,
              top: -RING_INNER,
              left: -RING_INNER,
              opacity: selection,
            },
          ]}
        />
        <View
          style={[
            styles.photoFrame,
            { borderRadius: radius },
            isSelected ? styles.shadowSelected : styles.shadow,
          ]}
        >
          <View style={[styles.photoClip, { borderRadius: radius }]}>
            <Image source={topicImageSource(name)} resizeMode="cover" style={styles.photo} />
            <View style={styles.scrim} />
          </View>
        </View>
        <View style={styles.labelBox} pointerEvents="none">
          <Animated.Text
            style={[styles.label, size >= 106 && styles.labelLarge]}
            numberOfLines={2}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
          >
            {name}
          </Animated.Text>
        </View>
        <Animated.View
          pointerEvents="none"
          style={[styles.badge, { transform: [{ scale: selection }] }]}
        >
          <View style={styles.check}>
            <View style={styles.checkShort} />
            <View style={styles.checkLong} />
          </View>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fill: {
    width: '100%',
    height: '100%',
  },
  ring: {
    position: 'absolute',
    borderColor: theme.color.primary,
  },
  ringInner: {
    position: 'absolute',
    backgroundColor: theme.color.background,
  },
  photoFrame: {
    ...StyleSheet.absoluteFill,
    backgroundColor: theme.color.surface,
  },
  shadow: {
    shadowColor: '#000000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  shadowSelected: {
    shadowColor: '#000000',
    shadowOpacity: 0.28,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  photoClip: {
    ...StyleSheet.absoluteFill,
    overflow: 'hidden',
  },
  /** 퍼센트 크기를 같이 준다 — 웹에서 inset 만으로는 원본 크기가 남는다(TopicChip 과 같은 규칙) */
  photo: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
  },
  // 이름이 어떤 사진 위에서도 읽히게 — 종전 알약의 34% 로는 IT·개발·데이터·AI 사진에서 글자가 묻혔다
  scrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.46)',
  },
  labelBox: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.sm + 2,
  },
  label: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.3,
    textAlign: 'center',
    color: theme.color.onPrimary,
    textShadowColor: theme.color.photoTextShadow,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  labelLarge: {
    fontSize: 16,
  },
  badge: {
    position: 'absolute',
    top: 2,
    right: 0,
    width: BADGE_SIZE,
    height: BADGE_SIZE,
    borderRadius: BADGE_SIZE / 2,
    backgroundColor: theme.color.primary,
    borderWidth: 2.5,
    borderColor: theme.color.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // 체크 — 글리프(✓)는 폰트마다 굵기·위치가 달라 막대 두 개로 그린다(design.md §5)
  check: {
    width: 12,
    height: 9,
    transform: [{ rotate: '-45deg' }, { translateY: -1 }],
  },
  checkShort: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 2.4,
    height: 6,
    borderRadius: 1.2,
    backgroundColor: theme.color.onPrimary,
  },
  checkLong: {
    position: 'absolute',
    left: 0,
    bottom: 3,
    width: 12,
    height: 2.4,
    borderRadius: 1.2,
    backgroundColor: theme.color.onPrimary,
  },
});
