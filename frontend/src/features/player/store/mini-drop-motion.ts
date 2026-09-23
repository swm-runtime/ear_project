import { Animated } from 'react-native';

/**
 * 미니플레이어를 아래로 끌어 캡슐에 흡수시키는 진행값(0 제자리 → 1 캡슐 안). 네이티브 드라이버.
 *
 * 모듈 싱글턴인 이유: 카드의 **내용물**(MiniPlayer, 독의 앞 층)과 카드의 **유리 판**(CapsuleTabBar 의 GlassGroup, 뒤 층)이
 * 다른 컴포넌트에 있는데 같은 값으로 같이 움직여야 한다(2026-09-23). 유리 판을 내용물과 같은 뷰에 두면 캡슐 유리와
 * 한 컨테이너에 못 넣어 물방울 병합이 안 된다
 */
export const miniDropProgress = new Animated.Value(0);

/** 카드 중심이 캡슐 중심까지 가는 거리 — 카드 반(27) + 간격 8 + 캡슐 반(30) */
export const MINI_DROP_TRAVEL = 65;

/** 진행값 → 카드의 transform·opacity. 내용물과 유리 판이 같은 식을 쓴다 */
export const miniDropStyle = (progress: Animated.Value) => ({
  opacity: progress.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 0.85, 0] }),
  transform: [
    { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [0, MINI_DROP_TRAVEL] }) },
    { scaleX: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0.92] }) },
    { scaleY: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0.12] }) },
  ],
});
