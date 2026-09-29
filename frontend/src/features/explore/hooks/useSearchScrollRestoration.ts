import { useCallback, useLayoutEffect, useRef, type MutableRefObject } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

/** 검색 덮개가 불투명한 동안 실제 피드 좌표를 복원해, 페이드 중 다른 위치가 비치지 않게 한다. */
export function useSearchScrollRestoration(
  closing: boolean,
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

  useLayoutEffect(() => {
    if (!closing || saved.current === null) return;
    // 닫기 시작 시 덮개 opacity는 1이다. 본문 퇴장(240ms) 뒤 덮개 페이드가 시작된다.
    // 덮개를 제거한 뒤 복원하면 임시 맨 위 피드가 먼저 노출되어 한 번 더 화면이 바뀐다.
    restore.current?.(saved.current);
    saved.current = null;
  }, [closing, restore]);

  return { onScroll, save, discard };
}
