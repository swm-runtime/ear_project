import type { ColorValue } from 'react-native';

import { useResolvedColor } from '@/shared/theme';

import PlayPauseGlyph from './PlayPauseGlyph';

interface PlayPauseSymbolProps {
  kind: 'play' | 'pause';
  size: number;
  color: ColorValue;
}

/**
 * 재생·일시정지 — Android·웹. 둥근 SVG(애플 play.fill·pause.fill 인상, 직접 그림)로 그린다.
 * iOS 는 `PlayPauseSymbol.ios.tsx`(SF Symbols). expo-symbols 를 이 파일에서 부르지 않아 Android 번들에
 * Material Symbols 글꼴(약 1MB)이 실리지 않는다
 */
export default function PlayPauseSymbol({ kind, size, color: colorValue }: PlayPauseSymbolProps) {
  // 토큰(iOS 동적 색)을 지금 모드의 문자열로 — SVG·기호는 문자열 색만 받는다(다크 모드, 2026-10-10)
  const color = useResolvedColor(colorValue);
  return <PlayPauseGlyph kind={kind} size={size} color={color} />;
}
