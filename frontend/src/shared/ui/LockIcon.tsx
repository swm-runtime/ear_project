import type { ColorValue } from 'react-native';

import { useResolvedColor } from '@/shared/theme';

import LockGlyph from './LockGlyph';

interface LockIconProps {
  size: number;
  color: ColorValue;
}

/**
 * 자물쇠 — 시리즈 잠긴 편 표시(KAN-294). Android·웹은 SVG(`LockGlyph`)로 그린다. iOS 는 `LockIcon.ios.tsx`(SF Symbols
 * `lock.fill`). expo-symbols 를 이 파일에서 부르지 않아 Android 번들에 Material Symbols 글꼴이 실리지 않는다
 */
export default function LockIcon({ size, color: colorValue }: LockIconProps) {
  // 토큰(iOS 동적 색)을 지금 모드의 문자열로 — SVG 는 문자열 색만 받는다(다크 모드)
  const color = useResolvedColor(colorValue);
  return <LockGlyph size={size} color={color} />;
}
