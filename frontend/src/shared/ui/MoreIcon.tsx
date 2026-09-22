import Svg, { Circle } from 'react-native-svg';

interface MoreIconProps {
  size: number;
  color: string;
  /**
   * 사진 위에 놓일 때 켠다 — 점 뒤에 조금 큰 반투명 검정 원을 깔아 밝은 사진에서도 읽히게 한다.
   * SVG 에는 텍스트 그림자가 없어 후광으로 대신한다(2026-09-22 PM — "은은한 그림자")
   */
  shadow?: boolean;
}

const DOT_XS = [5.5, 12, 18.5];
const DOT_R = 1.8;
const HALO_R = 2.9;
const HALO_DY = 0.6;

/**
 * 더보기 — 가로 둥근 점 3개. 글자(`⋯`)로 그리면 폰트에 따라 점 크기·간격·세로 위치가 제각각이라
 * 같은 버튼이 기기마다 다르게 보인다 — 도형으로 그려 크기와 색을 직접 정한다(CheckIcon 과 같은 관례).
 * 장식이므로 낭독 라벨은 쓰는 쪽이 갖는다. 종전 player/PlayerIcons 의 MoreIcon 을 공용으로 옮겼다(2026-09-22)
 */
export default function MoreIcon({ size, color, shadow = false }: MoreIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {shadow
        ? DOT_XS.map((x) => (
            <Circle key={`halo-${x}`} cx={x} cy={12 + HALO_DY} r={HALO_R} fill="rgba(0, 0, 0, 0.4)" />
          ))
        : null}
      {DOT_XS.map((x) => (
        <Circle key={x} cx={x} cy={12} r={DOT_R} fill={color} />
      ))}
    </Svg>
  );
}
