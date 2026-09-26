import { useFocusEffect } from '@react-navigation/native';
import { useCallback, type RefObject } from 'react';
import { findNodeHandle, type View } from 'react-native';

import { HAS_NATIVE_TAB_BAR } from '@/shared/ui/GlassSurface';

import {
  applyScrollEdgeEffect,
  attachScrollEdgeContainer,
  type ScrollEdgeEffectStyle,
} from '../../../modules/scroll-edge-effect/src';

/** 마지막 시도 — 태그가 null 이면 ref 가 비어 있던 것. 디버그 행이 읽는다 */
let lastAttempt = 'not-run';
export const getLastScrollEdgeEffectAttempt = (): string => lastAttempt;

/** 마지막으로 건 스크롤 뷰 태그 — 디버그 행이 스타일을 바꿔 다시 걸 때 쓴다 */
let lastTag: number | null = null;
/** 현재 스타일 — 기본 soft. 디버그 행이 soft → hard → hidden 으로 돌린다(실기기에서 효과 영역이 있는지 가른다) */
let currentStyle: ScrollEdgeEffectStyle = 'soft';
const STYLE_CYCLE: ScrollEdgeEffectStyle[] = ['soft', 'hard', 'hidden'];
export const getScrollEdgeEffectStyle = (): ScrollEdgeEffectStyle => currentStyle;
export const cycleScrollEdgeEffectStyle = async (): Promise<string> => {
  currentStyle = STYLE_CYCLE[(STYLE_CYCLE.indexOf(currentStyle) + 1) % STYLE_CYCLE.length];
  if (lastTag === null) {
    lastAttempt = `no-tag-yet style=${currentStyle}`;
    return lastAttempt;
  }
  lastAttempt = `${await applyScrollEdgeEffect(lastTag, currentStyle)} style=${currentStyle}`;
  return lastAttempt;
};

/** 인셋이 잡힌 뒤 한 번 더 건다 — 마운트 직후엔 adjustedContentInset 이 0 이었다(2026-09-25 21:32 실기기) */
const REAPPLY_DELAY_MS = 1000;

/**
 * iOS 26 **시스템 scroll edge effect**(상태 바 밑 점진 블러 — 애플 뮤직·설정과 같은 것)를 이 화면의 목록에 건다.
 *
 * 로컬 네이티브 모듈(`modules/scroll-edge-effect`)이 목록의 UIScrollView 에 `topEdgeEffect` 를 직접 건다.
 * react-native-screens 의 자동 적용은 스택 화면 마운트 때 `subviews[0]` 을 따라 첫 스크롤 뷰를 한 번만 찾아
 * 탭 바 컨트롤러 밑의 늦게 뜨는 목록엔 닿지 않았고(2026-09-25 실기기), JS 로 만든 블러 띠·마스크는 계단·얼룩이었다.
 *
 * 목록이 마운트된 뒤·탭이 포커스될 때마다 다시 건다(스크롤 뷰가 바뀔 수 있다). rt 9 이하 빌드·iOS 26 미만·Android 는 no-op.
 *
 * 그리고 **머리 줄(FloatingHeader)에 `UIScrollEdgeElementContainerInteraction` 을 붙인다** — iOS 26 은 edge effect 를
 * "바 밑"에서만 그리므로(21:45 실기기: topEdgeEffect 만으로는 hard 도 안 보였다) 커스텀 머리 줄이 바를 자처해야 한다.
 *
 * @param listRef FlatList/ScrollView(또는 Animated 변형) ref
 * @param headerRef FloatingHeader 의 containerRef
 * @param isListMounted 스크롤 뷰가 실제로 그려졌는가(스켈레톤·에러 화면이 아닌가)
 */
export const useSystemScrollEdgeEffect = (
  listRef: RefObject<unknown>,
  headerRef: RefObject<View | null>,
  isListMounted: boolean,
): void => {
  useFocusEffect(
    useCallback(() => {
      if (!HAS_NATIVE_TAB_BAR || !isListMounted) return;
      const apply = (label: string) => {
        const node = listRef.current as Parameters<typeof findNodeHandle>[0];
        const tag = node ? findNodeHandle(node) : null;
        if (tag === null) {
          lastAttempt = `${label}:${node ? 'no-tag' : 'no-ref'}`;
          return;
        }
        lastTag = tag;
        const headerTag = headerRef.current ? findNodeHandle(headerRef.current) : null;
        void applyScrollEdgeEffect(tag, currentStyle).then(async (result) => {
          const attached =
            headerTag === null ? 'no-header' : await attachScrollEdgeContainer(headerTag, tag);
          lastAttempt = `${label}:${result} style=${currentStyle} | ${attached}`;
        });
      };
      // 마운트 직후엔 네이티브 뷰·인셋이 아직 없을 수 있다 — 한 프레임 뒤, 그리고 1초 뒤 한 번 더
      const frame = requestAnimationFrame(() => apply('t0'));
      const timer = setTimeout(() => apply('t1'), REAPPLY_DELAY_MS);
      return () => {
        cancelAnimationFrame(frame);
        clearTimeout(timer);
      };
    }, [listRef, headerRef, isListMounted]),
  );
};
