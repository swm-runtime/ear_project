import { useEffect, useRef, useState } from 'react';
import { Keyboard, Platform, type KeyboardEvent, type View } from 'react-native';

/**
 * 바닥에 붙은 시트 안의 입력이 키보드에 가리지 않게 — 시트 바닥이 키보드 위로 올라오도록 더할 바닥 여백.
 *
 * 공용 시트(BottomSheet)는 키보드를 모른다(입력이 있는 시트가 처음이다). 키보드 높이를 그대로 더하지 않고 **시트 바닥과 키보드 윗변이
 * 겹치는 만큼만** 더한다 — Android 에서 창이 키보드만큼 줄어드는 기기(adjustResize)는 이미 올라와 있어 겹침이 0 이 되고, 줄지 않는
 * 기기(edge-to-edge)는 겹친 만큼 올라간다. 어느 쪽이든 두 번 올라가지 않는다.
 * iOS 는 키보드가 오르기 **전**(will) 이벤트로 맞춰 함께 움직이고, Android 는 will 이벤트가 없어 did 로 맞춘다.
 */
export const useSheetKeyboardInset = (isActive: boolean) => {
  const containerRef = useRef<View>(null);
  const [inset, setInset] = useState(0);
  const insetRef = useRef(0);

  useEffect(() => {
    insetRef.current = inset;
  }, [inset]);

  // 무엇과 동기화하나: 시트가 떠 있는 동안의 키보드 표시 · 숨김 → 바닥 여백
  useEffect(() => {
    if (!isActive) return;
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const handleShow = (event: KeyboardEvent) => {
      const keyboardTop = event.endCoordinates.screenY;
      containerRef.current?.measureInWindow((_x, y, _width, height) => {
        // 지금 더해 둔 여백을 빼야 시트 본래의 바닥이다 — 키보드 크기가 바뀌어 다시 올 때 여백이 쌓이지 않게
        const bottom = y + height - insetRef.current;
        setInset(Math.max(0, Math.ceil(bottom - keyboardTop)));
      });
    };
    const showSubscription = Keyboard.addListener(showEvent, handleShow);
    const hideSubscription = Keyboard.addListener(hideEvent, () => setInset(0));
    return () => {
      showSubscription.remove();
      hideSubscription.remove();
      setInset(0);
    };
  }, [isActive]);

  return { containerRef, inset };
};
