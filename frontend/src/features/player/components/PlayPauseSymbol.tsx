import PlayPauseGlyph from './PlayPauseGlyph';

interface PlayPauseSymbolProps {
  kind: 'play' | 'pause';
  size: number;
  color: string;
}

/**
 * 재생·일시정지 — Android·웹. 둥근 SVG(애플 play.fill·pause.fill 인상, 직접 그림)로 그린다.
 * iOS 는 `PlayPauseSymbol.ios.tsx`(SF Symbols). expo-symbols 를 이 파일에서 부르지 않아 Android 번들에
 * Material Symbols 글꼴(약 1MB)이 실리지 않는다
 */
export default function PlayPauseSymbol({ kind, size, color }: PlayPauseSymbolProps) {
  return <PlayPauseGlyph kind={kind} size={size} color={color} />;
}
