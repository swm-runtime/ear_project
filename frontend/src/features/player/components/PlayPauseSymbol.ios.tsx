import { SymbolView } from 'expo-symbols';
import type { ColorValue } from 'react-native';

import { useResolvedColor } from '@/shared/theme';

import PlayPauseGlyph from './PlayPauseGlyph';

/**
 * 재생·일시정지 — **플랫폼 기본 기호**를 쓴다(PM 2026-10-07 "애플 자체 플레이 아이콘, 중지 아이콘 쓰자").
 * iOS 는 SF Symbols `play.fill`·`pause.fill`(애플 뮤직·팟캐스트와 같은 모양). 기호를 그리지 못하면 둥근 SVG 로 그린다.
 * **Android·웹은 `PlayPauseSymbol.tsx`** — expo-symbols 의 Android 구현은 Material Symbols **속 빈** 글꼴(약 1MB)을
 * 불러와 그려서(로딩 중 빈칸) 쓰지 않는다(PM 2026-10-07 후보 비교)
 */
const SYMBOL_NAME = {
  play: 'play.fill',
  pause: 'pause.fill',
} as const;

interface PlayPauseSymbolProps {
  kind: 'play' | 'pause';
  size: number;
  color: ColorValue;
}

export default function PlayPauseSymbol({ kind, size, color: colorValue }: PlayPauseSymbolProps) {
  // 토큰(iOS 동적 색)을 지금 모드의 문자열로 — SVG·기호는 문자열 색만 받는다(다크 모드, 2026-10-10)
  const color = useResolvedColor(colorValue);
  return (
    <SymbolView
      name={SYMBOL_NAME[kind]}
      size={size}
      tintColor={color}
      type="monochrome"
      fallback={<PlayPauseGlyph kind={kind} size={size} color={color} />}
    />
  );
}
