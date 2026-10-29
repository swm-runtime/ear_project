import { SymbolView } from 'expo-symbols';
import type { ColorValue } from 'react-native';

import { useResolvedColor } from '@/shared/theme';

import LockGlyph from './LockGlyph';

interface LockIconProps {
  size: number;
  color: ColorValue;
}

/**
 * 자물쇠 — 시리즈 잠긴 편 표시(KAN-294). **iOS 는 SF Symbols `lock.fill`**(애플 팟캐스트의 구독자 전용 편과 같은 기호 — design.md
 * "잠긴 편"). 기호를 그리지 못하면 SVG 로 그린다. Android·웹은 `LockIcon.tsx`(Material Symbols 글꼴을 싣지 않는다 —
 * `PlayPauseSymbol` 과 같은 이유)
 */
export default function LockIcon({ size, color: colorValue }: LockIconProps) {
  // 토큰(iOS 동적 색)을 지금 모드의 문자열로 — SVG·기호는 문자열 색만 받는다(다크 모드)
  const color = useResolvedColor(colorValue);
  return (
    <SymbolView
      name="lock.fill"
      size={size}
      tintColor={color}
      type="monochrome"
      fallback={<LockGlyph size={size} color={color} />}
    />
  );
}
