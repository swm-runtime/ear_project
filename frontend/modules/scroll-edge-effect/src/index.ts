import { requireOptionalNativeModule } from 'expo-modules-core';

export type ScrollEdgeEffectStyle = 'automatic' | 'soft' | 'hard' | 'hidden';

interface ScrollEdgeEffectNative {
  apply(viewTag: number, style: ScrollEdgeEffectStyle): Promise<boolean>;
}

const native = requireOptionalNativeModule<ScrollEdgeEffectNative>('ScrollEdgeEffect');

/**
 * RN 스크롤 뷰(FlatList·ScrollView 의 native tag)에 iOS 26 scroll edge effect 를 건다.
 * iOS 26 미만·Android·모듈 없는 빌드(rt 9 이하)에서는 false — 호출부는 결과에 기대지 않는다
 */
export const applyScrollEdgeEffect = async (
  viewTag: number,
  style: ScrollEdgeEffectStyle,
): Promise<boolean> => {
  if (!native) return false;
  try {
    return await native.apply(viewTag, style);
  } catch {
    return false;
  }
};
