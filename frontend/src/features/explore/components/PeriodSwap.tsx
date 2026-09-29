import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Platform } from 'react-native';

import { useAnimatedValue } from '@/shared/hooks/useAnimatedValue';
import { motion } from '@/shared/theme';

interface PeriodSwapProps {
  /** 구간(주간·월간·전체) — 바뀌면 새 목록이 옆에서 밀려 들어오며 나타난다 */
  swapKey: string;
  /** 전환 조회 중 — 직전 목록을 흐리게 둔다(uiux 4.10) */
  isDimmed: boolean;
  children: ReactNode;
}

/** 조회 중 흐림 정도 — 종전 styles.dimmed 와 같은 0.5 */
const DIMMED_OPACITY = 0.5;
/**
 * 새 목록이 들어오는 거리 — 오른쪽에서 짧게. **Android 는 0**(옆으로 밀지 않고 페이드만) — 사진 여러 장이 든 면을
 * 반투명하게 옮기면 프레임이 끊겨 어색했다(PM 2026-09-30 05:02 "안드로이드는 살짝 어색", 05:03 "둘 다")
 */
const ENTER_SHIFT = Platform.OS === 'android' ? 0 : 16;
/** 들어오는 길이 — Android 는 페이드만이라 짧게 */
const ENTER_DURATION = Platform.OS === 'android' ? motion.duration.fast : motion.duration.normal;

/**
 * 인기 콘텐츠 구간 전환의 모션(PM 2026-09-30 04:49 "주간/월간/전체 눌러 콘텐츠가 바뀔 때 자연스럽게") — 종전엔 조회 중
 * 목록이 툭 흐려졌다가, 도착하면 새 카드로 한 프레임에 바뀌었다. 이제
 * 1. 누르면 직전 목록이 **서서히** 흐려지고(0.5),
 * 2. 새 구간이 도착하면 목록이 오른쪽에서 16pt 밀려 들어오며 선명해진다(240ms ease-out, 네이티브 드라이버).
 * 처음 그릴 때는 움직이지 않는다
 */
export default function PeriodSwap({ swapKey, isDimmed, children }: PeriodSwapProps) {
  const dim = useAnimatedValue(isDimmed ? DIMMED_OPACITY : 1);
  const enter = useAnimatedValue(1);
  const lastKeyRef = useRef(swapKey);

  useEffect(() => {
    Animated.timing(dim, {
      toValue: isDimmed ? DIMMED_OPACITY : 1,
      duration: motion.duration.fast,
      easing: motion.easing.easeOut,
      useNativeDriver: true,
    }).start();
  }, [dim, isDimmed]);

  useEffect(() => {
    if (lastKeyRef.current === swapKey) return;
    lastKeyRef.current = swapKey;
    enter.setValue(0);
    Animated.timing(enter, {
      toValue: 1,
      duration: ENTER_DURATION,
      easing: motion.easing.easeOut,
      useNativeDriver: true,
    }).start();
  }, [enter, swapKey]);

  return (
    <Animated.View
      style={{
        opacity: Animated.multiply(dim, enter),
        transform: [
          { translateX: enter.interpolate({ inputRange: [0, 1], outputRange: [ENTER_SHIFT, 0] }) },
        ],
      }}
    >
      {children}
    </Animated.View>
  );
}
