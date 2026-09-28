import Svg, { FeDropShadow, Filter, G, Path } from 'react-native-svg';

interface PlayIconProps {
  size: number;
  color: string;
  /**
   * 사진 위에 놓일 때 켠다 — 삼각형 아래로 번지는 은은한 그림자(`MoreIcon` 과 같은 방식). 사진 위 표식에
   * **불투명 원·알약을 쓰지 않는다**(design.md §3) — 흰 원을 깔면 흐린 커버 위에서 가장 밝은 덩어리가 돼
   * 아트워크·제목과 싸운다(PM 2026-09-28 00:46 "플레이 버튼이 너무 이질적이다")
   */
  shadow?: boolean;
}

/**
 * 재생 삼각형 — 플레이어·미니플레이어·탐색 대표 카드가 같은 도형을 쓴다(글자 `▶` 는 폰트마다 굵기·위치가 달라
 * 도형으로, design.md §5 더보기 아이콘과 같은 이유). 원형 버튼 안에서 광학 중심이 맞도록 왼쪽 여백을 조금 더 준다
 */
export default function PlayIcon({ size, color, shadow = false }: PlayIconProps) {
  const triangle = <Path fill={color} d="M8 5.2 19 12 8 18.8z" />;
  if (!shadow) {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        {triangle}
      </Svg>
    );
  }
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {/* 필터 영역을 넉넉히 잡는다 — 기본(-10%)이면 번진 가장자리가 잘린다(MoreIcon 과 같다) */}
      <Filter id="playIconShadow" x="-30%" y="-30%" width="160%" height="160%">
        <FeDropShadow dx={0} dy={0.8} stdDeviation={1.1} floodColor="#000000" floodOpacity={0.5} />
      </Filter>
      <G filter="url(#playIconShadow)">{triangle}</G>
    </Svg>
  );
}
