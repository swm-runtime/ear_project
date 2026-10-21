import type { ColorValue } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { useResolvedColor } from '@/shared/theme';

interface IconProps {
  size: number;
  color: ColorValue;
}

/** 셔플 — 엇갈린 두 화살표(애플 뮤직 앨범 화면의 셔플 원). 장식이라 낭독 라벨은 쓰는 쪽이 갖는다 */
export function ShuffleIcon({ size, color: colorValue }: IconProps) {
  const color = useResolvedColor(colorValue);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5"
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** 더하기 — 시리즈 담기 원 */
export function PlusIcon({ size, color: colorValue }: IconProps) {
  const color = useResolvedColor(colorValue);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M12 5v14M5 12h14"
        fill="none"
        stroke={color}
        strokeWidth={2.2}
        strokeLinecap="round"
      />
    </Svg>
  );
}
