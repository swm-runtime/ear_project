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
/**
 * 조회가 이보다 빨리 끝나면 흐리지 않는다 — 흰 바탕에서 흐렸다 돌아오는 게 "흰색으로 바뀌었다 나타남"으로 읽혔다(2026-10-09).
 * 전환은 조회 + 앞 카드 사진 올리기(최대 600ms, useExploreScreen POPULAR_WARM_MS)라 그보다 길게 잡는다 — 느린 망에서만 흐린다
 */
const DIM_DELAY_MS = 800;
/** 직전 줄 ↔ 새 줄 교차 시간 */
const CROSSFADE_MS = 200;

type Slot = 'a' | 'b';
/** 두 칸을 늘 같은 순서로 둔다 — 칸이 자리를 옮기지 않아 직전 줄의 뷰가 그대로 남는다(사진이 비지 않는다) */
const SLOTS: readonly Slot[] = ['a', 'b'];

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
  /*
   * **칸마다 제 불투명도 값을 늘 붙잡는다** — 한 값을 두 줄이 나눠 쓰고 교차 끝에 스타일을 떼었다 붙이면, 네이티브 값이
   * 연결·해제되는 순간이 그려지는 프레임과 어긋나 "깜빡였다 다시 나옴"(#1344) · "깜빡이다 사라짐"(#1345)이 났다(PM 2026-10-09).
   * 쉬는 칸은 0, 보이는 칸은 1 이라 새 줄은 0 에서 태어나고 직전 줄은 1 에서 시작한다 — 렌더 중에 값을 고칠 일이 없다
   */
  const opacityA = useAnimatedValue(1);
  const opacityB = useAnimatedValue(0);
  const slotOpacity = { a: opacityA, b: opacityB };

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

  useLayoutEffect(() => {
    if (leaving === null) return undefined;
    const incoming = live === 'a' ? opacityA : opacityB;
    const outgoing = leaving.slot === 'a' ? opacityA : opacityB;
    const timing = (value: Animated.Value, toValue: number) =>
      Animated.timing(value, {
        toValue,
        duration: CROSSFADE_MS,
        easing: motion.easing.easeInOut,
        useNativeDriver: true,
      });
    /*
     * **새 줄만 직전 줄 위에서 나타난다** — 직전 줄은 끝까지 1 로 둔다. 둘을 함께 교차하면 중간에 둘 다 반투명이라 흰 바탕이
     * 비쳐 "흰색으로 바뀌었다가 나타났다"(PM 2026-10-09). 다 나타나면 직전 줄을 바로 감추고(카드 사이 틈으로 비치지 않게) 뗀다
     */
    const animation = timing(incoming, 1);
    animation.start(({ finished }) => {
      if (!finished) return;
      outgoing.setValue(0);
      setLeaving(null);
    });
    return () => animation.stop();
  }, [leaving, live, opacityA, opacityB]);

  return (
    <Animated.View style={{ opacity: dim }}>
      {SLOTS.map((slot) => {
        const isLive = slot === live;
        const node = isLive ? children : leaving?.slot === slot ? leaving.node : null;
        if (node === null) return null;
        return (
          <Animated.View
            key={slot}
            pointerEvents={isLive ? 'auto' : 'none'}
            style={[isLive ? styles.live : styles.leaving, { opacity: slotOpacity[slot] }]}
          >
            {node}
          </Animated.View>
        );
      })}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // 보이는(새) 줄 — 직전 줄 위에 그린다. 칸 순서는 고정이라 zIndex 로 올린다
  live: {
    zIndex: 1,
  },
  // 사라지는 줄 — 새 줄과 같은 자리에 겹쳐 둔다(높이는 새 줄이 잡는다)
  leaving: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 0,
  },
});
