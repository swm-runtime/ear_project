import Svg, { Path } from 'react-native-svg';

interface ChevronIconProps {
  /** 'right' 이동 가능 표시 · 'left' 뒤로 가기 · 'down' 내려서 닫기 */
  direction: 'left' | 'right' | 'down';
  size: number;
  color: string;
}

const PATHS = {
  right: 'M9.5 5.5 16 12l-6.5 6.5',
  left: 'M14.5 5.5 8 12l6.5 6.5',
  down: 'M5.5 9.5 12 16l6.5-6.5',
} as const;

/**
 * 그려진 획과 박스 끝 사이의 빈 여백(가로) — viewBox 24 기준 7(획이 x=16 에서 끝나고 굵기 절반 1).
 *
 * 셰브론을 줄 끝에 둘 때 이만큼 **음수 여백으로 당겨야** 스위치·글자 버튼처럼 **보이는 끝이** 줄의 끝선에 선다
 * (PM 2026-09-28 02:50 "설정에 토글이 그 앞에랑 정렬이 안 맞는다"). 안 당기면 셰브론만 5pt 안쪽으로 들어간다.
 */
export const chevronTrailingGutter = (size: number): number => (size * 7) / 24;

/**
 * 셰브론. 글자(`›` `‹`)로 그리면 폰트에 따라 굵기·크기·세로 위치가 제각각이라
 * 같은 카드가 기기마다 다르게 보인다 — 도형으로 그려 크기와 색을 직접 정한다.
 *
 * 장식이므로 이 컴포넌트를 쓰는 쪽(카드·버튼)이 낭독 라벨을 갖는다.
 */
export default function ChevronIcon({ direction, size, color }: ChevronIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        d={PATHS[direction]}
      />
    </Svg>
  );
}
