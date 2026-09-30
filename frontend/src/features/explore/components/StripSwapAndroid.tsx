import { Image } from 'expo-image';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { useAnimatedValue } from '@/shared/hooks/useAnimatedValue';
import { motion } from '@/shared/theme';

import type { ExploreItem } from '../explore.types';

interface StripSwapAndroidProps {
  /** 구간(주간·월간·전체) — 바뀌면 직전 카드 두 장 뒤에 새 카드 두 장이 붙어 함께 흐른다 */
  swapKey: string;
  /** 전환 조회 중 — 직전 목록을 흐리게 둔다(uiux 4.10) */
  isDimmed: boolean;
  /** 지금 구간의 카드들 — 흐르는 동안 앞 두 장을 가벼운 정적 줄로 그린다 */
  items: ExploreItem[];
  /** 정적 줄의 카드 한 장(누를 수 없다 — 흐르는 동안만 보인다) */
  renderCard: (item: ExploreItem) => ReactNode;
  /** 카드 한 칸(카드 폭 + 간격) · 목록 왼쪽 여백 · 카드 사이 간격 */
  itemExtent: number;
  leadingInset: number;
  gap: number;
  /** 진짜 가로 목록 */
  children: ReactNode;
}

const PERIOD_ORDER = ['week', 'month', 'all'];
const DIMMED_OPACITY = 0.5;
const FLOW_MS = 420;
/** 새 썸네일을 이만큼만 기다린다 — 못 받아도 흐른다(미리 받기는 편의지 조건이 아니다) */
const PREFETCH_WAIT_MS = 350;
/** 정적 줄에 그리는 카드 수 — 정지 화면에 보이는 1장 + 반쯤 보이는 2번째 */
const STRIP_CARDS = 2;

const directionOf = (from: string, to: string): number =>
  PERIOD_ORDER.indexOf(to) - PERIOD_ORDER.indexOf(from) < 0 ? -1 : 1;

const nextFrame = (): Promise<void> =>
  new Promise((resolve) => requestAnimationFrame(() => resolve()));

type Slot = 'a' | 'b';
type Swap = {
  oldItems: ExploreItem[];
  newItems: ExploreItem[];
  direction: number;
  from: Slot;
  to: Slot;
};

/**
 * **Android 인기 캐러셀 구간 전환**(PM 2026-09-30 06:07 "안드로이드도 1031 처럼 가는데 해결 방안을 찾아야지"). iOS(PeriodSwap)처럼
 * 카드 두 장 거리만 온전한 카드가 이어져 흐르되, Android 에서 끊기고 깜빡이던 원인(05:52)을 비켜 간다:
 * 1. **흐르는 건 진짜 목록이 아니라 카드 두 장짜리 정적 줄 두 개**(직전·새) — 가로 목록의 잘림·화면 밖 셀·스크롤 뷰가 없다.
 * 2. 흐르는 동안 두 줄을 **GPU 텍스처로 고정**(renderToHardwareTextureAndroid) — 매 프레임 다시 그리지 않는다.
 * 3. **출발 전에 준비** — 새 썸네일을 미리 받고(최대 350ms), 새 목록은 밑에 숨겨 먼저 그려 둔 뒤 두 프레임 쉬고 출발한다.
 *    흐르는 도중에 무거운 일이 없다(종전엔 새 목록 생성·썸네일 로드가 모션과 겹쳐 끊기고 깜빡였다).
 * 4. 다 흐르면 숨겨 둔 진짜 목록을 드러내고 한 프레임 뒤 정적 줄을 걷는다.
 * 직전 줄은 맨 앞 두 장으로 그린다 — 옆으로 넘겨 본 뒤 바꾸면 그 자리가 아니라 맨 앞에서 흐른다(알려진 한계)
 */
