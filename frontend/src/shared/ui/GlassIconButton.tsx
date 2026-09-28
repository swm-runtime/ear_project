import type { ReactNode } from 'react';
import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import GlassCapsule, { HEADER_CONTROL_HEIGHT } from '@/shared/ui/GlassCapsule';

interface GlassIconButtonProps {
  onPress: () => void;
  accessibilityLabel: string;
  /** 아이콘 — 도형(SVG)을 넘긴다. 글자 글리프는 폰트마다 굵기·위치가 달라 쓰지 않는다(design.md §5) */
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}

/**
 * 유리 원 안의 아이콘 버튼(40pt — 머리 줄 컨트롤과 같은 높이) — 상세 화면의 뒤로·공유가 쓴다
 * (PM 2026-09-27 23:13 "상세정보에 있는 < 도 리퀴드 글라스 버튼, 공유 버튼하고").
 *
 * 재질은 `GlassCapsule` 이 준다: iOS 26 리퀴드 글라스, 그 밑은 블러 + 흰 틴트. 유리는 밑에 지나가는 콘텐츠가
 * 있어야 유리이므로 목록·아트워크 위에 떠 있는 머리 줄에만 쓴다(design.md §3). 보이는 40 을 hitSlop 으로 44 로 채운다.
 */
export default function GlassIconButton({
  onPress,
  accessibilityLabel,
  children,
  style,
}: GlassIconButtonProps) {
  return (
    <GlassCapsule style={[styles.circle, style]}>
      <Pressable
        style={styles.pressable}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        hitSlop={HIT_SLOP}
      >
        {children}
      </Pressable>
    </GlassCapsule>
  );
}

/** 보이는 40 을 터치 44 로 채운다(design.md §6) */
const HIT_SLOP = 2;

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
