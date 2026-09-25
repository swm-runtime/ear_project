import { useNavigation } from '@react-navigation/native';
import { useEffect, useLayoutEffect, useRef } from 'react';
import type { SearchBarCommands } from 'react-native-screens';

import { HAS_NATIVE_TAB_BAR } from '@/shared/ui/GlassSurface';

interface NativeHeaderSearchBarOptions {
  /** false 면 검색창을 걸지 않는다(빈 라이브러리처럼 검색이 뜻 없을 때). 값이 바뀌면 검색창을 다시 만든다 — 드물게만 */
  enabled?: boolean;
  placeholder: string;
  cancelButtonText: string;
  /** 화면에 들어오면 바로 키보드 — 검색 탭처럼 입력이 목적인 화면만 */
  autoFocus?: boolean;
  /** 훅이 가진 질의. 검색창이 보낸 값과 다르면(최근 검색어 탭·지우기) setText 로 되비춘다 */
  value: string;
  onChangeText: (text: string) => void;
  /** 키보드 [검색] — 상태 갱신을 기다리지 않게 값을 넘긴다 */
  onSubmit?: (text: string) => void;
}

type SearchBarTextEvent = { nativeEvent: { text: string } };

/**
 * iOS 26 시스템 내비게이션 바의 **시스템 검색창**(`headerSearchBarOptions`)을 화면의 질의 상태에 잇는다
 * (PM 2026-09-25 23:50 "애플이라면 상단을 어떻게" — 검색창은 우리 TextInput 이 아니라 바의 것).
 *
 * 옵션은 **한 번만** 건다 — iOS 26 은 검색창 설정이 바뀔 때마다 다시 만들어 깜빡인다(react-native-screens 주석).
 * 핸들러는 ref 로 최신을 본다. 시스템 탭 바가 아닌 갈래(iOS 26 미만·Android)에서는 아무것도 하지 않는다.
 */
export const useNativeHeaderSearchBar = ({
  enabled = true,
  placeholder,
  cancelButtonText,
  autoFocus = false,
  value,
  onChangeText,
  onSubmit,
}: NativeHeaderSearchBarOptions): void => {
  const navigation = useNavigation();
  const searchBarRef = useRef<SearchBarCommands | null>(null);
  const handlersRef = useRef({ onChangeText, onSubmit });
  useEffect(() => {
    handlersRef.current = { onChangeText, onSubmit };
  });
  // 검색창이 마지막으로 보낸 값 — 화면이 다른 경로로 바꾼 질의만 되비춘다(타이핑 에코 방지)
  const lastNativeTextRef = useRef('');

  useLayoutEffect(() => {
    if (!HAS_NATIVE_TAB_BAR) return;
    navigation.setOptions({
      headerSearchBarOptions: enabled
        ? {
            ref: searchBarRef,
            placeholder,
            cancelButtonText,
            autoFocus,
            hideWhenScrolling: false,
            obscureBackground: false,
            onChangeText: (e: SearchBarTextEvent) => {
              lastNativeTextRef.current = e.nativeEvent.text;
              handlersRef.current.onChangeText(e.nativeEvent.text);
            },
            onSearchButtonPress: (e: SearchBarTextEvent) => {
              lastNativeTextRef.current = e.nativeEvent.text;
              handlersRef.current.onSubmit?.(e.nativeEvent.text);
            },
            onCancelButtonPress: () => {
              lastNativeTextRef.current = '';
              handlersRef.current.onChangeText('');
            },
          }
        : undefined,
    } as object);
  }, [navigation, enabled, placeholder, cancelButtonText, autoFocus]);

  useEffect(() => {
    if (!HAS_NATIVE_TAB_BAR || value === lastNativeTextRef.current) return;
    lastNativeTextRef.current = value;
    searchBarRef.current?.setText(value);
  }, [value]);
};
