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

/** 휴지통 — 시리즈째 빼기 원(노출 편이 전부 담겼을 때 담기 원 자리) */
export function TrashIcon({ size, color: colorValue }: IconProps) {
  const color = useResolvedColor(colorValue);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M4 7h16M10 11v6M14 11v6M5.5 7l1 12a2 2 0 0 0 2 1.8h7a2 2 0 0 0 2-1.8l1-12M9 7V4.8A.8.8 0 0 1 9.8 4h4.4a.8.8 0 0 1 .8.8V7"
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
