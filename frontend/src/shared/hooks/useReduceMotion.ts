import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * OS "동작 줄이기"(iOS) · "애니메이션 삭제"(Android) 설정. 아직 모르면 `null` 이다 —
 * 호출부는 `null` 을 "움직이지 않는다" 쪽으로 다룬다(설정을 켠 사용자에게 한 번이라도 움직임을 보이지 않게).
 * 앱이 떠 있는 동안 설정을 바꾸면 따라간다.
 */
export const useReduceMotion = (): boolean | null => {
  const [isReduceMotion, setIsReduceMotion] = useState<boolean | null>(null);

  // OS 설정과 동기화한다 — 첫 값 조회 + 변경 구독. setState 는 비동기 콜백에서만 일어난다
  useEffect(() => {
    let isMounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (isMounted) setIsReduceMotion(enabled);
      })
      .catch(() => {
        if (isMounted) setIsReduceMotion(false);
      });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
      if (isMounted) setIsReduceMotion(enabled);
    });
    return () => {
      isMounted = false;
      subscription.remove();
    };
  }, []);

  return isReduceMotion;
};
