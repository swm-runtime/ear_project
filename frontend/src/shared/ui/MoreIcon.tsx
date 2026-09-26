import Svg, { Circle, FeDropShadow, Filter, G } from 'react-native-svg';

interface MoreIconProps {
  size: number;
  color: string;
  /**
   * 사진 위에 놓일 때 켠다 — 점 아래로 번지는 은은한 그림자(드롭섀도 필터)를 깔아 밝은 사진에서도 읽히게 한다.
   * 처음엔 반투명 검정 원을 뒤에 그렸는데 번짐이 없어 테두리처럼 보였다(2026-09-22 PM — "은은하게")
   */
  shadow?: boolean;
}

const DOT_XS = [5.5, 12, 18.5];
const DOT_R = 1.8;

/**
 * 더보기 — 가로 둥근 점 3개. 글자(`⋯`)로 그리면 폰트에 따라 점 크기·간격·세로 위치가 제각각이라
 * 같은 버튼이 기기마다 다르게 보인다 — 도형으로 그려 크기와 색을 직접 정한다(CheckIcon 과 같은 관례).
 * 장식이므로 낭독 라벨은 쓰는 쪽이 갖는다. 종전 player/PlayerIcons 의 MoreIcon 을 공용으로 옮겼다(2026-09-22)
 */
export default function MoreIcon({ size, color, shadow = false }: MoreIconProps) {
  const dots = DOT_XS.map((x) => <Circle key={x} cx={x} cy={12} r={DOT_R} fill={color} />);
  if (!shadow) {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        {dots}
      </Svg>
    );
  }
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {/* 필터 영역을 넉넉히 잡는다 — 기본(-10%)이면 번진 가장자리가 잘린다 */}
      <Filter id="moreIconShadow" x="-30%" y="-30%" width="160%" height="160%">
        <FeDropShadow dx={0} dy={0.8} stdDeviation={1.1} floodColor="#000000" floodOpacity={0.5} />
      </Filter>
      <G filter="url(#moreIconShadow)">{dots}</G>
    </Svg>
  );
}
