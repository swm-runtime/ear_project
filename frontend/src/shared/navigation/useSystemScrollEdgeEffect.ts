import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useCallback } from 'react';

import { HAS_NATIVE_TAB_BAR } from '@/shared/ui/GlassSurface';

/** 두 설정은 보기엔 같다(bottom 의 기본값이 automatic) — 값이 바뀌어야 네이티브가 스크롤 뷰를 다시 찾는다 */
const EDGE_EFFECT_VARIANTS = [
  { top: 'soft' },
  { top: 'soft', bottom: 'automatic' },
] as const;
let variantIndex = 0;

/**
 * iOS 26 **시스템 scroll edge effect**(상태 바 밑 점진 블러 — 애플 뮤직·설정과 같은 것)를 이 탭 화면의 목록에 건다.
 *
 * react-native-screens 는 스택 화면(`Tabs`)이 마운트되는 순간 `subviews[0]` 을 따라 내려가 첫 스크롤 뷰를 찾아
 * `UIScrollEdgeEffect` 를 적용하고, 그 뒤엔 `scrollEdgeEffects` 옵션이 **바뀔 때만** 다시 찾는다. 우리 목록은 스켈레톤
 * 뒤에 늦게 마운트되고 탭을 바꾸면 스크롤 뷰가 달라지므로, 목록이 마운트된 뒤·탭이 포커스될 때마다 옵션 값을
 * 번갈아 바꿔 재탐색을 강제한다(2026-09-25 PM — JS 로 흉내낸 마스크 블러는 UIVisualEffectView 가 마스크를 지원하지
 * 않아 얼룩졌다). 전제: 목록이 화면 루트의 **첫 자식**이어야 한다(FloatingHeader 는 뒤에 선언).
 *
 * @param isListMounted 스크롤 뷰가 실제로 그려졌는가(스켈레톤·에러 화면이 아닌가)
 */
export const useSystemScrollEdgeEffect = (isListMounted: boolean): void => {
  const navigation = useNavigation();
  useFocusEffect(
    useCallback(() => {
      if (!HAS_NATIVE_TAB_BAR || !isListMounted) return;
      // 탭 화면 → 탭 내비게이터 → MainStack(현재 라우트 = Tabs)
      const stack = navigation.getParent()?.getParent();
      if (!stack) return;
      variantIndex = (variantIndex + 1) % EDGE_EFFECT_VARIANTS.length;
      (stack as { setOptions: (options: object) => void }).setOptions({
        scrollEdgeEffects: EDGE_EFFECT_VARIANTS[variantIndex],
      });
    }, [navigation, isListMounted]),
  );
};
