import { HeaderHeightContext } from '@react-navigation/elements';
import { useNavigation, type NavigationProp, type ParamListBase } from '@react-navigation/native';
import { createElement, useContext, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

import GlassSearchButton from '@/shared/ui/GlassSearchButton';
import { HAS_NATIVE_TAB_BAR } from '@/shared/ui/GlassSurface';

interface SystemLargeTitleOptions {
  /** 바가 부모 내비게이터의 것일 때(탐색은 탭 안 스택) */
  onParent?: boolean;
  /** 접힌(스크롤한) 작은 제목의 글자 크기 — 없으면 COLLAPSED_TITLE_SIZE */
  collapsedTitleSize?: number;
  /**
   * 탭 화면 — **설정과 같은 `.always` 모드로 처음부터** 건다(PM 2026-09-28 04:57 "설정은 되는데 이거는 왜 안 되냐").
   * 큰 제목은 버튼 줄 밑, 스크롤하면 UIKit 이 접어 가운데 작은 제목 + 블러. 접힌 동안에만 **왼쪽에 유리 검색 버튼**(03:44 PM).
   * 모드는 절대 도중에 바꾸지 않는다 — 스크롤 중 .inline → .always 로 바꾸면 큰 제목이 콘텐츠 위로 다시 펼쳐졌다(04:49 rt 29).
   * 없으면 `.inline`(큰 제목과 오른쪽 버튼이 같은 줄)
   */
  collapse?: {
    onSearch: () => void;
    searchLabel: string;
  };
}

/** 바 높이가 펼친 때보다 이만큼 줄면 "접혔다" — UIKit 이 큰 제목을 접은 것을 헤더 높이로 읽는다 */
const COLLAPSED_BY = 24;

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
  const hasCollapse = collapse !== undefined;
  const collapsed = useCollapsedBar(hasCollapse);

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
      headerTitle: title,
      // 큰 제목 모드는 항상 켠다 — 켜져 있어야 scroll edge 블러가 그려진다(04:29 PM). collapse 가 있으면 처음부터 .always
      // (patches/react-native-screens — largeTitleHideShadow 가 .always 신호, runtime 29), 없으면 .inline. 도중에 안 바꾼다
      headerLargeTitleEnabled: true,
      headerLargeTitleShadowVisible: !hasCollapse,
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
  }, [navigation, title, trailing, onParent, collapsedTitleSize, showSearch, searchLabel, hasCollapse]);
};

/**
 * UIKit 이 큰 제목을 접었는가 — 헤더 높이(HeaderHeightContext, 네이티브 헤더 높이 이벤트)가 펼친 때(본 것 중 최대)보다
 * COLLAPSED_BY 이상 줄었으면 접힘. 스크롤 오프셋으로 추정하지 않는다 — 접힘 판정은 UIKit 의 것이다
 */
const useCollapsedBar = (enabled: boolean): boolean => {
  const headerHeight = useContext(HeaderHeightContext) ?? 0;
  const [expandedHeight, setExpandedHeight] = useState(0);
  // 렌더 중 상태 맞추기(React "prop 이 바뀔 때 상태 조정" 패턴) — 최대값만 올라간다
  if (headerHeight > expandedHeight) setExpandedHeight(headerHeight);
  return enabled && HAS_NATIVE_TAB_BAR && headerHeight > 0 && expandedHeight - headerHeight >= COLLAPSED_BY;
};
