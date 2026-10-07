import Svg, { Path, Rect } from 'react-native-svg';

/**
 * 둥근 재생·일시정지 그림 — 애플 `play.fill`·`pause.fill` 의 인상(꼭짓점·모서리가 둥근 꽉 찬 모양)을 **직접 그린** 것이다.
 * SF Symbols 그림을 애플 기기 밖에서 쓰는 것은 애플 라이선스가 막아서 베끼지 않는다(PM 2026-10-07 후보 R2 · 막대 모서리 1.2).
 * Android 의 재생 기호와 iOS 에서 기호를 못 그릴 때의 대체로 쓴다
 */
interface PlayPauseGlyphProps {
  kind: 'play' | 'pause';
  size: number;
  color: string;
}

/** 삼각형 꼭짓점 둥글기 — 같은 색 선을 둥근 이음으로 둘러 꼭짓점을 깎는다(선 굵기의 절반이 곧 반경) */
const PLAY_CORNER_STROKE = 2.6;
/** 일시정지 막대 모서리 반경(24 격자 기준) */
const PAUSE_BAR_RADIUS = 1.2;

export default function PlayPauseGlyph({ kind, size, color }: PlayPauseGlyphProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {kind === 'play' ? (
        <Path
          d="M9 7.1 17.2 12 9 16.9z"
          fill={color}
          stroke={color}
          strokeWidth={PLAY_CORNER_STROKE}
          strokeLinejoin="round"
        />
      ) : (
        <>
          <Rect x={7} y={5} width={3.8} height={14} rx={PAUSE_BAR_RADIUS} fill={color} />
          <Rect x={13.2} y={5} width={3.8} height={14} rx={PAUSE_BAR_RADIUS} fill={color} />
        </>
      )}
    </Svg>
  );
}
