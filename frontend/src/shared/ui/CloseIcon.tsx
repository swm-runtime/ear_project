import Svg, { Path } from 'react-native-svg';

interface CloseIconProps {
  size: number;
  color: string;
  strokeWidth?: number;
}

/**
 * 닫기(✕) — SF Symbols `xmark` 자리. 글자(✕)는 폰트마다 굵기·세로 위치가 달라 도형으로 그린다(CheckIcon 과 같은 관례).
 * 장식이므로 낭독 라벨은 버튼이 갖는다
 */
export default function CloseIcon({ size, color, strokeWidth = 2.2 }: CloseIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M6 6 18 18M18 6 6 18"
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
    </Svg>
  );
}
