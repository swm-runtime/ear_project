import Svg, { Circle, Path, Rect } from 'react-native-svg';

interface IconProps {
  size: number;
  color: string;
}

/** 재생 — 삼각형. 원형 버튼 안에서 광학 중심이 맞도록 왼쪽 여백을 조금 더 준다 */
export function PlayIcon({ size, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path fill={color} d="M8 5.2 19 12 8 18.8z" />
    </Svg>
  );
}

/** 일시정지 — 두 막대 */
export function PauseIcon({ size, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path fill={color} d="M7.5 5h3.2v14H7.5zM13.3 5h3.2v14h-3.2z" />
    </Svg>
  );
}

/** 더보기 — 가로 점 3개 */
export function MoreIcon({ size, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx="5.5" cy="12" r="1.8" fill={color} />
      <Circle cx="12" cy="12" r="1.8" fill={color} />
      <Circle cx="18.5" cy="12" r="1.8" fill={color} />
    </Svg>
  );
}

/** 바깥으로 나가는 링크 — 원문이 앱 밖으로 연다는 것을 알린다 */
export function ExternalLinkIcon({ size, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        fill="none"
        stroke={color}
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8 16 16 8M9.5 8H16v6.5"
      />
    </Svg>
  );
}

/**
 * 헤드폰 — "들을 수 있는 횟수"를 말한다. 재생 삼각형은 지금 누르면 재생된다는 뜻으로
 * 읽혀 잔여 표시에는 맞지 않는다(2026-09-02).
 */
export function HeadphonesIcon({ size, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        fill="none"
        stroke={color}
        strokeWidth={2.2}
        strokeLinecap="round"
        d="M4.6 14.5v-2.4a7.4 7.4 0 0 1 14.8 0v2.4"
      />
      <Rect x="2.4" y="13.4" width="4.6" height="7.4" rx="2.3" fill={color} />
      <Rect x="17" y="13.4" width="4.6" height="7.4" rx="2.3" fill={color} />
    </Svg>
  );
}
