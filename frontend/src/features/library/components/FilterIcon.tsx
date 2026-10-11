import type { ColorValue } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { useResolvedColor } from '@/shared/theme';

interface FilterIconProps {
  size: number;
  color: ColorValue;
}

/**
 * 주제·출처 필터 아이콘(깔때기). 탭과 같은 글자로 두면 상태 탭 옆에 네 번째 탭처럼 읽힌다 —
 * 탭은 상태 축, 필터는 다른 축이므로 형태부터 갈라 둔다(library-uiux.md 4.2).
 */
export default function FilterIcon({ size, color: colorValue }: FilterIconProps) {
  // 토큰(iOS 동적 색)을 지금 모드의 문자열로 — SVG·기호는 문자열 색만 받는다(다크 모드, 2026-10-10)
  const color = useResolvedColor(colorValue);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        fill="none"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4.2 5.6h15.6l-6.1 7.2v5.9l-3.4 1.7v-7.6z"
      />
    </Svg>
  );
}
