import Svg, { Circle, Path } from 'react-native-svg';

import PersonIcon from './PersonIcon';

export type TabBarIconName = 'library' | 'explore' | 'profile';

interface TabBarIconProps {
  name: TabBarIconName;
  color: string;
  /** 선택된 탭은 면으로, 나머지는 선으로 그린다 */
  focused: boolean;
  size: number;
}

const STROKE_WIDTH = 1.8;

/**
 * 하단 탭 아이콘.
 *
 * **선택 여부를 색으로만 알리지 않는다**(각 uiux 7장) — 선택된 탭은 면(fill), 나머지는
 * 선(stroke)으로 그려 형태 자체가 달라지게 한다. 활성·비활성 색이 검정과 회색이라
 * 색만 두면 색각 이상·저조도에서 어느 탭에 있는지 읽히지 않는다.
 *
 * 라벨이 항상 함께 있으므로 아이콘은 장식이다 — 낭독기 노출은 탭 자체가 담당한다.
 */
export default function TabBarIcon({ name, color, focused, size }: TabBarIconProps) {
  // 채울 때도 같은 색·같은 굵기의 획을 함께 준다. 획은 경로 바깥으로 굵기의 절반만큼
  // 번져 나가므로, 채우기만 하면 그 번짐이 사라져 **활성일 때 도형이 줄어 보인다.**
  // 획을 유지해야 두 상태의 바깥 실루엣이 정확히 일치한다
  const shape = focused
    ? { fill: color, stroke: color, strokeWidth: STROKE_WIDTH }
    : { fill: 'none', stroke: color, strokeWidth: STROKE_WIDTH };

  if (name === 'library') {
    // 북마크 — 담아 둔 것들이 쌓이는 곳
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path
          {...shape}
          strokeLinejoin="round"
          d="M7 3.6h10A1.6 1.6 0 0 1 18.6 5.2v15.4a.7.7 0 0 1-1.09.58L12 17.5l-5.51 3.68A.7.7 0 0 1 5.4 20.6V5.2A1.6 1.6 0 0 1 7 3.6z"
        />
      </Svg>
    );
  }

  if (name === 'explore') {
    // 나침반 — 테두리는 늘 선으로 두고 바늘만 채워 두 상태를 가른다
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Circle cx="12" cy="12" r="8.6" fill="none" stroke={color} strokeWidth={STROKE_WIDTH} />
        <Path {...shape} strokeLinejoin="round" d="M15.6 8.4l-2 5.2-5.2 2 2-5.2z" />
      </Svg>
    );
  }

  // 닉네임 없는 계정의 아바타와 같은 도형을 쓴다(shared/ui/PersonIcon)
  return <PersonIcon size={size} color={color} filled={focused} />;
}
