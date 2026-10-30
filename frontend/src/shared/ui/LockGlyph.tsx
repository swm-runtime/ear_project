import Svg, { Path, Rect } from 'react-native-svg';

interface LockGlyphProps {
  size: number;
  /** 문자열 색만 받는다 — 토큰은 호출부(`LockIcon`)가 지금 모드의 문자열로 풀어 넘긴다 */
  color: string;
}

/**
 * 자물쇠 도형 — SF Symbols `lock.fill` 인상(둥근 몸통 + 고리)을 SVG 로 그린 것. Android·웹의 `LockIcon` 이 쓰고, iOS 는 기호를
 * 그리지 못할 때의 대체다(`PlayPauseGlyph` 와 같은 역할)
 */
export default function LockGlyph({ size, color }: LockGlyphProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M8 10.5V7.6a4 4 0 0 1 8 0v2.9"
        fill="none"
        stroke={color}
        strokeWidth={2.2}
        strokeLinecap="round"
      />
      <Rect x={5} y={10} width={14} height={11.5} rx={2.8} fill={color} />
    </Svg>
  );
}
