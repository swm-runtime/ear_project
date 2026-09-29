import Svg, { Circle, Defs, Mask, Path, Rect } from 'react-native-svg';

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
 *
 * **모양은 iOS 26 시스템 탭 바의 SF Symbols 와 같다**(PM 2026-09-29 "안드로이드 아이콘을 iOS 에서 쓰는 걸로 맞추자" —
 * NativeMainTabs: `books.vertical` · `safari` · `person`). 이 SVG 는 Android 와 iOS 26 미만의 캡슐 탭 바, 첫 실행
 * 튜토리얼이 쓴다. 종전 북마크·나침반은 iOS 와 기호가 달라 같은 앱이 플랫폼마다 다른 탭처럼 보였다
 */
export default function TabBarIcon({ name, color, focused, size }: TabBarIconProps) {
  // 채울 때도 같은 색·같은 굵기의 획을 함께 준다. 획은 경로 바깥으로 굵기의 절반만큼
  // 번져 나가므로, 채우기만 하면 그 번짐이 사라져 **활성일 때 도형이 줄어 보인다.**
  // 획을 유지해야 두 상태의 바깥 실루엣이 정확히 일치한다
  const shape = focused
    ? { fill: color, stroke: color, strokeWidth: STROKE_WIDTH }
    : { fill: 'none', stroke: color, strokeWidth: STROKE_WIDTH };

  if (name === 'library') {
    // books.vertical — 세워 둔 책 두 권 + 오른쪽으로 기대 선 한 권
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Rect {...shape} strokeLinejoin="round" x="2.2" y="4" width="3.8" height="16" rx="1" />
        <Rect {...shape} strokeLinejoin="round" x="8.8" y="4" width="3.8" height="16" rx="1" />
        <Rect
          {...shape}
          strokeLinejoin="round"
          x="14.6"
          y="4.6"
          width="3.8"
          height="15.4"
          rx="1"
          transform="rotate(14 14.6 20)"
        />
      </Svg>
    );
  }

  if (name === 'explore') {
    // safari — 원 + 오른쪽 위에서 왼쪽 아래로 누운 바늘(위 절반은 늘 채움). 채운 변형(safari.fill)은 원을 채우고
    // 바늘을 뚫어 낸다(마스크) — 바늘이 바탕색으로 보여야 SF 의 채운 변형과 같다
    const needleUpper = 'M16.6 7.4L13.6 13.6 10.4 10.4z';
    const needleLower = 'M7.4 16.6L10.4 10.4 13.6 13.6z';
    if (focused) {
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Defs>
            <Mask id="tab-explore-needle">
              <Rect x="0" y="0" width="24" height="24" fill="#fff" />
              <Path d={needleUpper} fill="#000" />
              <Path
                d={needleLower}
                fill="none"
                stroke="#000"
                strokeWidth={1.4}
                strokeLinejoin="round"
              />
            </Mask>
          </Defs>
          <Circle
            cx="12"
            cy="12"
            r="9"
            fill={color}
            stroke={color}
            strokeWidth={STROKE_WIDTH}
            mask="url(#tab-explore-needle)"
          />
        </Svg>
      );
    }
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Circle cx="12" cy="12" r="9" fill="none" stroke={color} strokeWidth={STROKE_WIDTH} />
        <Path d={needleUpper} fill={color} stroke={color} strokeWidth={1} strokeLinejoin="round" />
        <Path d={needleLower} fill="none" stroke={color} strokeWidth={1.2} strokeLinejoin="round" />
      </Svg>
    );
  }

  // 닉네임 없는 계정의 아바타와 같은 도형을 쓴다(shared/ui/PersonIcon)
  return <PersonIcon size={size} color={color} filled={focused} />;
}
