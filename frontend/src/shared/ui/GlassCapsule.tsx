import type { ReactNode } from 'react';
import { Animated, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { theme } from '@/shared/theme';
import { useHeaderSolidness } from '@/shared/ui/FloatingHeader';
import GlassSurface from '@/shared/ui/GlassSurface';

/**
 * 머리 줄 컨트롤 공통 높이 — 검색 캡슐·툴바 캡슐(링 + 필터)·탐색의 링 원이 전부 이 값(PM 2026-09-25 "높이 맞춰").
 * 44 터치 영역은 바깥 hitSlop·셀이 채운다
 */
export const HEADER_CONTROL_HEIGHT = 40;

interface GlassCapsuleProps {
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
  pointerEvents?: 'auto' | 'none' | 'box-none';
}

/**
 * 유리 캡슐 — 검색창·잔여 링처럼 **콘텐츠 위에 떠 있는 작은 컨트롤**의 바탕(2026-09-24 PM "리퀴드 글라스 처리").
 * 탭 바 캡슐·필터 원과 같은 재질(GlassSurface regular) + hairline 윤곽. 자식은 그 위에 그려진다.
 * 크기·여백은 호출부 style 이 정한다(둥근 정도는 항상 `full`).
 *
 * FloatingHeader 안에서 solidness 가 주어지면 **스크롤 맨 위에서는 면(surface)으로 덮고, 내리면 유리**가 드러난다
 * (PM 2026-09-25 결정 — 애플처럼 맨 위에선 일반 컴포넌트, 내리면 리퀴드). 덮개는 네이티브 드라이버 불투명도
 */
export default function GlassCapsule({ style, children, pointerEvents }: GlassCapsuleProps) {
  const solidness = useHeaderSolidness();
  return (
    <View style={[styles.capsule, style]} pointerEvents={pointerEvents}>
      <GlassSurface style={[StyleSheet.absoluteFill, styles.glass]} />
      {solidness ? (
        <Animated.View
          style={[StyleSheet.absoluteFill, styles.solid, { opacity: solidness }]}
          pointerEvents="none"
        />
      ) : null}
      <View style={styles.border} pointerEvents="none" />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  capsule: {
    borderRadius: theme.radius.full,
    backgroundColor: 'transparent',
  },
  glass: {
    borderRadius: theme.radius.full,
    overflow: 'hidden',
  },
  solid: {
    borderRadius: theme.radius.full,
    backgroundColor: theme.color.surface,
  },
  border: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: theme.radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0, 0, 0, 0.10)',
  },
});
