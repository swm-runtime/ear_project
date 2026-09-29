import { useScrollToTop } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import type { Animated, ScrollView } from 'react-native';

type TabScrollable =
  | Pick<ScrollView, 'scrollTo'>
  | { scrollToOffset(options: { offset: number; animated: boolean }): void };

/**
 * 선택된 하단 탭을 다시 누르면 현재 목록의 맨 위로 이동한다.
 * 포커스·중첩 탭·preventDefault 판정은 React Navigation에 맡긴다.
 * 시스템 헤더 아래의 목록은 음수 인셋까지 돌아가야 제목·검색창이 온전히 보인다.
 * 검색이 피드를 덮는 동안에는 피드 연결만 끄고 검색 목록을 따로 연결한다.
 * `controlRef` 를 주면 같은 "맨 위로"를 화면이 직접 부를 수 있다(접힌 바의 검색 버튼 — useSystemLargeTitle).
 */
export const useTabScrollToTop = ({
  topInset = 0,
  enabled = true,
  controlRef,
}: {
  topInset?: number;
  enabled?: boolean;
  controlRef?: MutableRefObject<((animated?: boolean) => void) | null>;
} = {}) => {
  const scrollableRef = useRef<TabScrollable | null>(null);
  const target = useMemo(
    () => ({
      current: {
        scrollToTop(animated = true) {
          const scrollable = scrollableRef.current;
          if (!enabled || !scrollable) return;
          const offset = topInset > 0 ? -topInset : 0;
          if ('scrollToOffset' in scrollable) {
            scrollable.scrollToOffset({ offset, animated });
          } else {
            scrollable.scrollTo({ y: offset, animated });
          }
        },
      },
    }),
    [enabled, topInset],
  );
  useScrollToTop(target);
  useEffect(() => {
    if (controlRef) controlRef.current = (animated) => target.current.scrollToTop(animated);
  }, [controlRef, target]);

  return useCallback((node: TabScrollable | Animated.LegacyRef<TabScrollable> | null) => {
    scrollableRef.current = node && 'getNode' in node ? node.getNode() : node;
  }, []);
};
