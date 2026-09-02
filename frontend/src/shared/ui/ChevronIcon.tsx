import Svg, { Path } from 'react-native-svg';

interface ChevronIconProps {
  /** 'right' 이동 가능 표시 · 'left' 뒤로 가기 · 'down' 내려서 닫기 */
  direction: 'left' | 'right' | 'down';
  size: number;
  color: string;
}

const PATHS = {
  right: 'M9.5 5.5 16 12l-6.5 6.5',
  left: 'M14.5 5.5 8 12l6.5 6.5',
  down: 'M5.5 9.5 12 16l6.5-6.5',
} as const;

/**
 * 셰브론. 글자(`›` `‹`)로 그리면 폰트에 따라 굵기·크기·세로 위치가 제각각이라
 * 같은 카드가 기기마다 다르게 보인다 — 도형으로 그려 크기와 색을 직접 정한다.
 *
 * 장식이므로 이 컴포넌트를 쓰는 쪽(카드·버튼)이 낭독 라벨을 갖는다.
 */
export default function ChevronIcon({ direction, size, color }: ChevronIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        d={PATHS[direction]}
      />
    </Svg>
  );
}
