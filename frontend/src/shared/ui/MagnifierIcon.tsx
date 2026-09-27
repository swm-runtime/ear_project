import Svg, { Circle, Path } from 'react-native-svg';

interface MagnifierIconProps {
  size: number;
  color: string;
  strokeWidth?: number;
}

/**
 * 돋보기 — iOS 시스템 검색창(UISearchBar)의 `magnifyingglass` 자리(PM 2026-09-27 20:40 "검색바 앞에 돋보기").
 * 글자(🔍)는 이모지라 색·굵기를 못 맞춘다 — 도형으로 그린다(CheckIcon·ChevronIcon 과 같은 관례).
 * 장식이므로 낭독 라벨은 검색창이 갖는다
 */
export default function MagnifierIcon({ size, color, strokeWidth = 2.2 }: MagnifierIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={10.5} cy={10.5} r={6.5} fill="none" stroke={color} strokeWidth={strokeWidth} />
      <Path
        d="M15.4 15.4 20 20"
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
    </Svg>
  );
}

/** 검색창 돋보기 크기 — 세 검색창(라이브러리·탐색·검색 화면)이 같은 값을 쓴다 */
export const SEARCH_ICON_SIZE = 17;
