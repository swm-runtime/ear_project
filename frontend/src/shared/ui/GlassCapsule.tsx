import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { theme } from '@/shared/theme';
import GlassSurface from '@/shared/ui/GlassSurface';

interface GlassCapsuleProps {
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
  pointerEvents?: 'auto' | 'none' | 'box-none';
}

/**
 * 유리 캡슐 — 검색창·잔여 링처럼 **콘텐츠 위에 떠 있는 작은 컨트롤**의 바탕(2026-09-24 PM "리퀴드 글라스 처리").
 * 탭 바 캡슐·필터 원과 같은 재질(GlassSurface regular) + hairline 윤곽. 자식은 그 위에 그려진다.
 * 크기·여백은 호출부 style 이 정한다(둥근 정도는 항상 `full`).
 * 항상 유리다 — "맨 위에선 면, 내리면 유리" 분기는 하루 만에 폐기했다(2026-09-25 16:30 "그냥 blur 처리하자")
 */
export default function GlassCapsule({ style, children, pointerEvents }: GlassCapsuleProps) {
  return (
    <View style={[styles.capsule, style]} pointerEvents={pointerEvents}>
      <GlassSurface style={[StyleSheet.absoluteFill, styles.glass]} />
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
