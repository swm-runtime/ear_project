import Svg, { Path } from 'react-native-svg';

interface ShareIconProps {
  size: number;
  color: string;
}

/**
 * [공유] 아이콘 — OS 공유 관용 표현(위로 나가는 화살표 + 상자, share-uiux.md 4.1).
 * 플랫폼별 도형 분기 없이 공통 아이콘 하나다(uiux 9장 미결 — 시안 SH1·SH2의 제안을 따른다).
 * 장식이므로 이 컴포넌트를 쓰는 쪽(행·버튼)이 낭독 라벨을 갖는다(ChevronIcon과 같은 규칙).
 */
export default function ShareIcon({ size, color }: ShareIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 14.5V3.5M8.5 6.5 12 3l3.5 3.5M8 10.5H6.5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1H16"
      />
    </Svg>
  );
}
