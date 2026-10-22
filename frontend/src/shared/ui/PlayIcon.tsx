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
  // SF Symbols `play.fill` 처럼 꼭짓점을 둥글린 삼각형 — 채움 + 같은 색 라운드 조인(테두리가 모서리를 둥글린다).
  // 베이스 삼각형을 조금 줄여 선 두께만큼 커지는 걸 상쇄한다(각진 삼각형은 애플 글리프와 다르다, PM 2026-10-22)
  const triangle = (
    <Path
      fill={color}
      stroke={color}
      strokeWidth={2.4}
      strokeLinejoin="round"
      d="M9 6.8 17.8 12 9 17.2z"
    />
  );
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
