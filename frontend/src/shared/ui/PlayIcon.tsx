import Svg, { Path } from 'react-native-svg';

interface PlayIconProps {
  size: number;
  color: string;
}

/**
 * 재생 삼각형 — 플레이어·미니플레이어·탐색 대표 카드가 같은 도형을 쓴다(글자 `▶` 는 폰트마다 굵기·위치가 달라
 * 도형으로, design.md §5 더보기 아이콘과 같은 이유). 원형 버튼 안에서 광학 중심이 맞도록 왼쪽 여백을 조금 더 준다
 */
export default function PlayIcon({ size, color }: PlayIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path fill={color} d="M8 5.2 19 12 8 18.8z" />
    </Svg>
  );
}
