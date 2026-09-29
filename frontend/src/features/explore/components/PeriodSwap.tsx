import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, StyleSheet, useWindowDimensions } from 'react-native';

import { useAnimatedValue } from '@/shared/hooks/useAnimatedValue';
import { motion } from '@/shared/theme';

interface PeriodSwapProps {
  /** 구간(주간·월간·전체) — 바뀌면 직전 카드 줄 뒤에 새 카드 줄이 이어 붙어 함께 흘러간다. 인기 섹션이 아니면 고정 값 */
  swapKey: string;
  /** 전환 조회 중 — 직전 목록을 흐리게 둔다(uiux 4.10) */
  isDimmed: boolean;
  children: ReactNode;
}

/** 구간의 순서 — 토글의 왼쪽→오른쪽(PopularPeriodToggle 과 같다) */
const PERIOD_ORDER = ['week', 'month', 'all'];
/** 조회 중 흐림 정도 */
const DIMMED_OPACITY = 0.5;
/** 한 번에 흘러가는 길이 — 두 단계(빠짐 → 들어옴)가 아니라 한 번이다 */
const FLOW_MS = 420;

/** 오른쪽 칸으로 가면 +1(줄이 왼쪽으로 흐른다), 왼쪽 칸이면 −1 */
const directionOf = (from: string, to: string): number =>
  PERIOD_ORDER.indexOf(to) - PERIOD_ORDER.indexOf(from) < 0 ? -1 : 1;

type Slot = 'a' | 'b';

/**
 * 인기 콘텐츠 구간 전환 — **카드가 한 줄로 이어져 흘러간다**(PM 2026-09-30 05:29 "카드가 이어져 있다는 느낌이 있어야 하는데 그냥
 * 화면만 움직이는 느낌"). 종전(#1023)은 직전 카드를 다 뺀 뒤 새 카드를 넣는 두 단계라 화면이 따로따로 움직였다. 이제 직전
 * 줄 바로 뒤(진행 방향 쪽)에 새 줄을 붙여 두고 **같은 값으로 한 번에** 민다 — 빠지는 카드 꽁무니를 새 카드가 따라 들어온다.
 * - 방향은 토글 순서: 오른쪽 칸(주간→월간→전체)이면 왼쪽으로 흐르고 오른쪽에서 새 카드, 왼쪽 칸이면 반대.
 * - 조회 중엔 직전 줄을 그 자리에서 흐리게 둔다. 새 구간이 **도착한 순간** 흐른다.
 * - 직전 줄은 같은 뷰를 그대로 붙잡는다(두 칸을 번갈아 쓴다) — 다시 만들지 않아 사진이 비지 않는다. 위치만 움직인다
 */
export default function PeriodSwap({ swapKey, isDimmed, children }: PeriodSwapProps) {
  const { width } = useWindowDimensions();
  const dim = useAnimatedValue(isDimmed ? DIMMED_OPACITY : 1);
  const flow = useAnimatedValue(1);

  const lastChildrenRef = useRef<ReactNode>(children);
  const [renderedKey, setRenderedKey] = useState(swapKey);
  const [live, setLive] = useState<Slot>('a');
  const [leaving, setLeaving] = useState<{ slot: Slot; node: ReactNode; direction: number } | null>(
    null,
  );
  if (swapKey !== renderedKey) {
    setRenderedKey(swapKey);
    if (PERIOD_ORDER.includes(renderedKey) && PERIOD_ORDER.includes(swapKey)) {
      setLeaving({
        slot: live,
        // eslint-disable-next-line react-hooks/refs -- 구간이 바뀐 이 렌더에서 직전 줄을 붙잡는다(효과에선 이미 새 줄이다)
        node: lastChildrenRef.current,
        direction: directionOf(renderedKey, swapKey),
      });
      setLive(live === 'a' ? 'b' : 'a');
    }
  }
  useLayoutEffect(() => {
    if (leaving === null) lastChildrenRef.current = children;
  });

  useEffect(() => {
    Animated.timing(dim, {
      toValue: isDimmed ? DIMMED_OPACITY : 1,
      duration: motion.duration.fast,
      easing: motion.easing.easeOut,
      useNativeDriver: true,
    }).start();
  }, [dim, isDimmed]);

  // 그리기 전에 새 줄을 직전 줄 꽁무니에 붙여 두고(0) 한 번에 민다(1)
  useLayoutEffect(() => {
    if (leaving === null) return;
    flow.setValue(0);
    Animated.timing(flow, {
      toValue: 1,
      duration: FLOW_MS,
      easing: motion.easing.easeInOut,
      useNativeDriver: true,
    }).start(() => setLeaving(null));
  }, [leaving, flow]);

  const direction = leaving?.direction ?? 1;
  return (
    <Animated.View style={{ opacity: dim }}>
      {leaving !== null ? (
        <Animated.View
          key={leaving.slot}
          style={[
            styles.leaving,
            {
              transform: [
                {
                  translateX: flow.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, -direction * width],
                  }),
                },
              ],
            },
          ]}
        >
          {leaving.node}
        </Animated.View>
      ) : null}
      <Animated.View
        key={live}
        style={
          leaving !== null
            ? {
                transform: [
                  {
                    translateX: flow.interpolate({
                      inputRange: [0, 1],
                      outputRange: [direction * width, 0],
                    }),
                  },
                ],
              }
            : undefined
        }
      >
        {children}
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // 빠지는 줄 — 새 줄과 같은 자리에 겹쳐 두고 옮긴다(높이는 새 줄이 잡는다)
  leaving: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
});
