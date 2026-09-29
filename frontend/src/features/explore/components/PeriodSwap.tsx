import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, useWindowDimensions } from 'react-native';

import { useAnimatedValue } from '@/shared/hooks/useAnimatedValue';
import { motion } from '@/shared/theme';

interface PeriodSwapProps {
  /** 구간(주간·월간·전체) — 바뀌면 직전 카드가 빠지고 새 카드가 채워진다. 인기 섹션이 아니면 고정 값 */
  swapKey: string;
  /** 전환 조회 중 — 직전 목록을 흐리게 둔다(uiux 4.10) */
  isDimmed: boolean;
  /** 새 카드가 들어오기 직전(화면에 그리기 전) — Android 는 여기서 가로 목록을 맨 앞으로 되돌린다 */
  onBeforeEnter?: () => void;
  children: ReactNode;
}

/** 구간의 순서 — 토글의 왼쪽→오른쪽(PopularPeriodToggle 과 같다) */
const PERIOD_ORDER = ['week', 'month', 'all'];
/** 조회 중 흐림 정도 */
const DIMMED_OPACITY = 0.5;
const EXIT_MS = 180;
const ENTER_MS = 260;

/** 오른쪽 칸으로 가면 +1(카드가 왼쪽으로 빠지고 오른쪽에서 채워진다), 왼쪽 칸이면 −1 */
const directionOf = (from: string, to: string): number => {
  const delta = PERIOD_ORDER.indexOf(to) - PERIOD_ORDER.indexOf(from);
  return delta < 0 ? -1 : 1;
};

/**
 * 인기 콘텐츠 구간 전환 — **카드가 앞으로 빠지고 뒤에서 채워진다**(PM 2026-09-30 05:17 "앞에서 빠지고 뒤에서 채워지는 애니메이션").
 * - 방향은 토글 순서를 따른다: 오른쪽 칸(주간→월간→전체)이면 직전 카드가 왼쪽으로 빠지고 새 카드가 오른쪽에서 들어온다,
 *   왼쪽 칸이면 반대. 늘 한 방향이면 "다음 페이지"로 읽힌다.
 * - 조회 중에는 직전 목록을 그 자리에서 흐리게 둔다(빈 자리를 보이지 않는다). 새 구간이 **도착한 순간** 직전 화면을 붙잡아
 *   빼고(180ms), 새 목록을 반대편에서 밀어 넣는다(260ms). 위치만 움직인다 — Android 는 사진 여러 장이 든 면의 투명도를
 *   바꾸면 끊겼다(05:02). 목록 통째로 움직인다(카드별 시차 없음)
 */
export default function PeriodSwap({ swapKey, isDimmed, onBeforeEnter, children }: PeriodSwapProps) {
  const { width } = useWindowDimensions();
  const dim = useAnimatedValue(isDimmed ? DIMMED_OPACITY : 1);
  const slide = useAnimatedValue(0);

  // 직전 화면 — 새 구간이 오면 이것을 붙잡아 빼낸다
  const lastChildrenRef = useRef<ReactNode>(children);
  const [renderedKey, setRenderedKey] = useState(swapKey);
  const [exiting, setExiting] = useState<{ node: ReactNode; direction: number } | null>(null);
  const [entering, setEntering] = useState<{ direction: number; seq: number } | null>(null);
  if (swapKey !== renderedKey) {
    setRenderedKey(swapKey);
    if (PERIOD_ORDER.includes(renderedKey) && PERIOD_ORDER.includes(swapKey)) {
      // eslint-disable-next-line react-hooks/refs -- 구간이 바뀐 이 렌더에서 직전 화면을 붙잡는다(효과에선 이미 새 화면이다)
      setExiting({ node: lastChildrenRef.current, direction: directionOf(renderedKey, swapKey) });
    }
  }
  useLayoutEffect(() => {
    if (exiting === null) lastChildrenRef.current = children;
  });

  useEffect(() => {
    Animated.timing(dim, {
      toValue: isDimmed ? DIMMED_OPACITY : 1,
      duration: motion.duration.fast,
      easing: motion.easing.easeOut,
      useNativeDriver: true,
    }).start();
  }, [dim, isDimmed]);

  // 1) 직전 화면을 진행 방향 반대쪽으로 뺀다
  useEffect(() => {
    if (exiting === null) return;
    slide.setValue(0);
    Animated.timing(slide, {
      toValue: -exiting.direction * width,
      duration: EXIT_MS,
      easing: motion.easing.easeInOut,
      useNativeDriver: true,
    }).start(() => {
      setExiting(null);
      setEntering((prev) => ({ direction: exiting.direction, seq: (prev?.seq ?? 0) + 1 }));
    });
  }, [exiting, slide, width]);

  // 2) 새 화면을 반대편에 놓고(그리기 전) 제자리로 밀어 넣는다
  useLayoutEffect(() => {
    if (entering === null) return;
    onBeforeEnter?.();
    slide.setValue(entering.direction * width);
    Animated.timing(slide, {
      toValue: 0,
      duration: ENTER_MS,
      easing: motion.easing.easeOut,
      useNativeDriver: true,
    }).start();
    // onBeforeEnter 는 매 렌더 새 함수일 수 있다 — 새 화면이 들어올 때 한 번만 부른다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entering, slide, width]);

  return (
    <Animated.View style={{ opacity: dim, transform: [{ translateX: slide }] }}>
      {exiting !== null ? exiting.node : children}
    </Animated.View>
  );
}
