import { useCallback, useEffect, useRef, type MutableRefObject } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

/** 검색 덮개가 사라진 뒤, 헤더 높이로 환산하지 않은 실제 피드 좌표로 돌아간다. */
export function useSearchScrollRestoration(
  searching: boolean,
  restore: MutableRefObject<((offset: number) => void) | null>,
) {
  const current = useRef<number | null>(null);
  const saved = useRef<number | null>(null);
  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    current.current = event.nativeEvent.contentOffset.y;
  }, []);
  const save = useCallback((fallbackTop: number) => {
    saved.current = current.current ?? fallbackTop;
  }, []);
  const discard = useCallback(() => {
    saved.current = null;
  }, []);

  useEffect(() => {
    if (searching || saved.current === null) return;
    // 덮개 제거·툴바 복귀를 커밋한 뒤 이동한다. 먼저 이동하면 UIKit 레이아웃이 다시 밀 수 있다.
    const frame = requestAnimationFrame(() => {
      if (saved.current !== null) restore.current?.(saved.current);
      saved.current = null;
    });
    return () => cancelAnimationFrame(frame);
  }, [searching, restore]);

  return { onScroll, save, discard };
}
