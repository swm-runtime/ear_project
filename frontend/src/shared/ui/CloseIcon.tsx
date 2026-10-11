import type { ColorValue } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { useResolvedColor } from '@/shared/theme';

interface CloseIconProps {
  size: number;
  color: ColorValue;
  strokeWidth?: number;
}

/**
 * 닫기(✕) — SF Symbols `xmark` 자리. 글자(✕)는 폰트마다 굵기·세로 위치가 달라 도형으로 그린다(CheckIcon 과 같은 관례).
 * 장식이므로 낭독 라벨은 버튼이 갖는다
 */
export default function CloseIcon({ size, color: colorValue, strokeWidth = 2.2 }: CloseIconProps) {
  // 토큰(iOS 동적 색)을 지금 모드의 문자열로 — SVG·기호는 문자열 색만 받는다(다크 모드, 2026-10-10)
  const color = useResolvedColor(colorValue);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M6 6 18 18M18 6 6 18"
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
    </Svg>
  );
}
