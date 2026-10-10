import { useEffect } from 'react';
import { Animated, Image, Pressable, StyleSheet, View } from 'react-native';

import { useAnimatedValue } from '@/shared/hooks/useAnimatedValue';
import { motion, theme } from '@/shared/theme';

import { topicImageSource } from './TopicChip';

interface InterestBubbleProps {
  name: string;
  /** 기본 지름(pt) — 자리·배율은 부모(InterestBubbleField)의 물리가 transform 으로 준다 */
  size: number;
  isSelected: boolean;
  /** 상한까지 다 골랐을 때 남은 주제 — 흐려진다. 탭하면 선택되지 않고 상한 토스트가 뜬다(PM 2026-10-10 01:08) */
  isDimmed: boolean;
  onPress: () => void;
}

/** 선택되면 커지고 상한 뒤 남은 주제는 물러난다 — 물리가 이 배율로 이웃을 밀어낸다(Magnetic 은 4/3) */
export const SCALE_SELECTED = 1.2;
export const SCALE_DIMMED = 0.88;
/**
 * 상한 뒤 남은 버블을 흐리는 흰 막의 농도. 버블 전체를 반투명하게 만들면 밑에 깔린 그림자가 사진을 뚫고 비쳤다 —
 * Android 는 원 그림자를 다각형으로 근사해 육각형처럼 보였다(PM 2026-10-10 01:14). 그래서 투명도 대신 위에 흰 막을 덮는다
 */
const DIMMED_WASH = 0.62;

/**
 * 관심 주제 버블의 얼굴 — 원형 사진 + 가운데 이름 + 흐림 막. **자리와 크기 변화는 그리지 않는다** — 부모의 물리
 * (Reanimated, UI 스레드)가 바깥 틀의 transform 으로 준다(PM 2026-10-10 "버블 최대한 좋게" — 애플 뮤직 방식).
 *
 * 선택은 색이 아니라 **크기·그림자**로 구분한다(design.md "색만으로 상태를 구분하지 않는다"). 이중 링·체크 배지는
 * PM 이 뺐다(2026-10-09 22:55)
 */
export default function InterestBubble({
  name,
  size,
  isSelected,
  isDimmed,
  onPress,
}: InterestBubbleProps) {
  const wash = useAnimatedValue(isDimmed ? DIMMED_WASH : 0);

  useEffect(() => {
    Animated.timing(wash, {
      toValue: isDimmed ? DIMMED_WASH : 0,
      duration: motion.duration.normal,
      useNativeDriver: true,
    }).start();
  }, [wash, isDimmed]);

  const radius = size / 2;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: isSelected }}
      accessibilityLabel={name}
      style={({ pressed }) => [{ width: size, height: size }, pressed && styles.pressed]}
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
          style={[styles.label, size >= 104 && styles.labelLarge]}
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
  );
}

const styles = StyleSheet.create({
  // 누르는 동안 살짝 옅어진다 — 크기는 물리가 쥐고 있어 투명도로만 알린다
  pressed: {
    opacity: 0.82,
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
    color: theme.color.onPhoto,
    textShadowColor: theme.color.photoTextShadow,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  labelLarge: {
    fontSize: 16,
  },
});
