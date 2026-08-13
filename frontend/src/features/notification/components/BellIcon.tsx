import Svg, { Path } from 'react-native-svg';

interface BellIconProps {
  size: number;
  color: string;
}

/**
 * 알림 종 심볼(단색). 이모지(🔔)는 OS·기기마다 모양과 색이 달라 화면 톤이 흔들리고
 * 색을 지정할 수도 없다 — 도형으로 그려 테마 색을 따르게 한다.
 *
 * 장식이므로 이 컴포넌트를 쓰는 쪽에서 낭독기 노출을 막는다.
 */
export default function BellIcon({ size, color }: BellIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {/* 종몸통 — 위 꼭지에서 아래 테두리까지 한 붓으로 잇는다 */}
      <Path
        fill={color}
        d="M12 2a1.6 1.6 0 0 1 1.6 1.6v.7a6.4 6.4 0 0 1 4.8 6.2v3.3l1.4 2.5a1 1 0 0 1-.9 1.5H5.1a1 1 0 0 1-.9-1.5l1.4-2.5v-3.3a6.4 6.4 0 0 1 4.8-6.2v-.7A1.6 1.6 0 0 1 12 2z"
      />
      {/* 종추 */}
      <Path fill={color} d="M9.5 19.3h5a2.5 2.5 0 0 1-5 0z" />
    </Svg>
  );
}
