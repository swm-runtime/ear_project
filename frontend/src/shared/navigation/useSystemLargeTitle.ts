import { HeaderHeightContext } from '@react-navigation/elements';
import { useNavigation, type NavigationProp, type ParamListBase } from '@react-navigation/native';
import { createElement, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { Animated } from 'react-native';

import { theme } from '@/shared/theme';
import GlassSearchButton from '@/shared/ui/GlassSearchButton';
import { HAS_NATIVE_TAB_BAR } from '@/shared/ui/GlassSurface';
import { Text } from '@/shared/ui/Typography';

interface SystemLargeTitleOptions {
  /** 검색 중에는 헤더를 유지하고 왼쪽 사용자 뷰로 큰 제목을 고정한다. */
  pinnedTitle?: boolean;
  /** 바가 부모 내비게이터의 것일 때(탐색은 탭 안 스택) */
  onParent?: boolean;
  /** 접힌(스크롤한) 작은 제목의 글자 크기 — 없으면 COLLAPSED_TITLE_SIZE */
  collapsedTitleSize?: number;
  /**
   * 탭 화면 — 접힌 동안(UIKit 이 큰 제목을 접어 가운데 작은 제목, 05:49 실기기)에만 **왼쪽에 유리 검색 버튼**(03:44 PM).
   * 모드는 .inline 그대로 — 애플 문서상 .inline 은 왼쪽 항목을 오버플로 메뉴로 옮길 수 있어 실기기로 확인 중(05:50)
   */
  collapse?: {
    /** 목록의 contentOffset.y(useFloatingHeaderScroll 의 것) */
    scrollY: Animated.Value;
    onSearch: () => void;
    searchLabel: string;
  };
}

/** 큰 제목 줄이 이만큼 밀려 올라가면 접힘 — 되돌아올 땐 EXPAND_AT 안으로 와야 풀린다(경계에서 깜빡이지 않게) */
const COLLAPSE_AT = 44;
const EXPAND_AT = 16;

/**
 * 스크롤해 접힌 바의 작은 제목 크기 — 시스템 기본 17 은 작았다(PM 2026-09-28 03:34 설정 18 → 04:09 "더 글자 키우자 작다" 전 화면 20)
 */
const COLLAPSED_TITLE_SIZE = 20;

/**
 * **시스템 큰 제목**(iOS 26 `UINavigationItem.LargeTitleDisplayMode.inline`) — 큰 제목이 바 줄에 앉고 오른쪽 바 버튼과
 * **같은 줄**이다(애플 뮤직 보관함). 바 밑 블러는 시스템 scroll edge effect 가 그린다
 * (PM 2026-09-28 02:40 "애플에서 기본적으로 제공하는거 없어" → `.inline` 발견 → "빌드 ㄱ").
 *
 * react-native-screens 는 큰 제목을 always/never 로만 걸어 `.inline` 을 못 넣는다 — patches/react-native-screens 가
 * iOS 26 에서 `headerLargeTitleEnabled` 를 `.inline` 으로 바꾼다(runtime 28). 오른쪽 컨트롤은 우리 유리 캡슐을 그대로
 * 쓰도록 시스템 공유 유리를 끈다(hidesSharedBackground). 시스템 탭 바 갈래에서만 건다.
 */
export const useSystemLargeTitle = (
  title: string,
  trailing: ReactNode,
  { onParent = false, collapsedTitleSize = COLLAPSED_TITLE_SIZE, collapse, pinnedTitle = false }: SystemLargeTitleOptions = {},
): void => {
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const hasCollapse = collapse !== undefined;
  const collapsed = useCollapsedBar(collapse?.scrollY);

  // 검색 콜백은 매 렌더 새 함수일 수 있다 — 버튼 요소가 바뀌면 옵션이 다시 걸려 나타남 애니메이션이 반복된다
  const searchRef = useRef(collapse?.onSearch);
  useLayoutEffect(() => {
    searchRef.current = collapse?.onSearch;
  });
  const searchLabel = collapse?.searchLabel;
  const showSearch = collapsed && hasCollapse;

  useLayoutEffect(() => {
    if (!HAS_NATIVE_TAB_BAR) return;
    const target = onParent ? navigation.getParent() : navigation;
    target?.setOptions({
      title,
      // headerTitle 이 옵션에 있으면(PUSHED_SCREEN_HEADER 의 '') title 을 이긴다 — 같이 덮는다(09-28 03:25 설정 제목 빈칸)
      headerTitle: pinnedTitle ? '' : title,
      // 피드는 .inline 큰 제목과 시스템 scroll edge 효과를 쓴다. 검색은 왼쪽 고정 제목으로 대체한다.
      // 검색 중 큰 제목 접힘만 끈다. headerShown/header는 절대 전환하지 않는다(네이티브 탭 제약).
      headerLargeTitleEnabled: !pinnedTitle,
      headerLargeTitleShadowVisible: true,
      headerTitleStyle: { fontSize: collapsedTitleSize },
      unstable_headerLeftItems: () =>
        pinnedTitle
          ? [{
              type: 'custom',
              element: createElement(Text, {
                accessibilityRole: 'header',
                numberOfLines: 1,
                style: { fontSize: collapsedTitleSize, fontWeight: '700', color: theme.color.textPrimary },
              }, title),
              hidesSharedBackground: true,
            }]
          : showSearch
          ? [
              {
                type: 'custom',
                element: createElement(GlassSearchButton, {
                  onPress: () => searchRef.current?.(),
                  accessibilityLabel: searchLabel ?? '',
                }),
                hidesSharedBackground: true,
              },
            ]
          : [],
      unstable_headerRightItems: () =>
        trailing ? [{ type: 'custom', element: trailing, hidesSharedBackground: true }] : [],
    } as object);
  }, [navigation, title, trailing, onParent, collapsedTitleSize, showSearch, searchLabel, hasCollapse, pinnedTitle]);
};

/**
 * 큰 제목이 접힐 만큼 내려갔는가 — **스크롤 위치**로 본다. 정지 오프셋은 −(펼친 바 높이)(automatic 인셋)이고 거기서
 * COLLAPSE_AT 넘게 내려가면 접힘, EXPAND_AT 안으로 돌아오면 펼침(경계 깜빡임 방지). 헤더 높이 감소로 보던 종전 판정은
 * .inline 에서 안 걸렸다 — 큰 제목이 바 줄 안에서 접혀 바 높이가 거의 안 줄어든다(05:57 PM "검색 버튼 안 뜸")
 */
const useCollapsedBar = (scrollY: Animated.Value | undefined): boolean => {
  const headerHeight = useContext(HeaderHeightContext) ?? 0;
  const [expandedHeight, setExpandedHeight] = useState(0);
  // 렌더 중 상태 맞추기(React "prop 이 바뀔 때 상태 조정" 패턴) — 최대값만 올라간다
  if (headerHeight > expandedHeight) setExpandedHeight(headerHeight);
  const restRef = useRef(0);
  useLayoutEffect(() => {
    restRef.current = expandedHeight;
  }, [expandedHeight]);
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    if (!HAS_NATIVE_TAB_BAR || !scrollY) return undefined;
    const id = scrollY.addListener(({ value }) => {
      const pushed = value + restRef.current;
      setCollapsed((prev) => (prev ? pushed > EXPAND_AT : pushed > COLLAPSE_AT));
    });
    return () => scrollY.removeListener(id);
  }, [scrollY]);
  return collapsed;
};
