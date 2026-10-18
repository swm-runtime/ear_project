import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

/**
 * 끝에 닿았다고 보는 여유(pt) — 바운스·소수점 반올림으로 마지막 몇 pt 가 남아도 끝으로 친다.
 * 리스트 하단 여백(24)보다 작아야 마지막 항목을 실제로 본 뒤에만 열린다
 */
export const SCROLL_END_THRESHOLD = 12;

/** onScroll 을 받는 간격(ms) — 끝 판정 한 번만 필요해서 촘촘할 필요가 없다 */
const SCROLL_EVENT_THROTTLE_MS = 32;

interface ScrollEndGate {
  /** 끝까지 봤거나(한 번이라도) 내용이 화면에 다 들어가거나 스크린리더가 켜져 있으면 true */
  isOpen: boolean;
  /**
   * 닫혀 있다고 **판정이 끝난** 상태 — 두 높이를 다 받았는데 아직 안 열렸다. 안내 문구는 이때만 보인다
   * (짧은 화면에서 첫 프레임에 안내가 번쩍였다 사라지지 않게)
   */
  isClosedAfterMeasure: boolean;
  /** ScrollView 에 그대로 펼친다 */
  scrollViewProps: {
    onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
    scrollEventThrottle: number;
    onLayout: (event: LayoutChangeEvent) => void;
    onContentSizeChange: (width: number, height: number) => void;
  };
}

/**
 * 스크롤 끝 관문 — "목록을 끝까지 내려야 버튼이 열린다"(A4 약관 동의, PM 확정 2026-10-19 · auth-uiux.md 4.3).
 *
 * - **스크롤로 한 번 끝에 닿으면 닫히지 않는다.** 다시 올려도, 목록이 길어져도(재조회로 항목 추가·글자 크기 변경) 열린 채다.
 * - **내용이 화면에 다 들어가면 열린다** — 스크롤할 수 없는 화면에서는 onScroll 이 오지 않아 영영 못 연다.
 *   높이 두 개(보이는 칸 onLayout · 내용 onContentSizeChange)를 받을 때마다 **그 순간의 값으로** 비교하고, 이 판정은
 *   붙잡아 두지 않는다. 첫 레이아웃 패스에서 목록이 다 그려지기 전의 짧은 높이가 한 번 들어오면 "다 들어간다"로
 *   잠겨, 스크롤되는 긴 목록인데도 끝까지 내리기 전에 버튼이 열렸다(2026-10-19 실기기 — [전체 동의]만 누르면 열림).
 *   그래서 내용이 나중에 길어지면 다시 닫힌다(아직 안 본 항목이 생긴 것이다).
 * - **스크린리더(VoiceOver·TalkBack)가 켜져 있으면 면제한다.** 스크린리더는 항목 단위로 초점을 옮기며 읽어서
 *   스크롤 이벤트가 끝까지 오지 않을 수 있다 — 끝까지 읽고도 버튼이 안 열리면 가입을 못 한다. 켜고 끄는 것도 따라간다.
 */
export function useScrollEndGate(): ScrollEndGate {
  const [hasReachedEnd, setHasReachedEnd] = useState(false);
  /** 지금 내용이 보이는 칸에 다 들어가는가 — 높이가 바뀔 때마다 다시 계산한다(잠그지 않는다) */
  const [fitsInViewport, setFitsInViewport] = useState(false);
  const [isScreenReaderOn, setIsScreenReaderOn] = useState(false);
  const [hasMeasured, setHasMeasured] = useState(false);
  // 두 높이는 화면을 다시 그릴 이유가 없다 — 비교에만 쓴다
  const viewportHeight = useRef(0);
  const contentHeight = useRef(0);

  // 스크린리더 상태와 동기화 — 처음 값을 읽고, 켜고 끄는 것을 구독한다
  useEffect(() => {
    let isMounted = true;
    void AccessibilityInfo.isScreenReaderEnabled().then((enabled) => {
      if (isMounted) setIsScreenReaderOn(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener('screenReaderChanged', (enabled) => {
      setIsScreenReaderOn(enabled);
    });
    return () => {
      isMounted = false;
      subscription.remove();
    };
  }, []);

  const checkFits = useCallback(() => {
    if (viewportHeight.current <= 0 || contentHeight.current <= 0) return;
    setHasMeasured(true);
    setFitsInViewport(contentHeight.current <= viewportHeight.current + SCROLL_END_THRESHOLD);
  }, []);

  const onLayout = useCallback(
    (event: LayoutChangeEvent) => {
      viewportHeight.current = event.nativeEvent.layout.height;
      checkFits();
    },
    [checkFits],
  );

  const onContentSizeChange = useCallback(
    (_width: number, height: number) => {
      contentHeight.current = height;
      checkFits();
    },
    [checkFits],
  );

  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, layoutMeasurement, contentSize } = event.nativeEvent;
    if (contentOffset.y + layoutMeasurement.height >= contentSize.height - SCROLL_END_THRESHOLD) {
      setHasReachedEnd(true);
    }
  }, []);

  const isOpen = hasReachedEnd || fitsInViewport || isScreenReaderOn;
  return {
    isOpen,
    isClosedAfterMeasure: hasMeasured && !isOpen,
    scrollViewProps: {
      onScroll,
      scrollEventThrottle: SCROLL_EVENT_THROTTLE_MS,
      onLayout,
      onContentSizeChange,
    },
  };
}
