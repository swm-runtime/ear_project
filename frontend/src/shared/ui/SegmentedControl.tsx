import { useEffect } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAnimatedValue } from '@/shared/hooks/useAnimatedValue';
import { motion, theme } from '@/shared/theme';
import GlassSurface, { GlassPill, HAS_LIQUID_GLASS } from '@/shared/ui/GlassSurface';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  options: SegmentOption<T>[];
  /** 선택값 — 호출부(보통 서버 응답·스토어)가 정한다. 탭 시점이 아니라 값이 바뀔 때 알약이 움직인다 */
  value: T;
  onChange: (value: T) => void;
  /** 전환 중 중복 탭 차단 */
  disabled?: boolean;
  accessibilityLabel: string;
  /** 칸 폭 — 라벨 길이에 맞춰 호출부가 정한다(전부 같은 폭이어야 알약이 옮겨갈 때 크기가 안 변한다) */
  segmentWidth?: number;
}

/**
 * 선택 알약 높이 = 섹션 제목 글자 높이(xl 28). 트랙은 테두리 1 + 안쪽 여백 3 을 더해 36 이 된다 —
 * 제목 줄(35)과 나란히 서고 알약 둘레로 여백이 눈에 띄게 남아 "트랙 안에 떠 있는 알약"으로 읽힌다
 */
const SEGMENT_HEIGHT = theme.font.size.xl;
const TRACK_BORDER = 1;
const TRACK_INSET = 3;
const DEFAULT_SEGMENT_WIDTH = 48;
/** 보이는 높이는 28 이고 44pt 는 hitSlop 으로 채운다(uiux 7) */
const SEGMENT_HIT_SLOP = {
  top: (theme.touchTarget.minHeight - SEGMENT_HEIGHT) / 2,
  bottom: (theme.touchTarget.minHeight - SEGMENT_HEIGHT) / 2,
};

/**
 * 세그먼트 컨트롤(HIG: Segmented controls) — 서로 배타적인 2~5개 뷰를 같은 자리에서 바꾼다. 탐색의 주간·월간·전체와
 * 라이브러리의 전체·미청취·완청이 같은 부품을 쓴다(2026-09-23 PM — 앱 안의 문법 통일, `docs/frontend/design.md` §5).
 *
 * - 트랙은 유리(GlassSurface regular — 캡슐 탭 바와 같은 재질, PM 2026-09-23 "blur 있는 리퀴드 글라스로") +
 *   hairline 윤곽. 그 위 선택 알약은 clear 유리 + 림(GlassPill).
 * - 선택 알약은 **하나가 미끄러진다**(snappy 스프링, 네이티브). iOS 26 은 유리 렌즈(GlassPill), 그 밑은 그림자로 뜬 흰 알약.
 * - 라벨 색은 알약이 그 칸에 겹친 만큼 회색 위에 검정을 겹쳐(두 겹 + 불투명도) 알약과 같은 프레임에 바뀐다.
 * - 라벨 굵기는 선택과 무관하게 같다 — 굵히면 폭이 변해 시선이 튄다.
 * - 선택은 색만이 아니라 알약(면)으로도 드러난다(uiux 7).
 */
export default function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  disabled = false,
  accessibilityLabel,
  segmentWidth = DEFAULT_SEGMENT_WIDTH,
}: SegmentedControlProps<T>) {
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  const indicatorX = useAnimatedValue(selectedIndex * segmentWidth);
  useEffect(() => {
    Animated.spring(indicatorX, {
      toValue: selectedIndex * segmentWidth,
      useNativeDriver: true,
      ...motion.spring.snappy,
    }).start();
  }, [indicatorX, selectedIndex, segmentWidth]);

  const indicatorStyle = [
    styles.indicator,
    { width: segmentWidth, transform: [{ translateX: indicatorX }] },
  ];

  return (
    <View style={styles.track} accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel}>
      <GlassSurface style={[StyleSheet.absoluteFill, styles.trackGlass]} />
      <View style={styles.trackBorder} pointerEvents="none" />
      {HAS_LIQUID_GLASS ? (
        <GlassPill style={indicatorStyle} />
      ) : (
        <Animated.View style={[indicatorStyle, styles.indicatorRaised]} pointerEvents="none" />
      )}
      {options.map((option, index) => {
        const isSelected = option.value === value;
        // 알약이 이 칸에 얼마나 겹쳐 있는가(0~1) — 검정 글자의 불투명도
        const selectedOpacity = indicatorX.interpolate({
          inputRange: [(index - 1) * segmentWidth, index * segmentWidth, (index + 1) * segmentWidth],
          outputRange: [0, 1, 0],
          extrapolate: 'clamp',
        });
        return (
          <Pressable
            key={option.value}
            style={[styles.segment, { width: segmentWidth }]}
            onPress={() => onChange(option.value)}
            hitSlop={SEGMENT_HIT_SLOP}
            disabled={disabled}
            accessibilityRole="radio"
            accessibilityLabel={option.label}
            accessibilityState={{ checked: isSelected, disabled }}
          >
            <Text style={styles.label}>{option.label}</Text>
            <Animated.Text
              style={[styles.label, styles.labelSelected, { opacity: selectedOpacity }]}
              accessibilityElementsHidden
              importantForAccessibility="no"
            >
              {option.label}
            </Animated.Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  // 트랙 자체는 투명(유리가 깐다). 테두리는 별도 뷰 — 유리를 clip 하는 뷰에 border 를 주면 안쪽이 잘린다
  track: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    backgroundColor: 'transparent',
    // 바깥 트랙도 알약 — 안쪽만 둥글면 모서리에 각진 여백이 남는다
    borderRadius: theme.radius.full,
    padding: TRACK_INSET + TRACK_BORDER,
  },
  trackGlass: {
    borderRadius: theme.radius.full,
    overflow: 'hidden',
  },
  trackBorder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: theme.radius.full,
    borderWidth: TRACK_BORDER,
    borderColor: 'rgba(0, 0, 0, 0.10)',
  },
  segment: {
    height: SEGMENT_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  indicator: {
    position: 'absolute',
    top: TRACK_INSET + TRACK_BORDER,
    left: TRACK_INSET + TRACK_BORDER,
    height: SEGMENT_HEIGHT,
    borderRadius: theme.radius.full,
  },
  // iOS 26 미만·Android — 흰 면을 부드러운 그림자로 띄운다. `shadow*` 대신 boxShadow(RN 0.86·웹 공통)
  indicatorRaised: {
    backgroundColor: theme.color.background,
    boxShadow: '0 1px 4px rgba(0, 0, 0, 0.14)',
  },
  label: {
    fontSize: theme.font.size.xs,
    fontWeight: '600',
    color: theme.color.textSecondary,
  },
  // 검정 글자는 회색 글자 위에 겹친다 — 같은 자리·같은 크기라 불투명도만으로 색이 섞인다
  labelSelected: {
    position: 'absolute',
    color: theme.color.textPrimary,
  },
});
