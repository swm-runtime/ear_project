import { useEffect, useMemo } from 'react';
import { Animated, Image, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Line, Rect } from 'react-native-svg';

import { useAnimatedValue } from '@/shared/hooks/useAnimatedValue';
import { motion, theme } from '@/shared/theme';

import { INTEREST_COPY } from '../interest.copy';
import { topicImageSource } from '../interest.images';

interface InterestBubbleProps {
  name: string;
  /** 사진 키 — slug 먼저, 없으면 `name`으로 찾는다(interest.images.ts, KAN-195) */
  slug: string | null;
  /** 기본 지름(pt) — 자리·배율은 부모(InterestBubbleField)의 물리가 transform 으로 준다 */
  size: number;
  isSelected: boolean;
  /** 상한까지 다 골랐을 때 남은 주제 — 흐려진다. 탭하면 선택되지 않고 상한 토스트가 뜬다(PM 2026-10-10 01:08) */
  isDimmed: boolean;
  /**
   * 자동 확장으로 들어온 주제(source=auto_expand, KAN-181) — 사진 위에 빗금(애플식 "창문 블라인드")을 덮어
   * 직접 고른 주제와 구분한다. 링·체크 배지는 쓰지 않는다(PM 2026-10-09 22:55와 같은 결) — 빗금 한 겹이다.
   */
  isAutoExpanded: boolean;
  onPress: () => void;
}

/**
 * 빗금 — 흰 선(블라인드 살), 반투명. 간격·굵기는 버블 지름과 무관하게 일정하게.
 * 밝은 사진(IT·개발 같은 코드 이미지) 위에서도 또렷하게: 아래 옅은 어두운 판(블라인드 사이 그늘)을
 * 깔고 그 위에 흰 살을 얹는다 — 흰 선만으로는 밝은 사진에 묻힌다(2026-10-14 실기기 확인, juho).
 *
 * **`<Pattern patternTransform="rotate(45)">` 로 그리지 않는다** — react-native-svg 15.x 에서 회전 패턴이
 * 기기에 따라 아예 안 그려졌다(2026-10-14 대비·그늘 보강 뒤에도 실기기 미표시, juho 2026-10-15). 지름(size)으로
 * 45° 대각선 Line 을 직접 깔아 패턴 엔진 의존을 없앴다(앱 안에 Pattern 쓰는 검증된 전례도 여기뿐이었다).
 */
const HATCH_GAP = 7;
const HATCH_STROKE = 2;
const HATCH_OPACITY = 0.55;
/** 블라인드 사이 그늘 — 흰 살이 어떤 사진 위에서도 뜨게 하는 옅은 어두운 판 */
const HATCH_SCRIM_OPACITY = 0.22;

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
  slug,
  size,
  isSelected,
  isDimmed,
  isAutoExpanded,
  onPress,
}: InterestBubbleProps) {
  const wash = useAnimatedValue(isDimmed ? DIMMED_WASH : 0);
  /**
   * 45° 대각선 살 — 반대각선 x+y=t 의 가족을 수직 간격 HATCH_GAP(=> t 간격 GAP·√2)로 깔고, 각 선을 버블
   * 정사각형(size) 안으로 자른다. 원 밖 삐침은 hatchClip(overflow:hidden·둥근 모서리)이 자른다.
   */
  const hatchLines = useMemo(() => {
    const step = HATCH_GAP * Math.SQRT2;
    const lines: { x1: number; y1: number; x2: number; y2: number }[] = [];
    for (let t = step; t < size * 2; t += step) {
      lines.push(
        t <= size
          ? { x1: t, y1: 0, x2: 0, y2: t }
          : { x1: size, y1: t - size, x2: t - size, y2: size },
      );
    }
    return lines;
  }, [size]);

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
      accessibilityLabel={isAutoExpanded ? `${name}, ${INTEREST_COPY.autoBadgeA11y}` : name}
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
          <Image source={topicImageSource({ slug, name })} resizeMode="cover" style={styles.photo} />
          <View style={styles.scrim} />
        </View>
      </View>
      {/* 자동 확장 주제 — 사진 위 빗금("창문 블라인드"). 이름은 위에 그대로 올라 읽힌다(빗금은 label 아래) */}
      {isAutoExpanded ? (
        <View style={[styles.hatchClip, { borderRadius: radius }]} pointerEvents="none">
          {/* 숫자 지름 — react-native-svg 는 absoluteFill 안에서 width="100%" 를 못 잡아 SVG 가 0 으로
              안 그려지는 함정이 있다(2026-10-14, juho). 그늘 판을 먼저 깔고 그 위에 45° 살을 직접 올린다 */}
          <Svg width={size} height={size}>
            {/* 블라인드 사이 그늘 — 밝은 사진 위에서도 흰 살이 떠 보이게 옅은 어두운 판을 먼저 깐다 */}
            <Rect x={0} y={0} width={size} height={size} fill="#000000" fillOpacity={HATCH_SCRIM_OPACITY} />
            {hatchLines.map((line, index) => (
              <Line
                key={index}
                x1={line.x1}
                y1={line.y1}
                x2={line.x2}
                y2={line.y2}
                stroke={theme.color.onPhoto}
                strokeWidth={HATCH_STROKE}
                strokeOpacity={HATCH_OPACITY}
              />
            ))}
          </Svg>
        </View>
      ) : null}
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
  // 빗금 레이어 — 원 바깥으로 삐져나가지 않게 둥근 클립. 사진 위·이름 아래
  hatchClip: {
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
