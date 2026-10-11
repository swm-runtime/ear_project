import type { ColorValue } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { useResolvedColor } from '@/shared/theme';

interface StatusIconProps {
  kind?: 'warning' | 'offline';
  color: ColorValue;
  size?: number;
}

/** 상태 문구의 장식 아이콘. 의미와 낭독은 함께 놓인 텍스트가 맡는다. */
export default function StatusIcon({ kind = 'warning', color, size = 16 }: StatusIconProps) {
  const stroke = useResolvedColor(color);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false}>
      {kind === 'offline' ? (
        <Path
          d="M3 3 21 21 M2 8a16 16 0 0 1 3-1.7 M9 5.3A16 16 0 0 1 22 8 M5 12a11 11 0 0 1 4-2 M15 10a11 11 0 0 1 4 2 M8.5 16a5 5 0 0 1 7 0 M12 20h.01"
          fill="none"
          stroke={stroke}
          strokeWidth={1.8}
          strokeLinecap="round"
        />
      ) : (
        <>
          <Circle cx={12} cy={12} r={9} stroke={stroke} strokeWidth={1.8} fill="none" />
          <Path d="M12 7v6 M12 17h.01" stroke={stroke} strokeWidth={2} strokeLinecap="round" />
        </>
      )}
    </Svg>
  );
}
