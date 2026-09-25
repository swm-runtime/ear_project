import { requireOptionalNativeModule } from 'expo-modules-core';

export type ScrollEdgeEffectStyle = 'automatic' | 'soft' | 'hard' | 'hidden';

interface ScrollEdgeEffectNative {
  apply(viewTag: number, style: ScrollEdgeEffectStyle): Promise<string | boolean>;
}

const native = requireOptionalNativeModule<ScrollEdgeEffectNative>('ScrollEdgeEffect');

/** 마지막 적용 결과 — 개발계 설정의 디버그 행이 읽는다(실기기 진단, 2026-09-25) */
let lastResult = 'not-called';
export const getLastScrollEdgeEffectResult = (): string => lastResult;

/**
 * RN 스크롤 뷰(FlatList·ScrollView 의 native tag)에 iOS 26 scroll edge effect 를 건다.
 * 반환은 진단 문자열 — `applied:…` 만 성공. iOS 26 미만·Android·모듈 없는 빌드는 `no-module`/`unavailable`
 */
export const applyScrollEdgeEffect = async (
  viewTag: number,
  style: ScrollEdgeEffectStyle,
): Promise<string> => {
  if (!native) {
    lastResult = 'no-module';
    return lastResult;
  }
  try {
    const result = await native.apply(viewTag, style);
    // 옛 네이티브(rt 10 첫 빌드)는 불리언을 돌려준다
    lastResult = typeof result === 'boolean' ? (result ? 'applied(legacy)' : 'false(legacy)') : result;
  } catch (error) {
    lastResult = `error:${String(error).slice(0, 80)}`;
  }
  return `${lastResult} tag=${viewTag}`;
};
