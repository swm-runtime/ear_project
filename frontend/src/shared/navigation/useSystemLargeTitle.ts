import { HeaderHeightContext } from '@react-navigation/elements';
import { useNavigation, type NavigationProp, type ParamListBase } from '@react-navigation/native';
import {
  createElement,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Animated } from 'react-native';

import GlassSearchButton from '@/shared/ui/GlassSearchButton';
import { HAS_NATIVE_TAB_BAR } from '@/shared/ui/GlassSurface';

interface SystemLargeTitleOptions {
  /** 바가 부모 내비게이터의 것일 때(탐색은 탭 안 스택) */
  onParent?: boolean;
  /** 접힌(스크롤한) 작은 제목의 글자 크기 — 없으면 COLLAPSED_TITLE_SIZE */
  collapsedTitleSize?: number;
  /**
   * 스크롤해 큰 제목이 밀려나면 **작은 제목을 가운데**로 두고 **왼쪽에 유리 검색 버튼**을 띄운다(PM 2026-09-28 03:44).
   * `.inline` 은 왼쪽 항목을 오버플로 메뉴로 치우고 작은 제목도 왼쪽에 두므로, 접힌 동안에는 `.always`(설정과 같은 모드)로
   * 바꾸고 왼쪽 항목을 건다. 맨 위로 돌아오면 `.inline` 으로 되돌린다(runtime 29). 없으면 접힘 전환을 하지 않는다
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
 * 오른쪽 컨트롤의 항목 이름 — **탭마다 같은 값이어야** iOS 26 이 전환 때 같은 항목으로 알아보고 모핑한다
 * (`UIBarButtonItem.identifier`). 라이브러리의 [링 | 필터]와 탐색의 [링]이 이 이름으로 이어진다
 */
const TRAILING_ITEM_ID = 'ear.header.trailing';

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
 * iOS 26 에서 `headerLargeTitleEnabled` 를 `.inline` 으로 바꾼다(runtime 28). **오른쪽 컨트롤의 유리는 시스템 것이다**
 * (`sharesBackground` — 우리 캡슐을 그리지 않는다, 04:18 PM). 시스템 탭 바 갈래에서만 건다.
 */
export const useSystemLargeTitle = (
  title: string,
  trailing: ReactNode,
  {
    onParent = false,
    collapsedTitleSize = COLLAPSED_TITLE_SIZE,
    collapse,
  }: SystemLargeTitleOptions = {},
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
      headerTitle: title,
      // 접힌 동안은 큰 제목을 끄지 않고 .always 로 바꾼다(patches/react-native-screens — largeTitleHideShadow 가 .always 신호).
      // .always 여야 작은 제목이 가운데·왼쪽 버튼이 살고, 큰 제목 모드가 켜져 있어야 scroll edge 블러가 그려진다(04:29 PM
      // "상단 blur 왜 사라졌어" — 종전엔 큰 제목을 꺼서 블러가 사라졌다). 작은 제목의 등장도 UIKit 접힘 그대로(설정과 같다)
      headerLargeTitleEnabled: true,
      headerLargeTitleShadowVisible: !showSearch,
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
      // 오른쪽 컨트롤은 **시스템의 공유 유리**에 담는다(`sharesBackground`) — 유리는 애플 것이고, 크기가 달라지는
      // 전환(라이브러리 [링|필터] ↔ 탐색 [링])도 애플이 애니메이션한다. `identifier` 가 같으면 iOS 26 이 전환 때
      // **같은 항목으로 알아보고 모핑한다**(UIBarButtonItem.identifier, PM 2026-09-28 04:18 "저거 리퀴드라 애플 자체
      // 애니메이션 써야 해"). 종전 `hidesSharedBackground: true` 는 애플 유리를 끄고 우리 캡슐을 그리던 것이라,
      // 애플 애니메이션이 처음부터 없었고 JS 로 폭을 스프링해도 바 버튼이 다시 재지 않아 화면에 안 나왔다
      unstable_headerRightItems: () =>
        trailing
          ? [
              {
                type: 'custom',
                element: trailing,
                sharesBackground: true,
                identifier: TRAILING_ITEM_ID,
              },
            ]
          : [],
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
