import { useState } from 'react';
import { Animated } from 'react-native';

/**
 * react-native의 `useAnimatedValue`와 같은 훅. react-native-web이 이 훅을 내보내지 않아
 * 웹 번들에서 `useAnimatedValue is not a function`으로 화면이 통째로 죽는다 —
 * UI를 브라우저에서 확인하려면 양쪽에서 도는 구현이 필요하다.
 *
 * 동작은 원본과 같다: 마운트 시 한 번 만든 Animated.Value를 그대로 돌려준다.
 * 원본은 useRef를 쓰지만 렌더 중 ref 접근이 되어(react-hooks/refs) 지연 초기화 useState로 둔다 —
 * setter를 쓰지 않으므로 리렌더를 유발하지 않는다.
 */
export const useAnimatedValue = (initialValue: number): Animated.Value => {
  const [value] = useState(() => new Animated.Value(initialValue));
  return value;
};
