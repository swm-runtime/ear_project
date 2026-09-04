import Svg, { Path } from 'react-native-svg';

interface CheckIconProps {
  size: number;
  color: string;
  strokeWidth?: number;
}

/**
 * 체크. 글자(`✓`)로 그리면 폰트에 따라 굵기·크기·세로 위치가 제각각이라
 * 같은 컨트롤이 기기마다 다르게 보인다 — 도형으로 그려 크기와 색을 직접 정한다.
 * (ChevronIcon과 같은 이유·같은 관례. 장식이므로 낭독 라벨은 쓰는 쪽이 갖는다)
 */
export default function CheckIcon({ size, color, strokeWidth = 2.5 }: CheckIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M5 12.5 10 17.5 19 7"
      />
    </Svg>
  );
}
