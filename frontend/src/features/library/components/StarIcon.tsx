import type { ColorValue } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { useResolvedColor } from '@/shared/theme';

interface StarIconProps {
  size: number;
  color: ColorValue;
  /** 채운 별(매긴 별) / 윤곽만(아직) — 색만으로 구분하지 않고 모양도 바뀐다(design.md §1) */
  isFilled: boolean;
}

/** 별 1~5 의 한 칸. 글자(`★`)는 폰트마다 크기·세로 위치가 달라 도형으로 그린다(CheckIcon 과 같은 이유). 낭독 라벨은 쓰는 쪽이 갖는다 */
export default function StarIcon({ size, color: colorValue, isFilled }: StarIconProps) {
  // 토큰(iOS 동적 색)을 지금 모드의 문자열로 — SVG 는 문자열 색만 받는다(다크 모드)
  const color = useResolvedColor(colorValue);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        fill={isFilled ? color : 'none'}
        stroke={color}
        strokeWidth={1.6}
        strokeLinejoin="round"
        d="M12 3.2l2.62 5.31 5.86.85-4.24 4.13 1 5.84L12 16.58l-5.24 2.75 1-5.84-4.24-4.13 5.86-.85L12 3.2z"
      />
    </Svg>
  );
}
