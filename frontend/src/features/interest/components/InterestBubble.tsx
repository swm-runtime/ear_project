import { useEffect } from 'react';
import { Animated, Easing, Image, Pressable, StyleSheet, View } from 'react-native';

import { useAnimatedValue } from '@/shared/hooks/useAnimatedValue';
import { motion, theme } from '@/shared/theme';

import { topicImageSource } from './TopicChip';

interface InterestBubbleProps {
  name: string;
  /** 지름(pt) — 배치는 부모(InterestBubbleField)가 정한다 */
  size: number;
  /**
   * 원의 중심(밭 좌표) — 배치 계산(bubble-layout)이 이웃을 밀어낸 결과다. 바뀌면 스프링으로 옮겨 간다.
   * 레이아웃이 아니라 translate 라 네이티브 드라이버로 돈다
   */
  cx: number;
  cy: number;
  isSelected: boolean;
  /** 상한까지 다 골랐을 때 남은 주제 — 흐려진다. 탭하면 선택되지 않고 상한 토스트가 뜬다(PM 2026-10-10 01:08) */
  isDimmed: boolean;
  /** 둥실 모션의 박자를 버블마다 다르게 — 같은 박자로 떠다니면 한 덩어리처럼 출렁인다 */
  index: number;
  /** OS "동작 줄이기" — null(아직 모름)도 움직이지 않는 쪽으로 다룬다 */
  reduceMotion: boolean | null;
  onPress: () => void;
}

/** 선택되면 커지고 상한 뒤 남은 주제는 물러난다 — 배치 계산도 같은 배율로 이웃을 밀어낸다 */
export const SCALE_SELECTED = 1.16;
export const SCALE_DIMMED = 0.9;
/**
 * 상한 뒤 남은 버블을 흐리는 흰 막의 농도. 버블 전체를 반투명하게 만들면 밑에 깔린 그림자가 사진을 뚫고 비쳤다 —
 * Android 는 원 그림자를 다각형으로 근사해 육각형처럼 보였다(PM 2026-10-10 01:14). 그래서 투명도 대신 위에 흰 막을 덮는다
 */
const DIMMED_WASH = 0.62;
/** 위아래로 떠다니는 폭(pt) — 원끼리 빈틈이 6pt 라 그보다 훨씬 작게(붙어 있는 이웃과 겹쳐 보이지 않게) */
const FLOAT_DISTANCE = 2;

/**
 * 관심 주제 버블(PM 2026-10-09 "D로 가는데 설정 관심 주제 관리만") — 원형 사진 + 가운데 이름. 애플 뮤직 첫 실행의
 * 아티스트 버블 문법: 고르면 튕기며 커지고 그림자가 깊어지며, 상한까지 고르면 나머지가 작아지며 흐려진다.
 * 버블마다 다른 박자로 5pt 떠다닌다. 크기·위치·불투명도 전부 transform·opacity 라 네이티브 드라이버로 돈다.
 *
 * 선택은 색이 아니라 **크기·그림자**로 구분한다(design.md "색만으로 상태를 구분하지 않는다") — 종전 사진 알약은
 * 막 농도(34→62%)만 바뀌어 어두운 사진에서는 선택 여부가 보이지 않았다(PM 10-09 스샷). 이중 링·체크 배지는
 * PM 이 뺐다(2026-10-09 22:55 "체크 표시 없애, 겉에 칠해지는 거 없애")
 */
export default function InterestBubble({
  name,
  size,
  cx,
  cy,
  isSelected,
  isDimmed,
  index,
  reduceMotion,
  onPress,
}: InterestBubbleProps) {
  const targetScale = isSelected ? SCALE_SELECTED : isDimmed ? SCALE_DIMMED : 1;
  const scale = useAnimatedValue(targetScale);
  const press = useAnimatedValue(1);
  const wash = useAnimatedValue(isDimmed ? DIMMED_WASH : 0);
  const float = useAnimatedValue(0);
  const posX = useAnimatedValue(cx - size / 2);
  const posY = useAnimatedValue(cy - size / 2);

  useEffect(() => {
    // 밀려나는 이웃은 커지는 버블과 같은 박자로 비켜선다 — 위치는 출렁이지 않게 smooth
    Animated.parallel([
      Animated.spring(posX, {
        toValue: cx - size / 2,
        ...motion.spring.smooth,
        useNativeDriver: true,
      }),
      Animated.spring(posY, {
        toValue: cy - size / 2,
        ...motion.spring.smooth,
        useNativeDriver: true,
      }),
    ]).start();
  }, [posX, posY, cx, cy, size]);

  useEffect(() => {
    Animated.spring(scale, {
      toValue: targetScale,
      ...motion.spring.jelly,
      useNativeDriver: true,
    }).start();
  }, [scale, targetScale]);

  useEffect(() => {
    Animated.timing(wash, {
      toValue: isDimmed ? DIMMED_WASH : 0,
      duration: motion.duration.normal,
      useNativeDriver: true,
    }).start();
  }, [wash, isDimmed]);

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

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: size,
        height: size,
        zIndex: isSelected ? 2 : 1,
        transform: [
          { translateX: posX },
          { translateY: Animated.add(posY, float) },
          { scale: Animated.multiply(scale, press) },
        ],
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
        <View
          style={[
            styles.photoFrame,
            { borderRadius: radius },
            // 흐린 버블은 그림자를 두지 않는다 — 흰 막 아래로 그림자 윤곽이 비치지 않게
            isSelected ? styles.shadowSelected : isDimmed ? null : styles.shadow,
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
        {/* 흰 막 — 사진·이름을 함께 덮어 한 덩어리로 물러난다(불투명 레이어라 밑이 비치지 않는다) */}
        <Animated.View
          pointerEvents="none"
          style={[styles.wash, { borderRadius: radius, opacity: wash }]}
        />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fill: {
    width: '100%',
    height: '100%',
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
  wash: {
    ...StyleSheet.absoluteFill,
    backgroundColor: theme.color.background,
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
});
