import { useFocusEffect } from '@react-navigation/native';
import { useCallback, type RefObject } from 'react';
import { findNodeHandle } from 'react-native';

import { HAS_NATIVE_TAB_BAR } from '@/shared/ui/GlassSurface';

import { applyScrollEdgeEffect } from '../../../modules/scroll-edge-effect/src';

/** 마지막 시도 — 태그가 null 이면 ref 가 비어 있던 것. 디버그 행이 읽는다 */
let lastAttempt = 'not-run';
export const getLastScrollEdgeEffectAttempt = (): string => lastAttempt;

/**
 * iOS 26 **시스템 scroll edge effect**(상태 바 밑 점진 블러 — 애플 뮤직·설정과 같은 것)를 이 화면의 목록에 건다.
 *
 * 로컬 네이티브 모듈(`modules/scroll-edge-effect`)이 목록의 UIScrollView 에 `topEdgeEffect = .soft` 를 직접 건다.
 * react-native-screens 의 자동 적용은 스택 화면 마운트 때 `subviews[0]` 을 따라 첫 스크롤 뷰를 한 번만 찾아
 * 탭 바 컨트롤러 밑의 늦게 뜨는 목록엔 닿지 않았고(2026-09-25 실기기), JS 로 만든 블러 띠·마스크는 계단·얼룩이었다.
 *
 * 목록이 마운트된 뒤·탭이 포커스될 때마다 다시 건다(스크롤 뷰가 바뀔 수 있다). rt 9 이하 빌드·iOS 26 미만·Android 는 no-op.
 *
 * @param listRef FlatList/ScrollView(또는 Animated 변형) ref
 * @param isListMounted 스크롤 뷰가 실제로 그려졌는가(스켈레톤·에러 화면이 아닌가)
 */
export const useSystemScrollEdgeEffect = (
  listRef: RefObject<unknown>,
  isListMounted: boolean,
): void => {
  useFocusEffect(
    useCallback(() => {
      if (!HAS_NATIVE_TAB_BAR || !isListMounted) return;
      // 마운트 직후엔 네이티브 뷰가 아직 없을 수 있다 — 한 프레임 뒤에 건다
      const frame = requestAnimationFrame(() => {
        const node = listRef.current as Parameters<typeof findNodeHandle>[0];
        const tag = node ? findNodeHandle(node) : null;
        if (tag === null) {
          lastAttempt = node ? 'no-tag' : 'no-ref';
          return;
        }
        void applyScrollEdgeEffect(tag, 'soft').then((result) => {
          lastAttempt = result;
        });
      });
      return () => cancelAnimationFrame(frame);
    }, [listRef, isListMounted]),
  );
};
