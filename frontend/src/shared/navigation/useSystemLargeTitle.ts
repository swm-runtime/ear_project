import { useNavigation, type NavigationProp, type ParamListBase } from '@react-navigation/native';
import { useLayoutEffect, type ReactNode } from 'react';

import { HAS_NATIVE_TAB_BAR } from '@/shared/ui/GlassSurface';

/**
 * **시스템 큰 제목**(iOS 26 `UINavigationItem.LargeTitleDisplayMode.inline`) — 큰 제목이 바 줄에 앉고 오른쪽 바 버튼과
 * **같은 줄**이다(애플 뮤직 보관함). 스크롤하면 제목이 바에 접히고 바 밑 블러는 시스템 scroll edge effect 가 그린다
 * (PM 2026-09-28 02:40 "애플에서 기본적으로 제공하는거 없어" → `.inline` 발견 → "빌드 ㄱ").
 *
 * react-native-screens 는 큰 제목을 always/never 로만 걸어 `.inline` 을 못 넣는다 — patches/react-native-screens 가
 * iOS 26 에서 `headerLargeTitleEnabled` 를 `.inline` 으로 바꾼다(runtime 28). 오른쪽 컨트롤은 우리 유리 캡슐을 그대로
 * 쓰도록 시스템 공유 유리를 끈다(hidesSharedBackground). 시스템 탭 바 갈래에서만 건다.
 *
 * @param onParent 바가 부모 내비게이터의 것일 때(탐색은 탭 안 스택)
 */
export const useSystemLargeTitle = (title: string, trailing: ReactNode, onParent = false): void => {
  const navigation = useNavigation<NavigationProp<ParamListBase>>();

  useLayoutEffect(() => {
    if (!HAS_NATIVE_TAB_BAR) return;
    const target = onParent ? navigation.getParent() : navigation;
    target?.setOptions({
      title,
      // headerTitle 이 옵션에 있으면(PUSHED_SCREEN_HEADER 의 '') title 을 이긴다 — 같이 덮는다(09-28 03:25 설정 제목 빈칸)
      headerTitle: title,
      headerLargeTitleEnabled: true,
      unstable_headerRightItems: () =>
        trailing ? [{ type: 'custom', element: trailing, hidesSharedBackground: true }] : [],
    } as object);
  }, [navigation, title, trailing, onParent]);
};
