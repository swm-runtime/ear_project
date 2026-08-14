import Svg, { Circle, Path } from 'react-native-svg';

interface PersonIconProps {
  size: number;
  color: string;
  /** 면으로 채울지 선으로만 그릴지 */
  filled: boolean;
}

const STROKE_WIDTH = 1.8;

/**
 * 사람 심볼. 프로필 탭 아이콘과 닉네임 없는 계정의 아바타가 같은 도형을 쓴다 —
 * 두 곳이 서로 다른 사람 모양을 쓰면 같은 것을 가리키는지 알 수 없다.
 *
 * 채울 때도 같은 굵기의 획을 함께 준다. 획은 경로 바깥으로 굵기의 절반만큼 번져 나가므로
 * 채우기만 하면 그 번짐이 사라져 **채운 쪽이 줄어 보인다.**
 */
export default function PersonIcon({ size, color, filled }: PersonIconProps) {
  const shape = filled
    ? { fill: color, stroke: color, strokeWidth: STROKE_WIDTH }
    : { fill: 'none', stroke: color, strokeWidth: STROKE_WIDTH };

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="12" cy="8.4" r="3.6" {...shape} />
      <Path
        {...shape}
        strokeLinecap="round"
        d="M12 13.6c-4 0-7.2 2.7-7.2 6 0 .5.4.9.9.9h12.6c.5 0 .9-.4.9-.9 0-3.3-3.2-6-7.2-6z"
      />
    </Svg>
  );
}
