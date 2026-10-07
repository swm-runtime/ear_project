import { SymbolView } from 'expo-symbols';

import { PauseIcon, PlayIcon } from './PlayerIcons';

/**
 * 재생·일시정지 — **플랫폼 기본 기호**를 쓴다(PM 2026-10-07 "애플 자체 플레이 아이콘, 중지 아이콘 쓰자").
 * iOS 는 SF Symbols `play.fill`·`pause.fill`(애플 뮤직·팟캐스트와 같은 모양), Android 는 Material Symbols.
 * 기호를 그리지 못하면(네이티브 모듈이 없는 옛 빌드 등) 종전 SVG 로 그린다
 */
const SYMBOL_NAME = {
  play: { ios: 'play.fill', android: 'play_arrow', web: 'play_arrow' },
  pause: { ios: 'pause.fill', android: 'pause', web: 'pause' },
} as const;

interface PlayPauseSymbolProps {
  kind: 'play' | 'pause';
  size: number;
  color: string;
}

export default function PlayPauseSymbol({ kind, size, color }: PlayPauseSymbolProps) {
  const Fallback = kind === 'play' ? PlayIcon : PauseIcon;
  return (
    <SymbolView
      name={SYMBOL_NAME[kind]}
      size={size}
      tintColor={color}
      type="monochrome"
      fallback={<Fallback size={size} color={color} />}
    />
  );
}
