import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, StyleSheet, useWindowDimensions } from 'react-native';

import { useAnimatedValue } from '@/shared/hooks/useAnimatedValue';
import { motion } from '@/shared/theme';

interface PeriodSwapProps {
  /** 구간(주간·월간·전체) — 바뀌면 직전 카드 줄 뒤에 새 카드 줄이 이어 붙어 함께 흘러간다. 인기 섹션이 아니면 고정 값 */
  swapKey: string;
  /** 전환 조회 중 — 직전 목록을 흐리게 둔다(uiux 4.10) */
  isDimmed: boolean;
  /**
   * 카드 한 칸(카드 폭 + 간격)과 목록 왼쪽 여백 — 주면 **카드 두 장 거리만** 흐르고, 이어 붙는 자리를 카드 경계에 맞춘다.
   * 없으면 화면 폭만큼 흐른다
   */
  itemExtent?: number;
  leadingInset?: number;
  children: ReactNode;
}

/** 구간의 순서 — 토글의 왼쪽→오른쪽(PopularPeriodToggle 과 같다) */
const PERIOD_ORDER = ['week', 'month', 'all'];
/** 조회 중 흐림 정도 */
const DIMMED_OPACITY = 0.5;
/** 조회가 이보다 빨리 끝나면 흐리지 않는다 */
const DIM_DELAY_MS = 300;
/** 한 번에 흘러가는 길이 — 두 단계(빠짐 → 들어옴)가 아니라 한 번이다 */
const FLOW_MS = 420;
/** 흐르기 전 새 줄을 화면 밖에 그려 두는 틈 — 썸네일이 뜰 시간 */
const PREPARE_MS = 160;

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
export default function PeriodSwap({
  swapKey,
  isDimmed,
  itemExtent,
  leadingInset = 0,
  children,
}: PeriodSwapProps) {
  const { width } = useWindowDimensions();
  const dim = useAnimatedValue(isDimmed ? DIMMED_OPACITY : 1);
  const flow = useAnimatedValue(1);

  const lastChildrenRef = useRef<ReactNode>(children);
  const [renderedKey, setRenderedKey] = useState(swapKey);
  const [live, setLive] = useState<Slot>('a');
  const [leaving, setLeaving] = useState<{ slot: Slot; node: ReactNode; direction: number } | null>(
    null,
  );
  /*
   * **조회가 끝나 새 카드가 온 뒤에만** 흐른다(PM 2026-09-30 06:20 "다 움직이고 나서 갑자기 콘텐츠가 바뀐다") — 토글을 누르는 순간
   * 구간 값(section.period)은 조회 중인 구간으로 먼저 바뀌는데 카드는 아직 직전 것이라, 누르자마자 직전 카드끼리 흐르고
   * 끝난 뒤에 새 카드로 툭 바뀌었다. 조회 중(isDimmed)에는 구간이 바뀐 것으로 보지 않는다
   */
  if (!isDimmed && swapKey !== renderedKey) {
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
      // 금방 오면 흐리지 않는다 — 흰 바탕에서 짧게 흐렸다 돌아오는 게 깜빡임으로 읽혔다(PM 2026-10-09)
      delay: isDimmed ? DIM_DELAY_MS : 0,
      easing: motion.easing.easeOut,
      useNativeDriver: true,
    }).start();
  }, [dim, isDimmed]);

  // 그리기 전에 새 줄을 직전 줄 꽁무니(화면 밖)에 붙여 두고(0), **썸네일이 뜰 틈을 준 뒤** 한 번에 민다(1). 새 줄은 이 렌더에
  // 처음 만들어져 바로 흐르면 사진이 비었다 뜨며 번쩍였다(PM 2026-09-30 06:28) — 화면 밖에서 먼저 그려 둔다
  useLayoutEffect(() => {
    if (leaving === null) return undefined;
    flow.setValue(0);
    const timer = setTimeout(() => {
      Animated.timing(flow, {
        toValue: 1,
        duration: FLOW_MS,
        easing: motion.easing.easeInOut,
        useNativeDriver: true,
      }).start(() => setLeaving(null));
    }, PREPARE_MS);
    return () => clearTimeout(timer);
  }, [leaving, flow]);

  const direction = leaving?.direction ?? 1;
  /*
   * **카드가 잘리지 않게**(PM 2026-09-30 05:40 "카드가 잘린 채로 이동") — 정지 화면엔 카드 1장 + 2번째가 반쯤 보인다. 화면 폭만큼
   * 밀면 2번째 카드가 잘린 모양 그대로 떠났다. 그래서 흐르는 거리를 **카드 두 장(2칸)** 으로 하고, 두 줄이 맞닿는 쪽 줄은
   * 두 장까지만 보이게 잘라(그 뒤 카드가 다른 줄과 겹치지 않게) 목록 자체의 잘림은 풀어 둔다(overflow visible — ExploreScreen).
   * 오른쪽 칸이면 [직전 1·2장][새 1·2장 …]이 왼쪽으로, 왼쪽 칸이면 [새 1·2장][직전 1장 …]이 오른쪽으로 흐른다
   */
  const distance = itemExtent !== undefined ? itemExtent * 2 : width;
  const joinClip = itemExtent !== undefined ? { width: leadingInset + itemExtent * 2 } : null;
  const leavingClip = direction > 0 ? joinClip : null;
  const enteringClip = direction < 0 ? joinClip : null;
  return (
    <Animated.View style={{ opacity: dim }}>
      {leaving !== null ? (
        <Animated.View
          key={leaving.slot}
          style={[
            styles.leaving,
            leavingClip && [styles.clip, leavingClip],
            {
              transform: [
                {
                  translateX: flow.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, -direction * distance],
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
            ? [
                enteringClip && [styles.clip, enteringClip],
                {
                  transform: [
                    {
                      translateX: flow.interpolate({
                        inputRange: [0, 1],
                        outputRange: [direction * distance, 0],
                      }),
                    },
                  ],
                },
              ]
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
  // 맞닿는 쪽 줄 — 카드 두 장까지만 보이게 자른다(폭은 호출 값)
  clip: {
    overflow: 'hidden',
  },
});
