import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, StyleSheet } from 'react-native';

import { useAnimatedValue } from '@/shared/hooks/useAnimatedValue';
import { motion } from '@/shared/theme';

interface PeriodCrossfadeProps {
  /** 구간(주간·월간·전체) — 바뀌면 같은 자리에서 직전 카드 줄이 사라지며 새 줄이 나타난다. 인기 섹션이 아니면 고정 값 */
  swapKey: string;
  /** 전환 조회 중 — 직전 줄을 흐리게 둔다(uiux 4.10). 금방 오면 흐리지 않는다 */
  isDimmed: boolean;
  children: ReactNode;
}

/** 조회 중 흐림 정도 */
const DIMMED_OPACITY = 0.5;
/** 조회가 이보다 빨리 끝나면 흐리지 않는다 — 흰 바탕에서 짧게 흐렸다 돌아오는 게 깜빡임으로 읽혔다(2026-10-09) */
const DIM_DELAY_MS = 300;
/** 직전 줄 ↔ 새 줄 교차 시간 */
const CROSSFADE_MS = 200;

type Slot = 'a' | 'b';

/**
 * 인기 콘텐츠 구간 전환 — **제자리 크로스페이드**(PM 2026-10-09, 애플 뮤직·앱스토어의 세그먼트 전환과 같은 문법).
 * 종전(PeriodSwap · StripSwapAndroid, 2026-09-30)은 새 줄을 화면 밖에 그려 두고 직전 줄을 두 장 거리만 잘라 함께 밀었는데,
 * 미리 그리기·자르기·풀기 순서가 어긋날 때마다 뒤 카드가 번쩍였다. 이제 자리 이동도 화면 밖 그리기도 없다.
 * - 조회가 끝나 새 카드가 온 뒤에만 바꾼다 — 조회 중(isDimmed)에는 구간이 바뀐 것으로 보지 않는다
 * - 직전 줄은 같은 뷰를 그대로 붙잡는다(두 칸을 번갈아 쓴다) — 다시 만들지 않아 사진이 비지 않는다
 * - 새 줄은 새로 만들어져 늘 첫 카드부터 보인다
 */
export default function PeriodCrossfade({ swapKey, isDimmed, children }: PeriodCrossfadeProps) {
  const dim = useAnimatedValue(isDimmed ? DIMMED_OPACITY : 1);
  const fade = useAnimatedValue(1);

  const lastChildrenRef = useRef<ReactNode>(children);
  const [renderedKey, setRenderedKey] = useState(swapKey);
  const [live, setLive] = useState<Slot>('a');
  const [leaving, setLeaving] = useState<{ slot: Slot; node: ReactNode } | null>(null);
  if (!isDimmed && swapKey !== renderedKey) {
    setRenderedKey(swapKey);
    // eslint-disable-next-line react-hooks/refs -- 구간이 바뀐 이 렌더에서 직전 줄을 붙잡는다(효과에선 이미 새 줄이다)
    setLeaving({ slot: live, node: lastChildrenRef.current });
    setLive(live === 'a' ? 'b' : 'a');
  }
  useLayoutEffect(() => {
    lastChildrenRef.current = children;
  });

  useEffect(() => {
    const animation = Animated.timing(dim, {
      toValue: isDimmed ? DIMMED_OPACITY : 1,
      duration: motion.duration.fast,
      easing: motion.easing.easeOut,
      delay: isDimmed ? DIM_DELAY_MS : 0,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [dim, isDimmed]);

  // 그리기 전에 새 줄을 투명(0)으로 두고 교차한다 — 효과에서 하면 새 줄이 한 프레임 다 보인 뒤 사라졌다 나타난다
  useLayoutEffect(() => {
    if (leaving === null) return undefined;
    fade.setValue(0);
    const animation = Animated.timing(fade, {
      toValue: 1,
      duration: CROSSFADE_MS,
      easing: motion.easing.easeInOut,
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (finished) setLeaving(null);
    });
    return () => animation.stop();
  }, [leaving, fade]);

  return (
    <Animated.View style={{ opacity: dim }}>
      {leaving !== null ? (
        <Animated.View
          key={leaving.slot}
          pointerEvents="none"
          style={[
            styles.leaving,
            { opacity: fade.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) },
          ]}
        >
          {leaving.node}
        </Animated.View>
      ) : null}
      <Animated.View key={live} style={leaving !== null ? { opacity: fade } : undefined}>
        {children}
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // 사라지는 줄 — 새 줄과 같은 자리에 겹쳐 둔다(높이는 새 줄이 잡는다)
  leaving: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
});
