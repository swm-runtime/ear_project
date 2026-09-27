import { useEffect } from 'react';
import { Animated, Pressable, StyleSheet } from 'react-native';

import { useAnimatedValue } from '@/shared/hooks/useAnimatedValue';
import { motion, theme } from '@/shared/theme';
import GlassCapsule, { HEADER_CONTROL_HEIGHT } from '@/shared/ui/GlassCapsule';
import MagnifierIcon, { SEARCH_ICON_SIZE } from '@/shared/ui/MagnifierIcon';

interface GlassSearchButtonProps {
  onPress: () => void;
  accessibilityLabel: string;
}

/**
 * 유리 원 안의 돋보기 — 스크롤해 접힌 시스템 바의 왼쪽(PM 2026-09-28 03:44 "내렸을 때 제목 중앙, 왼쪽에 검색 리퀴드 버튼").
 * 나타날 때 작게 시작해 튀어 오른다(snappy 스프링 — 애플 바 버튼이 나타나는 느낌, "생길 때 애니메이션 있어야"). 네이티브 드라이버.
 * **투명도는 건드리지 않는다** — 유리(UIGlassEffect)는 조상 alpha 가 1 미만이면 효과가 안 그려져 평면으로 남았다
 * (03:58 PM "리퀴드가 적용 안 된 거 같아"). 크기만 키운다
 * 모양은 닫기 버튼(GlassCloseButton)과 같은 40pt 유리 원
 */
export default function GlassSearchButton({ onPress, accessibilityLabel }: GlassSearchButtonProps) {
  const appear = useAnimatedValue(0);
  useEffect(() => {
    Animated.spring(appear, { toValue: 1, ...motion.spring.snappy, useNativeDriver: true }).start();
  }, [appear]);

  return (
    <Animated.View
      style={{
        transform: [{ scale: appear.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) }],
      }}
    >
      <GlassCapsule style={styles.circle}>
        <Pressable
          style={styles.pressable}
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          hitSlop={4}
        >
          <MagnifierIcon size={SEARCH_ICON_SIZE} color={theme.color.textPrimary} />
        </Pressable>
      </GlassCapsule>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  circle: {
    width: HEADER_CONTROL_HEIGHT,
    height: HEADER_CONTROL_HEIGHT,
  },
  pressable: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
