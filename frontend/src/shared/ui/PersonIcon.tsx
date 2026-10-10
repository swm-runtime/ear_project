import type { ColorValue } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { useResolvedColor } from '@/shared/theme';

interface PersonIconProps {
  size: number;
  color: ColorValue;
  /** 면으로 채울지 선으로만 그릴지 */
  filled: boolean;
}

// 1.8 → 1.5(PM 2026-09-29 16:07 탭 아이콘 굵기 줄임 — TabBarIcon 과 같은 굵기)
const STROKE_WIDTH = 1.5;
/** 어깨 — 폭 19pt 돔, 아래 모서리만 둥글다(iOS 26 탭 바 `person` 실측) */
const SHOULDERS =
  'M12 13.65C17.6 13.65 21.5 16.8 21.5 20.6Q21.5 22 20.1 22H3.9Q2.5 22 2.5 20.6C2.5 16.8 6.4 13.65 12 13.65Z';

/**
 * 사람 심볼. 프로필 탭 아이콘과 닉네임 없는 계정의 아바타가 같은 도형을 쓴다 —
 * 두 곳이 서로 다른 사람 모양을 쓰면 같은 것을 가리키는지 알 수 없다.
 *
 * 모양은 iOS 26 시스템 탭 바의 사람 아이콘 실측(PM 2026-09-29 — TabBarIcon 주석): 지름 9.7pt 머리 + 폭 19pt 돔 어깨.
 * 선 변형은 같은 도형을 획 굵기의 절반만큼 안쪽으로 그려 바깥 실루엣이 채운 변형과 같다
 */
export default function PersonIcon({ size, color: colorValue, filled }: PersonIconProps) {
  // 토큰(iOS 동적 색)을 지금 모드의 문자열로 — SVG·기호는 문자열 색만 받는다(다크 모드, 2026-10-10)
  const color = useResolvedColor(colorValue);
  if (filled) {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Circle cx="12" cy="6.55" r="4.85" fill={color} />
        <Path d={SHOULDERS} fill={color} />
      </Svg>
    );
  }
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle
        cx="12"
        cy="6.55"
        r={4.85 - STROKE_WIDTH / 2}
        fill="none"
        stroke={color}
        strokeWidth={STROKE_WIDTH}
      />
      <Path
        d="M12 14.55C17.1 14.55 20.6 17.3 20.6 20.6Q20.6 21.1 20.1 21.1H3.9Q3.4 21.1 3.4 20.6C3.4 17.3 6.9 14.55 12 14.55Z"
        fill="none"
        stroke={color}
        strokeWidth={STROKE_WIDTH}
        strokeLinejoin="round"
      />
    </Svg>
  );
}
