import { HeaderHeightContext } from '@react-navigation/elements';
import { useNavigation, type NavigationProp, type ParamListBase } from '@react-navigation/native';
import { createElement, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { Animated } from 'react-native';

import CollapsedBarTitle from '@/shared/ui/CollapsedBarTitle';
import GlassSearchButton from '@/shared/ui/GlassSearchButton';
import { HAS_NATIVE_TAB_BAR } from '@/shared/ui/GlassSurface';

interface SystemLargeTitleOptions {
  /** 바가 부모 내비게이터의 것일 때(탐색은 탭 안 스택) */
  onParent?: boolean;
  /** 접힌(스크롤한) 작은 제목의 글자 크기 — 없으면 COLLAPSED_TITLE_SIZE */
  collapsedTitleSize?: number;
  /**
   * 스크롤해 큰 제목이 밀려나면 **작은 제목을 가운데**로 두고 **왼쪽에 유리 검색 버튼**을 띄운다(PM 2026-09-28 03:44).
   * `.inline` 은 왼쪽 항목을 오버플로 메뉴로 치우고 작은 제목도 왼쪽에 두므로, 접힌 동안에는 큰 제목을 끄고(가운데 제목 =
   * UIKit 기본) 왼쪽 항목을 건다. 맨 위로 돌아오면 큰 제목으로 되돌린다. 없으면 접힘 전환을 하지 않는다
   */
  collapse?: {
    /** 목록의 contentOffset.y(useFloatingHeaderScroll 의 것) */
    scrollY: Animated.Value;
    onSearch: () => void;
    searchLabel: string;
  };
}

/** 큰 제목 줄이 이만큼 밀려 올라가면 접힘 — 되돌아올 땐 더 내려와야 풀린다(경계에서 깜빡이지 않게) */
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
  { onParent = false, collapsedTitleSize = COLLAPSED_TITLE_SIZE, collapse }: SystemLargeTitleOptions = {},
): void => {
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const collapsed = useCollapsedBar(collapse?.scrollY);

  // 검색 콜백은 매 렌더 새 함수일 수 있다 — 버튼 요소가 바뀌면 옵션이 다시 걸려 나타남 애니메이션이 반복된다
  const searchRef = useRef(collapse?.onSearch);
  useLayoutEffect(() => {
    searchRef.current = collapse?.onSearch;
  });
  const searchLabel = collapse?.searchLabel;
  const showSearch = collapsed && collapse !== undefined;

  useLayoutEffect(() => {
    if (!HAS_NATIVE_TAB_BAR) return;
    const target = onParent ? navigation.getParent() : navigation;
    target?.setOptions({
      title,
      // headerTitle 이 옵션에 있으면(PUSHED_SCREEN_HEADER 의 '') title 을 이긴다 — 같이 덮는다(09-28 03:25 설정 제목 빈칸)
      // 접힌 동안은 페이드인하는 작은 제목(설정의 UIKit 접힘처럼, 04:15 PM). 펼친 동안은 문자열 — 큰 제목이 이 값을 쓴다
      headerTitle: showSearch
        ? () => createElement(CollapsedBarTitle, { title, fontSize: collapsedTitleSize })
        : title,
      headerLargeTitleEnabled: !showSearch,
      headerTitleStyle: { fontSize: collapsedTitleSize },
      unstable_headerLeftItems: () =>
        showSearch
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
  }, [navigation, title, trailing, onParent, collapsedTitleSize, showSearch, searchLabel]);
};

/**
 * 목록이 큰 제목 줄만큼 밀려 올라갔는가. 기준(정지 오프셋)은 펼친 바 높이 — 접히면 바가 낮아지므로 펼쳐 있던 때의 값을 쓴다
 */
const useCollapsedBar = (scrollY: Animated.Value | undefined): boolean => {
  const headerHeight = useContext(HeaderHeightContext) ?? 0;
  const [collapsed, setCollapsed] = useState(false);
  const expandedHeight = useRef(headerHeight);
  useEffect(() => {
    if (!collapsed && headerHeight > 0) expandedHeight.current = headerHeight;
  }, [collapsed, headerHeight]);

  useEffect(() => {
    if (!HAS_NATIVE_TAB_BAR || !scrollY) return undefined;
    const id = scrollY.addListener(({ value }) => {
      const pushed = value + expandedHeight.current;
      setCollapsed((prev) => (prev ? pushed > EXPAND_AT : pushed > COLLAPSE_AT));
    });
    return () => scrollY.removeListener(id);
  }, [scrollY]);

  return collapsed;
};
