import Svg, { Path } from 'react-native-svg';

interface FilterIconProps {
  size: number;
  color: string;
}

/**
 * 주제·출처 필터 아이콘(깔때기). 탭과 같은 글자로 두면 상태 탭 옆에 네 번째 탭처럼 읽힌다 —
 * 탭은 상태 축, 필터는 다른 축이므로 형태부터 갈라 둔다(library-uiux.md 4.2).
 */
export default function FilterIcon({ size, color }: FilterIconProps) {
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