export default function StripSwapAndroid({
  swapKey,
  isDimmed,
  items,
  renderCard,
  itemExtent,
  leadingInset,
  gap,
  children,
}: StripSwapAndroidProps) {
  const dim = useAnimatedValue(isDimmed ? DIMMED_OPACITY : 1);
  const flow = useAnimatedValue(0);
  const distance = itemExtent * STRIP_CARDS;

  const itemsRef = useRef(items);
  const [renderedKey, setRenderedKey] = useState(swapKey);
  const [swap, setSwap] = useState<Swap | null>(null);
  // 지금 목록과 같은 카드를 그린 정적 줄의 칸 — **늘 숨긴 채 떠 있다**(대기). 전환 때 새로 만들지 않고 이 줄을 드러내 흘린다 —
  // 그 자리에서 새로 만들면 캐시가 있어도 썸네일이 한두 프레임 비었다 떠 번쩍였다(PM 2026-09-30 06:28)
  const [live, setLive] = useState<Slot>('a');
  const [isFlowing, setIsFlowing] = useState(false);
  /*
   * **조회가 끝나 새 카드가 온 뒤에만** 흐른다(PM 2026-09-30 06:20 "다 움직이고 나서 갑자기 콘텐츠가 바뀐다") — 토글을 누르는 순간
   * 구간 값(section.period)은 조회 중인 구간으로 먼저 바뀌는데 카드는 아직 직전 것이라, 누르자마자 직전 카드끼리 흐르고
   * 끝난 뒤에 새 카드로 툭 바뀌었다. 조회 중(isDimmed)에는 구간이 바뀐 것으로 보지 않는다
   */
  if (!isDimmed && swapKey !== renderedKey) {
    setRenderedKey(swapKey);
    if (PERIOD_ORDER.includes(renderedKey) && PERIOD_ORDER.includes(swapKey)) {
      setSwap({
        // eslint-disable-next-line react-hooks/refs -- 구간이 바뀐 이 렌더에서 직전 카드를 붙잡는다(효과에선 이미 새 카드다)
        oldItems: itemsRef.current,
        newItems: items,
        direction: directionOf(renderedKey, swapKey),
        from: live,
        to: live === 'a' ? 'b' : 'a',
      });
    }
  }
  useLayoutEffect(() => {
    if (swap === null) itemsRef.current = items;
  });

  useEffect(() => {
    Animated.timing(dim, {
      toValue: isDimmed ? DIMMED_OPACITY : 1,
      duration: motion.duration.fast,
      easing: motion.easing.easeOut,
      useNativeDriver: true,
    }).start();
  }, [dim, isDimmed]);

  useEffect(() => {
    if (swap === null) return undefined;
    let cancelled = false;
    flow.setValue(0);
    const uris = swap.newItems
      .slice(0, STRIP_CARDS)
      .map((item) => item.content.thumbnailUrl)
      .filter((uri): uri is string => Boolean(uri));
    const prefetch =
      uris.length > 0 ? Image.prefetch(uris).catch(() => false) : Promise.resolve(true);
    const wait = new Promise((resolve) => setTimeout(resolve, PREFETCH_WAIT_MS));
    // 새 줄은 전환이 잡힌 렌더에 숨긴 채 먼저 그려진다 — 썸네일이 실제로 뜰 틈을 몇 프레임 더 준다
    void Promise.race([prefetch, wait])
      .then(nextFrame)
      .then(nextFrame)
      .then(nextFrame)
      .then(() => {
        if (cancelled) return;
        setIsFlowing(true);
        Animated.timing(flow, {
          toValue: 1,
          duration: FLOW_MS,
          easing: motion.easing.easeInOut,
          useNativeDriver: true,
        }).start(() => {
          if (cancelled) return;
          setIsFlowing(false);
          // 진짜 목록을 드러낸 다음 프레임에 정적 줄을 숨긴다(한 프레임도 비지 않게). 새 줄은 다음 대기 줄이 된다
          void nextFrame().then(() => {
            if (cancelled) return;
            setLive(swap.to);
            setSwap(null);
          });
        });
      });
    return () => {
      cancelled = true;
    };
  }, [swap, flow]);

  const direction = swap?.direction ?? 1;
  const renderStrip = (list: ExploreItem[]) =>
    list.slice(0, STRIP_CARDS).map((item, index) => (
      <View key={item.content.id} style={index > 0 ? { marginLeft: gap } : undefined}>
        {renderCard(item)}
      </View>
    ));
  /** 칸별로 무엇을 그리나 — 대기 줄은 지금 카드, 전환 중엔 직전(from)·새(to) 카드 */
  const stripItems = (slot: Slot): ExploreItem[] | null => {
    if (swap === null) return slot === live ? items : null;
    if (slot === swap.from) return swap.oldItems;
    if (slot === swap.to) return swap.newItems;
    return null;
  };
  const stripStyle = (slot: Slot) => {
    const isVisible = isFlowing || (swap !== null && slot === swap.from);
    const translateX =
      swap === null
        ? 0
        : flow.interpolate({
            inputRange: [0, 1],
            outputRange:
              slot === swap.from ? [0, -direction * distance] : [direction * distance, 0],
          });
    return [
      styles.strip,
      styles.stripOverlay,
      { paddingLeft: leadingInset, opacity: isVisible ? 1 : 0, transform: [{ translateX }] },
    ];
  };

  return (
    <Animated.View style={{ opacity: dim }}>
      {/* 진짜 목록 — 전환 중엔 밑에서 새 구간으로 미리 그려 두고 숨긴다 */}
      <View style={swap !== null ? styles.hidden : undefined}>{children}</View>
      <View style={styles.layer} pointerEvents="none">
        {(['a', 'b'] as const).map((slot) => {
          const list = stripItems(slot);
          if (list === null) return null;
          return (
            <Animated.View
              key={slot}
              renderToHardwareTextureAndroid={isFlowing}
              style={stripStyle(slot)}
            >
              {renderStrip(list)}
            </Animated.View>
          );
        })}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  hidden: { opacity: 0 },
  layer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  strip: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
  },
  stripOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
});
